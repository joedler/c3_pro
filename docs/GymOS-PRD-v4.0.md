# GymOS — 模組化健身房管理系統
## 產品需求文件 (PRD) v4.0 — 商業化 SaaS 獨立代管架構

> **定位**：商業級 SaaS 健身房管理系統。採用「代碼完全鎖定安全保護、客戶自持私有資料庫、跨帳號編輯授權」之頂級商業架構。
> **主要升級 (v4.0)**：正式確立 **「Decoupled Owner-Data & Operator-Code」** 商業解耦架構，完美兼顧「開發者智慧財產權保護」與「客戶數據隱私法律合規」。

---

## 1. 產品願景與定位

GymOS 是一套專為中小型健身房、瑜珈教室與個人工作室量身打造的極輕量化 SaaS 管理平台。

### 商業運營核心痛點與 v4.0 解決方案

| 痛點 | 傳統做法的缺點 | GymOS v4.0 的解耦代管方案 |
| :--- | :--- | :--- |
| **智慧財產權防盜** | 程式碼直接部署在客戶帳號下，客戶可隨時無成本複製代碼、轉賣或停用。 | **Operator-Code**：GAS 程式碼完全存放在「開發者帳號」，僅將 API 連線給前端，客戶無法接觸或複製任何一行 TypeScript 程式碼。 |
| **個資與隱私合規** | 數據存放在開發者資料庫，若發生外洩，開發者面臨龐大法律訴訟與罰款。 | **Owner-Data**：試算表資料庫存在「客戶帳號」下，客戶擁有 100% 數據所有權，符合個資法規範，客戶也對數據資產感到安心。 |
| **系統主控權與收費控管** | 客戶一旦取得完整程式碼，可隨時終止服務並自行運行，開發者失去收費槓桿。 | **Web App Control**：開發者可隨時關閉 Web App 部署或在代碼端拒絕特定 `SPREADSHEET_ID` 的 API 路由，掌握絕對的主控收費權。 |

---

## 2. 商業代管架構總覽 (Decoupled SaaS Architecture)

GymOS v4.0 採用「非對稱跨帳號授權機制」，完美將執行引擎與實體數據進行物理隔離：

```
     【開發者 / 運營商 Google 帳號】             【客戶健身房 Google 帳號】
┌──────────────────────────────────────┐     ┌──────────────────────────────────────┐
│        OPERATOR-CODE (執行引擎)       │     │        OWNER-DATA (私有數據)         │
│                                      │     │                                      │
│  [GAS Web App 統一核心]              │     │  [Google Sheets 資料庫] (全繁體中文)  │
│  • 封裝所有核心業務邏輯              │     │  • 11張中文分頁                      │
│  • 智慧型適應ORM (SheetHelper.ts)    │     │  • 共享編輯者權限 ───► 給開發者帳號   │
│  • 定義 API 端點並拒絕未授權請求     │     │                                      │
│                                      │     │  [Google 日曆]                        │
│  [Script Properties 設定]            │     │  • 健身房專屬日曆                     │
│  • SPREADSHEET_ID ──► 綁定客戶表格    │     │  • 共享最高管理權限 ─► 給開發者帳號   │
└──────────────────┬───────────────────┘     └──────────────────────────────────────┘
                   │                                             ▲
                   │ SpreadsheetApp.openById()                   │ CalendarApp.getCalendarById()
                   └─────────────────────────────────────────────┘
```

### 跨帳號授權設定標準 (30秒極速交割)
1. **試算表授權**：客戶在自己的 Google 雲端硬碟建立資料表，點選「共用」，將**開發者的 Gmail** 加入並設定為**「編輯者」**。
2. **日曆授權**：客戶在他的 Google 日曆中設定，將健身房主日曆以**「變更及管理共享設定」**最高權限共享給**開發者的 Gmail**。
3. **金鑰對齊**：開發者將客戶的 `Spreadsheet ID` 與 `Calendar ID` 寫入該專案的 **Script Properties (指令碼屬性)** 中，部署 Web App 即可完美直連運行！

---

## 3. 租戶隔離與多租戶擴充藍圖 (Multi-tenant Scaling)

當你開始面向多個不同健身房客戶進行銷售時，為避免「配額爭奪 (Quota Limits)」與「單點崩潰」，GymOS v4.0 設計了**「獨立配額租戶隔離」**的橫向擴充藍圖：

### 多租戶隔離策略表

| 規模階段 | 部署策略 | 優點 | 適用情境 |
| :--- | :--- | :--- | :--- |
| **入門測試 (1-2客)** | 共用一個開發者 Google 帳號，為每個客戶建立一個獨立的 GAS 專案（指向不同的 `SPREADSHEET_ID`）。 | 設定最快，零管理負擔。 | 初期驗證與 Alpha 測試。 |
| **商業營運 (3客以上)** | **「獨立配額隔離帳號」**：為每個付費客戶申請一個專屬的託管 Google 帳號（如 `gymos.clientname@gmail.com`），由開發者持有密碼。將該客戶的 GAS 核心部署於此獨立帳號下。 | **配額 100% 獨立隔離**，單一客戶請求過載不會影響其他客戶。程式碼依然由你鎖定，安全性極高。 | 正式對外商業化銷售、SaaS 營運。 |

---

## 4. 系統安全與存取控制 (Security & Access Control)

### API 門控安全守衛
為防止有心人士反編譯前端代碼並惡意調用你的 Apps Script Web App API：
1. **LINE Webhook 驗證**：只有來自 LINE 官方伺服器簽署的 Webhook 事件才會被 `LineHandler` 處理。
2. **Token 安全沙盒**：前端 LIFF 的每一次 POST 請求，都必須攜帶 LINE 的 ID Token 或自定義的安全 Token。`AuthService.ts` 會即時調用 LINE API 進行查驗，未綁定或未授權的角色請求將直接被後端攔截並返回 `403 Forbidden`。

### 客戶停權/欠款機制
* 由於執行引擎網址（Web App URL）掌握在你手中，一旦客戶欠款或合約到期，你可以在你所持有的 GAS 後端中直接：
  * **暫停該專案部署**，或
  * 在資料庫中將該客戶的 `status` 標記為 `suspended`。
  這能讓你的商業運營立於不敗之地。

---

## 5. 模組化功能清單與對照

所有功能模組已依照 v4.0 SaaS 標準重構完成：

*   **學員端 (Member LIFF)**：獨立綁定、實時課務大數據、自助請假、跨班可用空額自動篩選與一鍵補課登記。
*   **教練端 (Coach LIFF)**：今日課表、代課篩選、現場點名與出勤異常現場校正、停課與代課調整。
*   **管理員端 (Admin Portal)**：一鍵開班、Sessions 自動展開排程與 Google 日曆自動批次建置、學員預先登記、系統公告發布。

---

## 6. clasp 與持續整合開發 (CI/CD)

本專案採用 `clasp` 進行本地 TypeScript 開發與 GAS 雲端無縫同步：
*   **根目錄執行 `npm run tc`**：利用 TypeScript 編譯器進行極端強型別防護。
*   **根目錄執行 `.\deploy.ps1`**：一鍵將編譯後的最新代碼推送到對應的 GAS 雲端 Web App，並同步自動 Commit & Push 到 GitHub，實現高水準的自動化集成。

---

## 7. 階段五與後續營運任務清單

所有最新進度已在 [task_03.md](file:///d:/_LINE%20BOT/_C3_PRO/docs/task_03.md) 中完整同步跟進。接下來將引導客戶進行 Rich Menu 綁定與真實 LINE Webhook 對接！

---

## 8. 正式環境設定齒輪與維護模式規範

### 8.1 顯示權限

正式環境中，右上角齒輪設定只允許管理端顯示；學員端不顯示齒輪、不提供 API 設定、不提供 LINE 推播開關，也不需要儲存任何系統設定。此規則可避免學員看到與自身操作無關的管理欄位，降低誤解與誤觸風險。

### 8.2 管理端一般設定

管理端齒輪中的一般設定保留「LINE 繳費通知自動主動推送」開關。此開關用於控制學員完成繳費或課程啟用時，系統是否主動推送 LINE 通知。若需節省 LINE 官方帳號每月免費推播額度，可關閉此功能，改由學員開啟個人首頁查看帳單與課程狀態。

### 8.3 系統資訊

管理端齒輪顯示目前登入者、角色、目前模式、版本號與後端 Apps Script Web App API 網址。正式營運時，API 網址預設僅作為資訊檢視，不鼓勵日常操作修改。

### 8.4 維護工具

版本號連點 5 次後，管理端可開啟隱藏維護工具。維護工具僅供系統維護、部署後檢查、LINE 圖文選單重建與本機測試狀態清除使用，不屬於一般櫃檯日常操作。

維護工具保留項目：

- 後端 API 網址維護：僅在 Apps Script 部署網址更換時使用。
- 頁面模式預覽：供管理者或開發者快速確認管理端、綁定、請假、補課、加選頁面的畫面狀態。
- LINE 圖文選單同步：僅在初次導入、圖文選單圖片修改、LIFF 連結異動時使用，執行前必須再次確認。
- 清除本機測試身分：清除瀏覽器 localStorage 中的測試身分，避免正式環境受到測試資料干擾。

### 8.5 測試身分處理原則

正式 UI 不提供「測試學員 / 測試教職」快速切換欄位。測試身分僅能在受控的開發或驗收流程中使用，不能成為正式營運畫面的一般功能。LINE Rich Menu 的管理員/學員切換必須依後端角色與 LINE 真實身分決定，而不是單純由前端測試選單切換。

---

## 9. 正式前端部署與 LIFF Endpoint 規範

正式環境採用「GitHub Pages 前端 + GAS API 後端」雙端分離：

- GitHub Pages 負責載入 Web/LIFF 前端：`https://joedler.github.io/c3_pro/`
- GAS Web App 僅作為後端 API 與 LINE Webhook 執行引擎。
- LINE Developers 的 LIFF Endpoint URL 必須設為 GitHub Pages 前端，不應設為 GAS Web App URL。

此設計可避免 Google Apps Script HTML 提示列，並減少前端頁面載入時受到 GAS Web App 冷啟動影響。LINE Rich Menu 與 Flex Message 內的連結仍使用 `https://liff.line.me/LIFF_ID?...`，由 LINE LIFF 依 Endpoint 自動導向 GitHub Pages。

若未來切換自訂網域，只需將 LIFF Endpoint 改為新的前端網址，並確認 GitHub Pages 或前端主機仍能保留 `?mode=admin`、`?mode=leave`、`?mode=makeup` 等查詢參數。

---

## 10. 前端與 API 效能優化紀錄

### 10.1 管理端首頁載入優化

管理端首頁原本會連續呼叫多支 API，包含課堂、課程、待繳費、首頁統計、公告、表單中繼資料、系統設定與品牌設定。此設計在 GAS 環境會造成多次 HTTP 往返、多次 token 驗證與多次 Google Sheets 讀取。

已完成優化：

- 新增 `admin.bootstrap`，將管理端首頁所需資料合併為單一 API。
- 後端在同一次執行中讀取 Sheets 並組裝資料，減少重複讀表。
- 品牌設定、公告、首頁統計、教練/教室中繼資料與推播設定一併回傳。
- 管理端實測由約 35 秒降至約 9 秒。

### 10.2 全域背景維護節流

原本每次前端 API 呼叫都會觸發自動結課與自動續期檢查，導致首頁一次載入多支 API 時重複執行背景任務。

已完成優化：

- 在 GAS `doPost` 入口加入 `runBackgroundMaintenanceIfDue()`。
- 透過 `CacheService` 將背景維護節流為 10 分鐘內最多執行一次。
- 透過 `LockService` 避免多人同時開頁時重複觸發。
- 此優化同時套用於管理端、學員端與其他 API 入口。

### 10.3 學員端首頁載入優化

學員端原本雖然 API 數量較少，但仍會分別載入公告、學員資料與品牌設定。後續確認主要可優化項為重複讀取學員首頁資料。

已完成優化：

- 新增 `member.bootstrap`，將公告、學員首頁資料、未來課堂、請假/補課摘要與品牌設定合併回傳。
- 移除學員端額外呼叫 `admin.getBrandConfig` 的流程。
- 對 `member.bootstrap` 加入 30 秒短快取，快取 key 依 LINE UID 區分。
- 綁定、加選、請假、補課成功後會清除該學員 bootstrap 快取。
- 學員端實測由約 13 秒降至約 5 秒多。

### 10.4 前端靜態資源優化

正式前端已從瀏覽器端 Tailwind CDN 即時編譯，改為本機建置後的靜態 CSS：

- 新增 `tailwind.config.js`。
- 新增 `src/web/input.css`。
- 新增 `src/web/assets/app.css`。
- `package.json` 新增 `npm run build:css`。
- `deploy.ps1` 部署前會先執行 Tailwind CSS build。
- 前端不再載入 `https://cdn.tailwindcss.com`。
- Google Fonts 已移除，改用系統字體堆疊，減少外部資源依賴。

### 10.5 診斷計時保留策略

目前前端保留 console 分段計時，僅供開發與驗收期間觀察，不顯示於使用者畫面。

保留的 console 訊息：

- `[GymOS frontend perf]`：前端初始化、LIFF 初始化、資料載入與 appReady 分段計時。
- `[GymOS API perf]`：每支 API 的前端往返耗時。
- `[GymOS LIFF background perf]`：非 LINE 環境下的背景 LIFF 初始化耗時。

正式交付前若客戶不需觀察效能，可移除或以設定旗標關閉這些 console 訊息。

---

## 11. 請假與補課實際管制規則

目前請假與補課不再依賴試算表 `Config` 中的 `MAX_LEAVE_PER_PERIOD`、`MAX_MAKEUP_PER_PERIOD`、`MAKEUP_ADVANCE_DAYS`、`LEAVE_ADVANCE_HOURS` 與 `GYM_NAME`。上述設定列已從初始化種子移除，避免客戶以為修改試算表即可改變營運規則。健身房名稱與品牌顯示改由品牌設定欄位或前端設定處理。

### 11.1 請假管制

- 學員必須是已綁定且啟用中的會員。
- 請假的課堂必須存在，且課堂狀態不可為 `cancelled`。
- 學員必須有該課堂所屬班級的有效選課紀錄。
- 請假截止點為該堂課的「下課時間」。系統以 `session_date + end_time` 組成課堂結束時間，若目前時間已晚於下課時間，後端會拒絕請假。
- 同一位學員不可對同一堂課重複請假。
- 請假成功後會寫入 `Leave_Requests`，並在 `Attendance` 標記為 `leave`，再同步 Google Calendar 課堂資訊。

### 11.2 補課管制

- 補課必須來自本人已核准、尚未使用的請假紀錄。
- 目標課堂必須存在、狀態為 `scheduled`，且尚未開始。
- 目標班級必須允許補課，且不可為「不固定」難度班級。
- 學員程度必須足以參加目標班級，低程度不可補進高程度班級。
- 男性學員不可補進女性專班。
- 目標課堂必須仍有空位，空位以正式選課人數扣除請假人數，再加上已核准補課人數後計算。
- 補課清單與補課送出端都會排除原請假課堂所屬班級，避免學員使用補課額度回補自己的原班級。
- 補課成功後會寫入 `Makeup_Requests`，回填該請假紀錄的 `makeup_session_id`，並在目標課堂 `Attendance` 標記為 `makeup`，再同步 Google Calendar 課堂資訊。

---

## 12. 系統設定分層規範

正式產品化後，設定資料不再放在客戶可見的試算表 `Config/系統設定` 分頁。該分頁可直接刪除，避免客戶看到機密、系統 ID、固定資源路徑或不需理解的維護開關。

### 12.1 試算表 `Config` 分頁

正式環境不保留 `Config/系統設定` 分頁。舊分頁若仍存在，程式只把它當作過渡期備援讀取；刪除後不影響前端、LINE、LIFF、Rich Menu 或 Google Calendar 運作。

### 12.2 移到 GAS 專案屬性

這一層屬於部署、機密、平台 ID 或系統自動產生值，不應放在客戶日常可見的試算表中。程式會優先讀取 GAS Script Properties，若尚未搬移，才退回讀取舊 `Config` 備援值。

- `SPREADSHEET_ID`：客戶資料庫試算表 ID。
- `GCP_SERVICE_ACCOUNT_KEY`：Google Calendar 服務帳號金鑰。
- `LINE_CHANNEL_ACCESS_TOKEN`：LINE Bot Channel Access Token。
- `LINE_CHANNEL_SECRET`：LINE Bot Channel Secret。
- `LIFF_ID`：LINE LIFF ID。
- `GOOGLE_CALENDAR_ID`：客戶 Google Calendar ID。
- `GOOGLE_OAUTH_CLIENT_ID`、`GOOGLE_OAUTH_CLIENT_SECRET`、`GOOGLE_OAUTH_REFRESH_TOKEN`：若未來採 OAuth 模式才使用。
- `RICH_MENU_MEMBER`、`RICH_MENU_COACH`、`RICH_MENU_ADMIN`：LINE Rich Menu 建立後產生的 ID。
- `BRAND_TITLE`：前端品牌標題，未設定時預設為 `C3 Fitness`。
- `LINE_AUTO_PUSH_RENEW`：是否主動推送 LINE 繳費/續期通知，管理端齒輪儲存後會寫入此屬性。
- `ALLOW_DATABASE_RESET`：資料庫重置安全鎖，只在維護或初始化時短暫設為 `true`，執行完畢後必須改回 `false` 或刪除。

### 12.3 固定在程式或 GitHub Pages 路徑

這一層是專案固定資源，不再要求客戶填在試算表。若舊 `Config` 仍有值，程式仍可讀取；若沒有值，會自動使用以下 GitHub Pages 路徑：

- `BRAND_LOGO_URL`：`https://joedler.github.io/c3_pro/img/logo/logo.png`
- `IMG_MENU_MEMBER`：`https://joedler.github.io/c3_pro/img/rich-menu/member.jpg`
- `IMG_MENU_COACH`：`https://joedler.github.io/c3_pro/img/rich-menu/coach.jpg`
- `IMG_MENU_ADMIN`：`https://joedler.github.io/c3_pro/img/rich-menu/admin.jpg`

### 12.4 搬移策略

本專案採漸進式搬移，不要求一次刪除所有舊設定。正式建議順序如下：

1. 先在 GAS 專案屬性建立 `LINE_CHANNEL_ACCESS_TOKEN`、`LINE_CHANNEL_SECRET`、`LIFF_ID`、`GOOGLE_CALENDAR_ID`、`BRAND_TITLE`。
2. 執行一次 LINE 圖文選單同步，讓 `RICH_MENU_MEMBER`、`RICH_MENU_COACH`、`RICH_MENU_ADMIN` 寫入 GAS 專案屬性。
3. 在管理端齒輪確認 `LINE_AUTO_PUSH_RENEW` 狀態，儲存後由後端寫入 GAS 專案屬性。
4. 確認管理端、學員端、Rich Menu 切換與日曆同步都正常。
5. 執行 `cleanupProductionConfig()` 刪除試算表 `Config/系統設定` 分頁。

### 12.5 正式 Config 清理工具

專案提供 GAS 手動函式 `cleanupProductionConfig()`，僅供開發者或維護者在 Apps Script 編輯器中手動執行。此函式會直接刪除舊的 `系統設定` 或 `Config` 分頁。

此工具不放在前端管理頁，避免日常營運誤觸。若分頁已不存在，重複執行也只會回傳「不需要清理」。

---

## 13. 正式啟用前資料清理與 seedClasses 使用規範

本規範用於客戶測試期結束、正式啟用前的最後資料整理。此流程屬於低頻維護作業，通常只在正式上線前執行一次，不建議做成日常管理端按鈕，以避免誤刪正式營運資料。

### 13.1 教練測試學員身份後的權限原則

若教練在測試期間曾使用自己的 LINE 帳號走過學員綁定流程，正式啟用時仍不應由「更新」指令自動升級為教練權限。

正式規則如下：

- `我是教練 姓名`：用於第一次綁定或啟用教練身份。
- `更新`：僅用於重新判斷既有身份並同步 LINE 圖文選單。
- Staff 表必須已存在該教練資料。
- Staff 的 `role` 必須為 `coach` 或管理員指定角色。
- Staff 的 `status` 必須為 `active`。
- Staff 的 `line_uid` 可為空白，等待教練綁定；若已有值，必須與該教練目前 LINE UID 相同。
- 若 Staff 已綁定其他 LINE UID，系統應拒絕重新綁定，避免冒用。

因此，教練正式啟用時應輸入：

```text
我是教練 雯娟
```

綁定成功後，程式會將該教練 LINE UID 寫入 Staff，並直接套用教練圖文選單。之後若圖文選單未同步或角色有調整，教練再輸入 `更新` 即可重新同步。

### 13.2 seedClasses 目前職責

`seedClasses()` 是正式開班與測試重建課程資料的維護函式。它的目的不是清空整個系統，而是重建課程排程與日曆資料。

目前 `seedClasses()` 會自動清除：

- `Classes` 班級設定
- `Sessions` 課堂紀錄
- `Leave_Requests` 請假申請
- `Makeup_Requests` 補課申請
- `Attendance` 出勤紀錄
- 指定日期範圍內既有 Google Calendar 課程事件

目前 `seedClasses()` 不會自動清除：

- `Members` 學員資料
- `Enrollments` 選課紀錄
- `Staff` 教職員資料
- `Announcements` 系統公告
- `Rooms` 教室資料
- GAS Script Properties
- LINE Rich Menu ID
- Google Calendar 設定

### 13.3 正式啟用前手動清理建議

由於正式啟用前清理只會使用一次，且刪除資料具高風險，本專案不新增 `cleanupBeforeProduction()` 自動清理函式。正式啟用前採手動清理，讓維護者可以逐頁確認，降低誤刪風險。

手動清理原則：

- 不刪除整個分頁。
- 不刪除第 1 列標題。
- 只清除第 2 列以下資料內容。
- 清理前應先確認目前試算表是否為正式客戶試算表。

正式啟用前建議手動清除：

- `學員資料`
- `選課紀錄`
- `請假申請`
- `補課申請`
- `出勤紀錄`

正式啟用前通常保留：

- `教職員資料`
- `教室資料`
- `班級設定`
- `課堂紀錄`

其中 `班級設定` 與 `課堂紀錄` 若需依最新開課日期重建，應交由 `seedClasses()` 處理，而不是手動刪除分頁。

公告資料處理：

- 測試公告可在管理端公告管理列表中下架。
- 不建議直接刪除整張公告表。
- 若確定所有公告皆為測試資料，可手動清除 `系統公告` 第 2 列以下內容。

### 13.4 建議正式啟用流程

正式上線前建議依序執行：

1. 手動清除測試學員與測試紀錄。
2. 確認 `Staff` 教練與管理員資料保留且狀態正確。
3. 確認正式開班日期已寫入 `seedClasses()`。
4. 在 GAS 後台執行 `seedClasses()`，重建正式課程、課堂與 Google 日曆。
5. 確認 Google 日曆事件正確產生。
6. 請教練輸入 `我是教練 姓名` 完成教練 LINE 綁定。
7. 請正式學員開始透過 LINE 進行學員綁定與選課。

此流程的核心原則是：課程與日曆由 `seedClasses()` 重建；學員測試資料由維護者手動清除；教職員資料與系統設定不得由一次性清理流程自動刪除。

---

## 14. 會員與選課狀態代碼規範

管理端與學員端畫面一律顯示中文，後端與試算表狀態欄一律儲存英文代碼。此規則可避免日後 UI 文字微調造成程式判斷失效，也能降低「暫停、停用、取消、結束」等相近詞混用的風險。

### 14.1 判斷原則

- `Members.status` 管「人」：此 LINE 會員帳號是否能使用系統。
- `Enrollments.status` 管「課」：此會員與某一班級或某一期課程的關係。
- 日常營運中，大多數暫停、取消、不續報都應調整 `Enrollments.status`，不應直接停用 `Members.status`。
- 簡化判斷口訣：人停用，改 Members；課停掉，改 Enrollments。

### 14.2 Members.status

| 後端代碼 | 中文顯示 | 定義 | 使用時機 |
| --- | --- | --- | --- |
| `active` | 啟用 | 有效會員，可登入 LINE 系統並操作可用功能。 | 一般正式學員。 |
| `inactive` | 停用帳號 | 此人不再使用系統，例如退會、資料作廢或重複帳號。 | 確認不再使用此會員帳號時。 |
| `suspended` | 帳號暫停 | 整個會員帳號暫時不能使用。 | 特殊行政鎖定、爭議處理，日常很少使用。 |

### 14.3 Enrollments.status

| 後端代碼 | 中文顯示 | 定義 | 使用時機 |
| --- | --- | --- | --- |
| `pending_payment` | 待繳費 | 已選課或續期，但尚未完成付款確認。 | 學員新綁定、加選課程、自動續期後等待管理員確認繳費。 |
| `active` | 上課中 | 已繳費並啟用，可進入課表、請假、補課與時數統計。 | 管理員確認繳費後。 |
| `paused` | 課程暫停 | 此學員暫時中斷某一門課，但會員帳號仍有效。 | 臨時停課 1 至數個月、短期休息。 |
| `ended` | 本期結束 | 該期課程自然完成，不再列入目前時數與補課/加選判斷。 | 12 週期滿、月繳期別結束。 |
| `cancelled` | 課程取消 | 非自然完成，而是中途取消或行政取消。 | 報名取消、退款、中途不讀。 |
| `not_renewing` | 不續報 | 續期時標示此學員不帶入下一期。 | 上一期仍可保留紀錄，但下一期不建立待繳費選課。 |

### 14.4 營運設計備註

- 學員暫時不來上課時，優先使用 `Enrollments.status = paused`，不要使用 `Members.status = inactive`。
- 自動續期時，系統應產生候選名單，由管理員勾選是否帶入下一期；未勾選者可視需要標記為 `not_renewing` 或讓上一期自然 `ended`。
- 學員面板的剩餘堂數、已上堂數、可補額度應依目前有效的 `active` enrollment 計算。
- 班期結束或月繳期別結束後，該 enrollment 不應再出現在補課、請假、加選或目前時數統計的判斷中。
