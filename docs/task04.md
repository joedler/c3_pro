# GymOS v4.0 開發任務清單

- [x] **1. 實作雙模適應之 `GoogleCalendarAPI.ts`**
  - [x] 實作 `isSaaSMode()` 靜態檢測方法
  - [x] 重構 `createEvent` 支援 SaaS / CalendarApp 本地雙模
  - [x] 重構 `updateEvent` 支援 SaaS / CalendarApp 本地雙模
  - [x] 重構 `deleteEvent` 支援 SaaS / CalendarApp 本地雙模
  - [x] 重構 `listEvents` 支援 SaaS / CalendarApp 本地雙模且格式對齊

- [x] **2. 重構 `ClassEngine.ts` 業務引擎**
  - [x] 移除 `private static getCalendar()` 與 native CalendarApp 直接依賴
  - [x] 修改 `generate` 調用 `GoogleCalendarAPI.createEvent`
  - [x] 修改 `renew` 調用 `GoogleCalendarAPI.createEvent`
  - [x] 修改 `syncCalendarEvent` 調用 `GoogleCalendarAPI.updateEvent`
  - [x] 修改 `suspendSessions` 調用 `GoogleCalendarAPI.createEvent` 與 `deleteEvent`

- [x] **3. 重構與修復 `Setup.ts`**
  - [x] 將 `seedClasses` 中的清理邏輯替換為 `GoogleCalendarAPI.listEvents` 與 `GoogleCalendarAPI.deleteEvent`
  - [x] 確保 `uiUpdateRichMenus` 程式碼邏輯 100% 完整，無任何殘留損毀語法

- [x] **4. 攔截對接 `Main.ts` 中的 OAuth2 回呼**
  - [x] 將 `doGet` 回傳型別調整為 `any`
  - [x] 於最前端加入 `e.parameter.code` 攔截，回傳 `GoogleCalendarAPI.handleOAuthCallback` 結果

- [x] **5. 系統驗證與編譯部署**
  - [x] 執行本地 TypeScript 全案型別編譯檢測 (`npm run tc`)
  - [x] 執行雲端 `npm run push` 部署並與試算表對接聯調
