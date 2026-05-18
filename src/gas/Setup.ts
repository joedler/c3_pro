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

/**
 * 一鍵自動建立與對接 LINE 三角色圖文選單 (PRD v4.0)
 * 自動從試算表系統設定讀取 API 金鑰，並呼叫 LINE API 建立選單、上傳裁剪好的高畫質背景圖、自動更新回寫 ID！
 */
function setupRichMenus(): void {
  // 強制刷新 Config 快取
  Config.loadCache();
  
  const token = Config.get('LINE_CHANNEL_ACCESS_TOKEN');
  const liffId = Config.get('LIFF_ID');

  if (!token || token === 'YOUR_LINE_TOKEN') {
    throw new Error('【設定錯誤】尚未在試算表「系統設定 (Config)」中填入您真實的 LINE_CHANNEL_ACCESS_TOKEN！請填妥後再執行此功能。');
  }
  if (!liffId || liffId === 'YOUR_LIFF_ID') {
    throw new Error('【設定錯誤】尚未在試算表「系統設定 (Config)」中填入您真實的 LIFF_ID！請填妥後再執行此功能。');
  }

  // 1. 定義 3 個圖文選單配置結構與符合 LINE 規定比例 (2500x843) 的 Unsplash 精準裁剪背景圖
  const richMenus = [
    {
      role: 'member',
      configKey: 'RICH_MENU_MEMBER',
      imageUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=2500&h=843&crop=entropy&fit=crop', // 經典健身房重訓背景
      payload: {
        size: { width: 2500, height: 843 },
        selected: true,
        name: 'GymOS_Member_Menu',
        chatBarText: '👤 學員快速服務',
        areas: [
          {
            bounds: { x: 0, y: 0, width: 833, height: 843 },
            action: { type: 'message', label: '📊 我的課程', text: '我的課程' }
          },
          {
            bounds: { x: 833, y: 0, width: 833, height: 843 },
            action: { type: 'uri', label: '🚫 線上請假', uri: `https://liff.line.me/${liffId}?mode=leave` }
          },
          {
            bounds: { x: 1666, y: 0, width: 834, height: 843 },
            action: { type: 'uri', label: '🔄 跨班補課', uri: `https://liff.line.me/${liffId}?mode=makeup` }
          }
        ]
      }
    },
    {
      role: 'coach',
      configKey: 'RICH_MENU_COACH',
      imageUrl: 'https://images.unsplash.com/photo-1518310383802-640c2de311b2?q=80&w=2500&h=843&crop=entropy&fit=crop', // 教練專心教學背景
      payload: {
        size: { width: 2500, height: 843 },
        selected: false,
        name: 'GymOS_Coach_Menu',
        chatBarText: '📋 教練授課主控',
        areas: [
          {
            bounds: { x: 0, y: 0, width: 1250, height: 843 },
            action: { type: 'message', label: '🗓️ 今日課表', text: '今日課表' }
          },
          {
            bounds: { x: 1250, y: 0, width: 1250, height: 843 },
            action: { type: 'uri', label: '✍️ 點名出勤校正', uri: `https://liff.line.me/${liffId}?mode=coach` }
          }
        ]
      }
    },
    {
      role: 'admin',
      configKey: 'RICH_MENU_ADMIN',
      imageUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=2500&h=843&crop=entropy&fit=crop', // 數據分析管理背景
      payload: {
        size: { width: 2500, height: 843 },
        selected: false,
        name: 'GymOS_Admin_Menu',
        chatBarText: '👑 系統管理後台',
        areas: [
          {
            bounds: { x: 0, y: 0, width: 2500, height: 843 },
            action: { type: 'uri', label: '💻 進入管理後台', uri: `https://liff.line.me/${liffId}?mode=admin` }
          }
        ]
      }
    }
  ];

  // 2. 遍歷發送 API 進行建立、抓圖、上傳與回填
  richMenus.forEach(menu => {
    try {
      // A. 呼叫建立 Rich Menu API
      const createUrl = 'https://api.line.me/v2/bot/richmenu';
      const createOptions: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: `Bearer ${token}` },
        payload: JSON.stringify(menu.payload),
        muteHttpExceptions: true
      };
      
      const createRes = UrlFetchApp.fetch(createUrl, createOptions);
      const createResJson = JSON.parse(createRes.getContentText());

      if (createRes.getResponseCode() !== 200 || !createResJson.richMenuId) {
        throw new Error(`建立選單結構失敗: ${createRes.getContentText()}`);
      }

      const richMenuId = createResJson.richMenuId;
      Logger.log(`[LINE RichMenu] ${menu.role} 選單結構建立成功! ID: ${richMenuId}`);

      // B. 從 Unsplash 抓取 2500x843 精準尺寸背景圖 Blob
      const imgRes = UrlFetchApp.fetch(menu.imageUrl);
      const imgBlob = imgRes.getBlob();

      // C. 呼叫上傳 Rich Menu 圖片 API
      const uploadUrl = `https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`;
      const uploadOptions: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
        method: 'post',
        contentType: 'image/jpeg',
        headers: { Authorization: `Bearer ${token}` },
        payload: imgBlob.getBytes(),
        muteHttpExceptions: true
      };
      
      const uploadRes = UrlFetchApp.fetch(uploadUrl, uploadOptions);
      if (uploadRes.getResponseCode() !== 200) {
        throw new Error(`上傳背景圖片失敗: ${uploadRes.getContentText()}`);
      }
      Logger.log(`[LINE RichMenu] ${menu.role} 背景圖片自動上傳綁定成功!`);

      // D. 回寫更新至 Google 試算表的 Config 系統設定 (具備自我修復機制：若無則自動新增欄位)
      const configRows = SheetHelper.getRows<any>('Config');
      const targetRow = configRows.find(row => row.key === menu.configKey);
      if (targetRow) {
        SheetHelper.updateRow('Config', 'key', menu.configKey, { value: richMenuId });
        Logger.log(`[LINE Config回填] 成功將 ${menu.configKey} 的值更新為 ${richMenuId}！`);
      } else {
        const descMap: Record<string, string> = {
          'RICH_MENU_MEMBER': '學員版 LINE 圖文選單 ID',
          'RICH_MENU_COACH': '教練版 LINE 圖文選單 ID',
          'RICH_MENU_ADMIN': '管理員版 LINE 圖文選單 ID'
        };
        SheetHelper.addRow('Config', {
          key: menu.configKey,
          value: richMenuId,
          description: descMap[menu.configKey] || ''
        });
        Logger.log(`[LINE Config自動新增] 成功建立並填入 ${menu.configKey} 欄位，值為 ${richMenuId}！`);
      }
    } catch (e) {
      Logger.log(`[⚠️ LINE RichMenu 建立失敗 - ${menu.role}] ${e instanceof Error ? e.message : e}`);
    }
  });

  // 強制重新載入 Config 記憶體快取
  Config.loadCache();
  Logger.log('=== GymOS 豪華三角色 LINE 圖文選單一鍵自動建立與數據對接完成！ ===');
}
