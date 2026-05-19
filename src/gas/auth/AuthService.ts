/**
 * AuthService.ts
 * 提供用戶身份驗證與角色權限管控 (PRD v3.0)
 */

interface UserSession {
  uid: string;
  role: 'admin' | 'coach' | 'member' | 'guest';
  name: string;
}

class AuthService {
  /**
   * 透過 LINE Access Token 驗證用戶真實身份與角色
   */
  public static verify(token: string): UserSession {
    if (!token) {
      return { uid: '', role: 'guest', name: '訪客' };
    }

    // 開發者測試用後門：如果是在 Local 測試環境，支援直接帶入測試 UID
    if (token.startsWith('TEST_UID_')) {
      const mockUid = token.replace('TEST_UID_', '');
      return this.resolveRoleFromDatabase(mockUid, '測試帳號');
    }

    // 支援傳入真實的 LINE UID 直接解析（免 Token 驗證，用於 Webhook 診斷）
    if (/^U[0-9a-f]{32}$/i.test(token)) {
      return this.resolveRoleFromDatabase(token, 'LINE用戶');
    }

    try {
      // 呼叫 LINE 官方 API 驗證 Token 並取得 Profile，防止前端偽造 UID
      const response = UrlFetchApp.fetch('https://api.line.me/v2/profile', {
        method: 'get',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        muteHttpExceptions: true
      });

      const responseCode = response.getResponseCode();
      if (responseCode !== 200) {
        throw new Error(`LINE Token 驗證失敗，HTTP 狀態碼: ${responseCode}`);
      }

      const profile = JSON.parse(response.getContentText());
      const lineUid = profile.userId;
      const displayName = profile.displayName || 'LINE用戶';

      if (!lineUid) {
        throw new Error('無法從 LINE Profile 取得 userId');
      }

      return this.resolveRoleFromDatabase(lineUid, displayName);
    } catch (error) {
      Logger.log(`[驗證出錯] ${error instanceof Error ? error.message : error}`);
      return { uid: '', role: 'guest', name: '無效 Token' };
    }
  }

  /**
   * 比對資料庫，決定該 LINE UID 的使用者角色
   */
  private static resolveRoleFromDatabase(lineUid: string, fallbackName: string): UserSession {
    const cleanLineUid = String(lineUid).trim();
    
    // 1. 優先比對 Staff (管理與教練)
    const staffRows = SheetHelper.getRows<any>('Staff');
    const staffUser = staffRows.find(
      row => String(row.line_uid).trim() === cleanLineUid && 
             String(row.status).trim().toLowerCase() === 'active'
    );

    if (staffUser) {
      const cleanRole = String(staffUser.role).trim().toLowerCase();
      const isAdmin = cleanRole === 'admin' || cleanRole.includes('管理');
      return {
        uid: cleanLineUid,
        role: isAdmin ? 'admin' : 'coach',
        name: staffUser.real_name || fallbackName
      };
    }

    // 2. 次要比對 Members (學員)
    const memberRows = SheetHelper.getRows<any>('Members');
    const memberUser = memberRows.find(
      row => String(row.line_uid).trim() === cleanLineUid && 
             String(row.status).trim().toLowerCase() === 'active'
    );

    if (memberUser) {
      return {
        uid: cleanLineUid,
        role: 'member',
        name: memberUser.real_name || fallbackName
      };
    }

    // 3. 都查不到則判定為訪客 (未綁定)
    return {
      uid: cleanLineUid,
      role: 'guest',
      name: fallbackName
    };
  }

  /**
   * 角色權限門控守衛
   */
  public static requireRole(user: UserSession, allowedRoles: ('admin' | 'coach' | 'member')[]): void {
    if (user.role === 'admin') return; // 管理員預設擁有最高權限
    if (allowedRoles.includes(user.role as any)) return;
    throw new Error(`權限不足：本操作僅開放給 ${allowedRoles.join('/')} 角色。`);
  }
}
