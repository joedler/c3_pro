/**
 * Config.ts
 * 提供系統 Config 的讀取與緩存 (PRD v3.0)
 */

class Config {
  private static cache: Record<string, string> | null = null;

  /**
   * 取得指定 Key 的設定值
   */
  public static get(key: string, defaultValue: string = ''): string {
    if (this.cache === null) {
      this.loadCache();
    }
    return this.cache?.[key] ?? defaultValue;
  }

  /**
   * 強制重新載入 Config 緩存
   */
  public static loadCache(): void {
    this.cache = {};
    try {
      const rows = SheetHelper.getRows<any>('Config');
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
