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
    const allSessions = SheetHelper.getRows<any>('Sessions').filter(s => s.status === 'scheduled' || s.status === 'completed');
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
  public static getActiveAnnouncements(): Record<string, any>[] {
    const allAnnouncements = SheetHelper.getRows<any>('Announcements');
    const now = new Date();

    const active = allAnnouncements.filter(ann => {
      const pubTime = ann.publish_time ? new Date(ann.publish_time) : null;
      const expTime = ann.expire_time ? new Date(ann.expire_time) : null;

      if (!pubTime) return false;
      
      const isPublished = now >= pubTime;
      const isNotExpired = !expTime || now <= expTime;

      return isPublished && isNotExpired;
    });

    // 優先呈現置頂公告，再依時間倒序
    return active.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.publish_time).getTime() - new Date(a.publish_time).getTime();
    });
  }
}
