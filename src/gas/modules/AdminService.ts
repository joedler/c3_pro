/**
 * AdminService.ts
 * 提供管理員開班設定、系統公告發佈等核心後台控制功能 (PRD v3.0)
 */

class AdminService {
  /**
   * 建立全新班級設定 (F-A01)
   */
  public static createClass(
    data: {
      className: string;
      classType: 'group_1x' | 'group_2x' | 'personal';
      level: string;
      coachLineUid: string;
      roomId: string;
      maxCapacity?: number;
      dayOfWeek: number;
      startTime: string; // e.g. "09:00"
      endTime: string;   // e.g. "10:00"
      periodStart: string; // e.g. "2026-05-18"
      periodWeeks?: number;
      sessionsPerWeek?: number;
      totalSessions?: number;
      notes?: string;
    },
    user: UserSession
  ): Record<string, any> {
    const {
      className,
      classType,
      level,
      coachLineUid,
      roomId,
      maxCapacity,
      dayOfWeek,
      startTime,
      endTime,
      periodStart,
      periodWeeks = 12,
      sessionsPerWeek = 1,
      totalSessions,
      notes = ''
    } = data;

    // 參數欄位驗證
    if (!className || !classType || !level || !coachLineUid || !roomId || !startTime || !endTime || !periodStart) {
      throw new Error('缺少班級設定必要欄位，請完整輸入。');
    }

    // 1. 取得教室預設人數上限 (若無自訂設定)
    const room = SheetHelper.getRow<any>('Rooms', 'room_id', roomId);
    if (!room) {
      throw new Error(`找不到指定的教室 ID: ${roomId}`);
    }
    const finalCapacity = maxCapacity || Number(room.max_capacity) || 15;

    // 2. 檢查教練是否存在且在職
    const coach = SheetHelper.getRow<any>('Staff', 'line_uid', coachLineUid);
    if (!coach || coach.status !== 'active') {
      throw new Error('指定的授課教練不存在或已離職。');
    }

    // 3. 計算總堂數
    const finalTotalSessions = totalSessions || (periodWeeks * sessionsPerWeek);

    // 4. 建立班級紀錄
    const classId = `CLS-${Date.now()}`;
    const newClass = {
      class_id: classId,
      class_name: className,
      class_type: classType,
      level: level,
      coach_line_uid: coachLineUid,
      room_id: roomId,
      max_capacity: finalCapacity,
      day_of_week: dayOfWeek,
      time_slot: this.getTimeSlot(startTime),
      start_time: startTime,
      end_time: endTime,
      period_start: new Date(periodStart),
      period_weeks: periodWeeks,
      sessions_per_week: sessionsPerWeek,
      total_sessions: finalTotalSessions,
      status: 'active',
      notes: notes
    };

    SheetHelper.addRow('Classes', newClass);
    Logger.log(`[管理員開班] 成功建立班級：${className} (${classId})`);

    return {
      success: true,
      classId: classId,
      className: className,
      maxCapacity: finalCapacity,
      totalSessions: finalTotalSessions
    };
  }

  /**
   * 發佈系統公告 (F-A02) - 支援雙軌制公告與群發
   */
  public static createAnnouncement(
    data: {
      title: string;
      content: string;
      target?: string; // e.g. "all", "coach", "class:CLS-2025-001"
      expireDays?: number;
      pinned?: boolean;
      type?: string;   // e.g. "info", "alert"
      sendLine?: boolean;
    },
    user: UserSession
  ): Record<string, any> {
    const { title, content, target = 'all', expireDays = 14, pinned = false, type = 'info', sendLine = false } = data;

    if (!title || !content) {
      throw new Error('請輸入公告標題與內容。');
    }

    const now = new Date();
    const expireTime = new Date(now.getTime() + expireDays * 24 * 60 * 60 * 1000);
    const announcementId = `ANN-${Date.now()}`;

    const newAnnouncement = {
      announcement_id: announcementId,
      title: title,
      content: content,
      target: target,
      type: type,
      send_line: sendLine,
      publish_time: now,
      expire_time: expireTime,
      created_by: user.uid,
      pinned: pinned
    };

    SheetHelper.addRow('Announcements', newAnnouncement);
    Logger.log(`[管理員公告] 成功發布公告：${title} (${announcementId})`);

    // 🎯 雙軌制 LINE 群發：如果發布時勾選了 sendLine，且非模擬環境
    if (sendLine) {
      try {
        const flexBubble = LineHandler.buildAnnouncementFlex(title, content, type);

        LineHandler.broadcastMessage([
          {
            type: 'flex',
            altText: `📢 健身房公告: ${title}`,
            contents: flexBubble
          }
        ]);
      } catch (err) {
        Logger.log(`[公告群發 LINE 失敗] ${err}`);
      }
    }

    return {
      success: true,
      announcementId: announcementId,
      title: title,
      expireTime: expireTime
    };
  }

  public static deactivateAnnouncement(announcementId: string, user: UserSession): Record<string, any> {
    if (!announcementId) {
      throw new Error('請選擇要下架的公告。');
    }

    const updated = SheetHelper.updateRow('Announcements', 'announcement_id', announcementId, {
      expire_time: new Date(Date.now() - 60 * 1000),
      created_by: user.uid
    });

    if (!updated) {
      throw new Error('找不到指定公告，可能已被下架或刪除。');
    }

    return {
      success: true,
      message: '公告已下架。',
      announcementId: announcementId
    };
  }

  /**
   * 依據開始時間，判定所屬時段分類 (morning / afternoon / evening)
   */
  private static getTimeSlot(startTime: string): 'morning' | 'afternoon' | 'evening' {
    const hour = parseInt(startTime.split(':')[0], 10);
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  }

  /**
   * 取得今日營運摘要統計 (F-A03)
   */
  public static getDashboardStats(): Record<string, any> {
    const todayStr = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
    
    // 1. 今日課程
    const allSessions = SheetHelper.getRows<any>('Sessions');
    const classes = SheetHelper.getRows<any>('Classes');
    const members = SheetHelper.getRows<any>('Members');
    
    const formatDateStr = (val: any): string => {
      if (val instanceof Date) {
        return Utilities.formatDate(val, 'Asia/Taipei', 'yyyy-MM-dd');
      }
      return String(val || '').substring(0, 10);
    };

    const todaySessions = allSessions
      .filter(s => {
        const sDateStr = formatDateStr(s.date || s.session_date);
        return sDateStr === todayStr && s.status !== 'cancelled';
      })
      .map(s => {
        const cls = classes.find(c => c.class_id === s.class_id);
        const coach = cls ? SheetHelper.getRow<any>('Staff', 'line_uid', cls.coach_line_uid) : null;
        return {
          sessionId: s.session_id,
          className: cls ? cls.class_name : '未知課程',
          startTime: s.start_time,
          endTime: s.end_time,
          coachName: coach ? coach.real_name : '未知教練',
          actualCount: Number(s.actual_count) || 0
        };
      });

    // 2. 今日請假名單
    const leaves = SheetHelper.getRows<any>('Leave_Requests').filter(l => {
      const s = allSessions.find(sess => sess.session_id === l.session_id);
      if (!s) return false;
      const sDateStr = formatDateStr(s.date || s.session_date);
      return sDateStr === todayStr;
    });

    const todayLeaves = leaves.map(l => {
      const member = members.find(m => m.member_id === l.member_id);
      const s = allSessions.find(sess => sess.session_id === l.session_id);
      const cls = s ? classes.find(c => c.class_id === s.class_id) : null;
      return {
        leaveId: l.leave_id,
        realName: member ? member.real_name : '未知學員',
        className: cls ? cls.class_name : '未知課程',
        reason: l.reason || '無備註'
      };
    });

    // 3. 今日補課名單
    const makeups = SheetHelper.getRows<any>('Makeup_Requests').filter(m => {
      const s = allSessions.find(sess => sess.session_id === m.target_session_id);
      if (!s) return false;
      const sDateStr = formatDateStr(s.date || s.session_date);
      return sDateStr === todayStr;
    });

    const todayMakeups = makeups.map(mk => {
      const member = members.find(m => m.member_id === mk.member_id);
      const s = allSessions.find(sess => sess.session_id === mk.target_session_id);
      const cls = s ? classes.find(c => c.class_id === s.class_id) : null;
      return {
        makeupId: mk.makeup_id,
        realName: member ? member.real_name : '未知學員',
        className: cls ? cls.class_name : '未知課程'
      };
    });

    return {
      todaySessions,
      todayLeaves,
      todayMakeups
    };
  }

  /**
   * 取得管理員專屬週課表與每堂課的學員出席名冊 (已遷移至 AdminService)
   */
  public static getSchedule(
    data: { date?: string },
    user: UserSession
  ): Record<string, any>[] {
    if (!user || !user.uid) {
      throw new Error('未驗證的管理員身分，請重新登入。');
    }

    // 1. 取得所有班級
    const allClasses = SheetHelper.getRows<any>('Classes');
    const allTaughtClassIds = allClasses
      .filter(c => c.status === 'active')
      .map(c => c.class_id);

    // 2. 取得時間區間 (前後 45 天以符合網頁月曆展示)
    const refDate = data.date ? new Date(data.date) : new Date();
    const windowDays = 45;
    const startTime = new Date(refDate.getTime() - windowDays * 24 * 60 * 60 * 1000);
    const endTime = new Date(refDate.getTime() + windowDays * 24 * 60 * 60 * 1000);

    startTime.setHours(0, 0, 0, 0);
    endTime.setHours(23, 59, 59, 999);

    // 3. 撈取符合時間範圍的課堂
    const allSessions = SheetHelper.getRows<any>('Sessions');
    const mySessions = allSessions.filter(s => {
      const sDate = new Date(s.session_date);
      return sDate >= startTime && sDate <= endTime;
    });

    if (mySessions.length === 0) {
      return [];
    }

    // 4. 快取學員、選課、請假、補課、出勤資料
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

      // (A) 正式學員
      const regularMemberIds = allEnrollments
        .filter(e => e.class_id === s.class_id)
        .map(e => e.member_id);

      // (B) 請假學員
      const leaveMemberIds = new Set(
        allLeaves.filter(l => l.session_id === s.session_id).map(l => l.member_id)
      );

      // (C) 補課學員
      const makeupMemberIds = allMakeups
        .filter(m => m.target_session_id === s.session_id)
        .map(m => m.member_id);

      const students: Record<string, any>[] = [];

      // 1. 正式學員
      regularMemberIds.forEach(mId => {
        const m = memberMap.get(mId);
        if (!m) return;

        let status: 'present' | 'absent' | 'leave' = 'present';

        if (leaveMemberIds.has(mId)) {
          status = 'leave';
        } else {
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

      // 2. 補課學員
      makeupMemberIds.forEach(mId => {
        const m = memberMap.get(mId);
        if (!m) return;

        let status: 'present' | 'absent' | 'leave' = 'present';

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

    const cleanResult = result.filter(item => item !== null) as Record<string, any>[];
    return cleanResult.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }
}
