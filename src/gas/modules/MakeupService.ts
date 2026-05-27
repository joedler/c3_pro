/**
 * MakeupService.ts
 * 提供學員補課管理（查詢可用補課名額與補課申請登記）之核心邏輯 (PRD v3.0)
 */

class MakeupService {
  private static normalizeId(value: any): string {
    return String(value || '').trim();
  }

  private static getLevelNumber(levelStr: string): number {
    if (!levelStr) return 0;
    const match = String(levelStr).match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  }

  private static safeFormatSessionDate(dateVal: any): string {
    if (!dateVal) return '';
    if (dateVal instanceof Date) {
      return Utilities.formatDate(dateVal, 'Asia/Taipei', 'yyyy-MM-dd');
    }
    const d = new Date(dateVal);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, 'Asia/Taipei', 'yyyy-MM-dd');
    }
    return String(dateVal).substring(0, 10);
  }

  private static safeFormatTime(timeVal: any): string {
    if (!timeVal) return '';
    if (timeVal instanceof Date) {
      return Utilities.formatDate(timeVal, 'Asia/Taipei', 'HH:mm');
    }
    const match = String(timeVal).trim().match(/(\d{1,2}):(\d{2})/);
    if (match) {
      return `${match[1].padStart(2, '0')}:${match[2]}`;
    }
    return String(timeVal).trim().substring(0, 5);
  }

  private static buildSessionDateTime(dateVal: any, timeVal: any): Date {
    return new Date(`${this.safeFormatSessionDate(dateVal)}T${this.safeFormatTime(timeVal)}:00`);
  }

  private static isEnrollmentSessionEligible(enrollment: any, session: any, allSessions: any[]): boolean {
    const paidSessions = Number(enrollment.total_paid_sessions || 0);
    if (!paidSessions) return false;

    const classId = this.normalizeId(enrollment.class_id);
    const targetSessionId = this.normalizeId(session.session_id);
    const enrollmentDate = this.normalizeDateOnly(enrollment.enroll_date);

    const orderedSessions = allSessions
      .filter(s => this.normalizeId(s.class_id) === classId)
      .filter(s => String(s.status || '').trim() !== 'cancelled')
      .filter(s => this.normalizeDateOnly(s.session_date || s.date).getTime() >= enrollmentDate.getTime())
      .sort((a, b) => {
        const aKey = `${this.safeFormatSessionDate(this.normalizeDateOnly(a.session_date || a.date))} ${this.safeFormatTime(a.start_time)} ${String(a.session_seq || '')}`;
        const bKey = `${this.safeFormatSessionDate(this.normalizeDateOnly(b.session_date || b.date))} ${this.safeFormatTime(b.start_time)} ${String(b.session_seq || '')}`;
        return aKey.localeCompare(bKey);
      });

    return orderedSessions.slice(0, paidSessions).some(s => this.normalizeId(s.session_id) === targetSessionId);
  }

  private static normalizeDateOnly(value: any): Date {
    const date = value instanceof Date ? new Date(value) : new Date(String(value || '').split('T')[0]);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  /**
   * 查詢可用的補課課堂清單 (F-M04)
   * 規則：
   * 1. 課堂狀態為 scheduled 且在未來。
   * 2. 班級狀態為 active 或 open，且 allow_makeup 為 true。
   * 3. 級別篩選：學員本人的等級 >= 課程難度等級 (getLevelNumber(member.level) >= getLevelNumber(class.level))。
   * 4. 性別篩選：若學員 gender 為 '男'，則排除班級 gender_limit 為 'female'。
   * 5. 該課堂人數尚未額滿。
   */
  public static getAvailable(
    data: { leaveId: string },
    user: UserSession
  ): Record<string, any>[] {
    if (!user || !user.uid) {
      throw new Error('未驗證的學員身分，請重新登入。');
    }

    const { leaveId } = data;
    if (!leaveId) {
      throw new Error('請提供請假紀錄 ID 以匹配可用課程。');
    }

    // 1. 取得學員資料 (包含等級與性別)
    const member = SheetHelper.getRow<any>('Members', 'line_uid', user.uid);
    if (!member || member.status !== 'active') {
      throw new Error('您的學員帳號不存在或已停用。');
    }

    // 2. 取得該次請假紀錄並進行防呆驗證
    const leave = SheetHelper.getRow<any>('Leave_Requests', 'leave_id', leaveId);
    if (!leave || leave.member_id !== member.member_id) {
      throw new Error('找不到該次請假的申請紀錄。');
    }

    if (leave.status !== 'approved') {
      throw new Error('該次請假尚未通過審核，無法安排補課。');
    }

    if (leave.makeup_session_id && leave.makeup_session_id !== '') {
      throw new Error('此請假紀錄已安排過補課，無法重複補課。');
    }

    const originalSession = SheetHelper.getRow<any>('Sessions', 'session_id', leave.session_id);
    if (!originalSession) {
      throw new Error('找不到原請假課堂資料，無法安排補課。');
    }
    const originalClassId = this.normalizeId(originalSession.class_id);
    const allEnrollmentsRaw = SheetHelper.getRows<any>('Enrollments');
    const originalEnrollment = allEnrollmentsRaw.find(
      e => e.member_id === member.member_id &&
           this.normalizeId(e.class_id) === originalClassId &&
           e.status === 'active'
    );
    const originalClass = SheetHelper.getRow<any>('Classes', 'class_id', originalClassId);
    const classTotalSessions = originalClass
      ? Number(originalClass.total_sessions || (Number(originalClass.period_weeks) * Number(originalClass.sessions_per_week)))
      : 0;
    const isPartialEnrollment = !!originalEnrollment &&
      classTotalSessions > 0 &&
      Number(originalEnrollment.total_paid_sessions || 0) < classTotalSessions;

    const memberClassIds = new Set(
      allEnrollmentsRaw
        .filter(e => e.member_id === member.member_id && e.status === 'active')
        .map(e => this.normalizeId(e.class_id))
        .filter(id => id !== '')
    );
    if (originalClassId) {
      memberClassIds.add(originalClassId);
    }

    // 3. 解析學員等級分數
    const memberLevelNum = this.getLevelNumber(member.level);

    // 4. 篩選出所有符合條件的班級
    const allClasses = SheetHelper.getRows<any>('Classes');
    const validClassIds = new Set<string>();
    const classMap = new Map<string, any>();

    if (isPartialEnrollment && originalClass) {
      validClassIds.add(originalClassId);
      classMap.set(originalClassId, originalClass);
    } else {
      allClasses.forEach(c => {
        // 完整堂數學員維持原規則：只能跨班補課，不能補入自己的原班級或已報名班級。
        if (memberClassIds.has(this.normalizeId(c.class_id))) return;
        if (c.status !== 'active' && c.status !== 'open') return;
        if (c.allow_makeup !== true && String(c.allow_makeup).toLowerCase() !== 'true') return;
        if (c.level === '不固定') return; // 一律禁止補入不固定班級

        // 級別限制：學員級別 >= 班級級別
        const classLevelNum = this.getLevelNumber(c.level);
        if (memberLevelNum < classLevelNum) return;

        // 性別限制：男生不能選女性專班
        if (member.gender === '男' && c.gender_limit === 'female') return;

        validClassIds.add(c.class_id);
        classMap.set(c.class_id, c);
      });
    }

    if (validClassIds.size === 0) {
      return [];
    }

    // 5. 撈出所有符合班級且在未來的 scheduled 課堂
    const now = new Date();
    const allSessions = SheetHelper.getRows<any>('Sessions');
    const candidateSessions = allSessions.filter(s => {
      if (!validClassIds.has(s.class_id) || s.status !== 'scheduled') {
        return false;
      }
      if (this.normalizeId(s.session_id) === this.normalizeId(originalSession.session_id)) {
        return false;
      }
      if (isPartialEnrollment && originalEnrollment && this.isEnrollmentSessionEligible(originalEnrollment, s, allSessions)) {
        return false;
      }
      // 判斷是否在未來：GAS 從試算表讀回的欄位可能是 Date 物件，也可能是字串，必須兩者都處理
      try {
        let sessionStart: Date;
        if (s.session_date instanceof Date) {
          // GAS Date 欄位直接回傳 Date 物件
          sessionStart = new Date(
            s.session_date.getFullYear(),
            s.session_date.getMonth(),
            s.session_date.getDate()
          );
        } else {
          const parts = String(s.session_date).split('T')[0].split('-');
          sessionStart = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        }

        let hours = 0;
        let minutes = 0;
        if (s.start_time instanceof Date) {
          // GAS 純時間欄位以 1899-12-30 為 epoch 的 Date 物件回傳
          hours = s.start_time.getHours();
          minutes = s.start_time.getMinutes();
        } else if (s.start_time) {
          const tParts = String(s.start_time).trim().replace('上午', '').replace('下午', '').split(':');
          if (tParts.length >= 2) {
            hours = parseInt(tParts[0], 10);
            minutes = parseInt(tParts[1], 10);
            if (String(s.start_time).includes('下午') && hours < 12) hours += 12;
            else if (String(s.start_time).includes('上午') && hours === 12) hours = 0;
          }
        }
        sessionStart.setHours(hours, minutes, 0, 0);
        return sessionStart > now;
      } catch (e) {
        return false;
      }
    });

    const result: Record<string, any>[] = [];

    // 6. 計算每堂課的剩餘空位
    const allEnrollments = allEnrollmentsRaw.filter(e => e.status === 'active');
    const allLeaves = SheetHelper.getRows<any>('Leave_Requests').filter(l => l.status === 'approved');
    const allMakeups = SheetHelper.getRows<any>('Makeup_Requests').filter(
      m => m.status === 'approved' || m.status === 'completed'
    );
    const allRooms = SheetHelper.getRows<any>('Rooms');
    const roomMap = new Map(allRooms.map(r => [r.room_id, r]));

    candidateSessions.forEach(s => {
      const cls = classMap.get(s.class_id);
      if (!cls) return;

      const room = roomMap.get(cls.room_id);
      const maxCapacity = Number(cls.max_capacity) || (room ? Number(room.max_capacity) : 15);

      // 正式出席人數 (正式選課人數 - 該堂請假人數)
      const regCount = allEnrollments.filter(e =>
        e.class_id === s.class_id && this.isEnrollmentSessionEligible(e, s, allSessions)
      ).length;
      const leaveCount = allLeaves.filter(l => l.session_id === s.session_id).length;
      const attendingRegular = regCount - leaveCount;

      // 補課人數
      const makeupCount = allMakeups.filter(m => m.target_session_id === s.session_id).length;

      // 剩餘空位
      const currentAttending = attendingRegular + makeupCount;
      const vacancy = maxCapacity - currentAttending;

      if (vacancy > 0) {
        result.push({
          sessionId: s.session_id,
          classId: s.class_id,
          className: cls.class_name,
          date: s.session_date instanceof Date
            ? Utilities.formatDate(s.session_date, 'Asia/Taipei', 'yyyy-MM-dd')
            : String(s.session_date).split('T')[0],
          startTime: s.start_time instanceof Date
            ? Utilities.formatDate(s.start_time, 'Asia/Taipei', 'HH:mm')
            : String(s.start_time || '').trim().replace('上午', '').replace('下午', ''),
          endTime: s.end_time instanceof Date
            ? Utilities.formatDate(s.end_time, 'Asia/Taipei', 'HH:mm')
            : String(s.end_time || '').trim().replace('上午', '').replace('下午', ''),
          level: cls.level,
          vacancy: vacancy,
          makeupType: isPartialEnrollment ? '本班未啟用堂次' : '跨班補課'
        });
      }
    });

    // 按照日期排序
    return result.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  /**
   * 提交補課申請登記
   * 補課一經登記即不可修改、不可取消，缺席不得再補。
   */
  public static request(
    data: { leaveId: string; targetSessionId: string },
    user: UserSession
  ): Record<string, any> {
    if (!user || !user.uid) {
      throw new Error('未驗證的學員身分，請重新登入。');
    }

    const { leaveId, targetSessionId } = data;
    if (!leaveId || !targetSessionId) {
      throw new Error('請提供請假紀錄 ID 與欲補課之目標課堂 ID。');
    }

    // 1. 取得學員資料
    const member = SheetHelper.getRow<any>('Members', 'line_uid', user.uid);
    if (!member || member.status !== 'active') {
      throw new Error('您的學員帳號不存在或已停用。');
    }

    const memberId = member.member_id;

    // 2. 取得原請假紀錄並進行規則校驗
    const leave = SheetHelper.getRow<any>('Leave_Requests', 'leave_id', leaveId);
    if (!leave || leave.member_id !== memberId) {
      throw new Error('找不到與您身分匹配的請假紀錄。');
    }

    if (leave.status !== 'approved') {
      throw new Error('該次請假尚未通過審核，無法安排補課。');
    }

    if (leave.makeup_session_id && leave.makeup_session_id !== '') {
      throw new Error('此請假紀錄已安排過補課，無法重複安排。');
    }

    const originalSession = SheetHelper.getRow<any>('Sessions', 'session_id', leave.session_id);
    if (!originalSession) {
      throw new Error('找不到原請假課堂資料，無法安排補課。');
    }
    const originalClassId = this.normalizeId(originalSession.class_id);
    const allEnrollmentRows = SheetHelper.getRows<any>('Enrollments');
    const originalEnrollment = allEnrollmentRows.find(
      e => e.member_id === memberId &&
           this.normalizeId(e.class_id) === originalClassId &&
           e.status === 'active'
    );
    const originalClass = SheetHelper.getRow<any>('Classes', 'class_id', originalClassId);
    const originalClassTotalSessions = originalClass
      ? Number(originalClass.total_sessions || (Number(originalClass.period_weeks) * Number(originalClass.sessions_per_week)))
      : 0;
    const isPartialEnrollment = !!originalEnrollment &&
      originalClassTotalSessions > 0 &&
      Number(originalEnrollment.total_paid_sessions || 0) < originalClassTotalSessions;

    const memberClassIds = new Set(
      allEnrollmentRows
        .filter(e => e.member_id === memberId && e.status === 'active')
        .map(e => this.normalizeId(e.class_id))
        .filter(id => id !== '')
    );
    if (originalClassId) {
      memberClassIds.add(originalClassId);
    }

    // 3. 取得目標補課課堂與班級資料
    const targetSession = SheetHelper.getRow<any>('Sessions', 'session_id', targetSessionId);
    if (!targetSession || targetSession.status !== 'scheduled') {
      throw new Error('目標補課課堂已停課或非正常排定狀態。');
    }

    if (isPartialEnrollment && originalEnrollment) {
      if (this.normalizeId(targetSession.class_id) !== originalClassId) {
        throw new Error('部分堂數學員僅可預約本班未啟用堂次，不開放跨班補課。');
      }
      if (this.normalizeId(targetSession.session_id) === this.normalizeId(originalSession.session_id)) {
        throw new Error('不能選擇原請假課堂作為補課目標。');
      }
      const allSessions = SheetHelper.getRows<any>('Sessions');
      if (this.isEnrollmentSessionEligible(originalEnrollment, targetSession, allSessions)) {
        throw new Error('此課堂已包含在您的本期啟用堂數內，不能作為本班補課目標。');
      }
    } else if (memberClassIds.has(this.normalizeId(targetSession.class_id))) {
      Logger.log(`[補課阻擋] 學員 ${memberId} 嘗試補入自己的班級: ${targetSession.class_id}`);
      throw new Error('補課需選擇其他班級，不能回補自己的原班級或已報名班級。');
    }

    // 4. 驗證時間：目標課堂必須是在未來
    const now = new Date();
    const targetStart = this.buildSessionDateTime(targetSession.session_date, targetSession.start_time);
    if (targetStart <= now) {
      throw new Error('不能選擇過去或已經開始的課堂作為補課目標。');
    }

    // 5. 驗證補課資格與程度
    const targetClass = SheetHelper.getRow<any>('Classes', 'class_id', targetSession.class_id);
    if (!targetClass) {
      throw new Error('找不到目標補課課堂的班級資料。');
    }

    // 目標班級必須允許補課，且禁止補入「不固定」班級
    if (targetClass.allow_makeup !== true && String(targetClass.allow_makeup).toLowerCase() !== 'true') {
      throw new Error('目標班級目前未開放補課。');
    }
    if (targetClass.level === '不固定') {
      throw new Error('「不固定」難度等級的班級一律禁止作為補課目標。');
    }

    const memberLevelNum = this.getLevelNumber(member.level);
    const targetClassLevelNum = this.getLevelNumber(targetClass.level);

    if (memberLevelNum < targetClassLevelNum) {
      throw new Error(`程度不相符！您的學員級別 (${member.level}) 無法預約難度較高 (${targetClass.level}) 的班級進行補課。`);
    }

    // 性別限制防呆
    if (member.gender === '男' && targetClass.gender_limit === 'female') {
      throw new Error('男生不能預約女性專班。');
    }

    // 6. 精準檢查目標課堂是否還有剩餘空額
    const allSessionsForCapacity = SheetHelper.getRows<any>('Sessions');
    const allEnrollments = SheetHelper.getRows<any>('Enrollments').filter(
      e => e.class_id === targetSession.class_id &&
           e.status === 'active' &&
           this.isEnrollmentSessionEligible(e, targetSession, allSessionsForCapacity)
    );
    const allLeaves = SheetHelper.getRows<any>('Leave_Requests').filter(
      l => l.session_id === targetSessionId && l.status === 'approved'
    );
    const allMakeups = SheetHelper.getRows<any>('Makeup_Requests').filter(
      m => m.target_session_id === targetSessionId && (m.status === 'approved' || m.status === 'completed')
    );
    const room = SheetHelper.getRow<any>('Rooms', 'room_id', targetClass.room_id);
    const maxCapacity = Number(targetClass.max_capacity) || (room ? Number(room.max_capacity) : 15);

    const currentAttending = (allEnrollments.length - allLeaves.length) + allMakeups.length;
    if (currentAttending >= maxCapacity) {
      throw new Error('抱歉，目標課堂的補課/出席名額已滿，請選擇其他時間或班級補課。');
    }

    // 7. 寫入補課申請紀錄 (Makeup_Requests)
    const makeupId = `MK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newMakeup = {
      makeup_id: makeupId,
      member_id: memberId,
      leave_id: leaveId,
      target_session_id: targetSessionId,
      request_time: now,
      status: 'approved', // 登記即視為核准安排
      notes: '學員自主補課登記'
    };
    SheetHelper.addRow('Makeup_Requests', newMakeup);

    // 8. 回寫/更新請假紀錄以綁定此補課課堂
    SheetHelper.updateRow('Leave_Requests', 'leave_id', leaveId, {
      makeup_session_id: targetSessionId
    });

    // 9. 寫入出勤紀錄 (Attendance) 類型為 'makeup'
    const attendanceId = `ATT-MK-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newAttendance = {
      attendance_id: attendanceId,
      session_id: targetSessionId,
      member_id: memberId,
      type: 'makeup',
      checkin_time: '', // 補課當天由教練手動簽到
      checkin_by: '',
      original_session_id: leave.session_id, // 標記原始請假課程ID
      notes: '補課登記'
    };
    SheetHelper.addRow('Attendance', newAttendance);

    // 10. 即時同步更新目標課堂的 Google 日曆事件描述欄
    ClassEngine.syncCalendarEvent(targetSessionId);

    Logger.log(`[學員補課] 學員 ${member.real_name} 成功預約補課：${targetSessionId}，對應請假 ID: ${leaveId}`);

    return {
      success: true,
      makeupId: makeupId,
      sessionDate: this.safeFormatSessionDate(targetSession.session_date),
      startTime: this.safeFormatTime(targetSession.start_time),
      className: targetClass.class_name
    };
  }
}
