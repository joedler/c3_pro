# GymOS v4.0 轉移至 GCP 服務帳號 (Service Account) 方案實作計畫

早安！為您梳理目前的開發脈絡、記憶，並針對 **A方案 (Service Account)** 建立極具可行性、系統化的今日任務清單與實作計畫。

---

## 🧠 記憶整理與現況定位

### 1. 核心痛點已明確定位
*   **最初的共用日曆方案**：因跨網域（企業與個人帳號）的 Google 原生安全機制限制，無法使用 `CalendarApp` 穩定寫入，故此路不通。
*   **方案 B (OAuth2 同意畫面)**：雖然打通了 REST API，但因為企業版 G Suite Web App 的外部存取限制，被迫必須「共用 GAS 專案給客戶」以繞過重導向網頁阻擋，**導致核心原始碼外洩**。
*   **方案 A (服務帳號 Service Account) 的核心優勢**：
    1.  **程式碼 100% 私有**：不需要將 GAS 專案共用給客戶，GAS 專案可以設定為完全私有。
    2.  **免除 Web App 回呼阻擋**：不需客戶瀏覽器進行 OAuth 重導向（沒有 `/exec` 回呼頁面），完全由背景伺服器 API 自動對齊。
    3.  **日曆 100% 隔離防污染**：機器人帳號沒有網頁日曆 UI，客戶的課程日曆**絕對不會**出現在您個人的日曆左側列表中！

---

## 🛠️ 方案 A 實作架構設計

### 1. 敏感金鑰安全隱藏
服務帳號的 JSON 金鑰（`GCP_SERVICE_ACCOUNT_KEY`）將安全地存放在 **您私有 GAS 專案的「指令碼屬性 (Script Properties)」中**。
*   客戶完全沒有此 GAS 專案權限，因此金鑰 100% 安全。
*   代碼庫完全通用，不寫死任何金鑰。

### 2. 免外部庫 JWT 自簽章對接 (Pure GAS JWT & REST API)
我們將在 `GoogleCalendarAPI.ts` 內，實作一個基於 GAS 原生 `Utilities.computeRsaSha256Signature` 的輕量級 **JWT 自簽章認證器**：
*   **認證流程**：解析 JSON 金鑰中的 `private_key` 與 `client_email` -> 簽署 JWT -> 發送 POST 換取 `access_token` -> 快取 token 55分鐘以優化效能。
*   **API 執行**：以該 `access_token` 直接調用原有的 Google Calendar REST API。

### 3. 刪除冗餘與被共用的漏洞代碼
*   移除 `Main.ts` 中的 `doGet` OAuth 攔截回呼邏輯，徹底關閉外部 Web App 安全漏洞。
*   移除 `Setup.ts` 中一鍵授權選單功能與相關產生的 `getOAuthUrl`。
*   移除試算表「系統設定 (Config)」中不再需要的 `GOOGLE_OAUTH_CLIENT_ID`、`GOOGLE_OAUTH_CLIENT_SECRET` 與 `GOOGLE_OAUTH_REFRESH_TOKEN` 欄位，回歸極簡！

---

## 📅 今日任務清單 (Today's Tasks)

### Phase 1: 代碼重構與功能實作 (開發端)
- `[ ]` **重構 [GoogleCalendarAPI.ts](file:///d:/_LINE%20BOT/_C3_PRO/src/gas/utils/GoogleCalendarAPI.ts)**：
  - 新增 `getServiceAccountToken()`：實作基於 `GCP_SERVICE_ACCOUNT_KEY` 專案屬性的 JWT 自簽章與快取機制。
  - 將 REST API 的 `getAccessToken()` 方法改為調用 `getServiceAccountToken()`。
  - 移除已無用的 OAuth2 `handleOAuthCallback` 相關邏輯。
- `[ ]` **優化 [Main.ts](file:///d:/_LINE%20BOT/_C3_PRO/src/gas/Main.ts)**：
  - 移除 `doGet` 中攔截 OAuth2 `code` 的邏輯，使其保持純淨空殼。
- `[ ]` **清道夫重構 [Setup.ts](file:///d:/_LINE%20BOT/_C3_PRO/src/gas/Setup.ts)**：
  - 移除 `getOAuthUrl` 臨時授權代碼，確保雲端與本地不留冗餘。
- `[ ]` **本地型別編譯與 clasp 部署**：
  - 執行 `npm run tc` 確保重構後 0 型別錯誤。

### Phase 2: 安全降級與交割測試 (管理與設定端)
- `[ ]` **移除 GAS 客戶共用權限**：
  - 在雲端硬碟將此 GAS 專案的 `c3fitness2015@gmail.com` 共享權限**徹底移除**，關閉後門。
- `[ ]` **GCP 控制台設定 (開發者動作)**：
  - 建立 GCP 服務帳號 (Service Account)，下載 JSON 金鑰。
  - 將 JSON 內容貼入 GAS 的專案設定屬性 `GCP_SERVICE_ACCOUNT_KEY` 中。
- `[ ]` **Google 日曆共用設定 (客戶動作)**：
  - 讓客戶在其 Google Calendar，將日曆共用給該服務帳號信箱，給予「變更事件」權限。
- `[ ]` **實機排課連線驗證**：
  - 在試算表執行排課，驗證日曆事件是否完美由背景機器人自動同步至客戶日曆，且您的個人日曆 100% 保持乾淨！

---

## 🚦 待確認開放問題 (Open Questions)

> [!IMPORTANT]
> 1. 您是否擁有該 GCP 專案的權限來「新增一個服務帳號 (Service Account)」？
> 2. 請確認本計畫是否完美符合您的脈絡。確認後我們即刻開始！
