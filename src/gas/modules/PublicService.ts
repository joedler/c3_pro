/**
 * PublicService.ts
 * 提供免登入公開課表與最新系統公告查詢 (PRD v3.0)
 */

class PublicService {
  /**
   * 取得公開週課表 (免私密個資)
   */
  public static getPublicSchedule(): Record<string, any>[] {
    const allClasses = SheetHelper.getRows<any>('Classes').filter(c => c.status === 'active');
    const allSessions = SheetHelper.getRows<any>('Sessions').filter(s => s.status === 'scheduled' || s.status === 'open' || s.status === 'completed');
    const allRooms = SheetHelper.getRows<any>('Rooms');

    const classMap = new Map(allClasses.map(c => [c.class_id, c]));
    const roomMap = new Map(allRooms.map(r => [r.room_id, r]));

    const now = new Date();
    // 預設取得未來 14 天內之公開課程
    const endWindow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const publicSessions = allSessions
      .filter(s => {
        const sDate = new Date(s.session_date);
        return sDate >= now && sDate <= endWindow;
      })
      .map(s => {
        const cls = classMap.get(s.class_id);
        if (!cls) return null;

        const room = roomMap.get(cls.room_id);
        const maxCapacity = Number(cls.max_capacity) || (room ? Number(room.max_capacity) : 15);
        const vacancy = Math.max(0, maxCapacity - (Number(s.actual_count) || 0));

        return {
          sessionId: s.session_id,
          className: cls.class_name,
          level: cls.level,
          date: s.session_date,
          startTime: s.start_time,
          endTime: s.end_time,
          roomName: room ? room.room_name : '未命名教室',
          vacancy: vacancy,
          maxCapacity: maxCapacity
        };
      })
      .filter(item => item !== null) as Record<string, any>[];

    // 按時間排序
    return publicSessions.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }

  /**
   * 取得目前有效之公告
   */
  public static getActiveAnnouncements(limit = 3): Record<string, any>[] {
    const allAnnouncements = SheetHelper.getRows<any>('Announcements');
    return this.getActiveAnnouncementsFromRows(allAnnouncements, limit);
  }

  public static getActiveAnnouncementsFromRows(allAnnouncements: any[], limit = 3): Record<string, any>[] {
    const now = new Date();
    const nowStr = Utilities.formatDate(now, 'Asia/Taipei', 'yyyy-MM-dd');

    const active = allAnnouncements.filter(ann => {
      const pubTime = this.parseDateValue(ann.publish_time);
      const expTime = this.parseDateValue(ann.expire_time);

      if (!pubTime) return false;
      
      let pubTimeStr = '';
      if (ann.publish_time instanceof Date) {
        pubTimeStr = Utilities.formatDate(ann.publish_time, 'Asia/Taipei', 'yyyy-MM-dd');
      } else {
        pubTimeStr = String(ann.publish_time || '').substring(0, 10);
      }

      const isPublished = now >= pubTime || nowStr >= pubTimeStr;
      const isNotExpired = !expTime || now <= expTime;

      return isPublished && isNotExpired;
    });

    // 優先呈現置頂公告，再依時間倒序
    const sorted = active
      .sort((a, b) => {
        if (this.isTruthy(a.pinned) && !this.isTruthy(b.pinned)) return -1;
        if (!this.isTruthy(a.pinned) && this.isTruthy(b.pinned)) return 1;
        if (String(a.type || 'info') === 'alert' && String(b.type || 'info') !== 'alert') return -1;
        if (String(a.type || 'info') !== 'alert' && String(b.type || 'info') === 'alert') return 1;
        return (this.parseDateValue(b.publish_time)?.getTime() || 0) - (this.parseDateValue(a.publish_time)?.getTime() || 0);
      })
      .map(ann => this.normalizeAnnouncement(ann));

    return limit > 0 ? sorted.slice(0, limit) : sorted;
  }

  private static normalizeAnnouncement(ann: any): Record<string, any> {
    const publishTime = this.parseDateValue(ann.publish_time);
    const expireTime = this.parseDateValue(ann.expire_time);
    return {
      announcementId: ann.announcement_id || ann.announcementId || '',
      title: ann.title || '',
      content: ann.content || '',
      target: ann.target || 'all',
      type: ann.type || 'info',
      sendLine: this.isTruthy(ann.send_line),
      publishTime: publishTime ? publishTime.toISOString() : '',
      expireTime: expireTime ? expireTime.toISOString() : '',
      createdBy: ann.created_by || '',
      pinned: this.isTruthy(ann.pinned)
    };
  }

  private static parseDateValue(value: any): Date | null {
    if (!value) return null;
    if (value instanceof Date && !isNaN(value.getTime())) return value;
    const str = String(value).trim();
    if (!str) return null;
    const normalized = str.replace(/\//g, '-');
    const parsed = new Date(normalized);
    if (!isNaN(parsed.getTime())) return parsed;
    const dateOnly = normalized.substring(0, 10);
    const fallback = new Date(`${dateOnly}T00:00:00`);
    return isNaN(fallback.getTime()) ? null : fallback;
  }

  private static isTruthy(value: any): boolean {
    return value === true || String(value).trim().toLowerCase() === 'true' || String(value).trim() === '是' || String(value).trim() === '1';
  }
}
