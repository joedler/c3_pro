/**
 * CoachService.ts
 * 提供教練端課程查詢、現場出席校正與回報之核心業務邏輯 (PRD v3.0)
 */

class CoachService {
  /**
   * 取得教練專屬課表與每堂課的學員出席名冊 (F-C01)
   * 預設回傳今日前後 14 天內的課程（共 4 週視窗），支援代課課程查詢。
   */
  public static getSchedule(
    data: { date?: string },
    user: UserSession
  ): Record<string, any>[] {
    if (!user || !user.uid) {
      throw new Error('未驗證的教練身分，請重新登入。');
    }

    const isAdmin = user.role === 'admin';

    // 1. 取得教練所有授課班級 (管理員預設能查看全部班級)
    const allClasses = SheetHelper.getRows<any>('Classes');
    const myTaughtClassIds = allClasses
      .filter(c => (isAdmin || c.coach_line_uid === user.uid) && c.status === 'active')
      .map(c => c.class_id);

    // 2. 取得時間區間 (為相容網頁版月/週月曆展示，管理員放寬至前後 45 天，教練保持行動端 14 天)
    const refDate = data.date ? new Date(data.date) : new Date();
    const windowDays = isAdmin ? 45 : 14;
    const startTime = new Date(refDate.getTime() - windowDays * 24 * 60 * 60 * 1000);
    const endTime = new Date(refDate.getTime() + windowDays * 24 * 60 * 60 * 1000);

    startTime.setHours(0, 0, 0, 0);
    endTime.setHours(23, 59, 59, 999);

    // 3. 撈取所有符合條件的課堂 (自己授課 或 自己代課，管理員則全撈)
    const allSessions = SheetHelper.getRows<any>('Sessions');
    const mySessions = allSessions.filter(s => {
      const isMyClass = myTaughtClassIds.includes(s.class_id);
      const isMySubstitute = s.substitute_coach_uid === user.uid;
      
      if (!isAdmin && !isMyClass && !isMySubstitute) return false;

      // 時間範圍過濾
      const sDate = new Date(s.session_date);
      return sDate >= startTime && sDate <= endTime;
    });

    if (mySessions.length === 0) {
      return [];
    }

    // 4. 快取學員、選課、請假、補課、出勤資料，減少試算表讀取耗時
    const allEnrollments = SheetHelper.getRows<any>('Enrollments').filter(e => e.status === 'active');
    const allMembers = SheetHelper.getRows<any>('Members');
    const allLeaves = SheetHelper.getRows<any>('Leave_Requests').filter(l => l.status === 'approved');
    const allMakeups = SheetHelper.getRows<any>('Makeup_Requests').filter(
      m => m.status === 'approved' || m.status === 'completed'
    );
    const allAttendances = SheetHelper.getRows<any>('Attendance');
    const allRooms = SheetHelper.getRows<any>('Rooms');

    const memberMap = new Map(allMembers.map(m => [m.member_id, m]));
    const classMap = new Map(allClasses.map(c => [c.class_id, c]));
    const roomMap = new Map(allRooms.map(r => [r.room_id, r]));

    const result = mySessions.map(s => {
      const cls = classMap.get(s.class_id);
      if (!cls) return null;

      const room = roomMap.get(cls.room_id);
      const maxCapacity = Number(cls.max_capacity) || (room ? Number(room.max_capacity) : 15);

      // (A) 篩選正式選課學員
      const regularMemberIds = allEnrollments
        .filter(e => e.class_id === s.class_id)
        .map(e => e.member_id);

      // (B) 篩選此堂課請假的學員 ID
      const leaveMemberIds = new Set(
        allLeaves.filter(l => l.session_id === s.session_id).map(l => l.member_id)
      );

      // (C) 篩選此堂課跨班補課的學員 ID
      const makeupMemberIds = allMakeups
        .filter(m => m.target_session_id === s.session_id)
        .map(m => m.member_id);

      // 整合出此堂課「預計出席」的學生清單
      const students: Record<string, any>[] = [];

      // 1. 處理正式學員
      regularMemberIds.forEach(mId => {
        const m = memberMap.get(mId);
        if (!m) return;

        let status: 'present' | 'absent' | 'leave' = 'present'; // 預設視為全體正常出席 (PRD)

        if (leaveMemberIds.has(mId)) {
          status = 'leave';
        } else {
          // 檢查是否有教練手動校正的出席/曠課紀錄
          const att = allAttendances.find(a => a.session_id === s.session_id && a.member_id === mId);
          if (att) {
            if (att.checkin_time && att.checkin_time !== '') {
              status = 'present';
            } else if (att.notes === '曠課') {
              status = 'absent';
            }
          }
        }

        students.push({
          memberId: mId,
          realName: m.real_name || m.display_name || '未命名學員',
          type: 'regular',
          status: status
        });
      });

      // 2. 處理補課學員
      makeupMemberIds.forEach(mId => {
        const m = memberMap.get(mId);
        if (!m) return;

        let status: 'present' | 'absent' | 'leave' = 'present'; // 預設視為正常出席

        const att = allAttendances.find(a => a.session_id === s.session_id && a.member_id === mId);
        if (att) {
          if (att.checkin_time && att.checkin_time !== '') {
            status = 'present';
          } else if (att.notes === '曠課') {
            status = 'absent';
          }
        }

        students.push({
          memberId: mId,
          realName: m.real_name || m.display_name || '跨班補課學員',
          type: 'makeup',
          status: status
        });
      });

      let formattedDate = '';
      if (s.session_date instanceof Date) {
        formattedDate = Utilities.formatDate(s.session_date, 'Asia/Taipei', 'yyyy-MM-dd');
      } else {
        formattedDate = String(s.session_date || '').split('T')[0];
      }

      let formattedStart = '';
      if (s.start_time instanceof Date) {
        formattedStart = Utilities.formatDate(s.start_time, 'Asia/Taipei', 'HH:mm');
      } else {
        formattedStart = String(s.start_time || '').trim();
        let isPM = false;
        if (formattedStart.includes('下午')) {
          isPM = true;
          formattedStart = formattedStart.replace('下午', '').trim();
        } else if (formattedStart.includes('上午')) {
          formattedStart = formattedStart.replace('上午', '').trim();
        }
        const parts = formattedStart.split(':');
        if (parts.length >= 2) {
          let h = parseInt(parts[0], 10);
          const m = parts[1].substring(0, 2);
          if (isPM && h < 12) h += 12;
          else if (!isPM && h === 12) h = 0;
          formattedStart = `${String(h).padStart(2, '0')}:${m}`;
        }
      }

      let formattedEnd = '';
      if (s.end_time instanceof Date) {
        formattedEnd = Utilities.formatDate(s.end_time, 'Asia/Taipei', 'HH:mm');
      } else {
        formattedEnd = String(s.end_time || '').trim();
        let isPM = false;
        if (formattedEnd.includes('下午')) {
          isPM = true;
          formattedEnd = formattedEnd.replace('下午', '').trim();
        } else if (formattedEnd.includes('上午')) {
          formattedEnd = formattedEnd.replace('上午', '').trim();
        }
        const parts = formattedEnd.split(':');
        if (parts.length >= 2) {
          let h = parseInt(parts[0], 10);
          const m = parts[1].substring(0, 2);
          if (isPM && h < 12) h += 12;
          else if (!isPM && h === 12) h = 0;
          formattedEnd = `${String(h).padStart(2, '0')}:${m}`;
        }
      }

      return {
        sessionId: s.session_id,
        className: cls.class_name,
        date: formattedDate,
        startTime: formattedStart,
        endTime: formattedEnd,
        status: s.status,
        actualCount: Number(s.actual_count) || 0,
        maxCapacity: maxCapacity,
        roomName: room ? room.room_name : '未指派教室',
        students: students
      };
    });

    // 過濾空值並排序
    const cleanResult = result.filter(item => item !== null) as Record<string, any>[];
    return cleanResult.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  /**
   * 現場校正與回報 (F-C02)
   * 只有當實況與日曆名單不符時教練才需點選，送出後自動更新 Attendance 並重新計算出席人數、標記 completed。
   */
  public static checkin(
    data: { sessionId: string; attendanceList: { memberId: string; status: 'present' | 'absent' }[] },
    user: UserSession
  ): Record<string, any> {
    if (!user || !user.uid) {
      throw new Error('未驗證的教練身分，請重新登入。');
    }

    const { sessionId, attendanceList } = data;
    if (!sessionId || !attendanceList || !Array.isArray(attendanceList)) {
      throw new Error('缺少必要校正欄位。');
    }

    // 1. 取得並驗證課堂紀錄
    const session = SheetHelper.getRow<any>('Sessions', 'session_id', sessionId);
    if (!session) {
      throw new Error('找不到指定的課堂紀錄。');
    }

    // 2. 校正學員出勤與請假狀態
    const allAttendances = SheetHelper.getRows<any>('Attendance');
    const allLeaves = SheetHelper.getRows<any>('Leave_Requests').filter(l => l.status === 'approved');
    const allMakeups = SheetHelper.getRows<any>('Makeup_Requests').filter(
      m => m.status === 'approved' || m.status === 'completed'
    );

    const now = new Date();
    let actualAttendingCount = 0;

    attendanceList.forEach(item => {
      const { memberId, status } = item;

      // 檢查是否已存在該學生本堂課的出勤紀錄
      const existingAtt = allAttendances.find(
        a => a.session_id === sessionId && a.member_id === memberId
      );

      // 判斷學員類型 (正式 regular 或 補課 makeup)
      const isMakeup = allMakeups.some(m => m.target_session_id === sessionId && m.member_id === memberId);
      const isLeave = allLeaves.some(l => l.session_id === sessionId && l.member_id === memberId);
      
      const type = isLeave ? 'leave' : (isMakeup ? 'makeup' : 'regular');

      if (status === 'present') {
        actualAttendingCount++;

        // 寫入或更新 Attendance：標記簽到時間
        if (existingAtt) {
          SheetHelper.updateRow('Attendance', 'attendance_id', existingAtt.attendance_id, {
            type: type,
            checkin_time: now,
            checkin_by: 'coach',
            notes: '教練現場校正：確認出席'
          });
        } else {
          const attendanceId = `ATT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          SheetHelper.addRow('Attendance', {
            attendance_id: attendanceId,
            session_id: sessionId,
            member_id: memberId,
            type: type,
            checkin_time: now,
            checkin_by: 'coach',
            original_session_id: '',
            notes: '教練現場校正：確認出席'
          });
        }

        // 如果是補課學員，更新其補課狀態為 completed
        if (isMakeup) {
          const makeupReq = allMakeups.find(
            m => m.target_session_id === sessionId && m.member_id === memberId
          );
          if (makeupReq && makeupReq.status !== 'completed') {
            SheetHelper.updateRow('Makeup_Requests', 'makeup_id', makeupReq.makeup_id, {
              status: 'completed'
            });
          }
        }
      } else if (status === 'absent') {
        // 曠課 (Unexcused Absence)
        // 寫入或更新 Attendance：簽到時間保持空白，備註標記「曠課」
        if (existingAtt) {
          SheetHelper.updateRow('Attendance', 'attendance_id', existingAtt.attendance_id, {
            type: type,
            checkin_time: '',
            checkin_by: 'coach',
            notes: '曠課'
          });
        } else {
          const attendanceId = `ATT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          SheetHelper.addRow('Attendance', {
            attendance_id: attendanceId,
            session_id: sessionId,
            member_id: memberId,
            type: type,
            checkin_time: '',
            checkin_by: 'coach',
            original_session_id: '',
            notes: '曠課'
          });
        }

        // 如果是補課學員但缺席，更新其補課狀態為 rejected (作廢，不可再補)
        if (isMakeup) {
          const makeupReq = allMakeups.find(
            m => m.target_session_id === sessionId && m.member_id === memberId
          );
          if (makeupReq) {
            SheetHelper.updateRow('Makeup_Requests', 'makeup_id', makeupReq.makeup_id, {
              status: 'rejected',
              notes: '補課缺席，此額度作廢'
            });
          }
        }
      }
    });

    // 3. 更新 Sessions 該堂課的「實際出席人數」並將狀態標記為已上課 'completed'
    SheetHelper.updateRow('Sessions', 'session_id', sessionId, {
      actual_count: actualAttendingCount,
      status: 'completed'
    });

    // 4. 即時同步該堂課之 Google 日曆事件描述與標題出席人數
    ClassEngine.syncCalendarEvent(sessionId);

    Logger.log(`[教練現場校正] 教練 ${user.name} 提交課堂 ${sessionId} 出席校正，實際出席 ${actualAttendingCount} 人。`);

    return {
      success: true,
      sessionId: sessionId,
      actualCount: actualAttendingCount,
      status: 'completed'
    };
  }

  /**
   * 停課與代課調整 (F-C03)
   */
  public static adjustSession(
    data: { sessionId: string; action: 'cancel' | 'substitute'; reason: string; substituteCoachUid?: string },
    user: UserSession
  ): Record<string, any> {
    if (!user || !user.uid) {
      throw new Error('未驗證的教練身分，請重新登入。');
    }

    const { sessionId, action, reason, substituteCoachUid } = data;
    if (!sessionId || !action || !reason) {
      throw new Error('缺少調整必要資訊。');
    }

    // 授權檢查：教練只能調整自己的課程
    const session = SheetHelper.getRow<any>('Sessions', 'session_id', sessionId);
    if (!session) {
      throw new Error('找不到指定的課堂紀錄。');
    }

    const cls = SheetHelper.getRow<any>('Classes', 'class_id', session.class_id);
    if (!cls || (cls.coach_line_uid !== user.uid && session.substitute_coach_uid !== user.uid)) {
      AuthService.requireRole(user, ['admin']); // 非本班教練需為管理員
    }

    // 呼叫開班引擎統一執行變更與日曆同步
    if (action === 'cancel') {
      ClassEngine.suspendSessions([sessionId], reason, null);
    } else if (action === 'substitute') {
      if (!substituteCoachUid) {
        throw new Error('代課調整請指定代課教練。');
      }
      ClassEngine.suspendSessions([sessionId], reason, substituteCoachUid);
    }

    Logger.log(`[教練調整課堂] 教練 ${user.name} 對課堂 ${sessionId} 執行了 ${action}，原因: ${reason}`);

    return {
      success: true,
      sessionId: sessionId,
      action: action
    };
  }
}
