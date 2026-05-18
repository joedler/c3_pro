/**
 * Setup.ts
 * 一鍵初始化 Google Sheets 資料庫結構與預設 Config 設定 (PRD v3.0)
 */

function setupDatabase(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const sheetsConfig: Record<string, string[]> = {
    Config: ['key', 'value', 'description'],
    Members: [
      'member_id',
      'line_uid',
      'display_name',
      'real_name',
      'birthday',
      'level',
      'join_date',
      'status',
      'notes',
      'created_at',
      'updated_at'
    ],
    Classes: [
      'class_id',
      'class_name',
      'class_type',
      'level',
      'coach_line_uid',
      'room_id',
      'max_capacity',
      'day_of_week',
      'time_slot',
      'start_time',
      'end_time',
      'period_start',
      'period_weeks',
      'sessions_per_week',
      'total_sessions',
      'status',
      'notes'
    ],
    Sessions: [
      'session_id',
      'class_id',
      'session_date',
      'session_seq',
      'start_time',
      'end_time',
      'status',
      'cancel_reason',
      'substitute_coach_uid',
      'actual_count',
      'calendar_event_id',
      'notes'
    ],
    Enrollments: [
      'enrollment_id',
      'member_id',
      'class_id',
      'enroll_date',
      'status',
      'total_paid_sessions',
      'notes'
    ],
    Attendance: [
      'attendance_id',
      'session_id',
      'member_id',
      'type',
      'checkin_time',
      'checkin_by',
      'original_session_id',
      'notes'
    ],
    Leave_Requests: [
      'leave_id',
      'member_id',
      'session_id',
      'request_time',
      'status',
      'approved_by',
      'makeup_session_id',
      'notes'
    ],
    Makeup_Requests: [
      'makeup_id',
      'member_id',
      'leave_id',
      'target_session_id',
      'request_time',
      'status',
      'notes'
    ],
    Announcements: [
      'announcement_id',
      'title',
      'content',
      'target',
      'publish_time',
      'expire_time',
      'created_by',
      'pinned'
    ],
    Staff: [
      'staff_id',
      'line_uid',
      'real_name',
      'role',
      'status',
      'hourly_rate',
      'notes',
      'created_at',
      'updated_at'
    ],
    Rooms: [
      'room_id',
      'room_name',
      'max_capacity',
      'status',
      'notes'
    ]
  };

  const defaultSettings: [string, string, string][] = [
    ['GYM_NAME', 'C3 Fitness', '健身房名稱'],
    ['LINE_CHANNEL_ACCESS_TOKEN', 'YOUR_LINE_TOKEN', 'LINE Bot Channel Access Token'],
    ['LINE_CHANNEL_SECRET', 'YOUR_LINE_SECRET', 'LINE Bot Channel Secret'],
    ['LIFF_ID', 'YOUR_LIFF_ID', 'LINE LIFF ID'],
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

  for (const [sheetName, headers] of Object.entries(sheetsConfig)) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    } else {
      sheet.clear();
    }

    // 寫入 Header
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1); // 凍結首列

    // 表頭風格美化
    sheet.getRange(1, 1, 1, headers.length)
      .setBackground('#1e293b')
      .setFontColor('#ffffff')
      .setFontWeight('bold')
      .setHorizontalAlignment('center');

    // 寫入預設設定
    if (sheetName === 'Config') {
      sheet.getRange(2, 1, defaultSettings.length, 3).setValues(defaultSettings);
    }
    
    // 如果是 Rooms，寫入預設教室範本方便測試
    if (sheetName === 'Rooms') {
      const defaultRooms = [
        ['RM-01', '大教室', 15, 'active', '預設大教室'],
        ['RM-02', '小教室', 8, 'active', '預設小教室']
      ];
      sheet.getRange(2, 1, defaultRooms.length, 5).setValues(defaultRooms);
    }

    // 自動微調欄寬
    sheet.autoResizeColumns(1, headers.length);
  }

  Logger.log('=== GymOS v3.0 資料庫結構與 11 張 Sheets 初始化成功 ===');
}
