/**
 * Config.ts
 * 提供系統 Config 的讀取與緩存 (PRD v3.0)
 */

class Config {
  private static cache: Record<string, string> | null = null;
  private static readonly SCRIPT_PROPERTY_KEYS = new Set([
    'LINE_CHANNEL_ACCESS_TOKEN',
    'LINE_CHANNEL_SECRET',
    'LIFF_ID',
    'GOOGLE_CALENDAR_ID',
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET',
    'GOOGLE_OAUTH_REFRESH_TOKEN',
    'RICH_MENU_MEMBER',
    'RICH_MENU_COACH',
    'RICH_MENU_ADMIN',
    'BRAND_TITLE',
    'LINE_AUTO_PUSH_RENEW'
  ]);
  private static readonly FIXED_DEFAULTS: Record<string, string> = {
    BRAND_TITLE: 'C3 Fitness',
    LINE_AUTO_PUSH_RENEW: 'false',
    BRAND_LOGO_URL: 'https://joedler.github.io/c3_pro/img/logo/logo.png',
    IMG_MENU_MEMBER: 'https://joedler.github.io/c3_pro/img/rich-menu/member.jpg',
    IMG_MENU_COACH: 'https://joedler.github.io/c3_pro/img/rich-menu/coach.jpg',
    IMG_MENU_ADMIN: 'https://joedler.github.io/c3_pro/img/rich-menu/admin.jpg'
  };

  /**
   * 取得指定 Key 的設定值
   */
  public static get(key: string, defaultValue: string = ''): string {
    if (this.SCRIPT_PROPERTY_KEYS.has(key)) {
      const propValue = PropertiesService.getScriptProperties().getProperty(key);
      if (propValue && propValue.trim() !== '') {
        return propValue.trim();
      }
    }

    if (this.cache === null) {
      this.loadCache();
    }
    const sheetValue = this.cache?.[key];
    if (sheetValue && sheetValue.trim() !== '') {
      return sheetValue;
    }

    return this.FIXED_DEFAULTS[key] ?? defaultValue;
  }

  /**
   * 強制重新載入 Config 緩存
   */
  public static loadCache(): void {
    this.cache = {};
    try {
      const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
      const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
      const ss = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : activeSpreadsheet;
      const sheet = ss ? (ss.getSheetByName('系統設定') || ss.getSheetByName('Config')) : null;
      if (!sheet || sheet.getLastRow() < 2) {
        return;
      }
      const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
      const rows = values.map(row => ({ key: row[0], value: row[1] }));
      rows.forEach(row => {
        if (row.key) {
          this.cache![row.key] = String(row.value ?? '').trim();
        }
      });
    } catch (e) {
      Logger.log(`[Config載入失敗] ${e instanceof Error ? e.message : e}`);
    }
  }

  /**
   * 判斷指定功能模組是否啟用
   */
  public static isModuleEnabled(moduleName: string): boolean {
    const key = `MODULE_${moduleName.toUpperCase()}`;
    return this.get(key) === 'true';
  }
}
