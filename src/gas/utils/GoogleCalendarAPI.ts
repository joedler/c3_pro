/**
 * GoogleCalendarAPI.ts
 * 提供完全去中心化的 OAuth 2.0 Google Calendar REST API 封裝 (SaaS 模式)
 * 客戶無須共用日曆給開發者，透過簡單的 OAuth 授權，程式即可代為讀寫其日曆，且絕不弄髒開發者的個人日曆。
 */

class GoogleCalendarAPI {
  private static readonly TOKEN_URL = 'https://oauth2.googleapis.com/token';
  private static readonly CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

  /**
   * 判斷目前是否啟用了 SaaS 獨立代管日曆模式 (A方案：配置了服務帳號金鑰)
   */
  public static isSaaSMode(): boolean {
    const key = PropertiesService.getScriptProperties().getProperty('GCP_SERVICE_ACCOUNT_KEY');
    return !!key && key.trim() !== '';
  }

  /**
   * 取得或自動簽署 GCP 服務帳號 Access Token (A方案 JWT 自簽章與 Cache 快取)
   */
  public static getAccessToken(): string {
    const cache = CacheService.getScriptCache();
    const cachedToken = cache.get('GCP_SERVICE_ACCOUNT_ACCESS_TOKEN');
    if (cachedToken) {
      return cachedToken;
    }

    const serviceAccountKey = PropertiesService.getScriptProperties().getProperty('GCP_SERVICE_ACCOUNT_KEY');
    if (!serviceAccountKey) {
      throw new Error('409:【日曆未對接】未在 GAS 專案設定中配置 GCP_SERVICE_ACCOUNT_KEY 指令碼屬性！請先新增此屬性以啟用日曆服務。');
    }

    try {
      const sa = JSON.parse(serviceAccountKey);
      const privateKey = sa.private_key;
      const clientEmail = sa.client_email;

      if (!privateKey || !clientEmail) {
        throw new Error('GCP_SERVICE_ACCOUNT_KEY 格式不正確，缺少 private_key 或 client_email！');
      }

      // 建立 JWT Header 與 Claim Set
      const header = {
        alg: 'RS256',
        typ: 'JWT'
      };

      const now = Math.floor(Date.now() / 1000);
      const claimSet = {
        iss: clientEmail,
        scope: 'https://www.googleapis.com/auth/calendar',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
      };

      // Base64EncodeWebSafe 處理
      const toSign = Utilities.base64EncodeWebSafe(JSON.stringify(header)) + '.' +
                     Utilities.base64EncodeWebSafe(JSON.stringify(claimSet));

      // RSA-SHA256 簽名
      const signatureBytes = Utilities.computeRsaSha256Signature(toSign, privateKey);
      const signedJwt = toSign + '.' + Utilities.base64EncodeWebSafe(Utilities.newBlob(signatureBytes).getBytes());

      // 換取 Access Token
      const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
        method: 'post',
        contentType: 'application/x-www-form-urlencoded',
        payload: {
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: signedJwt
        },
        muteHttpExceptions: true
      };

      const response = UrlFetchApp.fetch(this.TOKEN_URL, options);
      const resData = JSON.parse(response.getContentText());

      if (response.getResponseCode() !== 200 || !resData.access_token) {
        throw new Error(resData.error_description || resData.error || 'JWT 授權換取 Access Token 失敗！');
      }

      const accessToken = resData.access_token;
      
      // 快取存取權杖 55 分鐘 (3300秒) 以提升後台排課效率
      cache.put('GCP_SERVICE_ACCOUNT_ACCESS_TOKEN', accessToken, 3300);

      return accessToken;
    } catch (error) {
      throw new Error('GCP 服務帳號認證失敗: ' + (error instanceof Error ? error.message : error));
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

}
