/**
 * SheetHelper.ts
 * 提供 Google Sheets 的物件化 ORM/CRUD 封裝，自動處理物件屬性與 Column Headers 的轉換。
 * 已完全中文化：實體 Google 試算表呈現 100% 繁體中文，而後端代碼維持使用英文變數名稱。
 */

class SheetHelper {
  // 英文 Sheet Name 到繁體中文 Sheet Name 的映射
  public static readonly SHEET_NAME_MAP: Record<string, string> = {
    Config: '系統設定',
    Members: '學員資料',
    Classes: '班級設定',
    Sessions: '課堂紀錄',
    Enrollments: '選課紀錄',
    Attendance: '出勤紀錄',
    Leave_Requests: '請假申請',
    Makeup_Requests: '補課申請',
    Announcements: '系統公告',
    Staff: '教職員資料',
    Rooms: '教室設定'
  };

  // 每一張 Sheet 的英文欄位名到繁體中文欄位名的對照表
  public static readonly COLUMN_MAP: Record<string, Record<string, string>> = {
    Config: {
      key: '設定鍵',
      value: '設定值',
      description: '說明'
    },
    Members: {
      member_id: '學員ID',
      line_uid: 'LINE帳號ID',
      display_name: 'LINE暱稱',
      real_name: '真實姓名',
      birthday: '生日',
      gender: '性別',
      height: '身高',
      weight: '體重',
      level: '程度等級',
      join_date: '加入日期',
      status: '狀態',
      notes: '備註',
      created_at: '建立時間',
      updated_at: '更新時間'
    },
    Classes: {
      class_id: '班級ID',
      class_name: '班級名稱',
      class_type: '班級類型',
      level: '難度等級',
      coach_line_uid: '授課教練LINE帳號',
      room_id: '教室ID',
      max_capacity: '人數上限',
      enrolled: '目前人數',
      gender_limit: '性別限制',
      allow_makeup: '開放補課',
      day_of_week: '星期幾',
      time_slot: '時段分類',
      start_time: '開始時間',
      end_time: '結束時間',
      period_start: '本期開始日期',
      period_weeks: '期數週數',
      sessions_per_week: '每週堂數',
      total_sessions: '總堂數',
      status: '狀態',
      notes: '備註'
    },
    Sessions: {
      session_id: '課堂ID',
      class_id: '班級ID',
      session_date: '上課日期',
      session_seq: '堂數序號',
      start_time: '開始時間',
      end_time: '結束時間',
      status: '狀態',
      cancel_reason: '取消原因',
      substitute_coach_uid: '代課教練LINE帳號',
      actual_count: '實際出席人數',
      calendar_event_id: '日曆事件ID',
      notes: '備註'
    },
    Enrollments: {
      enrollment_id: '選課ID',
      member_id: '學員ID',
      class_id: '班級ID',
      enroll_date: '選課日期',
      status: '狀態',
      total_paid_sessions: '已繳費總堂數',
      notes: '備註'
    },
    Attendance: {
      attendance_id: '出勤ID',
      session_id: '課堂ID',
      member_id: '學員ID',
      type: '出勤類型',
      checkin_time: '簽到時間',
      checkin_by: '簽到方式',
      original_session_id: '原始課堂ID',
      notes: '備註'
    },
    Leave_Requests: {
      leave_id: '請假ID',
      member_id: '學員ID',
      session_id: '課堂ID',
      request_time: '申請時間',
      status: '審核狀態',
      approved_by: '審核者',
      makeup_session_id: '已安排補課ID',
      notes: '備註'
    },
    Makeup_Requests: {
      makeup_id: '補課ID',
      member_id: '學員ID',
      leave_id: '請假ID',
      target_session_id: '目標補課課堂ID',
      request_time: '申請時間',
      status: '狀態',
      notes: '備註'
    },
    Announcements: {
      announcement_id: '公告ID',
      title: '標題',
      content: '內容',
      target: '發送對象',
      publish_time: '發布時間',
      expire_time: '失效時間',
      created_by: '建立者',
      pinned: '是否置頂'
    },
    Staff: {
      staff_id: '職員ID',
      line_uid: 'LINE帳號ID',
      real_name: '真實姓名',
      role: '角色職位',
      status: '狀態',
      hourly_rate: '鐘點費率',
      notes: '備註',
      created_at: '建立時間',
      updated_at: '更新時間'
    },
    Rooms: {
      room_id: '教室ID',
      room_name: '教室名稱',
      max_capacity: '容納人數上限',
      status: '狀態',
      notes: '備註'
    }
  };

  private static getSpreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) return ss;

    const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (!spreadsheetId) {
      throw new Error('【設定錯誤】未在 GAS 專案屬性中設定 SPREADSHEET_ID！\n請至 Apps Script 左側「專案設定 (齒輪)」->「指令碼屬性 (Script Properties)」中新增一個 Key 為 SPREADSHEET_ID，Value 為你的目標試算表 ID 的屬性。');
    }
    return SpreadsheetApp.openById(spreadsheetId);
  }

  public static getSheet(sheetName: string): GoogleAppsScript.Spreadsheet.Sheet {
    const ss = this.getSpreadsheet();
    const chineseSheetName = this.SHEET_NAME_MAP[sheetName] || sheetName;
    const sheet = ss.getSheetByName(chineseSheetName);
    if (!sheet) {
      throw new Error(`工作表 "${chineseSheetName}" 不存在，請確認是否已執行 setupDatabase。`);
    }
    return sheet;
  }

  // 取得中文欄位名到英文欄位名的反向映射
  private static getChineseToEnglishHeader(sheetName: string): Record<string, string> {
    const map = this.COLUMN_MAP[sheetName] || {};
    const reverseMap: Record<string, string> = {};
    for (const [eng, chi] of Object.entries(map)) {
      reverseMap[chi] = eng;
    }
    return reverseMap;
  }

  private static readonly HEADER_ALIASES: Record<string, string> = {
    '職員id': 'staff_id',
    '職員編號': 'staff_id',
    '員工id': 'staff_id',
    'staffid': 'staff_id',
    'line帳號id': 'line_uid',
    'line帳號': 'line_uid',
    'lineid': 'line_uid',
    'lineuid': 'line_uid',
    'line_uid': 'line_uid',
    '真實姓名': 'real_name',
    '姓名': 'real_name',
    'realname': 'real_name',
    'name': 'real_name',
    '角色職位': 'role',
    '角色': 'role',
    '職位': 'role',
    'role': 'role',
    '狀態': 'status',
    '審核狀態': 'status',
    'status': 'status',
    '鐘點費率': 'hourly_rate',
    '鐘點費': 'hourly_rate',
    'hourlyrate': 'hourly_rate',
    '建立時間': 'created_at',
    'createdat': 'created_at',
    '更新時間': 'updated_at',
    'updatedat': 'updated_at'
  };

  public static getEnglishKey(sheetName: string, header: string): string {
    if (!header) return '';
    const cleanHeader = String(header).trim();
    const reverseHeaderMap = this.getChineseToEnglishHeader(sheetName);
    
    let engKey = reverseHeaderMap[cleanHeader];
    if (engKey) return engKey;
    
    const normHeader = cleanHeader.toLowerCase().replace(/[\s_-]/g, '');
    engKey = this.HEADER_ALIASES[normHeader];
    if (engKey) return engKey;
    
    return cleanHeader;
  }

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
          const engKey = this.getEnglishKey(sheetName, header);
          obj[engKey] = row[colIndex];
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
    const cleanKeyValue = String(keyValue).trim();
    const found = rows.find(row => String(row[keyColumn]).trim() === cleanKeyValue);
    return found ? (found as T) : null;
  }

  /**
   * 新增一筆資料（傳入英文屬性物件，自動轉中文寫入）
   */
  public static addRow(sheetName: string, data: Record<string, any>): void {
    const sheet = this.getSheet(sheetName);
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0] as string[];

    const now = new Date();
    const payload = { ...data };
    
    // 自動填入時間戳記（若欄位存在）
    if (!payload['created_at']) payload['created_at'] = now;
    if (!payload['updated_at']) payload['updated_at'] = now;

    const newRowValue = headers.map(header => {
      const engKey = this.getEnglishKey(sheetName, header);
      if (engKey in payload) {
        const val = payload[engKey];
        return val instanceof Date ? val : val ?? '';
      }
      return '';
    });

    sheet.appendRow(newRowValue);
  }

  public static updateRow(
    sheetName: string,
    keyColumn: string,
    keyValue: any,
    updateData: Record<string, any>
  ): boolean {
    const sheet = this.getSheet(sheetName);
    const rows = this.getRows<any>(sheetName);
    const cleanKeyValue = String(keyValue).trim();
    const found = rows.find(row => String(row[keyColumn]).trim() === cleanKeyValue);

    if (!found) return false;

    const rowNum = found._rowNum;
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0] as string[];

    const payload = { ...updateData };
    payload['updated_at'] = new Date();

    // 逐欄檢查是否有需要更新的屬性，優化只寫入變動部分
    headers.forEach((header, index) => {
      const engKey = this.getEnglishKey(sheetName, header);
      if (engKey in payload && engKey !== keyColumn) {
        const colNum = index + 1;
        sheet.getRange(rowNum, colNum).setValue(payload[engKey] ?? '');
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
    const cleanKeyValue = String(keyValue).trim();
    const found = rows.find(row => String(row[keyColumn]).trim() === cleanKeyValue);

    if (!found) return false;

    sheet.deleteRow(found._rowNum);
    return true;
  }

  /**
   * 批次寫入多筆資料（自動處理中英對照，通常用於開班 Sessions 生成，效能優於 appendRow）
   */
  public static bulkInsert(sheetName: string, list: Record<string, any>[]): void {
    if (list.length === 0) return;
    const sheet = this.getSheet(sheetName);
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0] as string[];
    const reverseHeaderMap = this.getChineseToEnglishHeader(sheetName);

    const now = new Date();
    const rowsToInsert = list.map(item => {
      const payload = { ...item };
      if (!payload['created_at']) payload['created_at'] = now;
      if (!payload['updated_at']) payload['updated_at'] = now;

      return headers.map(header => {
        const engKey = reverseHeaderMap[header] || header;
        return payload[engKey] ?? '';
      });
    });

    const startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rowsToInsert.length, lastCol).setValues(rowsToInsert);
  }
}
