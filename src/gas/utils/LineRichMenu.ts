/**
 * LineRichMenu.ts
 * 提供用戶 LINE 圖文選單 (Rich Menu) 的動態切換支援 (PRD v3.0)
 */

class LineRichMenu {
  /**
   * 將特定用戶綁定指定的 Rich Menu 角色
   */
  public static link(userId: string, role: 'member' | 'coach' | 'admin'): void {
    const token = Config.get('LINE_CHANNEL_ACCESS_TOKEN');
    if (!token || token === 'YOUR_LINE_TOKEN') {
      Logger.log('[LINE RichMenu] LINE_CHANNEL_ACCESS_TOKEN 尚未配置，跳過選單切換。');
      return;
    }

    let key = '';
    if (role === 'member') key = 'RICH_MENU_MEMBER';
    if (role === 'coach') key = 'RICH_MENU_COACH';
    if (role === 'admin') key = 'RICH_MENU_ADMIN';

    const richMenuId = Config.get(key);
    if (!richMenuId || richMenuId === '' || richMenuId.startsWith('YOUR_')) {
      Logger.log(`[LINE RichMenu] 未配置或保留預設值 ${key}，跳過用戶 ${userId} 的 Rich Menu 關聯。`);
      return;
    }

    const url = `https://api.line.me/v2/bot/user/${userId}/richmenu/${richMenuId}`;
    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
      method: 'post',
      headers: {
        Authorization: `Bearer ${token}`
      },
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    Logger.log(`[LINE RichMenu切換] 用戶: ${userId}, 角色: ${role}, 狀態碼: ${response.getResponseCode()}, 回傳: ${response.getContentText()}`);
  }

  /**
   * 解除特定用戶的 Rich Menu 綁定 (恢復預設選單)
   */
  public static unlink(userId: string): void {
    const token = Config.get('LINE_CHANNEL_ACCESS_TOKEN');
    if (!token || token === 'YOUR_LINE_TOKEN') return;

    const url = `https://api.line.me/v2/bot/user/${userId}/richmenu`;
    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
      method: 'delete',
      headers: {
        Authorization: `Bearer ${token}`
      },
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    Logger.log(`[LINE RichMenu卸載] 用戶: ${userId}, 狀態碼: ${response.getResponseCode()}`);
  }
}
