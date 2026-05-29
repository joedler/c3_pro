/**
 * ClassEngine.ts
 * 負責開班排程、批次展開課程、自動同步 Google Calendar (PRD v3.0)
 */

class ClassEngine {
  /**
   * 將日期字串 (yyyy-MM-dd) 或 Date 物件與時間值 (Date 物件或 "HH:mm" 字串) 組合為正確的 Date 物件，防止時區位移與 Invalid Date 錯誤
   */
  private static parseDateTime(dateVal: any, timeVal: any): Date {
    let year = 0, month = 0, day = 0;
    
    if (dateVal instanceof Date) {
      year = dateVal.getFullYear();
      month = dateVal.getMonth();
      day = dateVal.getDate();
    } else {
      const parts = String(dateVal).split('T')[0].split('-');
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10) - 1; // 0-indexed
      day = parseInt(parts[2], 10);
    }
    
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

  private static formatDateYmd(dateVal: any): string {
    return Utilities.formatDate(this.normalizeDateOnly(dateVal), 'Asia/Taipei', 'yyyy-MM-dd');
  }

  private static nextClassDateAfter(dateVal: any, dayOfWeek: number): Date {
    const next = this.normalizeDateOnly(dateVal);
    do {
      next.setDate(next.getDate() + 1);
    } while (next.getDay() !== dayOfWeek);
    return next;
  }

  private static parseDaysOfWeek(dayVal: any): number[] {
    const clean = String(dayVal || '').trim();
    const map: Record<string, number> = {
      '日': 0, '週日': 0, '星期日': 0, 'Sunday': 0, 'SUN': 0,
      '一': 1, '週一': 1, '星期一': 1, 'Monday': 1, 'MON': 1,
      '二': 2, '週二': 2, '星期二': 2, 'Tuesday': 2, 'TUE': 2,
      '三': 3, '週三': 3, '星期三': 3, 'Wednesday': 3, 'WED': 3,
      '四': 4, '週四': 4, '星期四': 4, 'Thursday': 4, 'THU': 4,
      '五': 5, '週五': 5, '星期五': 5, 'Friday': 5, 'FRI': 5,
      '六': 6, '週六': 6, '星期六': 6, 'Saturday': 6, 'SAT': 6
    };
    const parts = clean.includes('+') ? clean.split('+') : [clean];
    return parts.map(part => {
      const key = part.trim();
      if (map[key] !== undefined) return map[key];
      const num = Number(key);
      return isNaN(num) ? -1 : num;
    }).filter(day => day >= 0 && day <= 6);
  }

  private static makeTermId(classId: string, startDate: string, termRemark: string): string {
    const cleanRemark = String(termRemark || 'term')
      .replace(/[^\w\u4e00-\u9fa5]+/g, '')
      .substring(0, 16);
    return `TERM-${classId}-${String(startDate || '').substring(0, 10)}-${cleanRemark || 'new'}`;
  }

  private static buildCalendarDescription(params: {
    className: string;
    roomName: string;
    startTime: any;
    endTime: any;
    maxCapacity: number | string;
    periodStart?: string;
    periodEnd?: string;
    attendingNames?: string[];
    leaveNames?: string[];
    makeupNames?: string[];
    extensionNote?: string;
  }): string {
    const attendingNames = params.attendingNames || [];
    const leaveNames = params.leaveNames || [];
    const makeupNames = params.makeupNames || [];
    return `【課程資訊】
班級：${params.className}
教室：${params.roomName}
起訖日期：${params.periodStart || '未定'} ~ ${params.periodEnd || '未定'}
上課時間：${this.formatTimeForDisplay(params.startTime)} ~ ${this.formatTimeForDisplay(params.endTime)}
人數上限：${params.maxCapacity}人
${params.extensionNote ? `\n📌 延期備註：${params.extensionNote}\n` : ''}
✅ 預計出席學員 (${attendingNames.length}人):
${attendingNames.map(name => `• ${name}`).join('\n') || '(無學員出席)'}

🚫 請假學員 (${leaveNames.length}人):
${leaveNames.map(name => `• ${name}`).join('\n') || '(無)'}

🔄 補課學員 (${makeupNames.length}人):
${makeupNames.map(name => `• ${name}`).join('\n') || '(無)'}`;
  }

  private static formatTimeForDisplay(timeVal: any): string {
    if (timeVal instanceof Date) {
      return Utilities.formatDate(timeVal, 'Asia/Taipei', 'HH:mm');
    }
    const match = String(timeVal || '').match(/(\d{1,2}):(\d{2})/);
    return match ? `${match[1].padStart(2, '0')}:${match[2]}` : String(timeVal || '').substring(0, 5);
  }

  private static sanitizeExtensionNote(note: any, fallbackDate: any): string {
    const raw = String(note || '').trim();
    if (!raw) return '[停課順延生成]';

    const dateMatch = raw.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}|[A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{4}(?:\s+\d{2}:\d{2}:\d{2})?/);
    let dateText = '';
    if (dateMatch) {
      const candidate = dateMatch[0].replace(/\//g, '-');
      const parsed = new Date(candidate);
      dateText = isNaN(parsed.getTime()) ? candidate : this.formatDateYmd(parsed);
    } else if (fallbackDate) {
      dateText = this.formatDateYmd(fallbackDate);
    }

    const normalized = dateMatch ? raw.replace(dateMatch[0], dateText) : raw;
    if (normalized.includes('代替已停課時段')) {
      return `[停課順延生成] 原課堂：${dateText || '未記錄'}`;
    }
    if (normalized.includes('原課堂：') || normalized.includes('原因：')) {
      return normalized;
    }
    return dateText ? `[停課順延生成] 原課堂：${dateText}` : normalized;
  }

  private static getSessionDateRange(sessions: any[]): { start: string; end: string } {
    const sorted = sessions
      .filter(s => String(s.status || '').trim() !== 'cancelled')
      .filter(s => s.session_date || s.date)
      .sort((a, b) => this.normalizeDateOnly(a.session_date || a.date).getTime() - this.normalizeDateOnly(b.session_date || b.date).getTime());
    return {
      start: sorted[0] ? this.formatDateYmd(sorted[0].session_date || sorted[0].date) : '',
      end: sorted[sorted.length - 1] ? this.formatDateYmd(sorted[sorted.length - 1].session_date || sorted[sorted.length - 1].date) : ''
    };
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

    const classStatus = String(cls.status || '').trim().toLowerCase();
    if (classStatus === 'pending') {
      Logger.log(`[ClassEngine.generate] ${classId} 尚未開課，略過課堂與日曆建立。`);
      return { generated: 0 };
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

    const periodType = String(cls.period_type || 'weekly').trim().toLowerCase();

    let totalSessions: number;

    if (periodType === 'monthly') {
      // === 方案 B：動態計算當月實際上課堂數 ===
      // 根據 period_start 所在月份，計算 daysOfWeek 每個星期幾各出現幾次加總
      const startDate = cls.period_start instanceof Date
        ? cls.period_start
        : new Date(String(cls.period_start).split('T')[0]);
      const year = startDate.getFullYear();
      const month = startDate.getMonth(); // 0-indexed
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      totalSessions = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        if (daysOfWeek.includes(new Date(year, month, d).getDay())) {
          totalSessions++;
        }
      }
      Logger.log(`[ClassEngine] ${classId} (月費制) ${year}/${month + 1} 動態計算堂數: ${totalSessions} 堂 (星期: ${daysOfWeek.join(',')})`);

      // 將計算出的實際堂數回寫至 Classes 表，確保後續 activateEnrollment 時能直接讀到正確的數字
      SheetHelper.updateRow('Classes', 'class_id', classId, { total_sessions: totalSessions });
    } else {
      // === 固定週期制 ===
      totalSessions = Number(cls.total_sessions || (Number(cls.period_weeks) * Number(cls.sessions_per_week)));
    }

    let currentDate = new Date(cls.period_start instanceof Date
      ? cls.period_start
      : new Date(String(cls.period_start).split('T')[0]));
    currentDate.setHours(0, 0, 0, 0);

    // 1. 移動到第一個符合上課星期的日期
    while (!daysOfWeek.includes(currentDate.getDay())) {
      currentDate.setDate(currentDate.getDate() + 1);
    }

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

    // 3. 取得教室名稱供日曆渲染使用；正式版暫不在日曆顯示教練。
    const roomRow = SheetHelper.getRow<any>('Rooms', 'room_id', cls.room_id);
    const roomName = roomRow ? roomRow.room_name : '未設定教室';

    // 4. 批次建立日曆事件並回寫 ID
    const calendarId = Config.get('GOOGLE_CALENDAR_ID');
    const generatedRange = this.getSessionDateRange(sessions);
    sessions.forEach(session => {
      try {
        const startDateTime = this.parseDateTime(session.session_date, session.start_time);
        const endDateTime = this.parseDateTime(session.session_date, session.end_time);

        const title = `${cls.class_name} (預計 0 人)`;
        const description = this.buildCalendarDescription({
          className: cls.class_name,
          roomName,
          startTime: session.start_time,
          endTime: session.end_time,
          maxCapacity: cls.max_capacity ?? '無',
          periodStart: generatedRange.start,
          periodEnd: generatedRange.end,
          attendingNames: []
        });

        const eventId = GoogleCalendarAPI.createEvent(calendarId, title, startDateTime, endDateTime, {
          description: description,
          location: roomName
        });

        session.calendar_event_id = eventId;
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
  public static renew(classId: string, newStartDate: string, renewMemberIds: string[], termRemark: string): { generated: number; renewedMembers: number; skippedMembers: number } {
    const cls = SheetHelper.getRow<any>('Classes', 'class_id', classId);
    if (!cls) {
      throw new Error(`找不到班級代碼: ${classId}`);
    }
    SheetHelper.ensureColumns('Sessions', ['term_id', 'term_label']);
    SheetHelper.ensureColumns('Enrollments', ['term_id', 'term_label', 'previous_enrollment_id']);
    const termId = this.makeTermId(classId, newStartDate, termRemark);
    const termLabel = String(termRemark || '').trim() || `${String(newStartDate || '').substring(0, 7)}期`;

    // 1. 取得現有 Sessions，找出最後一堂的序列號 seq (比如 12)
    const allSessions = SheetHelper.getRows<any>('Sessions').filter(s => s.class_id === classId);
    if (allSessions.some(s => String(s.term_id || '').trim() === termId)) {
      throw new Error(`此班級已建立「${termLabel}」課堂，請勿重複續期。`);
    }

    const allMembers = SheetHelper.getRows<any>('Members');
    const activeMemberIds = new Set(
      allMembers
        .filter(m => String(m.status || '').trim() === 'active')
        .map(m => String(m.member_id || '').trim())
    );
    const existingEnrollments = SheetHelper.getRows<any>('Enrollments');
    const currentActiveEnrollments = existingEnrollments.filter(e =>
      String(e.class_id || '').trim() === String(classId || '').trim() &&
      String(e.status || '').trim() === 'active'
    );
    const eligibleRenewMemberIds = renewMemberIds.filter(uid => {
      if (!activeMemberIds.has(String(uid || '').trim())) return false;
      return currentActiveEnrollments.some(e =>
        String(e.member_id || '').trim() === String(uid || '').trim() &&
        String(e.class_id || '').trim() === String(classId || '').trim()
      );
    });
    if (eligibleRenewMemberIds.length === 0) {
      throw new Error('沒有可續期的啟用中學員；可能已續期完成，或學員尚未啟用/已結束。');
    }

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

    const periodType = String(cls.period_type || 'weekly').trim().toLowerCase();
    let totalSessionsToGenerate = 0;

    if (periodType === 'monthly') {
      const startDate = new Date(newStartDate.split('T')[0]);
      const year = startDate.getFullYear();
      const month = startDate.getMonth(); // 0-indexed
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      for (let d = 1; d <= daysInMonth; d++) {
        if (daysOfWeek.includes(new Date(year, month, d).getDay())) {
          totalSessionsToGenerate++;
        }
      }
      Logger.log(`[ClassEngine.renew] ${classId} (月費制) 新一期 ${year}/${month + 1} 動態堂數: ${totalSessionsToGenerate} 堂`);

      // 順便更新 Classes 表的總堂數欄位
      const classesSheet = SheetHelper.getSheet('Classes');
      const classesRows = SheetHelper.getRows<any>('Classes');
      const classRowIndex = classesRows.findIndex(c => c.class_id === classId);
      if (classRowIndex !== -1) {
        const rowNum = classRowIndex + 2;
        const colMap = SheetHelper.COLUMN_MAP['Classes'];
        const headers = classesSheet.getRange(1, 1, 1, classesSheet.getLastColumn()).getValues()[0];
        const totalSessionsCol = headers.indexOf(colMap.total_sessions) + 1;
        if (totalSessionsCol > 0) {
          classesSheet.getRange(rowNum, totalSessionsCol).setValue(totalSessionsToGenerate);
        }
      }
    } else {
      const periodWeeks = Number(cls.period_weeks) || 12;
      const sessionsPerWeek = Number(cls.sessions_per_week) || 1;
      totalSessionsToGenerate = periodWeeks * sessionsPerWeek;
    }

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
        term_id: termId,
        term_label: termLabel,
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

    // 4. 取得教室名稱；正式版暫不在日曆顯示教練。
    const roomRow = SheetHelper.getRow<any>('Rooms', 'room_id', cls.room_id);
    const roomName = roomRow ? roomRow.room_name : '未設定教室';

    // 5. 批次建立 Google 日曆事件並回寫 ID
    const calendarId = Config.get('GOOGLE_CALENDAR_ID');
    
    const renewMemberNames = eligibleRenewMemberIds.map(uid => {
      const m = allMembers.find(member => member.member_id === uid);
      return m ? m.real_name : uid;
    });
    const renewalRange = this.getSessionDateRange(sessions);

    sessions.forEach(session => {
      try {
        const startDateTime = this.parseDateTime(session.session_date, session.start_time);
        const endDateTime = this.parseDateTime(session.session_date, session.end_time);

        const title = `${cls.class_name} (預計 ${renewMemberNames.length} 人) [${termRemark}]`;
        const description = this.buildCalendarDescription({
          className: `${cls.class_name} [${termRemark}]`,
          roomName,
          startTime: session.start_time,
          endTime: session.end_time,
          maxCapacity: cls.max_capacity ?? '無',
          periodStart: renewalRange.start,
          periodEnd: renewalRange.end,
          attendingNames: renewMemberNames.map(name => `${name} (已續期待繳費)`),
          leaveNames: [],
          makeupNames: []
        });

        const eventId = GoogleCalendarAPI.createEvent(calendarId, title, startDateTime, endDateTime, {
          description: description,
          location: roomName
        });

        session.calendar_event_id = eventId;
      } catch (e) {
        Logger.log(`[續期日曆建立失敗] Session: ${session.session_id}, Error: ${e instanceof Error ? e.message : e}`);
      }
    });

    // 6. 批次寫入 Sessions 工作表
    SheetHelper.bulkInsert('Sessions', sessions);

    // 7. 學員自動轉移 (Rollover) -> 寫入 Enrollments，狀態為 pending_payment
    const newEnrollments: any[] = eligibleRenewMemberIds.map(uid => {
      const previousEnrollment = currentActiveEnrollments.find(e =>
        String(e.member_id || '').trim() === String(uid || '').trim()
      );
      return {
        enrollment_id: `ENR-${classId}-${uid.substring(0, 6)}-${Utilities.formatDate(new Date(), 'Asia/Taipei', 'MMdd')}`,
        member_id: uid,
        class_id: classId,
        term_id: termId,
        term_label: termLabel,
        previous_enrollment_id: previousEnrollment ? previousEnrollment.enrollment_id : '',
        enroll_date: Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd'),
        status: 'pending_payment',
        total_paid_sessions: 0,
        notes: `學員自動續期 [${termRemark}]`
      };
    });

    if (newEnrollments.length > 0) {
      SheetHelper.bulkInsert('Enrollments', newEnrollments);
    }

    const renewedMemberSet = new Set(eligibleRenewMemberIds.map(id => String(id || '').trim()));
    currentActiveEnrollments.forEach(e => {
      const isRenewed = renewedMemberSet.has(String(e.member_id || '').trim());
      const oldNotes = String(e.notes || '').trim();
      const suffix = isRenewed
        ? `[本期結束，已續至 ${termLabel}]`
        : `[本期結束，未勾選續報 ${termLabel}]`;
      SheetHelper.updateRow('Enrollments', 'enrollment_id', e.enrollment_id, {
        status: 'ended',
        notes: `${oldNotes} ${suffix}`.trim()
      });
    });

    return { generated: sessions.length, renewedMembers: newEnrollments.length, skippedMembers: renewMemberIds.length - eligibleRenewMemberIds.length };
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

    // 1. 取得教室名稱；正式版暫不在日曆顯示教練或代課資訊。
    const roomRow = SheetHelper.getRow<any>('Rooms', 'room_id', cls.room_id);
    const roomName = roomRow ? roomRow.room_name : '未設定教室';

    // 2. 獲取報名該班級的所有正式學員
    const allClassSessions = SheetHelper.getRows<any>('Sessions').filter(
      s => s.class_id && session.class_id &&
           String(s.class_id).trim() === String(session.class_id).trim() &&
           String(s.status || '').trim() !== 'cancelled'
    );

    const enrollments = SheetHelper.getRows<any>('Enrollments').filter(
      e => e.class_id && session.class_id &&
           String(e.class_id).trim() === String(session.class_id).trim() && 
           String(e.status).trim() === 'active' &&
           this.isEnrollmentEligibleForSession(e, session, allClassSessions)
    );
    const allMembers = SheetHelper.getRows<any>('Members');
    const activeMemberIds = new Set(
      allMembers
        .filter(m => String(m.status || '').trim() === 'active')
        .map(m => String(m.member_id || '').trim())
        .filter(id => !!id)
    );
    const memberIds = Array.from(new Set(
      enrollments
        .map(e => String(e.member_id).trim())
        .filter(id => !!id && activeMemberIds.has(id))
    ));
    
    // 將 member_id 映射為 real_name
    const memberMap: Record<string, string> = {};
    allMembers.forEach(m => {
      if (m.member_id) {
        memberMap[String(m.member_id).trim()] = m.real_name || m.display_name || '未命名學員';
      }
    });

    // 3. 獲取本堂課的請假已批准名單
    const approvedLeaves = SheetHelper.getRows<any>('Leave_Requests').filter(
      l => l.session_id === sessionId && l.status === 'approved'
    );
    const leaveMemberIds = new Set(approvedLeaves.map(l => String(l.member_id).trim()));

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
      const cleanId = String(id).trim();
      const name = memberMap[cleanId];
      if (name) {
        if (leaveMemberIds.has(cleanId)) {
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
    const classRange = this.getSessionDateRange(allClassSessions);

    // 6. 重新編排日曆內容
    const calendarId = Config.get('GOOGLE_CALENDAR_ID');
    try {
      const statusPrefix = session.status === 'cancelled' ? '[已停課] ' : '';
      
      const title = `${statusPrefix}${cls.class_name} (${totalAttending}/${maxCapacity}人)`;

      const isExtensionSession = String(session.notes || '').includes('停課順延');
      const description = this.buildCalendarDescription({
        className: cls.class_name,
        roomName,
        startTime: session.start_time,
        endTime: session.end_time,
        maxCapacity,
        periodStart: classRange.start,
        periodEnd: classRange.end,
        attendingNames: [...regularAttendingNames, ...makeupNames],
        leaveNames,
        makeupNames,
        extensionNote: isExtensionSession ? String(session.notes || '') : ''
      });

      GoogleCalendarAPI.updateEvent(calendarId, session.calendar_event_id, {
        title: title,
        description: description
      });
    } catch (e) {
      Logger.log(`[同步日曆事件失敗] Session: ${sessionId}, Error: ${e instanceof Error ? e.message : e}`);
    }
  }

  /**
   * 修復舊版停課順延課堂缺漏欄位：序號、實際出席人數、狀態、日曆事件 ID。
   */
  public static repairClassSessions(classId: string): { repaired: number; createdEvents: number } {
    const cls = SheetHelper.getRow<any>('Classes', 'class_id', classId);
    if (!cls) {
      throw new Error(`找不到班級代碼: ${classId}`);
    }

    const calendarId = Config.get('GOOGLE_CALENDAR_ID');
    const roomRow = SheetHelper.getRow<any>('Rooms', 'room_id', cls.room_id);
    const roomName = roomRow ? roomRow.room_name : '未設定教室';
    const targetDayOfWeek = this.parseDaysOfWeek(cls.day_of_week)[0] ?? 1;
    const sessions = SheetHelper.getRows<any>('Sessions')
      .filter(s => String(s.class_id || '').trim() === String(classId || '').trim())
      .sort((a, b) => {
        const aTime = this.parseDateTime(a.session_date || a.date, a.start_time).getTime();
        const bTime = this.parseDateTime(b.session_date || b.date, b.start_time).getTime();
        return aTime - bTime;
      });

    const sheet = SheetHelper.getSheet('Sessions');
    const colMap = SheetHelper.COLUMN_MAP['Sessions'];
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const sessionIdCol = headers.indexOf(colMap.session_id) + 1;
    const dateCol = headers.indexOf(colMap.date) + 1;
    const sessionDateCol = headers.indexOf(colMap.session_date) + 1;
    const seqCol = headers.indexOf(colMap.session_seq) + 1;
    const statusCol = headers.indexOf(colMap.status) + 1;
    const actualCountCol = headers.indexOf(colMap.actual_count) + 1;
    const calendarEventCol = headers.indexOf(colMap.calendar_event_id) + 1;
    const notesCol = headers.indexOf(colMap.notes) + 1;

    let repaired = 0;
    let createdEvents = 0;
    const syncSessionIds: string[] = [];
    const existingIds = new Set(sessions.map(s => String(s.session_id || '').trim()).filter(id => !!id));
    let lastDate = sessions[0] ? this.normalizeDateOnly(sessions[0].session_date || sessions[0].date) : this.normalizeDateOnly(cls.period_start);
    sessions.forEach((s, index) => {
      const rowNum = Number(s._rowNum);
      if (!rowNum) return;

      const repairedSeq = Number(s.session_seq) || (index + 1);
      let repairedId = String(s.session_id || '').trim();
      let repairedDate = this.normalizeDateOnly(s.session_date || s.date);
      const isExtensionSession = String(s.notes || '').includes('停課順延') || String(s.notes || '').includes('代替已停課時段');
      const repairedNote = isExtensionSession ? this.sanitizeExtensionNote(s.notes, s.session_date || s.date) : String(s.notes || '');

      if (isExtensionSession && repairedDate.getDay() !== targetDayOfWeek) {
        repairedDate = this.nextClassDateAfter(lastDate, targetDayOfWeek);
        const dateStr = this.formatDateYmd(repairedDate);
        if (dateCol > 0) sheet.getRange(rowNum, dateCol).setValue(dateStr);
        if (sessionDateCol > 0) sheet.getRange(rowNum, sessionDateCol).setValue(dateStr);
        repaired++;
      }
      if (isExtensionSession && notesCol > 0 && repairedNote !== String(s.notes || '')) {
        sheet.getRange(rowNum, notesCol).setValue(repairedNote);
        repaired++;
      }

      const expectedId = `SES-${classId}-${String(repairedSeq).padStart(2, '0')}`;
      if (sessionIdCol > 0 && repairedId && !repairedId.startsWith(`SES-${classId}-`) && (!existingIds.has(expectedId) || repairedId === expectedId)) {
        sheet.getRange(rowNum, sessionIdCol).setValue(expectedId);
        existingIds.delete(repairedId);
        existingIds.add(expectedId);
        repairedId = expectedId;
        repaired++;
      }

      if (!Number(s.session_seq) && seqCol > 0) {
        sheet.getRange(rowNum, seqCol).setValue(repairedSeq);
        repaired++;
      }
      if (String(s.status || '').trim() === 'open' && statusCol > 0) {
        sheet.getRange(rowNum, statusCol).setValue('scheduled');
        repaired++;
      }
      if ((s.actual_count === '' || s.actual_count === null || s.actual_count === undefined) && actualCountCol > 0) {
        sheet.getRange(rowNum, actualCountCol).setValue(0);
        repaired++;
      }
      const dateWasChanged = this.formatDateYmd(repairedDate) !== this.formatDateYmd(s.session_date || s.date);
      if (dateWasChanged && s.calendar_event_id) {
        try {
          GoogleCalendarAPI.deleteEvent(calendarId, s.calendar_event_id);
          if (calendarEventCol > 0) sheet.getRange(rowNum, calendarEventCol).setValue('');
          s.calendar_event_id = '';
        } catch (err) {
          Logger.log(`[修復課堂刪除舊日曆事件失敗] Session: ${s.session_id}, Error: ${err}`);
        }
      }

      if (!s.calendar_event_id && calendarEventCol > 0) {
        try {
          const start = this.parseDateTime(this.formatDateYmd(repairedDate), s.start_time);
          const end = this.parseDateTime(this.formatDateYmd(repairedDate), s.end_time);
          const eventRange = this.getSessionDateRange([...sessions, { ...s, session_date: this.formatDateYmd(repairedDate), status: 'scheduled' }]);
          const extensionNote = isExtensionSession ? repairedNote : '';
          const eventId = GoogleCalendarAPI.createEvent(calendarId, `${cls.class_name} (0/${cls.max_capacity || 0}人)`, start, end, {
            description: this.buildCalendarDescription({
              className: cls.class_name,
              roomName,
              startTime: s.start_time,
              endTime: s.end_time,
              maxCapacity: cls.max_capacity ?? '無',
              periodStart: eventRange.start,
              periodEnd: eventRange.end,
              attendingNames: [],
              extensionNote
            }),
            location: roomName
          });
          sheet.getRange(rowNum, calendarEventCol).setValue(eventId);
          createdEvents++;
          repaired++;
        } catch (err) {
          Logger.log(`[修復課堂日曆事件失敗] Session: ${s.session_id}, Error: ${err}`);
        }
      }
      syncSessionIds.push(repairedId || String(s.session_id || '').trim());
      lastDate = repairedDate;
    });

    SpreadsheetApp.flush();
    syncSessionIds.forEach(sessionId => {
      try {
        this.syncCalendarEvent(sessionId);
      } catch (err) {
        Logger.log(`[修復後同步日曆失敗] Session: ${sessionId}, Error: ${err}`);
      }
    });

    return { repaired, createdEvents };
  }

  private static isEnrollmentEligibleForSession(enrollment: any, session: any, classSessions: any[]): boolean {
    const paidSessions = Number(enrollment.total_paid_sessions || 0);
    if (!paidSessions) return false;

    const targetId = String(session.session_id || '').trim();
    const enrollmentStart = this.normalizeEnrollmentStart(enrollment.enroll_date);
    const orderedSessions = classSessions
      .filter(s => this.getSessionStartDate(s).getTime() >= enrollmentStart.getTime())
      .sort((a, b) => {
        const aKey = `${Utilities.formatDate(this.normalizeDateOnly(a.session_date || a.date), 'Asia/Taipei', 'yyyy-MM-dd')} ${String(a.start_time || '')} ${String(a.session_seq || '')}`;
        const bKey = `${Utilities.formatDate(this.normalizeDateOnly(b.session_date || b.date), 'Asia/Taipei', 'yyyy-MM-dd')} ${String(b.start_time || '')} ${String(b.session_seq || '')}`;
        return aKey.localeCompare(bKey);
      });

    return orderedSessions.slice(0, paidSessions).some(s => String(s.session_id || '').trim() === targetId);
  }

  private static normalizeDateOnly(value: any): Date {
    const date = value instanceof Date ? new Date(value) : new Date(String(value || '').split('T')[0]);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  private static normalizeEnrollmentStart(value: any): Date {
    if (value instanceof Date) {
      return new Date(value);
    }
    const raw = String(value || '').trim();
    if (raw.includes('T') || /\d{1,2}:\d{2}/.test(raw)) {
      const parsed = new Date(raw);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return this.normalizeDateOnly(raw);
  }

  private static getSessionStartDate(session: any): Date {
    const date = Utilities.formatDate(this.normalizeDateOnly(session.session_date || session.date), 'Asia/Taipei', 'yyyy-MM-dd');
    const match = String(session.start_time || '').match(/(\d{1,2}):(\d{2})/);
    const time = match ? `${match[1].padStart(2, '0')}:${match[2]}` : '00:00';
    return new Date(`${date}T${time}:00`);
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
    const calendarId = Config.get('GOOGLE_CALENDAR_ID');
    
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
        const roomRow = SheetHelper.getRow<any>('Rooms', 'room_id', cls.room_id);
        const roomName = roomRow ? roomRow.room_name : '未設定教室';

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
          const maxSeq = sessions.reduce((max, s) => Math.max(max, Number(s.session_seq) || 0), 0);
          let latestDate = this.normalizeDateOnly(cls.period_start);
          sessions.forEach(s => {
            const rawDate = s.session_date || s.date;
            if (rawDate) {
              const d = this.normalizeDateOnly(rawDate);
              if (!isNaN(d.getTime()) && d.getTime() > latestDate.getTime()) {
                latestDate = d;
              }
            }
          });

          // 2. 依序產生順延新課堂 (例如順延 1 週或 2 週)
          for (let i = 1; i <= extendWeeks; i++) {
            const nextDate = new Date(latestDate);
            nextDate.setDate(nextDate.getDate() + (7 * i)); // 順延 i 週

            const nextSeq = maxSeq + i;
            const newSessionId = `SES-${classId}-${String(nextSeq).padStart(2, '0')}`;
            const dateStr = this.formatDateYmd(nextDate);
            const extensionNote = `[停課順延生成] 原課堂：${this.formatDateYmd(session.session_date || session.date)}，原因：${reason}`;

            // 建立日曆活動
            let calendarEventId = '';
            try {
              const startTimeStr = `${dateStr}T${cls.start_time}:00`;
              const endTimeStr = `${dateStr}T${cls.end_time}:00`;
              const extensionRange = this.getSessionDateRange([...sessions, { session_date: dateStr, status: 'scheduled' }]);
              calendarEventId = GoogleCalendarAPI.createEvent(
                calendarId,
                `${cls.class_name} (0/8人)`,
                new Date(startTimeStr),
                new Date(endTimeStr),
                {
                  description: this.buildCalendarDescription({
                    className: cls.class_name,
                    roomName,
                    startTime: cls.start_time,
                    endTime: cls.end_time,
                    maxCapacity: cls.max_capacity ?? '無',
                    periodStart: extensionRange.start,
                    periodEnd: extensionRange.end,
                    attendingNames: [],
                    extensionNote
                  })
                }
              );
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
              session_seq: nextSeq,
              start_time: cls.start_time,
              end_time: cls.end_time,
              status: 'scheduled',
              actual_count: 0,
              calendar_event_id: calendarEventId,
              notes: extensionNote
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
      if (s.status !== 'scheduled' && s.status !== 'open') {
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

  /**
   * 自動為即將結訓的班級辦理新一期續期 (在最後一堂課結束前 7 天自動觸發)
   */
  public static autoRenewClasses(): void {
    const autoRenewEnabled = Config.get('AUTO_RENEW_CLASSES', 'false') === 'true';
    if (!autoRenewEnabled) {
      Logger.log('[自動續期已停用] 正式版採用管理端提醒與手動續期。');
      return;
    }

    const classes = SheetHelper.getRows<any>('Classes');
    const allSessions = SheetHelper.getRows<any>('Sessions');
    const enrollments = SheetHelper.getRows<any>('Enrollments');
    const now = new Date();
    
    // 找出 7 天後的日期門檻
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
    const limitDateStr = Utilities.formatDate(sevenDaysLater, 'Asia/Taipei', 'yyyy-MM-dd');
    
    // status === 'active' 且備註不含終止字眼的班級自動續期
    const activeClasses = classes.filter(c => 
      c.status === 'active' && 
      !String(c.notes || '').includes('終止') && 
      !String(c.notes || '').includes('terminated')
    );
    
    activeClasses.forEach(c => {
      const classSessions = allSessions.filter(s => s.class_id === c.class_id);
      if (classSessions.length === 0) return;
      
      // 找到目前最後一堂課的日期與 seq
      let maxSeq = 0;
      let lastSession: any = null;
      classSessions.forEach(s => {
        const seq = Number(s.session_seq) || 0;
        if (seq > maxSeq) {
          maxSeq = seq;
          lastSession = s;
        }
      });
      
      if (!lastSession) return;
      
      const lastSessionDateStr = lastSession.session_date;
      
      // 如果最後一堂課的日期在未來 7 天之內（或者已經過去了），就自動續期
      if (lastSessionDateStr <= limitDateStr) {
        // 1. 計算新一期開始日期：最後一堂課的下週上課日
        const lastDate = new Date(lastSessionDateStr);
        const newStartDate = new Date(lastDate);
        newStartDate.setDate(newStartDate.getDate() + 7); // 下一週
        const newStartDateStr = Utilities.formatDate(newStartDate, 'Asia/Taipei', 'yyyy-MM-dd');
        
        // 2. 檢查是否已經為該新StartDate生成過Session（防重複）
        const alreadyRenewed = classSessions.some(s => s.session_date === newStartDateStr);
        if (alreadyRenewed) return;

        Logger.log(`[自動續期] 偵測到班級 ${c.class_name} (${c.class_id}) 即將結訓，啟動自動續期流程。`);

        // 3. 獲取當前活躍學員
        const activeEnrs = enrollments.filter(e => e.class_id === c.class_id && e.status === 'active');
        const activeMemberIds = activeEnrs.map(e => e.member_id);
        
        const termRemark = `${newStartDate.getFullYear()}年${newStartDate.getMonth() + 1}月期`;
        
        try {
          // 執行續期
          const result = this.renew(c.class_id, newStartDateStr, activeMemberIds, termRemark);
          Logger.log(`[自動續期成功] 班級: ${c.class_name}, 展開 ${result.generated} 堂課。`);
          
          // 4. LINE 推播通知（如果開啟了系統設定）
          const isPushEnabled = Config.get('LINE_AUTO_PUSH_RENEW', 'true') === 'true';
          if (isPushEnabled && activeMemberIds.length > 0) {
            const members = SheetHelper.getRows<any>('Members');
            activeMemberIds.forEach(uid => {
              const m = members.find(member => member.member_id === uid);
              if (m && m.line_uid) {
                try {
                  const flexContent = LineHandler.buildRenewalReminderFlex(m, c, newStartDateStr);
                  LineHandler.pushMessage(m.line_uid, [{
                    type: 'flex',
                    altText: `C3 Fitness ${c.class_name} 續期待繳費提醒`,
                    contents: flexContent
                  }]);
                } catch (lineErr) {
                  Logger.log(`[自動續期 LINE 通知失敗] 學員: ${m.real_name}, 錯誤: ${lineErr}`);
                }
              }
            });
          }
        } catch (renewErr) {
          Logger.log(`[自動續期失敗] 班級: ${c.class_name}, 錯誤: ${renewErr}`);
        }
      }
    });
  }
}
