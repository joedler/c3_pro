/**
 * SheetHelper.ts
 * 提供 Google Sheets 的物件化 ORM/CRUD 封裝，自動處理物件屬性與 Column Headers 的轉換。
 */

class SheetHelper {
  private static getSpreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;

    const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!spreadsheetId) {
      throw new Error('【設定錯誤】未在 GAS 專案屬性中設定 SPREADSHEET_ID！\n請至 Apps Script 左側「專案設定 (齒輪)」->「指令碼屬性 (Script Properties)」中新增一個 Key 為 SPREADSHEET_ID，Value 為你的目標試算表 ID 的屬性。');
    }
    return SpreadsheetApp.openById(spreadsheetId);
  }

  private static getSheet(sheetName: string): GoogleAppsScript.Spreadsheet.Sheet {
    const ss = this.getSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error(`Sheet "${sheetName}" 不存在，請確認是否已執行 setupDatabase。`);
    }
    return sheet;
  }

  /**
   * 取得指定 Sheet 的所有資料並轉換為物件陣列
   */
  public static getRows<T = any>(sheetName: string): T[] {
    const sheet = this.getSheet(sheetName);
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    if (lastRow <= 1) return [];

    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0] as string[];
    const values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    return values.map((row, rowIndex) => {
      const obj: any = { _rowNum: rowIndex + 2 }; // 保留真實試算表行號以便後續更新
      headers.forEach((header, colIndex) => {
        if (header) {
          obj[header] = row[colIndex];
        }
      });
      return obj as T;
    });
  }

  /**
   * 根據指定 Key 欄位查找單一物件
   */
  public static getRow<T = any>(sheetName: string, keyColumn: string, keyValue: any): T | null {
    const rows = this.getRows<any>(sheetName);
    const found = rows.find(row => String(row[keyColumn]) === String(keyValue));
    return found ? (found as T) : null;
  }

  /**
   * 新增一筆資料（物件格式）
   */
  public static addRow(sheetName: string, data: Record<string, any>): void {
    const sheet = this.getSheet(sheetName);
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0] as string[];

    const now = new Date();
    const payload = { ...data };
    
    // 自動填入時間戳記（若欄位存在）
    if (headers.includes('created_at') && !payload['created_at']) payload['created_at'] = now;
    if (headers.includes('updated_at') && !payload['updated_at']) payload['updated_at'] = now;

    const newRowValue = headers.map(header => {
      if (header in payload) {
        const val = payload[header];
        return val instanceof Date ? val : val ?? '';
      }
      return '';
    });

    sheet.appendRow(newRowValue);
  }

  /**
   * 根據指定 Key 更新單一列的指定欄位
   */
  public static updateRow(
    sheetName: string,
    keyColumn: string,
    keyValue: any,
    updateData: Record<string, any>
  ): boolean {
    const sheet = this.getSheet(sheetName);
    const rows = this.getRows<any>(sheetName);
    const found = rows.find(row => String(row[keyColumn]) === String(keyValue));

    if (!found) return false;

    const rowNum = found._rowNum;
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0] as string[];

    const payload = { ...updateData };
    if (headers.includes('updated_at')) {
      payload['updated_at'] = new Date();
    }

    // 逐欄檢查是否有需要更新的屬性，優化只寫入變動部分
    headers.forEach((header, index) => {
      if (header in payload && header !== keyColumn) {
        const colNum = index + 1;
        sheet.getRange(rowNum, colNum).setValue(payload[header] ?? '');
      }
    });

    return true;
  }

  /**
   * 根據指定 Key 刪除該列
   */
  public static deleteRow(sheetName: string, keyColumn: string, keyValue: any): boolean {
    const sheet = this.getSheet(sheetName);
    const rows = this.getRows<any>(sheetName);
    const found = rows.find(row => String(row[keyColumn]) === String(keyValue));

    if (!found) return false;

    sheet.deleteRow(found._rowNum);
    return true;
  }

  /**
   * 批次寫入多筆資料（通常用於開班 Sessions 生成，效能優於 appendRow）
   */
  public static bulkInsert(sheetName: string, list: Record<string, any>[]): void {
    if (list.length === 0) return;
    const sheet = this.getSheet(sheetName);
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0] as string[];

    const now = new Date();
    const rowsToInsert = list.map(item => {
      const payload = { ...item };
      if (headers.includes('created_at') && !payload['created_at']) payload['created_at'] = now;
      if (headers.includes('updated_at') && !payload['updated_at']) payload['updated_at'] = now;

      return headers.map(header => payload[header] ?? '');
    });

    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rowsToInsert.length, lastCol).setValues(rowsToInsert);
  }
}
