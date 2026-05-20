# GymOS — 模組化健身房管理系統
## 產品需求文件 (PRD) v3.0

> **定位**：零成本基礎設施、低維護負擔、模組化架構，可作為 SaaS 商業產品。
> **目標讀者**：開發者自己（備忘與規格對照）、AI 開發模擬團隊。

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
8. [系統告警與對帳設計（無 LINE PUSH 限制）](#8-系統告警與對帳設計無-line-push-限制)
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
│  doPost(e) → 需驗證操作 API (請假、開班、簽到)                    │
│                                                                   │
│  Modules:  ClassEngine | MemberService | AlertService            │
│            CoachService | AdminService | LineHandler              │
└───────────────────┬───────────────────────┬─────────────────────┘
                    │ SpreadsheetApp         │ UrlFetchApp
┌───────────────────▼──────┐  ┌─────────────▼─────────────────────┐
│    Google Sheets DB       │  │   External Services               │
│  • Members                │  │  • LINE Messaging API             │
│  • Classes                │  │  • LINE Login (LIFF)              │
│  • Sessions               │  │  • Gmail API                      │
│  • Enrollments            │  │  • Google Calendar API            │
│  • Attendance             │  │  • FullCalendar.js (前端)          │
│  • Leave_Requests         │  │  • Cloudinary (媒體, 免費)         │
│  • Makeup_Requests        │  └───────────────────────────────────┘
│  • Announcements          │
│  • Config                 │
│  • Staff (管理與教練)      │
│  • Rooms (教室)           │
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
- `MAX_LEAVE_PER_PERIOD` — 每期最多請假堂數（預設 3）
- `MAX_MAKEUP_PER_PERIOD` — 每期最多補課堂數（預設 3）
- `MAKEUP_ADVANCE_DAYS` — 補課需提前幾天申請（預設 1）
- `LEAVE_ADVANCE_HOURS` — 請假需提前幾小時（預設 24）
*註：管理員與教練名單改由獨立的 `Staff` 資料表進行權限與角色管理，免去在 Config 進行硬編碼。*

---

### Sheet 2: `Members` — 學員資料

| 欄位 | 類型 | 說明 |
|------|------|------|
| member_id | String (UUID) | 主鍵，系統產生 |
| line_uid | String | LINE User ID，綁定後填入 |
| display_name | String | LINE 顯示名稱 |
| real_name | String | 真實姓名 |
| birthday | String/Date | 生日（學員綁定時填寫） |
| level | Enum | 學員程度 (L1~L10) - 由教練於後台手動填入 |
| join_date | Date | 加入日期 |
| status | Enum | active / inactive / suspended |
| notes | String | 備註（健康狀況等） |
| created_at | Timestamp | |
| updated_at | Timestamp | |

---

### Sheet 3: `Classes` — 課程班級定義

| 欄位 | 類型 | 說明 |
|------|------|------|
| class_id | String | 主鍵 (e.g., `A-MON-1000`) |
| class_name | String | 班級名稱，命名規範：`{課程類型} {上課星期}{時段}{班別}` (e.g., `基礎重訓 週一上午班`、`混合重訓 週一三晚A班`) |
| class_type | Enum | `A` (基礎重訓 週1次 12週) / `B` (混合重訓 週2次 按月計費) / `C` (特殊專班 週1次 12週) |
| level | Enum | `Lv.2` / `Lv.4` / `Lv.6` / `Lv.8` / `不固定` |
| coach_line_uid | String | 授課教練 LINE UID (FK → Staff.line_uid) |
| room_id | String | 教室 ID (FK → Rooms.room_id)。A類使用 RM-02 (小教室)，B/C類使用 RM-01 (大教室) |
| max_capacity | Integer | 班級人數上限。A類上限 8 人，B/C類上限 15 人 |
| enrolled | Integer | 目前已報名人數（系統自動維護） |
| gender_limit | Enum | `null` (不限) / `female` (僅限女性) |
| allow_makeup | Boolean | 是否允許跨班補課 |
| day_of_week | String | 上課星期，支援複合格式。單天：`週一`；複合：`週一 + 週三` |
| time_slot | String | 時段描述 (e.g., `上午`、`晚間`) |
| start_time | Time | 開始時間 (e.g., `10:00`) |
| end_time | Time | 結束時間 (e.g., `11:00`) |
| period_start | Date | 本期開課日期 |
| period_type | Enum | **計費週期類型**：`weekly` (固定週數制，A/C類) / `monthly` (動態月份制，B類) |
| period_weeks | Integer | 期數週數（A/C類為 12，B類填 0 由系統動態計算） |
| sessions_per_week | Integer | 每週堂數（A/C類：1，B類：2） |
| total_sessions | Integer | 總堂數。A/C類固定 12；B類由 `ClassEngine.generate()` 動態計算後回寫，各月份不同（例如 2026/05 週一+週三共出現 9 次，`total_sessions` 即為 9） |
| status | Enum | `open` (開放報名) / `pending` (尚未開課) / `closed` (已結束) |
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

### Sheet 10: `Staff` — 員工與管理人員資料

| 欄位 | 類型 | 說明 |
|------|------|------|
| staff_id | String (UUID) | 主鍵，系統產生 |
| line_uid | String | LINE User ID (綁定時填入，權限驗證核心) |
| real_name | String | 真實姓名 |
| role | Enum | 權限角色：`admin` (管理員) / `coach` (教練) |
| status | Enum | `active` (正常在職) / `inactive` (離職) |
| hourly_rate | Number | 課程基本鐘點費 (僅教練角色適用，保留供財務計算使用) |
| notes | String | 備註 |
| created_at | Timestamp | 建立時間 |
| updated_at | Timestamp | 更新時間 |

---

### Sheet 11: `Rooms` — 教室設定

| 欄位 | 類型 | 說明 |
|------|------|------|
| room_id | String (UUID) | 主鍵，系統產生 (e.g., `RM-01`) |
| room_name | String | 教室名稱 (e.g., `大教室`, `小教室`) |
| max_capacity | Integer | 該教室標準人數上限 (大教室預設 15 人、小教室預設 8 人) |
| status | Enum | `active` (正常使用) / `closed` (維護中) |
| notes | String | 備註 |

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
  → 透過 LIFF 自動取得 LINE 登入授權與 UID (無須輸入額外驗證碼)
  → 學員首次填寫：姓名、生日
  → POST /api action=member.bind
  → GAS 寫入 Members Sheet (初始程度由教練後續於後台手動填入)
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
- 下課前均可請假。
- 請假無上限，請假課程均可補課。
- 補課時限在該期最後一堂課前。
- **學費折抵規則 (次期學費)**：
  - 全勤者：下期 95 折。
  - 該期未上完課程可折抵下期學費：缺課 1~2 堂，下期全額折抵；缺課第 3 堂起，以原價 75 折計算折抵。

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
- 請假後方可補課，補課時限為該期最後一堂課之前。
- 補課可跨班，但必須參加「同程度」的課程補課。
- 補課登記後不可再更改、不可取消。
- 補課若缺課，不得再補。

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
  → 回覆確認訊息
```

---

### 5.2 管理模組 (Admin Module)

> 管理介面主要在 **GitHub Pages 網頁**（需 LINE Login 驗證管理員身份），搭配 LINE Bot 處理緊急通知。

#### F-A01：開班功能

**介面**：`/admin/create-class.html`（或直接操作試算表 Classes 工作表）

**課程班級類型規格（C3 Fitness 現行三類）**：

| 類型 | 說明 | 每週堂數 | 計費週期 | `period_type` | 教室 | 上限 | 允許補課 |
|------|------|---------|---------|--------------|------|------|---------|
| **A 類** | 基礎重訓 | 1 次 | 12 週固定 (共 12 堂) | `weekly` | RM-02 小教室 | 8 人 | ✅ |
| **B 類** | 混合重訓 | 2 次 | 1 個月動態 (依月份計算) | `monthly` | RM-01 大教室 | 15 人 | ✅ |
| **C 類** | 特殊專班 | 1 次 | 12 週固定 (共 12 堂) | `weekly` | RM-01 大教室 | 15 人 | ❌ |

> **B 類動態堂數說明**：B 類採用 `period_type = 'monthly'` 機制。系統在 `ClassEngine.generate()` 時，會自動計算 `period_start` 所在月份內，設定星期幾（如週一+週三）實際出現的天數作為 `total_sessions`，並將結果回寫至 Classes 工作表。大月 (31天) 與小月 (28~30天) 可能分別為 9 或 8 堂，完全按月曆動態計算，不再寫死。

**班級命名規範**：`{課程類型} {上課星期}{時段}{班別}`
- A 類範例：`基礎重訓 週一上午班`、`基礎重訓 週三晚女專班`
- B 類範例：`混合重訓 週一三晚A班`、`混合重訓 週二四晚C班`
- C 類範例：`特殊專班 週四上午班`

**`ClassEngine.generate()` 執行流程**：
1.  **計算總堂數**：
    - A/C類（`weekly`）：`total_sessions = period_weeks × sessions_per_week`
    - B類（`monthly`）：動態遍歷 `period_start` 所在月份，累計 `day_of_week` 星期幾出現天數，並回寫 `Classes.total_sessions`
2.  **批次展開每堂課**：從開課日起，找出所有符合 `day_of_week` 的日期，跳過 `HOLIDAYS` 設定的國定假日，寫入 `Sessions` Sheet。
3.  **批次建立 Google Calendar 事件**：批次呼叫 Calendar API，建立對應的日曆事件（含班級名稱、教練、教室、學員名單於描述欄）。
4.  **回寫 Calendar Event ID**：將 Google Calendar 事件 ID 批次回寫至 `Sessions.calendar_event_id`，確保後續異動可同步。

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

#### 核心運作原則
*   **共享日曆為核心**：教練直接用手機觀看 Google Calendar。日曆事件的描述欄會自動同步並更新「預計出席名單」、「已請假名單」與「補課名單」。
*   **無事不登三寶殿**：日常上課只要現場人數與日曆吻合，教練和學員**什麼都不用按**，系統預設自動視為全體正常出席，免去日常點名打卡之負擔。
*   **現場不符才校正**：只有當上課實況與日曆不符時（例如：有人無預警曠課、或現場多出了未登記的試上學員），教練才需要開啟手機的教練網頁進行**「現場校正與回報」**。
*   **即時同步資料庫**：教練校正送出後，GAS API 會直接修改並更新 `Attendance` 與 `Sessions` 的狀態。

---

#### F-C01：教練日曆

**介面**：`/coach/calendar.html`（LINE Login 驗證）

- FullCalendar 僅顯示該教練的課程。
- 點擊任何課程 → 顯示詳細資訊彈窗。

**彈窗內容**：
```
課程：初階A班 第7堂
日期：2025/4/2（三）19:00-20:00
教室：大教室

預計出席：8人
─────────────────────
✅ 預計出席 (8)：
  王小明、李大華、陳小花...

🚫 請假已批准 (2)：
  張三、林四

🔄 補課學員 (1)：
  補課王（從初階B班補入）
─────────────────────
[ 點此進行現場名單校正/異常回報 ]
```

#### F-C02：現場出席名單校正與回報

**場景 1：現場人數與日曆完全一致**
- 教練和學員**完全不需要進行任何點名或打卡動作**。
- 系統自動視為「全體預期學員均正常出席」，預設自動標記為 `regular` 狀態。

**場景 2：現場與日曆名單不吻合（教練手動校正）**
教練於日曆彈窗點選「進行校正」開啟 `/coach/report.html`：
- **學員無預警缺席（未提前請假）**：教練於出席名單中將該學員勾選為「曠課/缺席」，送出後系統將 `Attendance.type` 標記為 `absent`。
- **補課學員臨時缺席**：補課名單中該學員標記為「未到」，送出後自動觸發「補課缺課不得再補」之懲罰，該補課紀錄失效。
- **有未登記學員到場（試上、臨時帶入）**：教練點選「新增臨時出席」 → 填入學員姓名與類型 → 系統寫入 `Attendance` 備註欄。

**場景 3：其他校正與回報**
- 現場設備或場地故障回報：教練填寫異常原因送出，系統自動發送告警通知給管理人員。

---

### 5.4 LINE Bot 模組



#### Finalized Rich Menu 設計 (方案 B 結案規格 🌟)

本專案正式採用 **「方案 B 矮版三格等寬選單」**，尺寸規格為 `2500 x 843` 像素，並徹底捨棄冗長小字，獲得極致奢華留白質感。

*   **自動化註冊與同步機制**：管理員只需在試算表 `Config` 黏貼 Google Drive 的選單圖共用連結（欄位名：`IMG_MENU_MEMBER`），並在控制台點選「🖼️ 一鍵同步 LINE 圖文選單」，系統後台將**自動呼叫 LINE API 完成選單註冊與熱區對齊**，完全免除人工於 LINE 後台拖拉與設定。

| 按鈕熱區 | 功能名稱 | 點擊動作 (LINE Action) | 預期跳轉 URL 路由 |
| :--- | :--- | :--- | :--- |
| **左格 A (x:0, y:0, w:833, h:843)** | **📅 我的課表** | 開啟網址 (Link) | `https://liff.line.me/${liffId}` <br>*(未綁定者智慧自動重導向至4步驟開戶)* |
| **中格 B (x:833, y:0, w:834, h:843)** | **✍️ 我要請假** | 開啟網址 (Link) | `https://liff.line.me/${liffId}?mode=leave` |
| **右格 C (x:1667, y:0, w:833, h:843)** | **⚡ 我要補課** | 開啟網址 (Link) | `https://liff.line.me/${liffId}?mode=makeup` |

---

#### 📱 移動端 CSS 卡片化重構 (Table-to-Card Conversion)
為解決手機端擁擠表格被迫左右滾動的致命 Bug，系統全面採用「零改動 HTML，純 CSS 媒體查詢重塑」技術：
*   **斷點**：於螢幕寬度小於 `768px` 時自動觸發。
*   **卡片化結構**：將 `table`, `thead`, `tbody`, `tr`, `td` 強制變更為 `display: block` 佈局。
*   **視覺美學**：隱藏傳統的表格標頭 (`<thead>`)，將每一列 (`<tr>`) 重塑為獨立的磨砂玻璃圓角卡片 (`rgba(30, 41, 59, 0.4)`)，且操作按鈕組 (`<td>`) 自動加入虛線分界線並右對齊，實現絕美流暢的滾動流。

---

#### 📅 FullCalendar 暗黑高對比 Day/Week 視圖與 24 小時制時間軸
FullCalendar 整合優化包括：
*   **24小時制時間軸**：時間軸與活動時間統一強制設定為 `hour12: false`，避免預設中文語系 `上午8時 / 下午12時` 等雜亂字眼，簡化為 `08:00 / 12:00` 的簡潔 24 小時制標籤。
*   **高對比深色 Header**：覆蓋 FullCalendar 預設淺色標頭，將星期一等 Column-Header 設定為深灰色 `#1e293b` 搭配亮白文字，在手機與電腦端均獲得 100% 完美閱讀性。

#### Webhook Event 處理

| Event | 處理邏輯 |
|-------|----------|
| `follow` | 歡迎訊息 + 綁定引導 |
| `unfollow` | 標記 member.status = inactive |
| `message` (文字) | 關鍵字比對（課程查詢/請假/補課/公告）|
| `postback` | 處理 LIFF 回傳動作 |

#### 通知設計（節省 Push 額度）

**LINE Flex Message 被動回應**：
- 學員主動詢問時，Bot 回覆內含完整資訊的 Flex Message
- 不主動 Push，改為在 LIFF 登入時顯示置頂公告

---

## 6. 開班與課程週期引擎

### ClassEngine 設計（GAS TypeScript）

`ClassEngine.ts` 實作了完整的課程排程引擎，核心方法包含 `generate()`（首期開班）、`renew()`（續期開班）與 `syncCalendarEvent()`（日曆同步）。

#### `generate(classId)` — 首期開班排程

```typescript
// 核心邏輯（TypeScript 版本，位於 src/gas/modules/ClassEngine.ts）
public static generate(classId: string): { generated: number } {
  const cls = SheetHelper.getRow<any>('Classes', 'class_id', classId);
  const daysOfWeek = parseDaysOfWeek(cls.day_of_week); // 支援 '週一 + 週三' 複合格式
  const periodType = cls.period_type || 'weekly';

  let totalSessions: number;
  if (periodType === 'monthly') {
    // B 類：動態計算 period_start 所在月份內 daysOfWeek 出現的實際天數
    const year = startDate.getFullYear();
    const month = startDate.getMonth();
    totalSessions = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      if (daysOfWeek.includes(new Date(year, month, d).getDay())) totalSessions++;
    }
    // 計算完成後回寫 Classes.total_sessions，供 activateEnrollment 讀取
    SheetHelper.updateRow('Classes', 'class_id', classId, { total_sessions: totalSessions });
  } else {
    // A/C 類：固定 = period_weeks × sessions_per_week
    totalSessions = Number(cls.period_weeks) * Number(cls.sessions_per_week);
  }
  // 從 period_start 起逐日推進，跳過非上課星期及 HOLIDAYS 設定的國定假日
  // 批次建立 Sessions 紀錄並呼叫 Calendar API 建立對應行程
}
```

**關鍵規則**：
- 遇到 `HOLIDAYS`（Config 設定的國定假日）的日期，跳過不計堂數，繼續往後找下一個上課日。
- `calendar.getEvents()` 採批量拉取而非逐筆 `getEventById()`，避免逐筆呼叫 API 造成 GAS 6 分鐘超時。

#### `renew(classId, newStartDate, memberIds, termRemark)` — 續期開班

- 相容 `period_type = 'monthly'`：以 `newStartDate` 所在月份重新動態計算堂數。
- 將被勾選的舊學員自動建立下期 Enrollment，狀態為 `pending_payment`。
- 對應月份堂數計算完成後同步回寫 `Classes.total_sessions`，確保 `activateEnrollment` 收費核點時讀到正確數字。

#### `syncCalendarEvent(sessionId)` — 日曆實時同步

當請假/補課申請狀態變更時觸發，重新計算該堂課的實際出席/請假/補課名單，並以單次 API 呼叫更新 Google 日曆事件的標題和描述，確保教練手機看到的行程永遠是最新狀態。

### 補課可用名額計算

```typescript
// MakeupService.getAvailable()
// 篩選條件：
// 1. 同等程度（level 相符）
// 2. 未來時段（session_date > today）
// 3. 該堂實際人數 < max_capacity（含正式學員 + 補課人員合計）
// 4. 限 allow_makeup = true 的班級
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

## 8. 系統告警與對帳設計（無 LINE PUSH 限制）

### 核心原則
> **不依賴 LINE Messaging API 的 Push Message**（免費每月 200 則極不夠用）

### 通知管道矩陣

| 場景 | 通知管道 | 成本 |
|------|----------|------|
| 停課公告 | LIFF 置頂橫幅 + Announcements Sheet | 免費 |
| 課程異動 | LIFF 置頂橫幅 + 公告頁面 | 免費 |
| 請假確認 | Webhook Reply（被動觸發） | 免費 |
| 補課確認 | Webhook Reply（被動觸發） | 免費 |
| 教練緊急通知 | 管理員發 Flex Reply（被動）| 免費 |
| 學費到期 | Gmail API | 免費 500/日 |

### GAS Trigger 排程

| Trigger | 排程 | 動作 |
|---------|------|------|
| `weeklyReport` | 每週一 9:00 AM | 教練週課表更新通知（記錄或發送 Gmail） |
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
│   │   │   └── AlertService.js
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
| `M-ALERT` | 系統告警 | Gmail 財務報表與系統告警 | NT$1,000/月 |
| `M-FINANCE` | 財務管理 | 學費計算、教練鐘點、PDF 收據 | NT$2,500/月 |
| `M-REPORT` | 報表分析 | Chart.js 儀表板、月報、趨勢 | NT$2,000/月 |

### 功能開關機制

```javascript
// Config.gs — 模組開關
const MODULES = {
  SCHEDULE:   getConfig('MODULE_SCHEDULE')   === 'true',
  LEAVE:      getConfig('MODULE_LEAVE')      === 'true',
  ATTENDANCE: getConfig('MODULE_ATTENDANCE') === 'true',
  ALERT:      getConfig('MODULE_ALERT')      === 'true',
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

## 13. AI 開發團隊與分工

為了高效開發，我們設定以下 AI 協作角色，確保各司其職：
1. **👨‍💻 架構師 (Architect)**：負責整體系統設計、資料庫結構優化、API 路由規劃。
2. **🎨 前端工程師 (Frontend Dev)**：負責 GitHub Pages、LIFF 頁面開發 (Alpine.js + Tailwind CSS)。
3. **⚙️ 後端工程師 (Backend Dev)**：負責 GAS TypeScript 開發、LINE Reply API 串接、Google Calendar 同步。
4. **🕵️ 測試與維運 (QA/Ops)**：負責撰寫測試案例、部署腳本 (GitHub Actions)、錯誤日誌追蹤。

---

## 14. CI/CD 與自動化 Wiki 更新

我們採用 GitHub Actions 來取代較為複雜的 MCP，達成程式碼更新與文件同步的自動化。

**工作流流程 (`.github/workflows/update-wiki.yml`)**：
1. **觸發條件**：當 `main` 分支有程式碼推送 (Push) 時。
2. **執行動作**：
   - 自動將 `src/web/` 的最新代碼部署到 GitHub Pages。
   - 透過腳本讀取程式碼中的 JSDoc 或 Markdown 文件更新，並自動 `git push` 到專案的 `.wiki.git` 儲存庫，實現 Wiki 的自動更新。

---

## 15. 專屬開發 Skills 清單

為了解決這個專案的特殊性，建立以下 AI 協作 Prompt Skills：
*   **Skill: GAS-TS-Generator**：產生程式碼時，必須符合 `module: "none"` 的 GAS TypeScript 規範，且不使用 `import/export`，變數與介面宣告於全域 `types.ts`。
*   **Skill: LIFF-UI-Builder**：產出前端頁面時，強制使用 Tailwind CSS (暗色主題) + Alpine.js，並且確保支援 LINE LIFF SDK 的初始化。
*   **Skill: Sheet-DB-Operator**：操作資料庫邏輯時，必須確保資料讀寫的效能 (批次 getValues/setValues)，並考慮併發鎖 (LockService)。

---

*GymOS PRD v3.0 — 最後更新：2026*
*本文件適用於：健身房、瑜珈教室、舞蹈教室、武術館等小型場館*
