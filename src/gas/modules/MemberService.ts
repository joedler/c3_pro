/**
 * MemberService.ts
 * 提供學員綁定、學員個人課務資訊查詢等核心功能 (PRD v3.0)
 */

class MemberService {
  /**
   * 新學員 LINE 帳號綁定流程
   * 優先匹配後台已預先登記之學員（真實姓名 + 生日），若無匹配則自動建立全新學員檔案。
   */
  /**
   * 根據班型與性別動態獲取可用班級時段 (Spec v2.0)
   */
  public static getAvailableClasses(data: { type: string; gender: string }): Record<string, any>[] {
    const { type, gender } = data;
    if (!type) {
      throw new Error('請指定班級類型。');
    }

    const allClasses = SheetHelper.getRows<any>('Classes');
    
    return allClasses
      .filter(cls => {
        if (cls.class_type !== type) return false;
        
        // 若學員性別為男，自動過濾並隱藏限女班
        if (gender === '男' && cls.gender_limit === 'female') {
          return false;
        }

        // 保留狀態為 open 與 pending 的課堂
        return cls.status === 'open' || cls.status === 'pending';
      })
      .map(cls => {
        const capacity = Number(cls.max_capacity) || 0;
        const enrolled = Number(cls.enrolled) || 0;
        
        let computedStatus = cls.status;
        if (cls.status === 'open') {
          if (enrolled >= capacity) {
            computedStatus = 'full';
          }
        }

        return {
          class_id: cls.class_id,
          class_name: cls.class_name,
          class_type: cls.class_type,
          level: cls.level || '—',
          day_of_week: cls.day_of_week,
          start_time: cls.start_time,
          end_time: cls.end_time,
          max_capacity: capacity,
          enrolled: enrolled,
          gender_limit: cls.gender_limit,
          allow_makeup: cls.allow_makeup === true || String(cls.allow_makeup).toLowerCase() === 'true',
          period_start: cls.period_start,
          period_weeks: Number(cls.period_weeks) || 12,
          status: computedStatus
        };
      });
  }

  /**
   * 新學員 LINE 帳號與時段課程四步驟綁定流程 (Spec v2.0)
   */
  public static bind(
    data: {
      realName: string;
      gender: string;
      birthday: string;
      height: number;
      weight: number;
      classId: string;
    },
    user: UserSession
  ): Record<string, any> {
    if (!user || !user.uid) {
      throw new Error('無法取得您的 LINE 身份識別，請在 LINE 官方帳號內重新開啟頁面。');
    }

    const { realName, gender, birthday, height, weight, classId } = data;
    if (!realName || String(realName).trim() === '') {
      throw new Error('請輸入真實姓名。');
    }
    if (!gender || (gender !== '男' && gender !== '女')) {
      throw new Error('請選擇性別。');
    }
    if (!birthday) {
      throw new Error('請選擇出生年月日。');
    }
    if (!height || isNaN(Number(height)) || Number(height) < 100 || Number(height) > 250) {
      throw new Error('請輸入合理的身高範圍 (100–250 cm)。');
    }
    if (!weight || isNaN(Number(weight)) || Number(weight) < 20 || Number(weight) > 200) {
      throw new Error('請輸入合理的體重範圍 (20–200 kg)。');
    }
    if (!classId) {
      throw new Error('請選擇要綁定的上課時段。');
    }

    // 0. 檢查是否為教職員預先登記的綁定 (教職員優先路徑，不綁定課程)
    const allStaff = SheetHelper.getRows<any>('Staff');
    const matchedStaff = allStaff.find(
      s => s.real_name === realName && (!s.line_uid || s.line_uid === '')
    );
    if (matchedStaff) {
      SheetHelper.updateRow('Staff', 'staff_id', matchedStaff.staff_id, {
        line_uid: user.uid
      });
      LineRichMenu.link(user.uid, matchedStaff.role || 'coach');
      Logger.log(`[教職員綁定] 成功匹配預登記教職員：${realName} (${matchedStaff.staff_id})`);
      return {
        success: true,
        type: 'staff',
        role: matchedStaff.role || 'coach',
        member: {
          memberId: matchedStaff.staff_id,
          realName: matchedStaff.real_name,
          level: 'Staff'
        }
      };
    }

    // 1. 取得目標班級資訊，進行人數與性別防呆
    const targetClass = SheetHelper.getRow<any>('Classes', 'class_id', classId);
    if (!targetClass) {
      throw new Error('所選的課程時段不存在，請重新整理頁面。');
    }
    if (targetClass.status === 'pending') {
      throw new Error('該課程時段目前尚未開課，無法預約綁定。');
    }
    
    // 性別過濾防呆
    if (gender === '男' && targetClass.gender_limit === 'female') {
      throw new Error('很抱歉，此課程為限女專班，男性學員無法選修。');
    }

    // 人數防呆 (Race Condition 關鍵點)
    const maxCapacity = Number(targetClass.max_capacity) || 0;
    const enrolled = Number(targetClass.enrolled) || 0;
    if (enrolled >= maxCapacity) {
      throw new Error('409:很抱歉，此時段剛剛額滿，請重新選擇時段');
    }

    // 2. 檢查是否該 LINE 帳號已綁定過任何學員
    const existingMemberByUid = SheetHelper.getRow<any>('Members', 'line_uid', user.uid);
    if (existingMemberByUid) {
      if (existingMemberByUid.status === 'active') {
        throw new Error(`422:您的 LINE 帳號已綁定學員「${existingMemberByUid.real_name}」，無須重複綁定。`);
      } else {
        throw new Error(`422:您的 LINE 帳號綁定的學員「${existingMemberByUid.real_name}」狀態為：${existingMemberByUid.status}，請聯絡管理員啟用。`);
      }
    }

    // 3. 搜尋是否有「預先登記」的學員（真實姓名與生日吻合，且尚未綁定 LINE 帳號）
    const allMembers = SheetHelper.getRows<any>('Members');
    const matchedPreRegistered = allMembers.find(
      member =>
        member.real_name === realName &&
        this.formatBirthday(member.birthday) === this.formatBirthday(birthday) &&
        (!member.line_uid || member.line_uid === '')
    );

    let finalMemberId = '';
    let finalLevel = targetClass.level || 'L1';

    if (matchedPreRegistered) {
      finalMemberId = matchedPreRegistered.member_id;
      finalLevel = targetClass.level || matchedPreRegistered.level || 'L1';
      
      const updated = SheetHelper.updateRow('Members', 'member_id', finalMemberId, {
        line_uid: user.uid,
        display_name: user.name || 'LINE 用戶',
        gender: gender,
        height: Number(height),
        weight: Number(weight),
        level: finalLevel,
        status: 'active'
      });

      if (!updated) {
        throw new Error('學員帳號更新失敗，請重新嘗試或聯絡管理員。');
      }

      Logger.log(`[學員綁定] 成功匹配預先登記學員：${realName} (${finalMemberId})，程度設定為：${finalLevel}`);
    } else {
      // 4. 無匹配之預先登記檔案：建立全新學員檔案
      finalMemberId = `MEM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      const newMember = {
        member_id: finalMemberId,
        line_uid: user.uid,
        display_name: user.name || 'LINE 用戶',
        real_name: realName,
        birthday: birthday,
        gender: gender,
        height: Number(height),
        weight: Number(weight),
        level: finalLevel,
        join_date: new Date(),
        status: 'active',
        notes: '學員自主綁定建立'
      };

      SheetHelper.addRow('Members', newMember);
      Logger.log(`[學員綁定] 建立全新學員檔案：${realName} (${finalMemberId})`);
    }

    // 5. 寫入選課紀錄表 (Enrollments)
    const newEnrollmentId = `ENR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newEnrollment = {
      enrollment_id: newEnrollmentId,
      member_id: finalMemberId,
      class_id: classId,
      enroll_date: new Date(),
      status: 'active',
      total_paid_sessions: 12,
      notes: '綁定自動選課'
    };
    SheetHelper.addRow('Enrollments', newEnrollment);
    Logger.log(`[學員綁定] 成功寫入選課紀錄：${newEnrollmentId}`);

    // 6. 更新班級表的「目前人數」計數器 (+1)
    SheetHelper.updateRow('Classes', 'class_id', classId, {
      enrolled: enrolled + 1
    });
    Logger.log(`[學員綁定] 班級人數計數更新成功：${classId} (目前人數: ${enrolled + 1})`);

    // 7. 動態對接 LINE 學員豐富選單
    LineRichMenu.link(user.uid, 'member');

    return {
      success: true,
      type: matchedPreRegistered ? 'matched' : 'new',
      member: {
        memberId: finalMemberId,
        realName: realName,
        level: finalLevel
      }
    };
  }

  /**
   * 取得學員個人資訊卡片所需之核心數據 (F-M02)
   */
  public static getInfo(user: UserSession): Record<string, any> {
    if (!user || !user.uid) {
      return { bound: false };
    }

    // 1. 取得學員基本資料
    const member = SheetHelper.getRow<any>('Members', 'line_uid', user.uid);
    if (!member || member.status !== 'active') {
      return { bound: false };
    }

    const memberId = member.member_id;

    // 2. 取得選課紀錄 (Enrollments)
    const enrollments = SheetHelper.getRows<any>('Enrollments').filter(
      e => e.member_id === memberId && (e.status === 'active' || e.status === 'pending_payment')
    );

    if (enrollments.length === 0) {
      return {
        bound: true,
        realName: member.real_name,
        level: member.level,
        hasClasses: false,
        message: '目前尚未選修任何課程，請聯絡管理員幫您安排班級。'
      };
    }

    const classIds = enrollments.map(e => e.class_id);

    // 3. 取得班級與課程設定 (Classes)
    const allClasses = SheetHelper.getRows<any>('Classes');
    const myClasses = allClasses.filter(c => classIds.includes(c.class_id) && (c.status === 'active' || c.status === 'open'));

    // 4. 取得出勤與請假統計
    const attendances = SheetHelper.getRows<any>('Attendance').filter(a => a.member_id === memberId);
    const leaveRequests = SheetHelper.getRows<any>('Leave_Requests').filter(
      l => l.member_id === memberId && l.status === 'approved'
    );
    const makeupRequests = SheetHelper.getRows<any>('Makeup_Requests').filter(
      m => m.member_id === memberId
    );

    // 各項計數器
    const totalPaid = enrollments.reduce((sum, e) => sum + (Number(e.total_paid_sessions) || 0), 0);
    
    // 已出席堂數：以系統自動防呆結案 (completed) 為基準，扣除學員已請假的堂數
    const completedSessions = SheetHelper.getRows<any>('Sessions').filter(
      s => classIds.includes(s.class_id) && s.status === 'completed'
    );
    const completedSessionIds = completedSessions.map(s => s.session_id);
    const leaveForCompletedCount = leaveRequests.filter(l => completedSessionIds.includes(l.session_id)).length;
    
    // 補課統計
    const totalMakeupsDone = makeupRequests.filter(m => m.status === 'completed' || m.status === 'approved').length;

    // 真正的已上堂數 = (該班級已結案的總堂數) - (已結案中他請假的堂數) + (他額外補課完成的堂數)
    const attendedCount = completedSessions.length - leaveForCompletedCount + totalMakeupsDone;

    // 請假堂數 (Leave_Requests 中已審核通過的紀錄)
    const leaveCount = leaveRequests.length;
    
    // 可補課額度：請假堂數 - 已安排或已完成的補課堂數
    // 預防出現負數，最少為 0
    const availableMakeupCount = Math.max(0, leaveCount - totalMakeupsDone);

    // 剩餘堂數 = 總繳費堂數 - 已出席堂數 - 請假堂數 (請假在下期結算前不計入已上，但從本期可用剩餘中扣除，由補課或下期折抵處理)
    const remainingCount = Math.max(0, totalPaid - attendedCount - leaveCount);

    // 組裝班級名稱清單與日期範圍
    const classNames = myClasses.map(c => c.class_name).join('、');
    
    // 取最早開始的班級時間作為當期區間參考
    let periodInfo = '尚未開始';
    if (myClasses.length > 0) {
      const firstClass = myClasses[0];
      const start = this.formatDate(firstClass.period_start);
      // 計算結束日期：開始日期 + 週數 * 7 天
      const weeks = Number(firstClass.period_weeks) || 12;
      const startDate = new Date(firstClass.period_start);
      const endDate = new Date(startDate.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
      periodInfo = `${start} ~ ${this.formatDate(endDate)}`;
    }

    // === 一併內嵌 upcomingSessions（未來4週可請假課堂），避免額外 API 往返 ===
    const allSessions = SheetHelper.getRows<any>('Sessions');
    const now = new Date();
    const fourWeeksLater = new Date(now.getTime() + 4 * 7 * 24 * 60 * 60 * 1000);
    const leaveSessionIds = leaveRequests.map(l => l.session_id);
    const classMap = new Map(allClasses.map(c => [c.class_id, c]));

    const upcomingSessions = allSessions
      .filter(s => {
        if (!classIds.includes(s.class_id)) return false;
        if (s.status === 'cancelled') return false;

        const dateStr = this.safeFormatSessionDate(s.session_date);
        const timeStr = this.safeFormatTime(s.start_time);
        if (!dateStr || !timeStr) return false;

        const sessionDate = new Date(`${dateStr}T${timeStr}:00`);
        if (isNaN(sessionDate.getTime())) return false;

        return sessionDate >= now && sessionDate <= fourWeeksLater;
      })
      .filter(s => !leaveSessionIds.includes(s.session_id))
      .map(s => {
        const cls = classMap.get(s.class_id);
        return {
          sessionId: s.session_id,
          classId: s.class_id,
          className: cls ? cls.class_name : s.class_id,
          date: this.safeFormatSessionDate(s.session_date),
          startTime: this.safeFormatTime(s.start_time),
          endTime: this.safeFormatTime(s.end_time)
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    // === 一併內嵌 pendingLeaves（已核准且尚未補課的請假紀錄），避免額外 API 往返 ===
    const pendingLeaves = leaveRequests
      .filter(l => !l.makeup_session_id || l.makeup_session_id === '')
      .map(l => {
        const session = allSessions.find(s => s.session_id === l.session_id);
        const cls = session ? classMap.get(session.class_id) : null;
        return {
          leaveId: l.leave_id,
          className: cls ? cls.class_name : '未知的課程',
          date: session ? this.safeFormatSessionDate(session.session_date) : '未知日期'
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    return {
      bound: true,
      role: user.role,
      realName: member.real_name,
      level: member.level,
      hasClasses: true,
      classNames,
      periodInfo,
      totalPaid,
      attendedCount,
      leaveCount,
      makeupInfo: `已補 ${totalMakeupsDone} 堂 / 可補 ${availableMakeupCount} 堂`,
      remainingCount,
      upcomingSessions,
      pendingLeaves
    };
  }

  /**
   * 安全格式化 Sheets 回傳的日期值（可能是 Date 物件或字串）為 yyyy-MM-dd
   */
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

  /**
   * 安全格式化 Sheets 回傳的時間值（可能是 Date 物件或 "HH:mm" 字串）為 HH:mm
   */
  private static safeFormatTime(timeVal: any): string {
    if (!timeVal) return '';
    if (timeVal instanceof Date) {
      return Utilities.formatDate(timeVal, 'Asia/Taipei', 'HH:mm');
    }
    return String(timeVal).trim();
  }

  /**
   * 取得學員未來 4 週內可請假的實時課堂列表
   */
  public static getUpcomingSessions(user: UserSession): Record<string, any>[] {
    if (!user || !user.uid) {
      return [];
    }

    const member = SheetHelper.getRow<any>('Members', 'line_uid', user.uid);
    if (!member || member.status !== 'active') {
      return [];
    }

    const memberId = member.member_id;

    const enrollments = SheetHelper.getRows<any>('Enrollments').filter(
      e => e.member_id === memberId && e.status === 'active'
    );
    if (enrollments.length === 0) {
      return [];
    }

    const classIds = enrollments.map(e => e.class_id);

    // JOIN Classes 表取得班級名稱（Sessions 表本身沒有 class_name 欄位！）
    const allClasses = SheetHelper.getRows<any>('Classes');
    const classMap = new Map(allClasses.map(c => [c.class_id, c]));

    const allSessions = SheetHelper.getRows<any>('Sessions');
    const now = new Date();
    const fourWeeksLater = new Date(now.getTime() + 4 * 7 * 24 * 60 * 60 * 1000);

    const leaveRequests = SheetHelper.getRows<any>('Leave_Requests').filter(
      l => l.member_id === memberId && l.status === 'approved'
    );
    const leaveSessionIds = leaveRequests.map(l => l.session_id);

    const upcoming = allSessions
      .filter(s => {
        if (!classIds.includes(s.class_id)) return false;
        if (s.status === 'cancelled') return false;

        const dateStr = this.safeFormatSessionDate(s.session_date);
        const timeStr = this.safeFormatTime(s.start_time);
        if (!dateStr || !timeStr) return false;

        const sessionDate = new Date(`${dateStr}T${timeStr}:00`);
        if (isNaN(sessionDate.getTime())) return false;

        return sessionDate >= now && sessionDate <= fourWeeksLater;
      })
      .filter(s => !leaveSessionIds.includes(s.session_id))
      .map(s => {
        const cls = classMap.get(s.class_id);
        return {
          sessionId: s.session_id,
          classId: s.class_id,
          className: cls ? cls.class_name : s.class_id,
          date: this.safeFormatSessionDate(s.session_date),
          startTime: this.safeFormatTime(s.start_time),
          endTime: this.safeFormatTime(s.end_time)
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return upcoming;
  }

  /**
   * 取得學員所有已審核通過、且尚未安排補課的請假紀錄
   */
  public static getPendingLeaves(user: UserSession): Record<string, any>[] {
    if (!user || !user.uid) {
      return [];
    }

    const member = SheetHelper.getRow<any>('Members', 'line_uid', user.uid);
    if (!member || member.status !== 'active') {
      return [];
    }

    const memberId = member.member_id;
    const allLeaves = SheetHelper.getRows<any>('Leave_Requests');
    const allSessions = SheetHelper.getRows<any>('Sessions');
    const allClasses = SheetHelper.getRows<any>('Classes');

    const pending = allLeaves
      .filter(l => 
        l.member_id === memberId && 
        l.status === 'approved' && 
        (!l.makeup_session_id || l.makeup_session_id === '')
      )
      .map(l => {
        const session = allSessions.find(s => s.session_id === l.session_id);
        const cls = session ? allClasses.find(c => c.class_id === session.class_id) : null;

        return {
          leaveId: l.leave_id,
          className: cls ? cls.class_name : '未知的課程',
          date: session ? this.safeFormatSessionDate(session.session_date) : '未知日期'
        };
      })
      .sort((a, b) => b.date.localeCompare(a.date));

    return pending;
  }

  /**
   * 輔助函數：日期轉成字串 yyyy/MM/dd
   */
  private static formatDate(dateInput: any): string {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return String(dateInput);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
  }

  /**
   * 輔助函數：標準化生日欄位，方便精準字串比對 (支援 Timestamp、Date 與字串格式)
   */
  private static formatBirthday(bdayInput: any): string {
    if (!bdayInput) return '';
    const date = new Date(bdayInput);
    if (isNaN(date.getTime())) {
      // 如果是字串，去除所有空格與斜線/橫線做比較
      return String(bdayInput).replace(/[\/\-\s]/g, '');
    }
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }
}
