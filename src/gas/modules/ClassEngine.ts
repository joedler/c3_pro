/**
 * ClassEngine.ts
 * 負責開班排程、批次展開課程、自動同步 Google Calendar (PRD v3.0)
 */

class ClassEngine {
  /**
   * 取得對應用戶設定的 Google 日曆
   */
  private static getCalendar(): GoogleAppsScript.Calendar.Calendar {
    const calendarId = Config.get('GOOGLE_CALENDAR_ID');
    if (calendarId && calendarId !== 'primary') {
      try {
        const cal = CalendarApp.getCalendarById(calendarId);
        if (cal) return cal;
      } catch (e) {
        Logger.log(`[日曆載入失敗，採用預設日曆] ${e instanceof Error ? e.message : e}`);
      }
    }
    return CalendarApp.getDefaultCalendar();
  }

  /**
   * 依據 Classes 班級設定，批次產生 Sessions 課堂紀錄，並同步至 Google Calendar
   * @param classId 班級ID
   */
  public static generate(classId: string): { generated: number } {
    const cls = SheetHelper.getRow<any>('Classes', 'class_id', classId);
    if (!cls) {
      throw new Error(`找不到班級代碼: ${classId}`);
    }

    const sessions: any[] = [];
    const holidaysStr = Config.get('HOLIDAYS', '');
    const holidays = holidaysStr ? holidaysStr.split(',').map(d => d.trim()) : [];

    let currentDate = new Date(cls.period_start);
    currentDate.setHours(0, 0, 0, 0); // 確保在台北時間的午夜開始計算

    // 1. 移動到第一個符合上課星期的日期
    while (currentDate.getDay() !== Number(cls.day_of_week)) {
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const totalSessions = Number(cls.total_sessions || (cls.period_weeks * cls.sessions_per_week));
    let seq = 1;
    let alternateGap = 3; // 適用於一週兩堂 (如週二/週五差 3 天，週五/下週二差 4 天)

    // 2. 展開所有上課日期並跳過國定假日
    while (seq <= totalSessions) {
      const dateStr = Utilities.formatDate(currentDate, 'Asia/Taipei', 'yyyy-MM-dd');

      if (holidays.includes(dateStr)) {
        // 遇到國定假日，直接將日期往後推，不列入上課堂數計數
        advanceDate();
        continue;
      }

      sessions.push({
        session_id: `SES-${classId}-${String(seq).padStart(2, '0')}`,
        class_id: classId,
        session_date: dateStr,
        session_seq: seq,
        start_time: cls.start_time,
        end_time: cls.end_time,
        status: 'scheduled',
        actual_count: 0,
        calendar_event_id: '',
        notes: ''
      });

      advanceDate();
      seq++;
    }

    function advanceDate() {
      if (Number(cls.sessions_per_week) === 1) {
        currentDate.setDate(currentDate.getDate() + 7);
      } else {
        currentDate.setDate(currentDate.getDate() + alternateGap);
        alternateGap = alternateGap === 3 ? 4 : 3;
      }
    }

    // 3. 取得相關關聯名稱 (教練、教室) 供日曆渲染使用
    const coachRow = SheetHelper.getRow<any>('Staff', 'line_uid', cls.coach_line_uid);
    const coachName = coachRow ? coachRow.real_name : '未指派教練';

    const roomRow = SheetHelper.getRow<any>('Rooms', 'room_id', cls.room_id);
    const roomName = roomRow ? roomRow.room_name : '未設定教室';

    // 4. 批次建立日曆事件並回寫 ID
    const calendar = this.getCalendar();
    sessions.forEach(session => {
      try {
        const startDateTime = new Date(`${session.session_date}T${session.start_time}:00`);
        const endDateTime = new Date(`${session.session_date}T${session.end_time}:00`);

        const title = `${cls.class_name} (預計 0 人)`;
        const description = `【課程資訊】\n班級：${cls.class_name}\n教練：${coachName}\n教室：${roomName}\n人數上限：${cls.max_capacity ?? '無'}人\n\n✅ 預計出席學員 (0人):\n(尚未有學員報名)\n\n🚫 請假學員:\n(無)\n\n🔄 補課學員:\n(無)`;

        const event = calendar.createEvent(title, startDateTime, endDateTime, {
          description: description,
          location: roomName
        });

        session.calendar_event_id = event.getId();
      } catch (e) {
        Logger.log(`[日曆事件建立失敗] Session: ${session.session_id}, Error: ${e instanceof Error ? e.message : e}`);
      }
    });

    // 5. 批次寫入資料庫 Sessions Sheet
    SheetHelper.bulkInsert('Sessions', sessions);

    return { generated: sessions.length };
  }

  /**
   * 當請假、補課或報名名單變動時，即時更新與重新同步該堂課的 Google 日曆事件描述欄
   * @param sessionId 課堂ID
   */
  public static syncCalendarEvent(sessionId: string): void {
    const session = SheetHelper.getRow<any>('Sessions', 'session_id', sessionId);
    if (!session || !session.calendar_event_id) return;

    const cls = SheetHelper.getRow<any>('Classes', 'class_id', session.class_id);
    if (!cls) return;

    // 1. 取得教練與教室名稱
    const coachRow = SheetHelper.getRow<any>('Staff', 'line_uid', session.substitute_coach_uid || cls.coach_line_uid);
    const coachName = coachRow ? coachRow.real_name : '未指派教練';
    const isSubstitute = !!session.substitute_coach_uid;

    const roomRow = SheetHelper.getRow<any>('Rooms', 'room_id', cls.room_id);
    const roomName = roomRow ? roomRow.room_name : '未設定教室';

    // 2. 獲取報名該班級的所有正式學員
    const enrollments = SheetHelper.getRows<any>('Enrollments').filter(
      e => e.class_id === session.class_id && e.status === 'active'
    );
    const memberIds = enrollments.map(e => e.member_id);
    const allMembers = SheetHelper.getRows<any>('Members');
    
    // 將 member_id 映射為 real_name
    const memberMap: Record<string, string> = {};
    allMembers.forEach(m => {
      memberMap[m.member_id] = m.real_name || m.display_name || '未命名學員';
    });

    // 3. 獲取本堂課的請假已批准名單
    const approvedLeaves = SheetHelper.getRows<any>('Leave_Requests').filter(
      l => l.session_id === sessionId && l.status === 'approved'
    );
    const leaveMemberIds = new Set(approvedLeaves.map(l => l.member_id));

    // 4. 獲取本堂課的補課已批准名單
    const approvedMakeups = SheetHelper.getRows<any>('Makeup_Requests').filter(
      m => m.target_session_id === sessionId && m.status === 'approved'
    );

    // 5. 計算實際出席名單
    const regularAttendingNames: string[] = [];
    const leaveNames: string[] = [];
    const makeupNames: string[] = [];

    // 正式學員分流：出席 / 請假
    memberIds.forEach(id => {
      const name = memberMap[id];
      if (name) {
        if (leaveMemberIds.has(id)) {
          leaveNames.push(name);
        } else {
          regularAttendingNames.push(name);
        }
      }
    });

    // 補課學員
    approvedMakeups.forEach(m => {
      const name = memberMap[m.member_id];
      if (name) {
        makeupNames.push(`${name} (跨班補課)`);
      }
    });

    const totalAttending = regularAttendingNames.length + makeupNames.length;
    const maxCapacity = cls.max_capacity || (roomRow ? roomRow.max_capacity : 15);

    // 6. 重新編排日曆內容
    const calendar = this.getCalendar();
    try {
      const event = calendar.getEventById(session.calendar_event_id);
      if (event) {
        const substitutePrefix = isSubstitute ? `[代課:${coachName}] ` : '';
        const statusPrefix = session.status === 'cancelled' ? '[已停課] ' : '';
        
        event.setTitle(`${statusPrefix}${substitutePrefix}${cls.class_name} (${totalAttending}/${maxCapacity}人)`);

        const description = `【課程資訊】
班級：${cls.class_name}
教練：${coachName}${isSubstitute ? ' (代課教練)' : ''}
教室：${roomName}
人數上限：${maxCapacity}人

✅ 預計出席學員 (${totalAttending}人):
${[...regularAttendingNames, ...makeupNames].map(name => `• ${name}`).join('\n') || '(無學員出席)'}

🚫 請假學員 (${leaveNames.length}人):
${leaveNames.map(name => `• ${name}`).join('\n') || '(無)'}

🔄 補課學員 (${makeupNames.length}人):
${makeupNames.map(name => `• ${name}`).join('\n') || '(無)'}`;

        event.setDescription(description);
      }
    } catch (e) {
      Logger.log(`[同步日曆事件失敗] Session: ${sessionId}, Error: ${e instanceof Error ? e.message : e}`);
    }
  }

  /**
   * 停課或調整特定課堂，連動停用日曆事件
   */
  public static suspendSessions(sessionIds: string[], reason: string, substituteCoachUid: string | null = null): void {
    const calendar = this.getCalendar();
    
    sessionIds.forEach(id => {
      const session = SheetHelper.getRow<any>('Sessions', 'session_id', id);
      if (!session) return;

      const updatePayload: Record<string, any> = {};

      if (substituteCoachUid) {
        updatePayload.substitute_coach_uid = substituteCoachUid;
        updatePayload.notes = `代課原因: ${reason}`;
      } else {
        updatePayload.status = 'cancelled';
        updatePayload.cancel_reason = reason;
      }

      // 1. 更新 Sheets 資料庫
      SheetHelper.updateRow('Sessions', 'session_id', id, updatePayload);

      // 2. 同步更新日曆
      this.syncCalendarEvent(id);
    });
  }
}
