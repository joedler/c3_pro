/**
 * MemberService.ts
 * 提供學員綁定、學員個人課務資訊查詢等核心功能 (PRD v3.0)
 */

class MemberService {
  /**
   * 新學員 LINE 帳號綁定流程
   * 優先匹配後台已預先登記之學員（真實姓名 + 生日），若無匹配則自動建立全新學員檔案。
   */
  public static bind(
    data: { realName: string; birthday: string },
    user: UserSession
  ): Record<string, any> {
    if (!user || !user.uid) {
      throw new Error('無法取得您的 LINE 身份識別，請在 LINE 官方帳號內重新開啟頁面。');
    }

    const { realName, birthday } = data;
    if (!realName || !birthday) {
      throw new Error('請輸入真實姓名與生日。');
    }

    // 1. 檢查是否該 LINE 帳號已綁定過任何學員
    const existingMemberByUid = SheetHelper.getRow<any>('Members', 'line_uid', user.uid);
    if (existingMemberByUid) {
      if (existingMemberByUid.status === 'active') {
        throw new Error(`您的 LINE 帳號已綁定學員「${existingMemberByUid.real_name}」，無須重複綁定。`);
      } else {
        throw new Error(`您的 LINE 帳號綁定的學員「${existingMemberByUid.real_name}」狀態為：${existingMemberByUid.status}，請聯絡管理員啟用。`);
      }
    }

    // 2. 搜尋是否有「預先登記」的學員（真實姓名與生日吻合，且尚未綁定 LINE 帳號）
    const allMembers = SheetHelper.getRows<any>('Members');
    const matchedPreRegistered = allMembers.find(
      member =>
        member.real_name === realName &&
        this.formatBirthday(member.birthday) === this.formatBirthday(birthday) &&
        (!member.line_uid || member.line_uid === '')
    );

    if (matchedPreRegistered) {
      // 匹配成功：綁定該預先登記學員的 LINE UID 與 LINE 暱稱，並激活狀態
      const updated = SheetHelper.updateRow('Members', 'member_id', matchedPreRegistered.member_id, {
        line_uid: user.uid,
        display_name: user.name || 'LINE 用戶',
        status: 'active'
      });

      if (!updated) {
        throw new Error('學員帳號更新失敗，請重新嘗試或聯絡管理員。');
      }

      Logger.log(`[學員綁定] 成功匹配預先登記學員：${realName} (${matchedPreRegistered.member_id})`);
      return {
        success: true,
        type: 'matched',
        member: {
          memberId: matchedPreRegistered.member_id,
          realName: matchedPreRegistered.real_name,
          level: matchedPreRegistered.level
        }
      };
    }

    // 3. 無匹配之預先登記檔案：建立全新學員檔案
    const newMemberId = `MEM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newMember = {
      member_id: newMemberId,
      line_uid: user.uid,
      display_name: user.name || 'LINE 用戶',
      real_name: realName,
      birthday: birthday,
      level: 'L1', // 預設最初階程度，由教練後續於後台微調
      join_date: new Date(),
      status: 'active',
      notes: '學員自主綁定建立'
    };

    SheetHelper.addRow('Members', newMember);
    Logger.log(`[學員綁定] 建立全新學員檔案：${realName} (${newMemberId})`);

    return {
      success: true,
      type: 'new',
      member: {
        memberId: newMemberId,
        realName: realName,
        level: 'L1'
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
      e => e.member_id === memberId && e.status === 'active'
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
    const myClasses = allClasses.filter(c => classIds.includes(c.class_id) && c.status === 'active');

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
    
    // 已出席堂數 (Attendance 中類型為 regular 且有簽到時間的紀錄)
    const attendedCount = attendances.filter(
      a => a.type === 'regular' && a.checkin_time && a.checkin_time !== ''
    ).length;

    // 請假堂數 (Leave_Requests 中已審核通過的紀錄)
    const leaveCount = leaveRequests.length;

    // 補課統計
    const totalMakeupsDone = makeupRequests.filter(m => m.status === 'completed' || m.status === 'approved').length;
    
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

    return {
      bound: true,
      realName: member.real_name,
      level: member.level,
      hasClasses: true,
      classNames,
      periodInfo,
      totalPaid,
      attendedCount,
      leaveCount,
      makeupInfo: `已補 ${totalMakeupsDone} 堂 / 可補 ${availableMakeupCount} 堂`,
      remainingCount
    };
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
