# GymOS v4.0 商業化 SaaS 獨立代管日曆與去中心化 OAuth2 自動化串接實作計劃

本計劃旨在落實 `# GymOS 產品需求文件 (PRD) v4.0` 的商業化 SaaS 私有獨立代管架構。透過對接 `GoogleCalendarAPI.ts` 實現「開發者與客戶日曆帳號完全解耦」，並在金鑰未完成對接時自動優雅降級回傳統 `CalendarApp` (Local 模式)，實現零摩擦的一鍵升級與向下相容。

---

## 🎯 使用者審查與核心設計

我們發掘了以下關鍵架構調整，以提供最頂級的 SaaS 商業體驗：

> [!IMPORTANT]
> 1. **金鑰雙向適應 (Hybrid Dual-Mode Google Calendar API)**：
>    - 為了讓系統能百分之百相容沒有對接 Google Cloud 憑證的本地開發者/小型健身房，我們將 `GoogleCalendarAPI.ts` 設計為 **自動雙模適應**：
>      - **SaaS 獨立代管模式**：當 Config 設有 `GOOGLE_OAUTH_CLIENT_ID`、`GOOGLE_OAUTH_CLIENT_SECRET` 與 `GOOGLE_OAUTH_REFRESH_TOKEN` 時，自動透過 REST API 讀寫客戶的 Google 日曆。
>      - **Local 降級模式**：當金鑰未設置時，自動優雅降級使用 `CalendarApp` 讀寫日曆，完全不需要任何修改代碼，開箱即可向下相容！
> 
> 2. **一鍵 OAuth 自動回呼攔截 (Google OAuth Redirect Callback Handler)**：
>    - 當客戶點擊授權，Google 重新導向回 GAS Web App URL 並帶入 `code` 參數時。
>    - 我們在 `Main.ts` 的 `doGet` 入口處，將 `code` 攔截並分流給 `GoogleCalendarAPI.handleOAuthCallback(code)` 進行 token 解析並自動回填試算表的 `Config` 中，無縫完成 30 秒金鑰對齊！
> 
> 3. **核心開班引擎全面解耦 (`ClassEngine.ts` / `Setup.ts`)**：
>    - 將 `ClassEngine.ts` 及 `Setup.ts` 中所有直接呼叫 `CalendarApp` 的程式碼，重構為統一呼叫 `GoogleCalendarAPI` 的封裝接口，實現完全模組化。

---

## 🛠️ 預計修改檔案與實作方案

### 1. 雙模日曆服務 (API & Service Layer)
#### [MODIFY] [GoogleCalendarAPI.ts](file:///d:/_LINE%20BOT/_C3_PRO/src/gas/utils/GoogleCalendarAPI.ts)
*   新增 `isSaaSMode()` 靜態方法，判斷是否已配置 SaaS OAuth 金鑰。
*   重構 `createEvent`、`updateEvent`、`deleteEvent`、`listEvents`：
    *   若是 SaaS 模式：執行既有的 OAuth REST 請求。
    *   若非 SaaS 模式：執行 `CalendarApp` 本地處理，並將本地 `CalendarEvent` 轉化為與 REST API 一致的數據結構回傳。

#### [MODIFY] [ClassEngine.ts](file:///d:/_LINE%20BOT/_C3_PRO/src/gas/modules/ClassEngine.ts)
*   刪除 `private static getCalendar()` 與對 `CalendarApp` 的直接依賴。
*   將 `generate`、`renew`、`syncCalendarEvent`、`suspendSessions` 中的日曆操作全面替換為呼叫 `GoogleCalendarAPI` 的對應靜態方法。

#### [MODIFY] [Setup.ts](file:///d:/_LINE%20BOT/_C3_PRO/src/gas/Setup.ts)
*   將 `seedClasses` 中對 `CalendarApp` 進行歷史舊活動清理的邏輯，重構為調用 `GoogleCalendarAPI.listEvents` 與 `GoogleCalendarAPI.deleteEvent`。
*   修正 `uiUpdateRichMenus` 的 Config 欄位自動檢測，將先前被損毀的程式碼完整修復。

---

### 2. 控制器路由 (Controller Layer)
#### [MODIFY] [Main.ts](file:///d:/_LINE%20BOT/_C3_PRO/src/gas/Main.ts)
*   將 `doGet` 傳回值型別改為 `any`，並在最前端新增對 `e.parameter.code` 授權金鑰的檢測與攔截：
    ```typescript
    if (e.parameter.code) {
      return GoogleCalendarAPI.handleOAuthCallback(e.parameter.code);
    }
    ```

---

## 🧪 驗證與測試計畫

### 自動化測試命令 (GAS & Clasp)
1. 執行 `npm run tc` 進行本地 TypeScript 靜態型別與語意安全檢查，確保 0 型別錯誤。
2. 執行 `npm run push` 將最新代碼部署至 Apps Script 雲端。

### 聯調功能驗證
1. **Local 模式驗證**：在未配置 OAuth Client ID 時，手動執行 `seedClasses()` 或開班，確認 Google 日曆仍能經由本地 `CalendarApp` 成功建立日曆事件。
2. **SaaS 模式模擬驗證**：確認程式碼能成功編譯，準備好 Google OAuth redirect URI 對接。
