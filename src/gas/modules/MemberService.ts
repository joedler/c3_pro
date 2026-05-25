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

        // 只顯示已正式開放報名的課堂；pending 尚未開課，不提供選擇。
        return cls.status === 'open';
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
    const perfStart = Date.now();
    const perfLog = (label: string): void => {
      Logger.log(`[學員綁定效能] ${label}: ${Date.now() - perfStart}ms`);
    };

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
    perfLog('讀取目標班級');
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
    perfLog('檢查 LINE 是否已綁定');
    if (existingMemberByUid) {
      if (existingMemberByUid.status === 'active') {
        throw new Error(`422:您的 LINE 帳號已綁定學員「${existingMemberByUid.real_name}」，無須重複綁定。`);
      } else {
        throw new Error(`422:您的 LINE 帳號綁定的學員「${existingMemberByUid.real_name}」狀態為：${existingMemberByUid.status}，請聯絡管理員啟用。`);
      }
    }

    // 3. 搜尋是否有「預先登記」的學員（真實姓名與生日吻合，且尚未綁定 LINE 帳號）
    const allMembers = SheetHelper.getRows<any>('Members');
    perfLog('讀取學員資料');
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
      perfLog('新增學員資料');
      Logger.log(`[學員綁定] 建立全新學員檔案：${realName} (${finalMemberId})`);
    }

    // 5. 寫入選課紀錄表 (Enrollments)
    const newEnrollmentId = `ENR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newEnrollment = {
      enrollment_id: newEnrollmentId,
      member_id: finalMemberId,
      class_id: classId,
      enroll_date: new Date(),
      status: 'pending_payment', // 學員首次註冊為「待繳費」，需由管理員確認
      total_paid_sessions: 0,     // 繳費確認前堂數為 0
      notes: '學員綁定自動加選'
    };
    SheetHelper.addRow('Enrollments', newEnrollment);
    perfLog('新增選課紀錄');
    Logger.log(`[學員綁定] 成功寫入待繳費選課紀錄：${newEnrollmentId}`);

    // 6. 更新班級表的「目前人數」計數器 (+1)
    SheetHelper.updateRow('Classes', 'class_id', classId, {
      enrolled: enrolled + 1
    });
    perfLog('更新班級人數');
    Logger.log(`[學員綁定] 班級人數計數更新成功：${classId} (目前人數: ${enrolled + 1})`);

    // 6.5 首次綁定只建立待繳費選課，不同步日曆。正式繳費確認時才會同步正式出席名單。
    perfLog('略過待繳費日曆同步');

    // 7. 動態對接 LINE 學員豐富選單
    LineRichMenu.link(user.uid, 'member');
    perfLog('同步 LINE 圖文選單');

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
    const allLeaveRows = SheetHelper.getRows<any>('Leave_Requests').filter(l => l.member_id === memberId);
    const leaveRequests = allLeaveRows.filter(l => l.status === 'approved');
    const makeupRequests = SheetHelper.getRows<any>('Makeup_Requests').filter(
      m => m.member_id === memberId
    );
    const allSessions = SheetHelper.getRows<any>('Sessions');

    // 各項計數器
    const totalPaid = enrollments.reduce((sum, e) => sum + (Number(e.total_paid_sessions) || 0), 0);
    
    // 已上堂數：指實際經過的周數或次數（不扣除請假）
    const completedSessions = allSessions.filter(
      s => classIds.includes(s.class_id) && s.status === 'completed'
    );
    const attendedCount = completedSessions.length;

    // 請假堂數：實際成功請假的次數
    const leaveCount = leaveRequests.length;
    
    // 補課完成：預約成功且已結案(completed)的補課次數
    const makeupCount = makeupRequests.filter(m => m.status === 'completed').length;

    // 已預約補課次數 (包含 completed 與 approved)
    const reservedMakeups = makeupRequests.filter(m => m.status === 'completed' || m.status === 'approved').length;

    // 可補額度：請假堂數 - 已預約補課次數
    const availableMakeupCount = Math.max(0, leaveCount - reservedMakeups);

    // 剩餘堂數 = 總堂數 - 經過週數 (即 attendedCount)
    const remainingCount = Math.max(0, totalPaid - attendedCount);

    // 組裝班級名稱清單與日期範圍
    const classNames = myClasses.map(c => c.class_name).join('、');
    
    // 支援多班級不同課程區間的精準顯示設計
    let periodInfo = '尚未開始';
    if (myClasses.length > 0) {
      periodInfo = myClasses.map(c => {
        const start = this.formatDate(c.period_start);
        const weeks = Number(c.period_weeks) || 12;
        const startDate = new Date(c.period_start);
        const endDate = new Date(startDate.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
        return `${c.class_name} (${start} ~ ${this.formatDate(endDate)})`;
      }).join(' ｜ ');
    }

    // === 一併內嵌 upcomingSessions（未來4週可請假課堂），避免額外 API 往返 ===
    const now = new Date();
    const fourWeeksLater = new Date(now.getTime() + 4 * 7 * 24 * 60 * 60 * 1000);
    const leaveSessionIds = leaveRequests.map(l => l.session_id);
    const classMap = new Map(allClasses.map(c => [c.class_id, c]));

    // 補課已預約的 target_session_id 清單
    const makeupTargetSessionIds = makeupRequests
      .filter(m => m.status === 'approved' || m.status === 'completed')
      .map(m => m.target_session_id)
      .filter(id => !!id);

    const upcomingSessions = allSessions
      .filter(s => {
        // 自己班級的課 OR 已預約補課的課堂
        const isMyClass = classIds.includes(s.class_id);
        const isMakeupTarget = makeupTargetSessionIds.includes(s.session_id);
        if (!isMyClass && !isMakeupTarget) return false;
        if (s.status === 'cancelled') return false;

        const dateStr = this.safeFormatSessionDate(s.session_date);
        const timeStr = this.safeFormatTime(s.start_time);
        if (!dateStr || !timeStr) return false;

        const sessionDate = new Date(`${dateStr}T${timeStr}:00`);
        if (isNaN(sessionDate.getTime())) return false;

        return sessionDate >= now && sessionDate <= fourWeeksLater;
      })
      .filter(s => {
        // 如果是自己班的課，過濾掉請假的；如果是補課的課，一律顯示
        const isMakeupTarget = makeupTargetSessionIds.includes(s.session_id);
        if (isMakeupTarget) return true;
        return !leaveSessionIds.includes(s.session_id);
      })
      .map(s => {
        const cls = classMap.get(s.class_id);
        const isMakeupTarget = makeupTargetSessionIds.includes(s.session_id);
        const myEnrollment = enrollments.find(e => e.class_id === s.class_id);
        const isPendingPayment = myEnrollment ? (myEnrollment.status === 'pending_payment') : false;
        return {
          sessionId: s.session_id,
          classId: s.class_id,
          className: cls ? cls.class_name : s.class_id,
          date: this.safeFormatSessionDate(s.session_date),
          startTime: this.safeFormatTime(s.start_time),
          endTime: this.safeFormatTime(s.end_time),
          isMakeup: isMakeupTarget,
          isPendingPayment: isPendingPayment
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
      makeupCount,
      availableMakeupCount,
      makeupInfo: `已登記 ${reservedMakeups} 堂`,
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
   * 獲取該學員目前可以報名的所有班級列表 (考量性別過濾、是否已選過、越級警告判定等)
   */
  public static getClassesForEnrollment(user: UserSession): Record<string, any> {
    if (!user || !user.uid) {
      throw new Error('無法識別您的 LINE 身份。');
    }

    const member = SheetHelper.getRow<any>('Members', 'line_uid', user.uid);
    if (!member || member.status !== 'active') {
      throw new Error('您的學員帳號狀態異常或未啟用。');
    }

    const memberId = member.member_id;
    const memberGender = member.gender || '男';
    const memberLevelVal = this.parseLevelNumber(member.level);

    // 取得目前學員已經選的班級 ID (包括 active 與 pending_payment 狀態)
    const enrollments = SheetHelper.getRows<any>('Enrollments').filter(
      e => e.member_id === memberId && (e.status === 'active' || e.status === 'pending_payment')
    );
    const enrolledClassIds = enrollments.map(e => e.class_id);

    const allClasses = SheetHelper.getRows<any>('Classes');
    const availableClasses = allClasses
      .filter(cls => {
        // 只允許加選已正式開放報名的課程；pending 尚未開課，不提供選擇。
        if (cls.status !== 'open') return false;

        // 不能重複報名已選過的班級
        if (enrolledClassIds.includes(cls.class_id)) return false;

        // 男性學員過濾限女專班
        if (memberGender === '男' && cls.gender_limit === 'female') return false;

        return true;
      })
      .map(cls => {
        const classLevelVal = this.parseLevelNumber(cls.level);
        const capacity = Number(cls.max_capacity) || 0;
        const enrolled = Number(cls.enrolled) || 0;

        // 判斷是否越級 (班級難度數字 > 學員等級數字)
        const isOverlimit = classLevelVal > memberLevelVal;

        return {
          classId: cls.class_id,
          className: cls.class_name,
          classType: cls.class_type,
          level: cls.level || 'L1',
          dayOfWeek: cls.day_of_week,
          startTime: this.safeFormatTime(cls.start_time),
          endTime: this.safeFormatTime(cls.end_time),
          maxCapacity: capacity,
          enrolled: enrolled,
          status: cls.status,
          totalSessions: Number(cls.total_sessions || (Number(cls.period_weeks) * Number(cls.sessions_per_week))) || 12,
          isOverlimit: isOverlimit
        };
      });

    return {
      memberLevel: member.level || 'L1',
      classes: availableClasses
    };
  }

  /**
   * 執行新班級報名加課 (智慧時段衝突檢測與方案 B 越級提醒)
   */
  public static enrollNewClass(data: { classId: string; isOverlimit: boolean }, user: UserSession): Record<string, any> {
    if (!user || !user.uid) {
      throw new Error('無法識別您的 LINE 身份。');
    }

    const { classId, isOverlimit } = data;
    if (!classId) {
      throw new Error('未指定要加選的班級 ID。');
    }

    const member = SheetHelper.getRow<any>('Members', 'line_uid', user.uid);
    if (!member || member.status !== 'active') {
      throw new Error('您的學員帳號狀態異常。');
    }

    const memberId = member.member_id;

    // 1. 取得並驗證目標班級
    const targetClass = SheetHelper.getRow<any>('Classes', 'class_id', classId);
    if (!targetClass) {
      throw new Error('所選的課程時段不存在。');
    }
    if (targetClass.status !== 'open') {
      throw new Error('該課程時段目前未開放報名。');
    }

    // 2. 性別防呆
    if (member.gender === '男' && targetClass.gender_limit === 'female') {
      throw new Error('此班級為限女專班，男性學員無法報名。');
    }

    // 3. 人數防呆
    const maxCapacity = Number(targetClass.max_capacity) || 0;
    const enrolled = Number(targetClass.enrolled) || 0;
    if (enrolled >= maxCapacity) {
      throw new Error('很抱歉，此班級人數已滿，無法報名。');
    }

    // 4. 重複選課防呆
    const enrollments = SheetHelper.getRows<any>('Enrollments').filter(
      e => e.member_id === memberId && (e.status === 'active' || e.status === 'pending_payment')
    );
    const enrolledClassIds = enrollments.map(e => e.class_id);
    if (enrolledClassIds.includes(classId)) {
      throw new Error('您已經報名過此課程，無須重複加選。');
    }

    // 5. 智慧時段衝突檢測
    const allClasses = SheetHelper.getRows<any>('Classes');
    const newDay = targetClass.day_of_week;
    const newStart = this.parseTimeToMinutes(this.safeFormatTime(targetClass.start_time));
    const newEnd = this.parseTimeToMinutes(this.safeFormatTime(targetClass.end_time));

    const myClasses = allClasses.filter(c => enrolledClassIds.includes(c.class_id));
    for (const myCls of myClasses) {
      if (this.hasDayOverlap(newDay, myCls.day_of_week)) {
        const myStart = this.parseTimeToMinutes(this.safeFormatTime(myCls.start_time));
        const myEnd = this.parseTimeToMinutes(this.safeFormatTime(myCls.end_time));

        // 重疊條件：(newStart < myEnd) && (newEnd > myStart)
        if (newStart < myEnd && newEnd > myStart) {
          throw new Error(`【時段衝突】此課程上課時間（${newDay} ${this.safeFormatTime(targetClass.start_time)}）與您已報名的「${myCls.class_name}」（${myCls.day_of_week} ${this.safeFormatTime(myCls.start_time)}）時間衝突，無法加選！`);
        }
      }
    }

    // 6. 寫入選課紀錄表 (Enrollments)，狀態設為待繳費 pending_payment
    const totalPaidSessions = Number(targetClass.total_sessions || (Number(targetClass.period_weeks) * Number(targetClass.sessions_per_week))) || 0;
    const newEnrollmentId = `ENR-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newEnrollment = {
      enrollment_id: newEnrollmentId,
      member_id: memberId,
      class_id: classId,
      enroll_date: new Date(),
      status: 'pending_payment',
      total_paid_sessions: totalPaidSessions,
      notes: isOverlimit ? '[越級加選-待審]' : '學員自主加選'
    };

    SheetHelper.addRow('Enrollments', newEnrollment);
    Logger.log(`[學員加選] 成功寫入選課紀錄：${newEnrollmentId} (待繳費)，總堂數：${totalPaidSessions}`);

    // 7. 更新班級報名人數
    SheetHelper.updateRow('Classes', 'class_id', classId, {
      enrolled: enrolled + 1
    });
    Logger.log(`[學員加選] 班級人數計數更新成功：${classId} (目前人數: ${enrolled + 1})`);

    return {
      success: true,
      enrollmentId: newEnrollmentId,
      className: targetClass.class_name,
      totalSessions: totalPaidSessions,
      isOverlimit: isOverlimit
    };
  }

  /**
   * 輔助函數：解析等級字串中的數字
   */
  private static parseLevelNumber(levelStr: any): number {
    if (!levelStr) return 1;
    const match = String(levelStr).match(/\d+/);
    return match ? parseInt(match[0], 10) : 1;
  }

  /**
   * 輔助函數：解析時間字串為分鐘數
   */
  private static parseTimeToMinutes(timeStr: string): number {
    const parts = timeStr.split(':');
    if (parts.length < 2) return 0;
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }

  /**
   * 輔助函數：比對星期是否有重疊
   */
  private static hasDayOverlap(dayStr1: string, dayStr2: string): boolean {
    const days1 = String(dayStr1).split('+').map(d => d.trim());
    const days2 = String(dayStr2).split('+').map(d => d.trim());
    return days1.some(d => days2.includes(d));
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
