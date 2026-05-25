/**
 * LeaveService.ts
 * 提供學員請假處理的核心業務邏輯 (PRD v3.0)
 */

class LeaveService {
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

  /**
   * 處理學員請假申請
   * 依據 PRD 3.0，請假截止至「下課前」，請假無上限且自動審核通過 (Approved)。
   */
  public static request(
    data: { sessionId: string; reason?: string },
    user: UserSession
  ): Record<string, any> {
    if (!user || !user.uid) {
      throw new Error('未驗證的學員身分，請重新登入。');
    }

    const { sessionId, reason } = data;
    if (!sessionId) {
      throw new Error('請指定請假的課堂 ID。');
    }

    // 1. 取得學員資料
    const member = SheetHelper.getRow<any>('Members', 'line_uid', user.uid);
    if (!member || member.status !== 'active') {
      throw new Error('您的學員帳號不存在或已停用，無法請假。');
    }

    const memberId = member.member_id;

    // 2. 取得課堂紀錄
    const session = SheetHelper.getRow<any>('Sessions', 'session_id', sessionId);
    if (!session) {
      throw new Error('找不到該堂課程的紀錄。');
    }

    if (session.status === 'cancelled') {
      throw new Error('該堂課已停課，無須申請請假。');
    }

    // 3. 驗證是否真的選修了該班級
    const enrollment = SheetHelper.getRows<any>('Enrollments').find(
      e => e.member_id === memberId && e.class_id === session.class_id && e.status === 'active'
    );
    if (!enrollment) {
      throw new Error('您並未選修本課程，無法請假。');
    }

    const allSessions = SheetHelper.getRows<any>('Sessions');
    if (!this.isEnrollmentSessionEligible(enrollment, session, allSessions)) {
      throw new Error('此課堂未包含在您的本期已啟用堂數內，無法請假。');
    }

    // 4. 驗證時間規則：必須在「下課前」申請請假
    const now = new Date();
    // 將 session_date (YYYY-MM-DD) 與 end_time (HH:mm) 合併為正確日期時間
    const sessionEndTime = this.buildSessionDateTime(session.session_date, session.end_time);
    
    if (now > sessionEndTime) {
      throw new Error(`抱歉，本堂課已於 ${session.session_date} ${session.end_time} 下課，無法補請假。`);
    }

    // 5. 檢查是否已存在請假申請
    const allLeaves = SheetHelper.getRows<any>('Leave_Requests');
    const existingLeave = allLeaves.find(
      l => l.member_id === memberId && l.session_id === sessionId
    );

    if (existingLeave) {
      throw new Error('您已對此堂課程申請過請假，無須重複申請。');
    }

    // 6. 寫入請假申請 (Leave_Requests) - 系統自動通過
    const leaveId = `LV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newLeave = {
      leave_id: leaveId,
      member_id: memberId,
      session_id: sessionId,
      request_time: now,
      status: 'approved', // 自動通過
      approved_by: 'auto',
      makeup_session_id: '',
      notes: reason || '學員自主請假'
    };
    SheetHelper.addRow('Leave_Requests', newLeave);

    // 7. 寫入或更新出勤紀錄 (Attendance) 為 'leave'，供後續出勤系統對帳
    const allAttendances = SheetHelper.getRows<any>('Attendance');
    const existingAttendance = allAttendances.find(
      a => a.member_id === memberId && a.session_id === sessionId
    );

    if (existingAttendance) {
      SheetHelper.updateRow('Attendance', 'attendance_id', existingAttendance.attendance_id, {
        type: 'leave',
        checkin_time: now,
        checkin_by: 'auto',
        notes: reason || '請假登記'
      });
    } else {
      const attendanceId = `ATT-LV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const newAttendance = {
        attendance_id: attendanceId,
        session_id: sessionId,
        member_id: memberId,
        type: 'leave',
        checkin_time: now,
        checkin_by: 'auto',
        original_session_id: '',
        notes: reason || '請假登記'
      };
      SheetHelper.addRow('Attendance', newAttendance);
    }

    // 8. 即時更新並同步 Google 日曆事件描述欄與標題出席人數
    ClassEngine.syncCalendarEvent(sessionId);

    Logger.log(`[學員請假] 學員 ${member.real_name} 成功申請請假，課堂: ${sessionId}`);

    return {
      success: true,
      leaveId: leaveId,
      sessionDate: this.safeFormatSessionDate(session.session_date),
      startTime: this.safeFormatTime(session.start_time)
    };
  }

  private static isEnrollmentSessionEligible(enrollment: any, session: any, allSessions: any[]): boolean {
    const paidSessions = Number(enrollment.total_paid_sessions || 0);
    if (!paidSessions) return false;

    const classId = String(enrollment.class_id || '').trim();
    const targetSessionId = String(session.session_id || '').trim();
    const enrollmentDate = this.normalizeDateOnly(enrollment.enroll_date);

    const orderedSessions = allSessions
      .filter(s => String(s.class_id || '').trim() === classId)
      .filter(s => String(s.status || '').trim() !== 'cancelled')
      .filter(s => this.normalizeDateOnly(s.session_date || s.date).getTime() >= enrollmentDate.getTime())
      .sort((a, b) => {
        const aKey = `${this.safeFormatSessionDate(this.normalizeDateOnly(a.session_date || a.date))} ${this.safeFormatTime(a.start_time)} ${String(a.session_seq || '')}`;
        const bKey = `${this.safeFormatSessionDate(this.normalizeDateOnly(b.session_date || b.date))} ${this.safeFormatTime(b.start_time)} ${String(b.session_seq || '')}`;
        return aKey.localeCompare(bKey);
      });

    return orderedSessions.slice(0, paidSessions).some(s => String(s.session_id || '').trim() === targetSessionId);
  }

  private static normalizeDateOnly(value: any): Date {
    const date = value instanceof Date ? new Date(value) : new Date(String(value || '').split('T')[0]);
    date.setHours(0, 0, 0, 0);
    return date;
  }
}
