# GymOS — 模組化健身房管理系統
## 產品需求文件 (PRD) v1.0

> **定位**：零成本基礎設施、低維護負擔、模組化架構，可作為 SaaS 商業產品販售給中小型健身房。

---

## 目錄

1. [產品願景與定位](#1-產品願景與定位)
2. [技術架構總覽](#2-技術架構總覽)
3. [資料架構 — Google Sheets Schema](#3-資料架構--google-sheets-schema)
4. [GAS API 設計規範](#4-gas-api-設計規範)
5. [功能模組規格](#5-功能模組規格)
   - 5.1 [學員模組 (Member Module)](#51-學員模組-member-module)
   - 5.2 [管理模組 (Admin Module)](#52-管理模組-admin-module)
   - 5.3 [教練模組 (Coach Module)](#53-教練模組-coach-module)
   - 5.4 [LINE Bot 模組](#54-line-bot-模組)
6. [開班與課程週期引擎](#6-開班與課程週期引擎)
7. [共享日曆規格](#7-共享日曆規格)
8. [通知系統設計（無 LINE PUSH 限制）](#8-通知系統設計無-line-push-限制)
9. [clasp 本地開發規範](#9-clasp-本地開發規範)
10. [模組化商業產品架構](#10-模組化商業產品架構)
11. [未來擴充路線圖](#11-未來擴充路線圖)
12. [非功能性需求](#12-非功能性需求)

---

## 1. 產品願景與定位

### 核心目標
打造一套完全基於 Google 生態系與 LINE 平台的健身房數位化管理系統，具備以下特性：

| 特性 | 說明 |
|------|------|
| **零成本基礎設施** | GitHub Pages + Google Apps Script + Google Sheets + LINE Free Plan |
| **低維護負擔** | 無伺服器、無資料庫帳單、Google 負責基礎設施維運 |
| **模組化架構** | 每個功能模組可獨立啟用/停用，便於客製化銷售 |
| **擴充彈性高** | clasp 本地開發 + Git 版控，未來可接 Firebase、串 LINE Pay |

### 目標客戶（商業化後）
- 主力：10～150 名會員的小型個人健身房、瑜珈教室、舞蹈教室
- 次要：社區運動中心、企業員工健康計畫
- 銷售模式：按模組授權 + 一次性設定費

---

## 2. 技術架構總覽

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND TIER                             │
│   GitHub Pages (靜態)          LINE 官方帳號 (LIFF App)          │
│   • 管理後台 SPA               • 學員操作介面                     │
│   • 教練日曆頁面                • 個人資訊卡片                     │
│   • 公開課表展示                • 請假 / 補課                      │
└───────────────────┬───────────────────────┬─────────────────────┘
                    │ HTTPS fetch/AJAX       │ LINE Webhook
┌───────────────────▼───────────────────────▼─────────────────────┐
│                     GAS WEB APP TIER                              │
│                                                                   │
│  doGet(e)  → 公開資料查詢 API (課表、公告)                        │
│  doPost(e) → 需驗證操作 API (請假、開班、報到)                    │
│                                                                   │
│  Modules:  ClassEngine | MemberService | NotifyService           │
│            CoachService | AdminService | LineHandler              │
└───────────────────┬───────────────────────┬─────────────────────┘
                    │ SpreadsheetApp         │ UrlFetchApp
┌───────────────────▼──────┐  ┌─────────────▼─────────────────────┐
│    Google Sheets DB       │  │   External Services               │
│  • Members                │  │  • LINE Messaging API             │
│  • Classes                │  │  • LINE Login (LIFF)              │
│  • Sessions               │  │  • Gmail API                      │
│  • Bookings               │  │  • Google Calendar API            │
│  • Attendance             │  │  • FullCalendar.js (前端)          │
│  • Leave_Requests         │  │  • Cloudinary (媒體, 免費)         │
│  • Makeup_Requests        │  └───────────────────────────────────┘
│  • Announcements          │
│  • Config                 │
└───────────────────────────┘
```

### 技術選型理由

| 層級 | 選用技術 | 選用理由 |
|------|----------|----------|
| 前端 | GitHub Pages | 免費靜態 CDN、Git 版控、CI/CD 自動部署 |
| 後端 | Google Apps Script | 免費執行時數足夠、直接存取 Sheets、可部署 Webhook |
| 資料庫 | Google Sheets | 非技術人員可直接操作、備份簡單、免費無限 |
| 即時通訊 | LINE LIFF + Webhook | 台灣用戶覆蓋率高、LIFF 可嵌入全功能 Web App |
| 日曆 | FullCalendar.js + Google Calendar | 視覺化排課、免費、可嵌入 LIFF |

---

## 3. 資料架構 — Google Sheets Schema

> 每個 Google Spreadsheet 即為一個「健身房租戶」的完整資料庫。

### Sheet 1: `Config` — 系統設定

| 欄位 | 類型 | 說明 |
|------|------|------|
| key | String | 設定鍵名 |
| value | String | 設定值 |
| description | String | 說明 |

重要設定鍵：
- `GYM_NAME` — 健身房名稱
- `LINE_CHANNEL_ACCESS_TOKEN` — LINE Bot Token
- `LINE_CHANNEL_SECRET`
- `LIFF_ID` — LIFF App ID
- `ADMIN_LINE_UIDS` — 管理員 LINE UID（逗號分隔）
- `COACH_LINE_UIDS` — 教練 LINE UID 清單
- `MAX_LEAVE_PER_PERIOD` — 每期最多請假堂數（預設 3）
- `MAX_MAKEUP_PER_PERIOD` — 每期最多補課堂數（預設 3）
- `MAKEUP_ADVANCE_DAYS` — 補課需提前幾天申請（預設 1）
- `LEAVE_ADVANCE_HOURS` — 請假需提前幾小時（預設 24）

---

### Sheet 2: `Members` — 學員資料

| 欄位 | 類型 | 說明 |
|------|------|------|
| member_id | String (UUID) | 主鍵，系統產生 |
| line_uid | String | LINE User ID，綁定後填入 |
| display_name | String | LINE 顯示名稱 |
| real_name | String | 真實姓名 |
| phone | String | 聯絡電話 |
| email | String | 電子郵件 |
| join_date | Date | 加入日期 |
| status | Enum | active / inactive / suspended |
| notes | String | 備註（健康狀況等） |
| created_at | Timestamp | |
| updated_at | Timestamp | |

---

### Sheet 3: `Classes` — 課程班級定義

| 欄位 | 類型 | 說明 |
|------|------|------|
| class_id | String | 主鍵 (e.g., `CLS-2025-001`) |
| class_name | String | 班級名稱 (e.g., `初階A班`) |
| class_type | Enum | `group_1x` / `group_2x` / `personal` |
| level | Enum | `beginner` / `intermediate` / `senior` / `personal` |
| coach_line_uid | String | 授課教練 LINE UID |
| room | Enum | `big_room` / `small_room` |
| max_capacity | Integer | 最大人數（大教室20、小教室10） |
| day_of_week | Integer | 0-6 (0=週日) |
| time_slot | Enum | `morning` / `afternoon` / `evening` |
| start_time | Time | e.g., `09:00` |
| end_time | Time | e.g., `10:00` |
| period_start | Date | 本期開始日期 |
| period_weeks | Integer | 期數週數（預設12） |
| sessions_per_week | Integer | 每週堂數（1 或 2） |
| total_sessions | Integer | 計算欄：period_weeks × sessions_per_week |
| status | Enum | `active` / `closed` / `suspended` |
| notes | String | 備註 |

---

### Sheet 4: `Sessions` — 每堂課紀錄（由開班自動產生）

| 欄位 | 類型 | 說明 |
|------|------|------|
| session_id | String | 主鍵 (e.g., `SES-CLS001-01`) |
| class_id | String | FK → Classes |
| session_date | Date | 上課日期 |
| session_seq | Integer | 第幾堂（1~12）|
| start_time | Time | 開始時間 |
| end_time | Time | 結束時間 |
| status | Enum | `scheduled` / `completed` / `cancelled` / `suspended` |
| cancel_reason | String | 取消原因（颱風/教練請假/...）|
| substitute_coach_uid | String | 代課教練 UID（若有）|
| actual_count | Integer | 實際出席人數 |
| notes | String | |

---

### Sheet 5: `Enrollments` — 學員選課（報名）

| 欄位 | 類型 | 說明 |
|------|------|------|
| enrollment_id | String | 主鍵 |
| member_id | String | FK → Members |
| class_id | String | FK → Classes |
| enroll_date | Date | 報名日期 |
| status | Enum | `active` / `completed` / `dropped` |
| total_paid_sessions | Integer | 已付費堂數 |
| notes | String | |

---

### Sheet 6: `Attendance` — 出勤紀錄

| 欄位 | 類型 | 說明 |
|------|------|------|
| attendance_id | String | 主鍵 |
| session_id | String | FK → Sessions |
| member_id | String | FK → Members |
| type | Enum | `regular` / `makeup` / `leave` |
| checkin_time | Timestamp | 簽到時間 |
| checkin_by | String | 簽到方式 (qr_code / manual / auto) |
| original_session_id | String | 若為補課，原本應到的 session_id |
| notes | String | |

---

### Sheet 7: `Leave_Requests` — 請假申請

| 欄位 | 類型 | 說明 |
|------|------|------|
| leave_id | String | 主鍵 |
| member_id | String | FK → Members |
| session_id | String | FK → Sessions（請哪一堂假）|
| request_time | Timestamp | 申請時間 |
| status | Enum | `pending` / `approved` / `rejected` |
| approved_by | String | 核准者 (LINE UID 或 `auto`)  |
| makeup_session_id | String | 已安排補課的 session_id（補課後填入）|
| notes | String | |

---

### Sheet 8: `Makeup_Requests` — 補課申請

| 欄位 | 類型 | 說明 |
|------|------|------|
| makeup_id | String | 主鍵 |
| member_id | String | FK → Members |
| leave_id | String | FK → Leave_Requests（補哪次請假）|
| target_session_id | String | FK → Sessions（要補哪一堂）|
| request_time | Timestamp | |
| status | Enum | `pending` / `approved` / `rejected` / `completed` |
| notes | String | |

---

### Sheet 9: `Announcements` — 公告

| 欄位 | 類型 | 說明 |
|------|------|------|
| announcement_id | String | 主鍵 |
| title | String | 標題 |
| content | String | 內容 |
| target | Enum | `all` / `class:{class_id}` / `coach` |
| publish_time | Timestamp | 發布時間 |
| expire_time | Timestamp | 失效時間 |
| created_by | String | 建立者 UID |
| pinned | Boolean | 是否置頂 |

---

## 4. GAS API 設計規範

### 統一入口

```javascript
// doPost 路由設計
function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  
  // LINE Webhook 特別處理
  if (payload.events) return LineHandler.process(payload);
  
  // 一般 API 路由
  const { action, token, data } = payload;
  const user = AuthService.verify(token); // 驗證 LINE Token
  
  const routes = {
    // 學員操作
    'member.bind':         () => MemberService.bind(data, user),
    'member.getInfo':      () => MemberService.getInfo(user),
    'leave.request':       () => LeaveService.request(data, user),
    'makeup.request':      () => MakeupService.request(data, user),
    'makeup.available':    () => MakeupService.getAvailable(data, user),
    // 教練操作
    'coach.getSchedule':   () => CoachService.getSchedule(data, user),
    'coach.checkin':       () => CoachService.checkin(data, user),
    'coach.adjustSession': () => CoachService.adjustSession(data, user),
    // 管理員操作
    'admin.createClass':   () => AdminService.createClass(data, user),
    'admin.generateSessions': () => ClassEngine.generate(data, user),
    'admin.suspendSession': () => AdminService.suspendSession(data, user),
    'admin.announcement':  () => AdminService.createAnnouncement(data, user),
  };
  
  if (!routes[action]) return respond(400, 'Unknown action');
  return respond(200, routes[action]());
}

function doGet(e) {
  const action = e.parameter.action;
  const routes = {
    'schedule.public':   () => ScheduleService.getPublic(),
    'announcements':     () => AnnouncementService.getActive(),
  };
  return respond(200, routes[action] ? routes[action]() : null);
}
```

### 認證機制（輕量 JWT）

```javascript
// AuthService.gs
const AuthService = {
  verify(token) {
    // 驗證 LINE Access Token，取得 LINE profile
    // 比對 Members sheet 的 line_uid
    // 回傳 { uid, role: 'member'|'coach'|'admin' }
  },
  requireRole(user, role) {
    if (user.role !== role && user.role !== 'admin') 
      throw new Error('Unauthorized');
  }
};
```

### CORS 處理

```javascript
function respond(status, data) {
  return ContentService
    .createTextOutput(JSON.stringify({ status, data }))
    .setMimeType(ContentService.MimeType.JSON);
  // GAS Web App 設為「所有人，包含匿名」才可被前端存取
}
```

---

## 5. 功能模組規格

### 5.1 學員模組 (Member Module)

#### F-M01：新加入綁定流程

**觸發**：學員加入 LINE 官方帳號

**流程**：
```
加入LINE帳號
  → LINE Webhook followEvent 觸發
  → Bot 回覆歡迎訊息 + 綁定連結
  → 連結開啟 LIFF App (bind.html)
  → 學員填入：姓名、電話（可選：email）
  → POST /api action=member.bind（含 LINE UID）
  → GAS 寫入 Members Sheet
  → Bot 回覆「綁定成功」+ 個人資訊卡片
```

**LIFF 頁面**：`/liff/bind.html`

#### F-M02：個人資訊卡片

**觸發**：學員輸入 `我的課程` 或點選 Rich Menu「我的課程」

**顯示內容**：
```
┌─────────────────────────────┐
│ 👤 王小明 的課程資訊          │
├─────────────────────────────┤
│ 📅 班級：初階A班（週三晚間）  │
│ 🗓 本期：2025/3/5 ~ 5/28   │
│ ✅ 已上：6 堂               │
│ ❌ 請假：1 堂               │
│ 🔄 補課：0 堂 / 可補 1 堂   │
│ 📊 剩餘：5 堂               │
├─────────────────────────────┤
│ [查看課表] [申請請假] [補課]  │
└─────────────────────────────┘
```

**實作**：LINE Flex Message（JSON 格式，GAS 動態組裝）

#### F-M03：請假功能

**規則**：
- 需在上課前 N 小時前申請（Config: `LEAVE_ADVANCE_HOURS`）
- 每期最多請假 M 堂（Config: `MAX_LEAVE_PER_PERIOD`）
- 請假後資格保留，可申請補課

**流程**：
```
學員點選「申請請假」
  → 開啟 LIFF /liff/leave.html
  → 顯示學員未來 4 週的課程清單（可請假的堂數）
  → 學員點選日期 → 填入原因（可選）→ 送出
  → POST action=leave.request
  → GAS 驗證規則 → 寫入 Leave_Requests
  → 更新 Sessions 的學員名單（標記請假）
  → 回覆確認訊息
```

#### F-M04：補課功能

**規則**：
- 只有「已批准請假」才可申請補課
- 補課可跨班（同等級或以下班級皆可補）
- 補課需查詢目標班級當天剩餘名額
- 可補課截止日：期末前 1 週（Config 可調整）

**流程**：
```
學員點選「申請補課」
  → 開啟 LIFF /liff/makeup.html
  → 顯示可補的請假紀錄
  → 學員選擇要補哪次請假
  → 系統顯示可補課的班級與時段（有空位者）
  → 學員選擇 → 送出
  → POST action=makeup.request
  → GAS 檢查名額 → 寫入 Makeup_Requests + Attendance
  → 通知管理員（LINE Notify 或頁面更新）
  → 回覆確認訊息
```

---

### 5.2 管理模組 (Admin Module)

> 管理介面主要在 **GitHub Pages 網頁**（需 LINE Login 驗證管理員身份），搭配 LINE Bot 處理緊急通知。

#### F-A01：開班功能

**介面**：`/admin/create-class.html`

**表單欄位**：
- 班級名稱、課程類型、程度
- 授課教練（下拉選教練）
- 教室（大/小）、最大人數
- 上課星期、時段（上午/下午/晚間）
- 開始時間、結束時間
- 開班日期、期數週數（預設12）
- 每週堂數（1 或 2）

**送出後觸發 ClassEngine.generate()**：
- 計算所有上課日期（跳過國定假日，或手動標記）
- 自動在 `Sessions` Sheet 建立每堂課紀錄
- 每筆 session 包含：日期、序號、時間、預設狀態 `scheduled`

**預覽**：送出前顯示課程預覽表，含所有上課日期。

#### F-A02：課程調整（停課/換日）

**場景**：
- 教練請假 → 停課 1 堂 或 安排代課
- 颱風停課 → 停課當日所有班級
- 特殊假日 → 調整單一班級

**介面**：`/admin/adjust-session.html`
- 依日期瀏覽所有 sessions
- 勾選要調整的 sessions
- 設定調整類型：`cancel` / `substitute_coach` / `reschedule`
- 填入原因（前台公告用）

**公告連動**：
- 調整後自動產生公告條目（Announcements Sheet）
- 公告顯示在前台課表（FullCalendar 上的課程標記）
- **不使用 LINE PUSH**（避免 200 則免費額度耗盡）
- 公告顯示在學員下次開啟 LIFF 時的置頂訊息

**通知替代方案（不用 LINE PUSH）**：
- 前台 LIFF 置頂公告橫幅
- LINE 官方帳號的「群發訊息（Narrowcast）」— 免費但有每月額度
- LINE Notify 個人通知（學員自行訂閱，不佔 Bot 額度）

#### F-A03：共享日曆（管理員視角）

**使用 FullCalendar.js**，後端資料來自 GAS API。

**顯示資訊**（每個課程 event）：
```javascript
{
  title: "初階A班 (6/10人)",
  start: "2025-04-02T19:00",
  end: "2025-04-02T20:00",
  extendedProps: {
    coach: "陳教練",
    room: "大教室",
    enrolled: 10,  // 已報名
    attending: 8,  // 預計出席（扣掉請假）
    leaves: 2,     // 請假人數
    makeups: 1,    // 補課人數
    members: ["王小明", "李大華", ...],  // 出席名單
    leaveMember: ["張三"],               // 請假名單
    makeupMembers: ["補課王"]            // 補課名單
  }
}
```

**視圖**：月視圖 / 週視圖 / 教練視圖（按教練篩選）

---

### 5.3 教練模組 (Coach Module)

#### F-C01：教練日曆

**介面**：`/coach/calendar.html`（LINE Login 驗證）

- FullCalendar 僅顯示該教練的課程
- 點擊任何課程 → 顯示詳細資訊彈窗

**彈窗內容**：
```
課程：初階A班 第7堂
日期：2025/4/2（三）19:00-20:00
教室：大教室

預計出席：8人
─────────────────────
✅ 出席 (8)：
  王小明、李大華、陳小花...

🚫 請假 (2)：
  張三、林四

🔄 補課 (1)：
  補課王（從初階B班補入）
─────────────────────
[ 開始上課（確認名單）]
```

#### F-C02：當班課程實況確認

**場景 1：與日曆一致**
```
教練到達 → 開啟日曆 → 點「開始上課」
  → 系統顯示今日出席名單 QR Code 掃碼頁
  → 學員出示 QR Code → 教練掃碼
  → 系統標記出席（type=regular/makeup）
  → 所有人簽到後點「結束上課」
  → 自動寫入 Attendance，session status → completed
```

**場景 2：與日曆不一致**（現場有人未預期）
- 有未登記學員到場（試上、教練帶來）→ 教練點「新增臨時出席」→ 填入姓名記錄
- 有學員未事先請假直接未到 → 教練點「標記缺席」
- 有學員現場才說要請假 → 教練代為申請（若時間規則允許）

**場景 3：其他操作**
- 標記「代課」（非本班學員補課確認）
- 回報設備問題 / 場地問題（送通知給管理員）

---

### 5.4 LINE Bot 模組

#### Rich Menu 設計

| 按鈕 | 動作 | 對象 |
|------|------|------|
| 📅 我的課程 | 開啟 LIFF 個人資訊頁 | 所有學員 |
| 📝 請假申請 | 開啟 LIFF 請假頁 | 已綁定學員 |
| 🔄 申請補課 | 開啟 LIFF 補課頁 | 已綁定學員 |
| 📣 最新公告 | 開啟 LIFF 公告頁 | 所有人 |
| 📞 聯絡我們 | 傳送健身房電話/地址 | 所有人 |

#### Webhook Event 處理

| Event | 處理邏輯 |
|-------|----------|
| `follow` | 歡迎訊息 + 綁定引導 |
| `unfollow` | 標記 member.status = inactive |
| `message` (文字) | 關鍵字比對（課程查詢/請假/補課/公告）|
| `postback` | 處理 LIFF 回傳動作 |

#### 通知設計（節省 Push 額度）

**LINE Notify**（學員自願訂閱，不佔 Bot 額度）：
- 學員自行點選「訂閱課程提醒」
- 透過 LINE Notify OAuth 取得個人 token
- GAS 定時每日 8AM 推播隔日課程提醒（每個 token 獨立，不佔帳號額度）

**LINE Flex Message 被動回應**：
- 學員主動詢問時，Bot 回覆內含完整資訊的 Flex Message
- 不主動 Push，改為在 LIFF 登入時顯示置頂公告

---

## 6. 開班與課程週期引擎

### ClassEngine 設計（GAS）

```javascript
// ClassEngine.gs
const ClassEngine = {
  
  /**
   * 依據 Classes 設定，批次產生 Sessions
   * @param {string} classId
   */
  generate(classId) {
    const cls = this.getClass(classId);
    const sessions = [];
    let currentDate = new Date(cls.period_start);
    let seq = 1;
    
    // 移動到第一個符合 day_of_week 的日期
    while (currentDate.getDay() !== cls.day_of_week) {
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    const totalSessions = cls.period_weeks * cls.sessions_per_week;
    
    while (seq <= totalSessions) {
      sessions.push({
        session_id: `SES-${classId}-${String(seq).padStart(2,'0')}`,
        class_id: classId,
        session_date: Utilities.formatDate(currentDate, 'Asia/Taipei', 'yyyy-MM-dd'),
        session_seq: seq,
        start_time: cls.start_time,
        end_time: cls.end_time,
        status: 'scheduled',
      });
      
      // 一週一堂：直接加7天；一週兩堂：交錯加3/4天
      if (cls.sessions_per_week === 1) {
        currentDate.setDate(currentDate.getDate() + 7);
      } else {
        // 週二/週五等雙週模式，需在 Config 設定第二天
        currentDate = this.nextClassDate(currentDate, cls);
      }
      seq++;
    }
    
    // 批次寫入 Sessions Sheet
    this.bulkInsert('Sessions', sessions);
    return { generated: sessions.length };
  },
  
  /**
   * 暫停/取消特定 sessions（颱風、教練請假等）
   */
  suspendSessions(sessionIds, reason, substituteCoachUid = null) {
    const sheet = getSheet('Sessions');
    sessionIds.forEach(id => {
      const row = findRow(sheet, 'session_id', id);
      if (substituteCoachUid) {
        row.status = 'scheduled'; // 維持上課但換代課
        row.substitute_coach_uid = substituteCoachUid;
      } else {
        row.status = 'cancelled';
        row.cancel_reason = reason;
      }
    });
    // 同步建立公告
    AnnouncementService.createFromSuspension(sessionIds, reason);
  }
};
```

### 補課可用名額計算

```javascript
// MakeupService.gs
getAvailable(memberId, leaveId) {
  const leave = getLeave(leaveId);
  const member = getMember(memberId);
  const enrolledClasses = getEnrollments(memberId);
  
  // 找出同等級或以下的所有 active sessions
  // 且日期在補課截止日之前
  // 且當前出席人數 < max_capacity（補課不佔正式名額，但總人數不超上限）
  
  return futureSessions.filter(session => {
    const cls = getClass(session.class_id);
    const currentCount = getAttendanceCount(session.session_id);
    return cls.level <= member.level 
      && currentCount < cls.max_capacity
      && session.session_date <= deadline;
  });
}
```

---

## 7. 共享日曆規格

### 技術實作

**前端**：FullCalendar.js + 自訂 Event Render

**資料來源**：
1. `doGet?action=schedule.admin` → 回傳所有 sessions（教練/管理員用）
2. `doGet?action=schedule.coach&uid={coachUID}` → 回傳該教練 sessions

**Event 顯示規則**：
- 正常課程：班級色彩（每班一色，Config 設定）
- 請假標記：event 標題加入 `(請假N人)` 
- 補課標記：event 標題加入 `+補課N人`
- 取消課程：灰色 + 刪除線
- 代課：教練名稱變更 + 小圖示

**FullCalendar 自訂 Event 渲染**：
```javascript
eventContent: function(arg) {
  const { enrolled, leaves, makeups, status } = arg.event.extendedProps;
  return {
    html: `
      <div class="fc-event-custom ${status === 'cancelled' ? 'cancelled' : ''}">
        <b>${arg.event.title}</b>
        <span class="counts">
          ✅${enrolled - leaves} 
          ${leaves > 0 ? `❌${leaves}` : ''}
          ${makeups > 0 ? `🔄+${makeups}` : ''}
        </span>
      </div>
    `
  };
}
```

---

## 8. 通知系統設計（無 LINE PUSH 限制）

### 核心原則
> **不依賴 LINE Messaging API 的 Push Message**（免費每月 200 則極不夠用）

### 通知管道矩陣

| 場景 | 通知管道 | 成本 |
|------|----------|------|
| 停課公告 | LIFF 置頂橫幅 + Announcements Sheet | 免費 |
| 課程異動 | LIFF 置頂橫幅 + 公告頁面 | 免費 |
| 課前提醒 | LINE Notify（學員自訂訂閱） | 免費 |
| 請假確認 | Webhook Reply（被動觸發） | 免費 |
| 補課確認 | Webhook Reply（被動觸發） | 免費 |
| 教練緊急通知 | 管理員發 Flex Reply（被動）| 免費 |
| 學費到期 | Gmail API | 免費 500/日 |

### LINE Notify 整合

```javascript
// NotifyService.gs
// 學員訂閱後儲存 token 在 Members Sheet (notify_token 欄)
sendNotify(memberIds, message) {
  memberIds.forEach(id => {
    const token = getMemberNotifyToken(id);
    if (!token) return;
    UrlFetchApp.fetch('https://notify-api.line.me/api/notify', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      payload: { message }
    });
  });
}
```

### GAS Trigger 排程

| Trigger | 排程 | 動作 |
|---------|------|------|
| `dailyReminder` | 每日 8:00 AM | 透過 LINE Notify 發隔日提醒 |
| `weeklyReport` | 每週一 9:00 AM | 教練週課表更新通知 |
| `expireCheck` | 每日 10:00 AM | 檢查期末最後3堂，提醒學員 |

---

## 9. clasp 本地開發規範

### 專案結構

```
gym-os/
├── .clasp.json              ← clasp 設定（scriptId）
├── .claspignore             ← 排除 node_modules 等
├── appsscript.json          ← GAS manifest（時區/依賴）
├── src/
│   ├── gas/                 ← GAS 原始碼（.gs → .js）
│   │   ├── Main.js          ← doGet / doPost 入口
│   │   ├── auth/
│   │   │   └── AuthService.js
│   │   ├── modules/
│   │   │   ├── MemberService.js
│   │   │   ├── ClassEngine.js
│   │   │   ├── LeaveService.js
│   │   │   ├── MakeupService.js
│   │   │   ├── CoachService.js
│   │   │   ├── AdminService.js
│   │   │   ├── ScheduleService.js
│   │   │   └── NotifyService.js
│   │   ├── handlers/
│   │   │   └── LineHandler.js
│   │   └── utils/
│   │       ├── SheetHelper.js
│   │       ├── DateHelper.js
│   │       └── Config.js
│   └── web/                 ← GitHub Pages 前端
│       ├── index.html       ← 公開首頁 / 課表
│       ├── liff/
│       │   ├── bind.html    ← 綁定頁面
│       │   ├── leave.html   ← 請假頁面
│       │   ├── makeup.html  ← 補課頁面
│       │   └── profile.html ← 個人資訊
│       ├── admin/
│       │   ├── index.html   ← 管理後台
│       │   ├── create-class.html
│       │   └── calendar.html
│       └── coach/
│           └── calendar.html
├── package.json
└── README.md
```

### 開發環境設定

```bash
# 安裝 clasp
npm install -g @google/clasp

# 登入
clasp login

# 綁定現有 GAS 專案
clasp clone <scriptId>

# 推送程式碼
clasp push

# 即時觀看 log
clasp logs --watch

# 部署新版本 API
clasp deploy --description "v1.2.0 - 新增補課功能"
```

### `appsscript.json`

```json
{
  "timeZone": "Asia/Taipei",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  },
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.send"
  ]
}
```

---

## 10. 模組化商業產品架構

### 模組定義與定價建議

| 模組 ID | 模組名稱 | 功能包含 | 建議售價 |
|---------|----------|----------|----------|
| `M-CORE` | 核心模組 | 學員綁定、個人資訊卡片、公告 | 必選 |
| `M-SCHEDULE` | 課程排程 | 開班引擎、Session 產生、共享日曆 | NT$3,000/月 |
| `M-LEAVE` | 請假補課 | 請假申請、補課媒合、規則引擎 | NT$2,000/月 |
| `M-ATTENDANCE` | 出勤管理 | QR 簽到、教練確認、出勤報表 | NT$1,500/月 |
| `M-NOTIFY` | 通知系統 | LINE Notify 整合、Gmail 帳單 | NT$1,000/月 |
| `M-FINANCE` | 財務管理 | 學費計算、教練鐘點、PDF 收據 | NT$2,500/月 |
| `M-REPORT` | 報表分析 | Chart.js 儀表板、月報、趨勢 | NT$2,000/月 |

### 功能開關機制

```javascript
// Config.gs — 模組開關
const MODULES = {
  SCHEDULE:   getConfig('MODULE_SCHEDULE')   === 'true',
  LEAVE:      getConfig('MODULE_LEAVE')      === 'true',
  ATTENDANCE: getConfig('MODULE_ATTENDANCE') === 'true',
  NOTIFY:     getConfig('MODULE_NOTIFY')     === 'true',
  FINANCE:    getConfig('MODULE_FINANCE')    === 'true',
};

// 在 API 路由層做門控
'leave.request': () => {
  if (!MODULES.LEAVE) return { error: 'Module not enabled' };
  return LeaveService.request(data, user);
},
```

### 多租戶設計

每個健身房客戶：
1. 一份 Google Spreadsheet（資料隔離）
2. 一個 GAS Web App 部署（獨立 URL）
3. 一個 LINE 官方帳號（客戶自備）
4. 一份 GitHub Pages 部署（Fork 後自訂）

**設定腳本**：提供 `setup.gs` 一鍵初始化所有 Sheets 結構，大幅降低部署成本。

---

## 11. 未來擴充路線圖

### Phase 2（3-6 個月後）
- [ ] `M-PAYMENT`：串接 LINE Pay / 綠界，學費線上繳交
- [ ] `M-REGISTER`：線上報名系統（含候補機制）
- [ ] `M-PERSONAL`：個人教練課管理（一對一/一對二）

### Phase 3（6-12 個月後）
- [ ] 遷移資料庫至 Firebase Firestore（保留免費方案）
- [ ] PWA 支援（離線簽到、推播通知）
- [ ] 多分館管理（一帳號管多個場地）
- [ ] API Webhook 開放第三方整合（健身追蹤 App）

### Phase 4（商業化）
- [ ] SaaS 後台（管理所有租戶的 Super Admin）
- [ ] 白牌方案（客戶自訂 Logo / 色彩）
- [ ] 數據分析儀表板（跨租戶匿名統計）

---

## 12. 非功能性需求

| 項目 | 要求 |
|------|------|
| **效能** | GAS API 回應 < 3 秒（Sheets 讀寫）|
| **可用性** | 依賴 Google 基礎設施，SLA ≈ 99.9% |
| **安全性** | LINE Token 驗證 + 角色權限控管，敏感資料不暴露在前端 |
| **備份** | Google Sheets 原生版本歷史，建議每週手動匯出 |
| **監控** | GAS Stackdriver Logging，錯誤時 Gmail 警報 |
| **擴充性** | 模組開關 + 多租戶設計，新功能不影響現有客戶 |
| **維護性** | clasp + Git 版控，PR review 流程，版本號管理 |
| **文件** | 每個 GAS module 的 JSDoc 註解，README 含完整設定步驟 |

---

*GymOS PRD v1.0 — 最後更新：2025*
*本文件適用於：健身房、瑜珈教室、舞蹈教室、武術館等小型場館*
