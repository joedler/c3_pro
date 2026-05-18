/**
 * Setup.ts
 * 一鍵初始化 Google Sheets 資料庫結構與預設 Config 設定 (PRD v3.0)
 * 支援 100% 繁體中文試算表呈現，欄位定義與名稱由 SheetHelper.ts 統一管理。
 */

function setupDatabase(): void {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!spreadsheetId) {
      throw new Error('【設定錯誤】未在 GAS 專案屬性中設定 SPREADSHEET_ID！\n請至 Apps Script 左側「專案設定 (齒輪)」->「指令碼屬性 (Script Properties)」中新增一個 Key 為 SPREADSHEET_ID，Value 為你的目標試算表 ID 的屬性，再重新執行此初始化功能。');
    }
    ss = SpreadsheetApp.openById(spreadsheetId);
  }
  
  const defaultSettings: [string, string, string][] = [
    ['GYM_NAME', 'C3 Fitness', '健身房名稱'],
    ['LINE_CHANNEL_ACCESS_TOKEN', 'YOUR_LINE_TOKEN', 'LINE Bot Channel Access Token'],
    ['LINE_CHANNEL_SECRET', 'YOUR_LINE_SECRET', 'LINE Bot Channel Secret'],
    ['LIFF_ID', 'YOUR_LIFF_ID', 'LINE LIFF ID'],
    ['RICH_MENU_MEMBER', 'YOUR_RICH_MENU_MEMBER_ID', '學員版 LINE 圖文選單 ID'],
    ['RICH_MENU_COACH', 'YOUR_RICH_MENU_COACH_ID', '教練版 LINE 圖文選單 ID'],
    ['RICH_MENU_ADMIN', 'YOUR_RICH_MENU_ADMIN_ID', '管理員版 LINE 圖文選單 ID'],
    ['MAX_LEAVE_PER_PERIOD', '3', '每期最多請假堂數'],
    ['MAX_MAKEUP_PER_PERIOD', '3', '每期最多補課堂數'],
    ['MAKEUP_ADVANCE_DAYS', '1', '補課需提前幾天申請'],
    ['LEAVE_ADVANCE_HOURS', '24', '請假需提前幾小時'],
    ['MODULE_SCHEDULE', 'true', '啟用模組：課程排程'],
    ['MODULE_LEAVE', 'true', '啟用模組：請假補課'],
    ['MODULE_ATTENDANCE', 'true', '啟用模組：出勤管理'],
    ['MODULE_NOTIFY', 'true', '啟用模組：通知系統'],
    ['MODULE_FINANCE', 'true', '啟用模組：財務管理']
  ];

  // 遍歷所有在 SheetHelper 中定義的 Sheets，建立中文工作表
  for (const [engSheetName, chineseSheetName] of Object.entries(SheetHelper.SHEET_NAME_MAP)) {
    let sheet = ss.getSheetByName(chineseSheetName);
    if (!sheet) {
      sheet = ss.insertSheet(chineseSheetName);
    } else {
      sheet.clear();
    }

    // 取得該工作表對應的繁體中文 Headers
    const columnMap = SheetHelper.COLUMN_MAP[engSheetName] || {};
    const headers = Object.values(columnMap);

    // 寫入 Header 欄位
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1); // 凍結首列

    // 表頭風格美化
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#1e293b')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');

    // 寫入預設設定值
    if (engSheetName === 'Config') {
      sheet.getRange(2, 1, defaultSettings.length, 3).setValues(defaultSettings);
    }
    
    // 如果是 Rooms，寫入預設教室範本方便測試
    if (engSheetName === 'Rooms') {
      const defaultRooms = [
        ['RM-01', '大教室', 15, 'active', '預設大教室'],
        ['RM-02', '小教室', 8, 'active', '預設小教室']
      ];
      sheet.getRange(2, 1, defaultRooms.length, 5).setValues(defaultRooms);
    }

    // 自動微調欄寬
    sheet.autoResizeColumns(1, headers.length);
  }

  // 刪除預設的 "工作表1" 或 "Sheet1" (若存在且不是我們的資料表之一)
  const defaultSheetNames = ['工作表1', '工作表 1', 'Sheet1', 'Sheet 1'];
  for (const name of defaultSheetNames) {
    const defaultSheet = ss.getSheetByName(name);
    if (defaultSheet && !Object.values(SheetHelper.SHEET_NAME_MAP).includes(name)) {
      try {
        ss.deleteSheet(defaultSheet);
      } catch (e) {
        // 忽略單一工作表無法刪除的錯誤
      }
    }
  }

  Logger.log('=== GymOS v3.0 繁體中文資料庫結構與 11 張 Sheets 初始化成功 ===');
}
