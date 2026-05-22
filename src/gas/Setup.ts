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
    ['IMG_MENU_MEMBER', '', '學員版選單圖 (支援 Google Drive 網址)'],
    ['IMG_MENU_COACH', '', '教練版選單圖 (支援 Google Drive 網址)'],
    ['IMG_MENU_ADMIN', '', '管理員版選單圖 (支援 Google Drive 網址)'],
    ['MAX_LEAVE_PER_PERIOD', '3', '每期最多請假堂數'],
    ['MAX_MAKEUP_PER_PERIOD', '3', '每期最多補課堂數'],
    ['MAKEUP_ADVANCE_DAYS', '1', '補課需提前幾天申請'],
    ['LEAVE_ADVANCE_HOURS', '24', '請假需提前幾小時'],
    ['MODULE_SCHEDULE', 'true', '啟用模組：課程排程'],
    ['MODULE_LEAVE', 'true', '啟用模組：請假補課'],
    ['MODULE_ATTENDANCE', 'true', '啟用模組：出勤管理'],
    ['MODULE_NOTIFY', 'true', '啟用模組：通知系統'],
    ['MODULE_FINANCE', 'true', '啟用模組：財務管理'],
    ['ALLOW_DATABASE_RESET', 'false', '安全鎖定：允許前端一鍵重置資料庫與課程種子 (true/false)'],
    ['GOOGLE_OAUTH_CLIENT_ID', '', 'Google Calendar API：OAuth Client ID (SaaS 模式)'],
    ['GOOGLE_OAUTH_CLIENT_SECRET', '', 'Google Calendar API：OAuth Client Secret (SaaS 模式)'],
    ['GOOGLE_OAUTH_REFRESH_TOKEN', '', 'Google Calendar API：自動連結儲存的 Refresh Token (系統自動產生)']
  ];

  // 遍歷所有在 SheetHelper 中定義的 Sheets，建立中文工作表
  for (const [engSheetName, chineseSheetName] of Object.entries(SheetHelper.SHEET_NAME_MAP)) {
    let sheet = ss.getSheetByName(chineseSheetName);
    const columnMap = SheetHelper.COLUMN_MAP[engSheetName] || {};
    const targetHeaders = Object.values(columnMap);

    if (!sheet) {
      // 1. 若資料表不存在：全新建立並寫入完整表頭
      sheet = ss.insertSheet(chineseSheetName);
      sheet.getRange(1, 1, 1, targetHeaders.length).setValues([targetHeaders]);
      sheet.setFrozenRows(1); // 凍結首列

      // 美化表頭風格
      sheet.getRange(1, 1, 1, targetHeaders.length)
        .setBackground('#1e293b')
        .setFontColor('#ffffff')
        .setFontWeight('bold')
        .setHorizontalAlignment('center');

      // 寫入預設設定值 (僅在全新建立 Config 時寫入)
      if (engSheetName === 'Config') {
        sheet.getRange(2, 1, defaultSettings.length, 3).setValues(defaultSettings);
      }

      // 寫入預設教室 (僅在全新建立 Rooms 時寫入)
      if (engSheetName === 'Rooms') {
        const defaultRooms = [
          ['RM-01', '大教室', 15, 'active', '預設大教室'],
          ['RM-02', '小教室', 8, 'active', '預設小教室']
        ];
        sheet.getRange(2, 1, defaultRooms.length, 5).setValues(defaultRooms);
      }
    } else {
      // 2. 若資料表已存在：比對表頭並無損升級 (無損遷移升級欄位，不影響已填寫的舊資料)
      const lastCol = sheet.getLastColumn();
      let currentHeaders: any[] = [];
      if (lastCol > 0) {
        currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
      }

      // 找出缺失的目標表頭欄位並依序追加到後面
      const missingHeaders = targetHeaders.filter(header => !currentHeaders.includes(header));

      if (missingHeaders.length > 0) {
        const startColForAppend = lastCol + 1;
        sheet.getRange(1, startColForAppend, 1, missingHeaders.length).setValues([missingHeaders]);

        // 僅美化新追加的表頭樣式
        sheet.getRange(1, startColForAppend, 1, missingHeaders.length)
          .setBackground('#1e293b')
          .setFontColor('#ffffff')
          .setFontWeight('bold')
          .setHorizontalAlignment('center');

        Logger.log(`【無損升級】在工作表「${chineseSheetName}」中追加了新欄位：${missingHeaders.join(', ')}`);
      }

      // 針對 Config 資料表：如果有新擴充的預設變數，安全地追加到末尾而不動原先的值
      if (engSheetName === 'Config' && sheet.getLastRow() > 0) {
        const existingKeys = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues().map(row => row[0]);
        const missingSettings = defaultSettings.filter(setting => !existingKeys.includes(setting[0]));
        if (missingSettings.length > 0) {
          const nextRow = sheet.getLastRow() + 1;
          sheet.getRange(nextRow, 1, missingSettings.length, 3).setValues(missingSettings);
          Logger.log(`【無損升級】在設定表（Config）中安全追加了預設變數：${missingSettings.map(s => s[0]).join(', ')}`);
        }
      }
    }

    // 自動微調欄寬
    const currentLastCol = sheet.getLastColumn();
    if (currentLastCol > 0) {
      sheet.autoResizeColumns(1, currentLastCol);
    }
  }

  // 刪除預設的 "工作表1" 或 "Sheet1" (若存在且不是我們的資料表之一)
  const defaultSheetNames = ['工作表1', '工作表 1', 'Sheet1', 'Sheet 1'];
  for (const name of defaultSheetNames) {
    const defaultSheet = ss.getSheetByName(name);
    if (defaultSheet && !Object.values(SheetHelper.SHEET_NAME_MAP).includes(name)) {
      try {
        ss.deleteSheet(defaultSheet);
      } catch (e) {
        // 忽略單一工作表無法刪除 the 錯誤
      }
    }
  }

  Logger.log('=== GymOS v3.0 繁體中文資料庫結構「無損遷移與升級」執行成功 ===');
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

  // 🎯 自動化修復：若試算表內缺少這三個欄位，自動為管理員填入，避免手動輸入錯誤！
  const configRows = SheetHelper.getRows<any>('Config');
  const imageKeys = ['IMG_MENU_MEMBER', 'IMG_MENU_COACH', 'IMG_MENU_ADMIN'];
  let fieldsAdded = false;

  imageKeys.forEach(key => {
    if (!configRows.find(r => r.key === key)) {
      const descMap: Record<string, string> = {
        'IMG_MENU_MEMBER': '學員版選單圖 (支援 Google Drive 網址)',
        'IMG_MENU_COACH': '教練版選單圖 (支援 Google Drive 網址)',
        'IMG_MENU_ADMIN': '管理員版選單圖 (支援 Google Drive 網址)'
      };
      SheetHelper.addRow('Config', {
        key: key,
        value: '',
        description: descMap[key]
      });
      fieldsAdded = true;
    }
  });

  if (fieldsAdded) {
    Config.loadCache();
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
        chatBarText: '📅 我的課程',
        areas: [
          {
            bounds: { x: 0, y: 0, width: 2500, height: 843 },
            action: { type: 'uri', label: '📅 我的課程', uri: `https://liff.line.me/${liffId}` }
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

      // B. 取得背景圖 Blob (支援多種 Google Drive 解析或 Unsplash 網址)
      let imgBlob: GoogleAppsScript.Base.Blob;
      const customImgUrl = Config.get(`IMG_MENU_${menu.role.toUpperCase()}`);
      const finalImgUrl = customImgUrl ? customImgUrl : menu.imageUrl;

      try {
        let driveId: string | null = null;
        if (finalImgUrl.includes('drive.google.com/file/d/')) {
          const match = finalImgUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
          if (match) driveId = match[1];
        } else if (finalImgUrl.includes('drive.google.com/open?id=')) {
          const match = finalImgUrl.match(/id=([a-zA-Z0-9_-]+)/);
          if (match) driveId = match[1];
        } else if (finalImgUrl.includes('drive.google.com/uc?id=')) {
          const match = finalImgUrl.match(/id=([a-zA-Z0-9_-]+)/);
          if (match) driveId = match[1];
        }

        if (driveId) {
          const file = DriveApp.getFileById(driveId);
          // 安全檢查：確保檔案小於 1MB 以符合 LINE API 規範
          if (file.getSize() > 1048576) {
            throw new Error('圖片檔案過大！LINE 規定圖文選單圖片不可超過 1MB。');
          }
          imgBlob = file.getBlob();
          Logger.log(`[LINE RichMenu] 成功從 Google Drive 讀取 ${menu.role} 的圖片`);
        } else if (finalImgUrl.includes('drive.google.com')) {
          throw new Error('無法解析您的 Google 雲端硬碟網址！請確保網址是「單一圖片」的共用連結，不能是資料夾連結。');
        } else {
          const imgRes = UrlFetchApp.fetch(finalImgUrl);
          imgBlob = imgRes.getBlob();
        }
      } catch (err) {
        throw new Error(`獲取背景圖失敗 (${finalImgUrl}): ${err instanceof Error ? err.message : err}`);
      }

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
        throw new Error(`上傳背景圖片失敗: ${uploadRes.getContentText()} (若顯示 invalid image dimension，請確認您的圖片剛好是 2500x843 像素且格式為 JPG/PNG)`);
      }
      Logger.log(`[LINE RichMenu] ${menu.role} 背景圖片自動上傳綁定成功!`);

      // D. 回寫更新至 Google 試算表的 Config 系統設定
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
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      Logger.log(`[⚠️ LINE RichMenu 建立失敗 - ${menu.role}] ${errMsg}`);
      throw new Error(`【${menu.role}選單失敗】${errMsg}`);
    }
  });

  // 強制重新載入 Config 記憶體快取
  Config.loadCache();

  // E. 重新綁定預設選單與現有職員的選單
  try {
    const memberMenuId = Config.get('RICH_MENU_MEMBER');
    if (memberMenuId) {
      // 將學員選單設為所有用戶的預設選單
      const defaultUrl = `https://api.line.me/v2/bot/user/all/richmenu/${memberMenuId}`;
      UrlFetchApp.fetch(defaultUrl, {
        method: 'post',
        headers: { Authorization: `Bearer ${token}` },
        muteHttpExceptions: true
      });
      Logger.log('[LINE RichMenu] 已將學員選單設為全域預設選單。');
    }

    // 重新綁定所有職員的專屬選單
    const staffRows = SheetHelper.getRows<any>('Staff');
    const activeStaff = staffRows.filter(row =>
      row.line_uid && String(row.status).trim().toLowerCase() === 'active'
    );
    activeStaff.forEach(staff => {
      const cleanUid = String(staff.line_uid).trim();
      const cleanRole = String(staff.role).trim().toLowerCase();
      LineRichMenu.link(cleanUid, cleanRole === 'admin' ? 'admin' : 'coach');
    });
    Logger.log(`[LINE RichMenu] 已成功重新綁定 ${activeStaff.length} 位職員的專屬選單。`);
  } catch (e) {
    Logger.log(`[⚠️ LINE RichMenu 綁定失敗] ${e instanceof Error ? e.message : e}`);
  }

  Logger.log('=== GymOS 豪華三角色 LINE 圖文選單一鍵自動建立與數據對接完成！ ===');
}

/**
 * 專屬提供給 Google Sheets UI 選單使用的「一鍵更新圖文選單」按鈕綁定函式
 * 執行前先自動確保 Config 表有正確的圖片網址欄位
 */
function uiUpdateRichMenus() {
  try {
    const ui = SpreadsheetApp.getUi();

    // 確保有預留圖片網址的欄位
    const configRows = SheetHelper.getRows<any>('Config');
    const imageKeys = ['IMG_MENU_MEMBER', 'IMG_MENU_COACH', 'IMG_MENU_ADMIN'];
    let fieldsAdded = false;

    imageKeys.forEach(key => {
      if (!configRows.find(r => r.key === key)) {
        SheetHelper.addRow('Config', {
          key: key,
          value: '',
          description: `${key.replace('IMG_MENU_', '')} 版選單圖 (支援 Google Drive 網址)`
        });
        fieldsAdded = true;
      }
    });

    if (fieldsAdded) {
      ui.alert('✅ 已為您在 Config 表中新增圖片網址欄位！\n請貼上您的 Google Drive 圖片網址後，再點擊一次更新按鈕。');
      return;
    }

    ui.alert('⏳ 開始為您重新建立並覆蓋圖文選單...\n處理時間約 5~10 秒，請稍候。');

    // 呼叫主函式
    setupRichMenus();

    ui.alert('🎉 圖文選單更新成功！\n請至 LINE 查看最新畫面。');
  } catch (error) {
    const ui = SpreadsheetApp.getUi();
    ui.alert('❌ 更新失敗：' + (error instanceof Error ? error.message : error));
  }
}

/**
 * 【知識庫標準解法】
 * 強制觸發 Google 授權審查視窗的專用函式
 * 用來解決 GAS 編輯器死不跳出授權視窗的 Bug (Bug 3 解決方案)
 */
function forceAuth() {
  // 隨便呼叫一個需要該權限的官方方法，誘騙編輯器觸發審查
  DriveApp.getFiles();
  Logger.log('🎉 雲端硬碟 (DriveApp) 讀取權限授權完成！');
}

/**
 * 診斷日曆權限與存取狀態，幫助排查日曆 ID 與權限不匹配問題
 */
function debugCalendarAccess(): void {
  let email = '未知 (未授權或無此權限)';
  try {
    email = Session.getActiveUser().getEmail() || '未知 (無 Email 存取權限)';
  } catch (e) {
    // 忽略未取得 email 授權的錯誤
  }
  Logger.log(`=== 🔍 開始診斷日曆存取權限 ===`);
  Logger.log(`1. 目前執行 GAS 的 Google 帳號: ${email}`);

  // 強制加載最新快取
  Config.loadCache();
  const calendarId = Config.get('GOOGLE_CALENDAR_ID');
  Logger.log(`2. 試算表「系統設定」中抓到的 GOOGLE_CALENDAR_ID: "${calendarId}"`);

  if (!calendarId) {
    Logger.log(`❌ 警告：未在「系統設定」中設定 GOOGLE_CALENDAR_ID，將自動使用預設個人日曆。`);
  } else if (calendarId === 'primary') {
    Logger.log(`ℹ️ 提示：設定為 "primary"，將使用您個人預設日曆。`);
  } else {
    try {
      const cal = CalendarApp.getCalendarById(calendarId);
      if (cal) {
        Logger.log(`✅ 成功！已成功載入指定日曆：「${cal.getName()}」`);
      } else {
        Logger.log(`❌ 失敗！無法取得指定日曆。原因可能是：`);
        Logger.log(`   - 該日曆 ID "${calendarId}" 不存在或打錯字。`);
        Logger.log(`   - 目前執行帳號 (${email}) 沒有該日曆的「共用/存取」權限。`);
        Logger.log(`   👉 解決對策：請至該日曆的「設定與共用」中，將執行帳號 (${email}) 加入共用名單，並給予「變更活動」權限。`);
      }
    } catch (err) {
      Logger.log(`❌ 讀取時發生異常：${err instanceof Error ? err.message : err}`);
    }
  }

  Logger.log(`3. 目前執行帳號 (${email}) 可讀取的所有日曆清單：`);
  const allCalendars = CalendarApp.getAllCalendars();
  allCalendars.forEach(cal => {
    Logger.log(`   - 名稱: "${cal.getName()}" | ID: "${cal.getId()}"`);
  });
  Logger.log(`=== 🔍 診斷結束 ===`);
}

/**
 * 一鍵自動建立並寫入 C3 Fitness 17 班課程種子資料 (Spec v2.0)
 */
function seedClasses(): void {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!spreadsheetId) {
      throw new Error('【設定錯誤】未在 GAS 專案屬性中設定 SPREADSHEET_ID！');
    }
    ss = SpreadsheetApp.openById(spreadsheetId);
  }

  // 1. 同步清理與刪除先前產生的日曆事件以避免重置時產生重複日曆髒資料
  // 注意：無條件按日期範圍全掃刪除，即使試算表已被手動清空也能正確清理日曆
  try {
    const calendarId = Config.get('GOOGLE_CALENDAR_ID');

    // 優先：透過 Sessions 表中記錄的 calendar_event_id 精準刪除
    const sessions = SheetHelper.getRows<any>('Sessions');
    const sessionEventIds = new Set(sessions.map((s: any) => s.calendar_event_id).filter(Boolean));

    // 無論 Sessions 是否為空，都對種子資料日期範圍做全面掃描刪除
    // 這樣即使試算表被手動清空後重跑，仍能刪除殘留的日曆事件
    // 注意：掃描起始日從最早可能的開課日往前抓到月初（不可引用尚未宣告的 START_DATES）
    const rangeStart = new Date('2026-05-01T00:00:00');
    const rangeEnd = new Date(rangeStart);
    rangeEnd.setMonth(rangeEnd.getMonth() + 6); // 掃描往後 6 個月

    const events = GoogleCalendarAPI.listEvents(calendarId, rangeStart, rangeEnd);
    let deletedCount = 0;
    events.forEach(event => {
      // 若 Sessions 有記錄：憑 ID 精準比對；若 Sessions 已清空：刪除範圍內所有事件
      const shouldDelete = sessionEventIds.size > 0
        ? sessionEventIds.has(event.id)
        : true; // Sessions 空時，範圍內全部視為舊事件刪除
      if (shouldDelete) {
        try {
          GoogleCalendarAPI.deleteEvent(calendarId, event.id);
          deletedCount++;
        } catch (e) {
          // 忽略已手動刪除的日曆事件錯誤
        }
      }
    });
    Logger.log(`[自動重置] 已刪除 ${deletedCount} 個舊的 Google 日曆事件。`);
  } catch (err) {
    Logger.log(`[清理舊日曆失敗] ${err instanceof Error ? err.message : err}`);
  }

  // 2. 清空相關資料表除了首代表頭外的內容
  const sheetsToClear = ['Classes', 'Sessions', 'Enrollments', 'Leave_Requests', 'Makeup_Requests', 'Attendance'];
  sheetsToClear.forEach(sheetName => {
    try {
      const s = ss.getSheetByName(SheetHelper.SHEET_NAME_MAP[sheetName] || sheetName);
      if (s && s.getLastRow() > 1) {
        s.getRange(2, 1, s.getLastRow() - 1, s.getLastColumn()).clearContent();
      }
    } catch (e) {
      Logger.log(`[清理 ${sheetName} 失敗] ${e}`);
    }
  });
  Logger.log('[自動重置] Classes、Sessions、Enrollments 等業務資料表已清空。');

  // =================================================================
  // 【一鍵設定各班開課日期】正式上線或測試時在此統一調整日期即可！
  // =================================================================
  const START_DATES: Record<string, Date> = {
    // 預設日期（若下方各班未單獨設定，則以此日期為準）
    'DEFAULT': new Date('2026-05-01'),

    // --- A 類：基礎重訓 各班正式日期 ---
    'A-MON-1000': new Date('2026-05-01'),
    'A-MON-1900': new Date('2026-05-01'),
    'A-MON-2000': new Date('2026-05-01'),
    'A-TUE-1000': new Date('2026-05-01'),
    'A-WED-1900': new Date('2026-05-01'),
    'A-WED-2000': new Date('2026-05-01'),
    'A-THU-2000': new Date('2026-05-01'),
    'A-SAT-1000': new Date('2026-05-01'),
    'A-SUN-1100': new Date('2026-05-01'),

    // --- B 類：混合重訓 各班正式日期（建議固定設在當月 1 號以動態計算正確月份堂數） ---
    'B-MONWED-1840': new Date('2026-05-01'),
    'B-MONWED-1950': new Date('2026-05-01'),
    'B-MONWED-2100': new Date('2026-05-01'),
    'B-TUETHU-1840': new Date('2026-05-01'),
    'B-TUETHU-1950': new Date('2026-05-01'),
    'B-TUETHU-2100': new Date('2026-05-01'),

    // --- C 類：特殊專班 各班正式日期 ---
    'C-THU-1000': new Date('2026-05-01'),
    'C-SAT-0800': new Date('2026-05-01'),
  };

  const defaultClasses: any[] = [
    // === A 類：基礎重訓 (每週1次，難度2-5，上限8人，開放補課) ===
    {
      class_id: 'A-MON-1000',
      class_name: '基礎重訓 週一上午班',
      class_type: 'A',
      level: 'Lv.2',
      coach_line_uid: 'U028285d818d2fb6acc952c416b833e33',
      room_id: 'RM-02',
      max_capacity: 8,
      enrolled: 4,
      gender_limit: null,
      allow_makeup: true,
      day_of_week: '週一',
      time_slot: '上午',
      start_time: '10:00',
      end_time: '11:00',
      period_start: START_DATES['A-MON-1000'] || START_DATES['DEFAULT'],
      period_weeks: 12,
      sessions_per_week: 1,
      total_sessions: 12,
      status: 'open',
      notes: '課程種子資料'
    },
    {
      class_id: 'A-MON-1900',
      class_name: '基礎重訓 週一晚女專班',
      class_type: 'A',
      level: 'Lv.4',
      coach_line_uid: 'U028285d818d2fb6acc952c416b833e33',
      room_id: 'RM-02',
      max_capacity: 8,
      enrolled: 5,
      gender_limit: 'female',
      allow_makeup: true,
      day_of_week: '週一',
      time_slot: '晚間',
      start_time: '19:00',
      end_time: '20:00',
      period_start: START_DATES['A-MON-1900'] || START_DATES['DEFAULT'],
      period_weeks: 12,
      sessions_per_week: 1,
      total_sessions: 12,
      status: 'open',
      notes: '課程種子資料'
    },
    {
      class_id: 'A-MON-2000',
      class_name: '基礎重訓 週一晚班',
      class_type: 'A',
      level: 'Lv.4',
      coach_line_uid: 'U028285d818d2fb6acc952c416b833e33',
      room_id: 'RM-02',
      max_capacity: 8,
      enrolled: 7,
      gender_limit: null,
      allow_makeup: true,
      day_of_week: '週一',
      time_slot: '晚間',
      start_time: '20:00',
      end_time: '21:00',
      period_start: START_DATES['A-MON-2000'] || START_DATES['DEFAULT'],
      period_weeks: 12,
      sessions_per_week: 1,
      total_sessions: 12,
      status: 'open',
      notes: '課程種子資料'
    },
    {
      class_id: 'A-TUE-1000',
      class_name: '基礎重訓 週二上午女專班',
      class_type: 'A',
      level: 'Lv.4',
      coach_line_uid: 'U028285d818d2fb6acc952c416b833e33',
      room_id: 'RM-02',
      max_capacity: 8,
      enrolled: 7,
      gender_limit: 'female',
      allow_makeup: true,
      day_of_week: '週二',
      time_slot: '上午',
      start_time: '10:00',
      end_time: '11:00',
      period_start: START_DATES['A-TUE-1000'] || START_DATES['DEFAULT'],
      period_weeks: 12,
      sessions_per_week: 1,
      total_sessions: 12,
      status: 'open',
      notes: '課程種子資料'
    },
    {
      class_id: 'A-WED-1900',
      class_name: '基礎重訓 週三晚女專A班',
      class_type: 'A',
      level: 'Lv.2',
      coach_line_uid: 'U028285d818d2fb6acc952c416b833e33',
      room_id: 'RM-02',
      max_capacity: 8,
      enrolled: 4,
      gender_limit: 'female',
      allow_makeup: true,
      day_of_week: '週三',
      time_slot: '晚間',
      start_time: '19:00',
      end_time: '20:00',
      period_start: START_DATES['A-WED-1900'] || START_DATES['DEFAULT'],
      period_weeks: 12,
      sessions_per_week: 1,
      total_sessions: 12,
      status: 'open',
      notes: '課程種子資料'
    },
    {
      class_id: 'A-WED-2000',
      class_name: '基礎重訓 週三晚女專B班',
      class_type: 'A',
      level: 'Lv.2',
      coach_line_uid: 'U028285d818d2fb6acc952c416b833e33',
      room_id: 'RM-02',
      max_capacity: 8,
      enrolled: 6,
      gender_limit: 'female',
      allow_makeup: true,
      day_of_week: '週三',
      time_slot: '晚間',
      start_time: '20:00',
      end_time: '21:00',
      period_start: START_DATES['A-WED-2000'] || START_DATES['DEFAULT'],
      period_weeks: 12,
      sessions_per_week: 1,
      total_sessions: 12,
      status: 'open',
      notes: '課程種子資料'
    },
    {
      class_id: 'A-THU-2000',
      class_name: '基礎重訓 週四晚女專班',
      class_type: 'A',
      level: 'Lv.4',
      coach_line_uid: 'U028285d818d2fb6acc952c416b833e33',
      room_id: 'RM-02',
      max_capacity: 8,
      enrolled: 6,
      gender_limit: 'female',
      allow_makeup: true,
      day_of_week: '週四',
      time_slot: '晚間',
      start_time: '20:00',
      end_time: '21:00',
      period_start: START_DATES['A-THU-2000'] || START_DATES['DEFAULT'],
      period_weeks: 12,
      sessions_per_week: 1,
      total_sessions: 12,
      status: 'open',
      notes: '課程種子資料'
    },
    {
      class_id: 'A-SAT-1000',
      class_name: '基礎重訓 週六上午班',
      class_type: 'A',
      level: 'Lv.2',
      coach_line_uid: 'U028285d818d2fb6acc952c416b833e33',
      room_id: 'RM-02',
      max_capacity: 8,
      enrolled: 0,
      gender_limit: null,
      allow_makeup: true,
      day_of_week: '週六',
      time_slot: '上午',
      start_time: '10:00',
      end_time: '11:00',
      period_start: START_DATES['A-SAT-1000'] || START_DATES['DEFAULT'],
      period_weeks: 12,
      sessions_per_week: 1,
      total_sessions: 12,
      status: 'pending',
      notes: '尚未開課'
    },
    {
      class_id: 'A-SUN-1100',
      class_name: '基礎重訓 週日上午班',
      class_type: 'A',
      level: 'Lv.4',
      coach_line_uid: 'U028285d818d2fb6acc952c416b833e33',
      room_id: 'RM-02',
      max_capacity: 8,
      enrolled: 8,
      gender_limit: null,
      allow_makeup: true,
      day_of_week: '週日',
      time_slot: '上午',
      start_time: '11:00',
      end_time: '12:00',
      period_start: START_DATES['A-SUN-1100'] || START_DATES['DEFAULT'],
      period_weeks: 12,
      sessions_per_week: 1,
      total_sessions: 12,
      status: 'open',
      notes: '課程種子資料'
    },

    // === B 類：混合重訓 (每週2次，難度6-9，上限15人，開放補課，不限性別) ===
    {
      class_id: 'B-MONWED-1840',
      class_name: '混合重訓 週一三晚A班',
      class_type: 'B',
      level: 'Lv.8',
      coach_line_uid: 'U028285d818d2fb6acc952c416b833e33',
      room_id: 'RM-01',
      max_capacity: 15,
      enrolled: 14,
      gender_limit: null,
      allow_makeup: true,
      day_of_week: '週一 + 週三',
      time_slot: '晚間',
      start_time: '18:40',
      end_time: '19:40',
      period_start: START_DATES['B-MONWED-1840'] || START_DATES['DEFAULT'],
      period_type: 'monthly',
      period_weeks: 0,
      sessions_per_week: 2,
      total_sessions: 0,
      status: 'open',
      notes: '課程種子資料'
    },
    {
      class_id: 'B-MONWED-1950',
      class_name: '混合重訓 週一三晚B班',
      class_type: 'B',
      level: 'Lv.6',
      coach_line_uid: 'U028285d818d2fb6acc952c416b833e33',
      room_id: 'RM-01',
      max_capacity: 15,
      enrolled: 13,
      gender_limit: null,
      allow_makeup: true,
      day_of_week: '週一 + 週三',
      time_slot: '晚間',
      start_time: '19:50',
      end_time: '20:50',
      period_start: START_DATES['B-MONWED-1950'] || START_DATES['DEFAULT'],
      period_type: 'monthly',
      period_weeks: 0,
      sessions_per_week: 2,
      total_sessions: 0,
      status: 'open',
      notes: '課程種子資料'
    },
    {
      class_id: 'B-MONWED-2100',
      class_name: '混合重訓 週一三晚C班',
      class_type: 'B',
      level: 'Lv.6',
      coach_line_uid: 'U028285d818d2fb6acc952c416b833e33',
      room_id: 'RM-01',
      max_capacity: 15,
      enrolled: 12,
      gender_limit: null,
      allow_makeup: true,
      day_of_week: '週一 + 週三',
      time_slot: '晚間',
      start_time: '21:00',
      end_time: '22:00',
      period_start: START_DATES['B-MONWED-2100'] || START_DATES['DEFAULT'],
      period_type: 'monthly',
      period_weeks: 0,
      sessions_per_week: 2,
      total_sessions: 0,
      status: 'open',
      notes: '課程種子資料'
    },
    {
      class_id: 'B-TUETHU-1840',
      class_name: '混合重訓 週二四晚A班',
      class_type: 'B',
      level: 'Lv.8',
      coach_line_uid: 'U028285d818d2fb6acc952c416b833e33',
      room_id: 'RM-01',
      max_capacity: 15,
      enrolled: 14,
      gender_limit: null,
      allow_makeup: true,
      day_of_week: '週二 + 週四',
      time_slot: '晚間',
      start_time: '18:40',
      end_time: '19:40',
      period_start: START_DATES['B-TUETHU-1840'] || START_DATES['DEFAULT'],
      period_type: 'monthly',
      period_weeks: 0,
      sessions_per_week: 2,
      total_sessions: 0,
      status: 'open',
      notes: '課程種子資料'
    },
    {
      class_id: 'B-TUETHU-1950',
      class_name: '混合重訓 週二四晚B班',
      class_type: 'B',
      level: 'Lv.6',
      coach_line_uid: 'U028285d818d2fb6acc952c416b833e33',
      room_id: 'RM-01',
      max_capacity: 15,
      enrolled: 10,
      gender_limit: null,
      allow_makeup: true,
      day_of_week: '週二 + 週四',
      time_slot: '晚間',
      start_time: '19:50',
      end_time: '20:50',
      period_start: START_DATES['B-TUETHU-1950'] || START_DATES['DEFAULT'],
      period_type: 'monthly',
      period_weeks: 0,
      sessions_per_week: 2,
      total_sessions: 0,
      status: 'open',
      notes: '課程種子資料'
    },
    {
      class_id: 'B-TUETHU-2100',
      class_name: '混合重訓 週二四晚C班',
      class_type: 'B',
      level: 'Lv.8',
      coach_line_uid: 'U028285d818d2fb6acc952c416b833e33',
      room_id: 'RM-01',
      max_capacity: 15,
      enrolled: 13,
      gender_limit: null,
      allow_makeup: true,
      day_of_week: '週二 + 週四',
      time_slot: '晚間',
      start_time: '21:00',
      end_time: '22:00',
      period_start: START_DATES['B-TUETHU-2100'] || START_DATES['DEFAULT'],
      period_type: 'monthly',
      period_weeks: 0,
      sessions_per_week: 2,
      total_sessions: 0,
      status: 'open',
      notes: '課程種子資料'
    },

    // === C 類：特殊專班 (每週1次，程度不固定，上限15人，不開放補課，不限性別) ===
    {
      class_id: 'C-THU-1000',
      class_name: '特殊專班 週四上午班',
      class_type: 'C',
      level: '不固定',
      coach_line_uid: 'U028285d818d2fb6acc952c416b833e33',
      room_id: 'RM-01',
      max_capacity: 15,
      enrolled: 0,
      gender_limit: null,
      allow_makeup: false,
      day_of_week: '週四',
      time_slot: '上午',
      start_time: '10:00',
      end_time: '11:00',
      period_start: START_DATES['C-THU-1000'] || START_DATES['DEFAULT'],
      period_weeks: 12,
      sessions_per_week: 1,
      total_sessions: 12,
      status: 'open',
      notes: '課程種子資料'
    },
    {
      class_id: 'C-SAT-0800',
      class_name: '特殊專班 週六上午班',
      class_type: 'C',
      level: '不固定',
      coach_line_uid: 'U028285d818d2fb6acc952c416b833e33',
      room_id: 'RM-01',
      max_capacity: 15,
      enrolled: 0,
      gender_limit: null,
      allow_makeup: false,
      day_of_week: '週六',
      time_slot: '上午',
      start_time: '08:00',
      end_time: '09:00',
      period_start: START_DATES['C-SAT-0800'] || START_DATES['DEFAULT'],
      period_weeks: 12,
      sessions_per_week: 1,
      total_sessions: 12,
      status: 'open',
      notes: '課程種子資料'
    }
  ];

  // 批次寫入所有班級資料並自動展開課堂 Sessions 及 Google 日曆事件
  defaultClasses.forEach(cls => {
    SheetHelper.addRow('Classes', cls);
    try {
      ClassEngine.generate(cls.class_id);
      Logger.log(`[自動排課] 班級 ${cls.class_id} 的課堂已成功展開並建立日曆事件。`);
    } catch (err) {
      Logger.log(`[自動排課失敗 - ${cls.class_id}] ${err instanceof Error ? err.message : err}`);
    }
  });

  Logger.log(`=== 成功導入 ${defaultClasses.length} 筆 C3 Fitness 課程排程種子資料且批次展開日曆！ ===`);
}


