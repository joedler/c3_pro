/**
 * GoogleCalendarAPI.ts
 * 提供完全去中心化的 OAuth 2.0 Google Calendar REST API 封裝 (SaaS 模式)
 * 客戶無須共用日曆給開發者，透過簡單的 OAuth 授權，程式即可代為讀寫其日曆，且絕不弄髒開發者的個人日曆。
 */

class GoogleCalendarAPI {
  private static readonly TOKEN_URL = 'https://oauth2.googleapis.com/token';
  private static readonly CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

  /**
   * 判斷目前是否啟用了 SaaS 獨立代管日曆模式
   */
  public static isSaaSMode(): boolean {
    const clientId = Config.get('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = Config.get('GOOGLE_OAUTH_CLIENT_SECRET');
    const refreshToken = Config.get('GOOGLE_OAUTH_REFRESH_TOKEN');
    return !!(clientId && clientSecret && refreshToken && refreshToken !== 'YOUR_REFRESH_TOKEN' && refreshToken !== '');
  }

  /**
   * 取得或自動刷新 OAuth Access Token
   */
  public static getAccessToken(): string {
    const props = PropertiesService.getScriptProperties();
    const cachedToken = props.getProperty('GOOGLE_OAUTH_ACCESS_TOKEN');
    const expiresAtStr = props.getProperty('GOOGLE_OAUTH_EXPIRES_AT');
    const now = Date.now();

    // 如果緩存的 Access Token 還有效 (預留 5 分鐘緩衝時間)，直接返回
    if (cachedToken && expiresAtStr && (parseInt(expiresAtStr, 10) - 300000 > now)) {
      return cachedToken;
    }

    // 緩存失效或不存在，執行 Refresh Token 換取流程
    const clientId = Config.get('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = Config.get('GOOGLE_OAUTH_CLIENT_SECRET');
    const refreshToken = Config.get('GOOGLE_OAUTH_REFRESH_TOKEN');

    if (!clientId || !clientSecret) {
      throw new Error('422:【系統設定未完成】未設定 GOOGLE_OAUTH_CLIENT_ID 或 GOOGLE_OAUTH_CLIENT_SECRET！請先至 Google Cloud Console 建立 OAuth 2.0 憑證。');
    }

    if (!refreshToken) {
      throw new Error('409:【日曆未授權】Google 日曆尚未授權連結！請管理員點擊選單「🔗 連結客戶 Google 日曆」進行一鍵登入授權。');
    }

    try {
      const payload = {
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      };

      const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
        method: 'post',
        contentType: 'application/x-www-form-urlencoded',
        payload: payload,
        muteHttpExceptions: true
      };

      const response = UrlFetchApp.fetch(this.TOKEN_URL, options);
      const resData = JSON.parse(response.getContentText());

      if (response.getResponseCode() !== 200 || !resData.access_token) {
        throw new Error(resData.error_description || resData.error || '無法更新 Google 日曆存取金鑰，請重新進行授權連結。');
      }

      const accessToken = resData.access_token;
      const expiresIn = resData.expires_in || 3600;
      const expiresAt = now + (expiresIn * 1000);

      // 寫入 Script 屬性快取
      props.setProperty('GOOGLE_OAUTH_ACCESS_TOKEN', accessToken);
      props.setProperty('GOOGLE_OAUTH_EXPIRES_AT', String(expiresAt));

      return accessToken;
    } catch (error) {
      throw new Error('Google 日曆金鑰更新失敗: ' + (error instanceof Error ? error.message : error));
    }
  }

  /**
   * 在客戶日曆中建立新事件，並返回 Event ID
   */
  public static createEvent(
    calendarId: string,
    title: string,
    startTime: Date,
    endTime: Date,
    options: { description?: string; location?: string } = {}
  ): string {
    if (!this.isSaaSMode()) {
      const calId = calendarId || 'primary';
      const cal = calId === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(calId);
      if (!cal) {
        throw new Error(`[CalendarApp 本地降級模式] 找不到指定日曆 ID: ${calId}`);
      }
      const event = cal.createEvent(title, startTime, endTime, {
        description: options.description || '',
        location: options.location || ''
      });
      return event.getId();
    }

    const token = this.getAccessToken();
    const targetCalId = encodeURIComponent(calendarId || 'primary');
    const url = `${this.CALENDAR_API_BASE}/calendars/${targetCalId}/events`;

    const eventPayload = {
      summary: title,
      description: options.description || '',
      location: options.location || '',
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'Asia/Taipei'
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'Asia/Taipei'
      }
    };

    const fetchOptions: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: `Bearer ${token}`
      },
      payload: JSON.stringify(eventPayload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, fetchOptions);
    const resText = response.getContentText();
    const resData = JSON.parse(resText);

    if (response.getResponseCode() !== 200) {
      throw new Error(`[建立日曆事件失敗 - REST API] ${resData.error?.message || resText}`);
    }

    return resData.id;
  }

  /**
   * 更新現有事件的標題與描述
   */
  public static updateEvent(
    calendarId: string,
    eventId: string,
    eventData: { title?: string; description?: string }
  ): void {
    if (!eventId) return;

    if (!this.isSaaSMode()) {
      const calId = calendarId || 'primary';
      const cal = calId === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(calId);
      if (!cal) return;
      const event = cal.getEventById(eventId);
      if (!event) return;
      if (eventData.title !== undefined) event.setTitle(eventData.title);
      if (eventData.description !== undefined) event.setDescription(eventData.description);
      return;
    }

    const token = this.getAccessToken();
    const targetCalId = encodeURIComponent(calendarId || 'primary');
    const url = `${this.CALENDAR_API_BASE}/calendars/${targetCalId}/events/${eventId}`;

    const eventPayload: Record<string, any> = {};
    if (eventData.title !== undefined) eventPayload.summary = eventData.title;
    if (eventData.description !== undefined) eventPayload.description = eventData.description;

    const fetchOptions: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
      method: 'patch',
      contentType: 'application/json',
      headers: {
        Authorization: `Bearer ${token}`
      },
      payload: JSON.stringify(eventPayload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, fetchOptions);
    if (response.getResponseCode() !== 200 && response.getResponseCode() !== 404) {
      throw new Error(`[更新日曆事件失敗 - REST API] ${response.getContentText()}`);
    }
  }

  /**
   * 刪除指定日曆事件
   */
  public static deleteEvent(calendarId: string, eventId: string): void {
    if (!eventId) return;

    if (!this.isSaaSMode()) {
      const calId = calendarId || 'primary';
      const cal = calId === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(calId);
      if (!cal) return;
      const event = cal.getEventById(eventId);
      if (event) {
        event.deleteEvent();
      }
      return;
    }

    const token = this.getAccessToken();
    const targetCalId = encodeURIComponent(calendarId || 'primary');
    const url = `${this.CALENDAR_API_BASE}/calendars/${targetCalId}/events/${eventId}`;

    const fetchOptions: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
      method: 'delete',
      headers: {
        Authorization: `Bearer ${token}`
      },
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, fetchOptions);
    const code = response.getResponseCode();
    // 204 代表成功刪除；404 代表事件早已不存在（視為成功）
    if (code !== 204 && code !== 404 && code !== 410) {
      throw new Error(`[刪除日曆事件失敗 - REST API] Code: ${code}, ${response.getContentText()}`);
    }
  }

  /**
   * 列出指定日期範圍內的所有日曆事件
   */
  public static listEvents(calendarId: string, timeMin: Date, timeMax: Date): any[] {
    if (!this.isSaaSMode()) {
      const calId = calendarId || 'primary';
      const cal = calId === 'primary' ? CalendarApp.getDefaultCalendar() : CalendarApp.getCalendarById(calId);
      if (!cal) return [];
      const events = cal.getEvents(timeMin, timeMax);
      return events.map(e => ({
        id: e.getId(),
        summary: e.getTitle(),
        description: e.getDescription(),
        start: { dateTime: e.getStartTime().toISOString() },
        end: { dateTime: e.getEndTime().toISOString() }
      }));
    }

    const token = this.getAccessToken();
    const targetCalId = encodeURIComponent(calendarId || 'primary');
    const url = `${this.CALENDAR_API_BASE}/calendars/${targetCalId}/events?` +
      `timeMin=${encodeURIComponent(timeMin.toISOString())}&` +
      `timeMax=${encodeURIComponent(timeMax.toISOString())}&` +
      `singleEvents=true&` +
      `maxResults=250`;

    const fetchOptions: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
      method: 'get',
      headers: {
        Authorization: `Bearer ${token}`
      },
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, fetchOptions);
    const resText = response.getContentText();
    const resData = JSON.parse(resText);

    if (response.getResponseCode() !== 200) {
      throw new Error(`[讀取日曆事件失敗 - REST API] ${resData.error?.message || resText}`);
    }

    return resData.items || [];
  }

  /**
   * 處理 Google OAuth 2.0 授權完成後的回呼邏輯 (doGet 接口)
   */
  public static handleOAuthCallback(code: string): GoogleAppsScript.HTML.HtmlOutput {
    const clientId = Config.get('GOOGLE_OAUTH_CLIENT_ID');
    const clientSecret = Config.get('GOOGLE_OAUTH_CLIENT_SECRET');
    const webAppUrl = ScriptApp.getService().getUrl();

    try {
      const payload = {
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: webAppUrl,
        grant_type: 'authorization_code'
      };

      const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
        method: 'post',
        contentType: 'application/x-www-form-urlencoded',
        payload: payload,
        muteHttpExceptions: true
      };

      const response = UrlFetchApp.fetch(this.TOKEN_URL, options);
      const resText = response.getContentText();
      const resData = JSON.parse(resText);

      if (response.getResponseCode() !== 200 || !resData.refresh_token) {
        throw new Error(resData.error_description || resData.error || '未取得離線存取所必需的 Refresh Token！請確保登入授權時點選了「允許離線讀寫」。');
      }

      const refreshToken = resData.refresh_token;

      // 將取得的 Refresh Token 寫入 Google Sheet '系統設定' 工作表
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const configSheet = ss.getSheetByName(SheetHelper.SHEET_NAME_MAP['Config']);
      if (!configSheet) {
        throw new Error('找不到「系統設定」工作表，無法保存連線密鑰！');
      }

      const rows = SheetHelper.getRows<any>('Config');
      const tokenRowIndex = rows.findIndex(r => r.key === 'GOOGLE_OAUTH_REFRESH_TOKEN');

      if (tokenRowIndex !== -1) {
        const rowNum = tokenRowIndex + 2; // +1 header, +1 1-based index
        const colMap = SheetHelper.COLUMN_MAP['Config'];
        const headers = configSheet.getRange(1, 1, 1, configSheet.getLastColumn()).getValues()[0];
        const valCol = headers.indexOf(colMap.value) + 1;
        if (valCol > 0) {
          configSheet.getRange(rowNum, valCol).setValue(refreshToken);
        }
      } else {
        // 安全保險：直接以 ORM 寫入新列
        SheetHelper.addRow('Config', {
          key: 'GOOGLE_OAUTH_REFRESH_TOKEN',
          value: refreshToken,
          description: 'Google Calendar API：自動連結儲存的 Refresh Token (系統自動產生)'
        });
      }

      // 立即清除過期的 Access Token 屬性快取
      const props = PropertiesService.getScriptProperties();
      props.deleteProperty('GOOGLE_OAUTH_ACCESS_TOKEN');
      props.deleteProperty('GOOGLE_OAUTH_EXPIRES_AT');

      return HtmlService.createHtmlOutput(
        `<div style="font-family: sans-serif; text-align: center; padding: 50px;">` +
        `<h1 style="color: #4CAF50; font-size: 28px;">🎉 Google 日曆連結成功！</h1>` +
        `<p style="font-size: 16px; color: #555; margin-top: 15px;">GymOS 系統已順利獲得授權。現在此專案的課程將直接與該 Google 日曆雙向安全連線！</p>` +
        `<p style="font-size: 14px; color: #888; margin-top: 30px;">👉 現在您可以安全地關閉此分頁視窗。</p>` +
        `</div>`
      ).setTitle('Google 日曆連結成功 - GymOS');

    } catch (err) {
      return HtmlService.createHtmlOutput(
        `<div style="font-family: sans-serif; text-align: center; padding: 50px;">` +
        `<h1 style="color: #F44336; font-size: 28px;">❌ Google 日曆連結失敗</h1>` +
        `<p style="font-size: 16px; color: #555; margin-top: 15px;">錯誤原因：${err instanceof Error ? err.message : err}</p>` +
        `<p style="font-size: 14px; color: #888; margin-top: 30px;">請確保您的「系統設定」試算表中的 Client ID 與 Client Secret 正確無誤，然後重新點擊選單進行嘗試。</p>` +
        `</div>`
      ).setTitle('Google 日曆連結失敗 - GymOS');
    }
  }
}
