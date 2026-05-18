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
   * 發佈系統公告 (F-A02)
   */
  public static createAnnouncement(
    data: {
      title: string;
      content: string;
      target?: string; // e.g. "all", "coach", "class:CLS-2025-001"
      expireDays?: number;
      pinned?: boolean;
    },
    user: UserSession
  ): Record<string, any> {
    const { title, content, target = 'all', expireDays = 30, pinned = false } = data;

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
      publish_time: now,
      expire_time: expireTime,
      created_by: user.uid,
      pinned: pinned
    };

    SheetHelper.addRow('Announcements', newAnnouncement);
    Logger.log(`[管理員公告] 成功發布公告：${title} (${announcementId})`);

    return {
      success: true,
      announcementId: announcementId,
      title: title,
      expireTime: expireTime
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
}
