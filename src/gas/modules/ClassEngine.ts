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
   * 將日期字串 (yyyy-MM-dd) 與時間值 (Date 物件或 "HH:mm" 字串) 組合為正確的 Date 物件，防止時區位移與 Invalid Date 錯誤
   */
  private static parseDateTime(dateStr: string, timeVal: any): Date {
    const parts = String(dateStr).split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed
    const day = parseInt(parts[2], 10);
    
    const d = new Date(year, month, day); // 台北時間 00:00:00 初始化
    let hours = 0;
    let minutes = 0;

    if (timeVal instanceof Date) {
      hours = timeVal.getHours();
      minutes = timeVal.getMinutes();
    } else if (timeVal) {
      let cleanTime = String(timeVal).trim();
      let isPM = false;
      if (cleanTime.includes('下午')) {
        isPM = true;
        cleanTime = cleanTime.replace('下午', '').trim();
      } else if (cleanTime.includes('上午')) {
        cleanTime = cleanTime.replace('上午', '').trim();
      }
      
      const timeParts = cleanTime.split(':');
      if (timeParts.length >= 2) {
        hours = parseInt(timeParts[0], 10);
        minutes = parseInt(timeParts[1], 10);
        if (isPM && hours < 12) {
          hours += 12;
        } else if (!isPM && hours === 12) {
          hours = 0;
        }
      }
    }
    
    d.setHours(hours, minutes, 0, 0);
    return d;
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

    // 解析星期幾字串為 JavaScript getDay() 數字陣列 (例如 "週一" -> [1], "週一 + 週三" -> [1, 3])
    function parseDaysOfWeek(dayStr: string): number[] {
      const clean = String(dayStr || '').trim();
      const days: number[] = [];
      const map: Record<string, number> = {
        '日': 0, '週日': 0, '星期日': 0,
        '一': 1, '週一': 1, '星期一': 1,
        '二': 2, '週二': 2, '星期二': 2,
        '三': 3, '週三': 3, '星期三': 3,
        '四': 4, '週四': 4, '星期四': 4,
        '五': 5, '週五': 5, '星期五': 5,
        '六': 6, '週六': 6, '星期六': 6
      };
      
      if (clean.includes('+')) {
        clean.split('+').forEach(part => {
          const key = part.trim();
          if (map[key] !== undefined) {
            days.push(map[key]);
          }
        });
      } else {
        if (map[clean] !== undefined) {
          days.push(map[clean]);
        } else {
          const num = Number(clean);
          if (!isNaN(num)) {
            days.push(num);
          }
        }
      }
      return days;
    }

    const daysOfWeek = parseDaysOfWeek(cls.day_of_week);
    if (daysOfWeek.length === 0) {
      daysOfWeek.push(1); // 預設週一
    }

    let currentDate = new Date(cls.period_start);
    currentDate.setHours(0, 0, 0, 0); // 確保在台北時間的午夜開始計算

    // 1. 移動到第一個符合上課星期的日期
    while (!daysOfWeek.includes(currentDate.getDay())) {
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const totalSessions = Number(cls.total_sessions || (cls.period_weeks * cls.sessions_per_week));
    let seq = 1;

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
      do {
        currentDate.setDate(currentDate.getDate() + 1);
      } while (!daysOfWeek.includes(currentDate.getDay()));
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
        const startDateTime = this.parseDateTime(session.session_date, session.start_time);
        const endDateTime = this.parseDateTime(session.session_date, session.end_time);

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
   * 為特定班級進行「續期開班」與「學員自動轉移 (Rollover)」
   */
  public static renew(classId: string, newStartDate: string, renewMemberIds: string[], termRemark: string): { generated: number } {
    const cls = SheetHelper.getRow<any>('Classes', 'class_id', classId);
    if (!cls) {
      throw new Error(`找不到班級代碼: ${classId}`);
    }

    // 1. 取得現有 Sessions，找出最後一堂的序列號 seq (比如 12)
    const allSessions = SheetHelper.getRows<any>('Sessions').filter(s => s.class_id === classId);
    let startSeq = 1;
    if (allSessions.length > 0) {
      const seqs = allSessions.map(s => Number(s.session_seq) || 0);
      startSeq = Math.max(...seqs) + 1;
    }

    // 2. 更新 Classes 表中的「本期開始日期」與備註
    const classesSheet = SheetHelper.getSheet('Classes');
    const classesRows = SheetHelper.getRows<any>('Classes');
    const classRowIndex = classesRows.findIndex(c => c.class_id === classId);
    if (classRowIndex !== -1) {
      const rowNum = classRowIndex + 2;
      const colMap = SheetHelper.COLUMN_MAP['Classes'];
      const headers = classesSheet.getRange(1, 1, 1, classesSheet.getLastColumn()).getValues()[0];
      const periodStartCol = headers.indexOf(colMap.period_start) + 1;
      const notesCol = headers.indexOf(colMap.notes) + 1;
      
      if (periodStartCol > 0) {
        classesSheet.getRange(rowNum, periodStartCol).setValue(newStartDate);
      }
      if (notesCol > 0) {
        const oldNotes = classesRows[classRowIndex].notes || '';
        classesSheet.getRange(rowNum, notesCol).setValue(`${oldNotes} [續期: ${termRemark}]`.trim());
      }
    }

    // 3. 展開新一期的 Sessions
    const sessions: any[] = [];
    const holidaysStr = Config.get('HOLIDAYS', '');
    const holidays = holidaysStr ? holidaysStr.split(',').map(d => d.trim()) : [];

    // 解析星期幾字串
    function parseDaysOfWeek(dayStr: string): number[] {
      const clean = String(dayStr || '').trim();
      const days: number[] = [];
      const map: Record<string, number> = {
        '日': 0, '週日': 0, '星期日': 0,
        '一': 1, '週一': 1, '星期一': 1,
        '二': 2, '週二': 2, '星期二': 2,
        '三': 3, '週三': 3, '星期三': 3,
        '四': 4, '週四': 4, '星期四': 4,
        '五': 5, '週五': 5, '星期五': 5,
        '六': 6, '週六': 6, '星期六': 6
      };
      
      if (clean.includes('+')) {
        clean.split('+').forEach(part => {
          const key = part.trim();
          if (map[key] !== undefined) {
            days.push(map[key]);
          }
        });
      } else {
        if (map[clean] !== undefined) {
          days.push(map[clean]);
        } else {
          const num = Number(clean);
          if (!isNaN(num)) {
            days.push(num);
          }
        }
      }
      return days;
    }

    const daysOfWeek = parseDaysOfWeek(cls.day_of_week);
    if (daysOfWeek.length === 0) {
      daysOfWeek.push(1);
    }

    let currentDate = new Date(newStartDate);
    currentDate.setHours(0, 0, 0, 0);

    // 移動到第一個符合星期的日期
    while (!daysOfWeek.includes(currentDate.getDay())) {
      currentDate.setDate(currentDate.getDate() + 1);
    }

    const periodWeeks = Number(cls.period_weeks) || 12;
    const sessionsPerWeek = Number(cls.sessions_per_week) || 1;
    const totalSessionsToGenerate = periodWeeks * sessionsPerWeek;
    
    let seq = startSeq;
    const endSeq = startSeq + totalSessionsToGenerate - 1;

    while (seq <= endSeq) {
      const dateStr = Utilities.formatDate(currentDate, 'Asia/Taipei', 'yyyy-MM-dd');

      if (holidays.includes(dateStr)) {
        currentDate.setDate(currentDate.getDate() + 1);
        while (!daysOfWeek.includes(currentDate.getDay())) {
          currentDate.setDate(currentDate.getDate() + 1);
        }
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
        notes: `[期數: ${termRemark}]`
      });

      // Advance
      do {
        currentDate.setDate(currentDate.getDate() + 1);
      } while (!daysOfWeek.includes(currentDate.getDay()));
      
      seq++;
    }

    // 4. 取得相關關聯名稱 (教練、教室)
    const coachRow = SheetHelper.getRow<any>('Staff', 'line_uid', cls.coach_line_uid);
    const coachName = coachRow ? coachRow.real_name : '未指派教練';

    const roomRow = SheetHelper.getRow<any>('Rooms', 'room_id', cls.room_id);
    const roomName = roomRow ? roomRow.room_name : '未設定教室';

    // 5. 批次建立 Google 日曆事件並回寫 ID
    const calendar = this.getCalendar();
    
    const allMembers = SheetHelper.getRows<any>('Members');
    const renewMemberNames = renewMemberIds.map(uid => {
      const m = allMembers.find(member => member.member_id === uid);
      return m ? m.real_name : uid;
    });

    sessions.forEach(session => {
      try {
        const startDateTime = this.parseDateTime(session.session_date, session.start_time);
        const endDateTime = this.parseDateTime(session.session_date, session.end_time);

        const title = `${cls.class_name} (預計 ${renewMemberNames.length} 人) [${termRemark}]`;
        const studentLines = renewMemberNames.map(name => `• ${name} (已續期待繳費)`).join('\n');
        
        const description = `【課程資訊】\n班級：${cls.class_name} [${termRemark}]\n教練：${coachName}\n教室：${roomName}\n人數上限：${cls.max_capacity ?? '無'}人\n\n✅ 預計出席學員 (${renewMemberNames.length}人):\n${studentLines || '(無)'}\n\n🚫 請假學員:\n(無)\n\n🔄 補課學員:\n(無)`;

        const event = calendar.createEvent(title, startDateTime, endDateTime, {
          description: description,
          location: roomName
        });

        session.calendar_event_id = event.getId();
      } catch (e) {
        Logger.log(`[續期日曆建立失敗] Session: ${session.session_id}, Error: ${e instanceof Error ? e.message : e}`);
      }
    });

    // 6. 批次寫入 Sessions 工作表
    SheetHelper.bulkInsert('Sessions', sessions);

    // 7. 學員自動轉移 (Rollover) -> 寫入 Enrollments，狀態為 pending_payment
    const newEnrollments: any[] = renewMemberIds.map(uid => {
      return {
        enrollment_id: `ENR-${classId}-${uid.substring(0, 6)}-${Utilities.formatDate(new Date(), 'Asia/Taipei', 'MMdd')}`,
        member_id: uid,
        class_id: classId,
        enroll_date: Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd'),
        status: 'pending_payment',
        total_paid_sessions: 0,
        notes: `學員自動續期 [${termRemark}]`
      };
    });

    if (newEnrollments.length > 0) {
      SheetHelper.bulkInsert('Enrollments', newEnrollments);
    }

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
   * 停課或調整特定課堂，連動停用日曆事件，支援順延與返還點數 (Spec v3.0)
   */
  public static suspendSessions(
    sessionIds: string[], 
    reason: string, 
    substituteCoachUid: string | null = null,
    extendWeeks: number = 0,
    grantMakeupPoints: boolean = false
  ): void {
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

      // 如果是「停課」而非「代課教練」
      if (!substituteCoachUid) {
        const classId = session.class_id;
        const cls = SheetHelper.getRow<any>('Classes', 'class_id', classId);
        if (!cls) return;

        // A. 針對一期一個月的班 (B 類) 或管理員勾選返還點數者：發放請假補償以返還補課點數
        if (grantMakeupPoints || cls.class_type === 'B') {
          const enrollments = SheetHelper.getRows<any>('Enrollments');
          const enrolledMembers = enrollments.filter(e => e.class_id === classId && e.status === 'active');
          
          enrolledMembers.forEach(e => {
            const leaveId = `LV-SYS-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            // 寫入請假申請 (Leave_Requests)，預設自動審查通過，且 makeup_session_id 為空代表擁有 1 點可補課點數
            SheetHelper.addRow('Leave_Requests', {
              leave_id: leaveId,
              member_id: e.member_id,
              session_id: id,
              request_time: new Date(),
              status: 'approved',
              approved_by: 'system',
              makeup_session_id: '',
              notes: `[系統停課補償] 課堂因故停課，自動發送補課點數。原因: ${reason}`
            });

            // 同步寫入出勤紀錄為 'leave'
            SheetHelper.addRow('Attendance', {
              attendance_id: `ATT-SYS-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              session_id: id,
              member_id: e.member_id,
              type: 'leave',
              checkin_time: new Date(),
              checkin_by: 'system',
              original_session_id: '',
              notes: `[系統停課請假] 原因: ${reason}`
            });
          });
          Logger.log(`[系統停課補償] 已為班級 ${classId} 的 ${enrolledMembers.length} 位學員發放請假返還補課點數`);
        }

        // B. 針對 12 週者 (A 類 / C 類) 或勾選順延者：順延結束日期
        if (extendWeeks > 0 && cls.class_type !== 'B') {
          // 1. 取得該班級所有現有課堂，找出最後一堂課的日期
          const sessions = SheetHelper.getRows<any>('Sessions').filter(s => s.class_id === classId);
          let latestDate = new Date(cls.period_start);
          sessions.forEach(s => {
            if (s.date) {
              const d = new Date(s.date);
              if (!isNaN(d.getTime()) && d.getTime() > latestDate.getTime()) {
                latestDate = d;
              }
            }
          });

          // 2. 依序產生順延新課堂 (例如順延 1 週或 2 週)
          for (let i = 1; i <= extendWeeks; i++) {
            const nextDate = new Date(latestDate);
            nextDate.setDate(nextDate.getDate() + (7 * i)); // 順延 i 週

            const newSessionId = `SES-${Math.floor(nextDate.getTime() / 1000)}`;
            const dateStr = nextDate.toISOString().split('T')[0];

            // 建立日曆活動
            let calendarEventId = '';
            try {
              const calendar = this.getCalendar();
              const startTimeStr = `${dateStr}T${cls.start_time}:00`;
              const endTimeStr = `${dateStr}T${cls.end_time}:00`;
              const event = calendar.createEvent(
                `${cls.class_name} (0/8人)`,
                new Date(startTimeStr),
                new Date(endTimeStr),
                {
                  description: `【課程資訊】\n班級：${cls.class_name}\n停課順延生成課堂`
                }
              );
              calendarEventId = event.getId();
            } catch (err) {
              Logger.log(`[順延建立日曆活動失敗] ${err}`);
            }

            // 新增 Session 記錄
            SheetHelper.addRow('Sessions', {
              session_id: newSessionId,
              class_id: classId,
              class_name: cls.class_name,
              coach_line_uid: cls.coach_line_uid,
              room_id: cls.room_id,
              date: dateStr,
              session_date: dateStr,
              start_time: cls.start_time,
              end_time: cls.end_time,
              status: 'open',
              calendar_event_id: calendarEventId,
              notes: `[停課順延生成] 代替已停課時段: ${session.date}`
            });
            Logger.log(`[停課順延] 已成功為班級 ${classId} 生成新的課堂：${dateStr} (${newSessionId})`);
          }

          // 3. 更新 Classes 中的總週數 (period_weeks)
          const newPeriodWeeks = (Number(cls.period_weeks) || 12) + extendWeeks;
          const newTotalSessions = (Number(cls.total_sessions) || 12) + extendWeeks;
          SheetHelper.updateRow('Classes', 'class_id', classId, {
            period_weeks: newPeriodWeeks,
            total_sessions: newTotalSessions
          });
          Logger.log(`[停課順延] 班級 ${classId} 的總週數已增加為: ${newPeriodWeeks}週，總堂數變更為: ${newTotalSessions}堂`);
        }
      }
    });
  }

  /**
   * 自動完成所有已過期的未來課堂 (F-C02 防呆擴充)
   * 規則：當課程日期與結束時間已過去，且狀態仍為 scheduled，自動更新為 completed 結案
   */
  public static autoCompletePastSessions(): void {
    const now = new Date();
    const allSessions = SheetHelper.getRows<any>('Sessions');
    
    // 找出所有已過去但狀態仍為 scheduled 的課堂
    const pastSessions = allSessions.filter(s => {
      if (s.status !== 'scheduled') {
        return false;
      }
      try {
        const sessionEnd = this.parseDateTime(s.session_date, s.end_time);
        return sessionEnd < now;
      } catch (e) {
        return false;
      }
    });

    if (pastSessions.length === 0) {
      return;
    }

    Logger.log(`[系統防呆自動結課] 偵測到 ${pastSessions.length} 堂過期課堂，開始批次更新為 completed 狀態。`);
    
    pastSessions.forEach(s => {
      SheetHelper.updateRow('Sessions', 'session_id', s.session_id, {
        status: 'completed'
      });
      // 順便即時同步該堂課之 Google 日曆事件描述 (包含出席人數描述)
      try {
        this.syncCalendarEvent(s.session_id);
      } catch (err) {
        Logger.log(`[系統自動結課日曆同步失敗] ${s.session_id}: ${err}`);
      }
    });

    Logger.log(`[系統防呆自動結課] 已成功自動結算 ${pastSessions.length} 堂過期課堂！`);
  }
}
