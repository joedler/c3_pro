# GymOS 正式環境檢查摘要

檢查日期：2026-05-24

## 摘要

目前 UI 與部署流程已可進入正式使用前檢查階段。正式環境最需要優先控管的是：公開 GAS Web App 的後端權限、LINE LIFF 真實身分驗證、測試身分入口，以及診斷 API 的開放範圍。

## 正式擴大使用前必修項目

### 1. 關閉正式環境測試身分登入

目前風險：

`AuthService.verify()` 仍可能接受 `TEST_UID_...` 或原始 LINE UID 形式的測試 token。這對本機測試有幫助，但 GAS Web App 若設定為 `ANYONE_ANONYMOUS`，正式環境就不應接受可偽造的身分字串。

建議修正：

加入正式環境旗標，例如 Config 或 Script Properties 中的 `ALLOW_TEST_AUTH=false`。只有在明確設定為 `true` 的開發/驗收環境，才允許 `TEST_UID_` 或原始 `U...` token。

### 2. 移除或保護診斷 API

目前風險：

`public.diagnose` 會回傳員工/學員數量與遮蔽後的使用者資訊，`makeup.diagnose` 也可執行診斷邏輯。正式環境不建議公開呼叫。

建議修正：

將診斷路由從公開 API 移除，或要求所有診斷 API 都必須具備管理員角色。

### 3. 確認 LINE Token 是正式唯一身分來源

目前風險：

前端仍有 `devToken` 概念。正式環境應使用 LIFF 從 LINE 取得的真實 access token，不應依賴 localStorage 中殘留的測試 UID。

已完成方向：

正式 UI 已移除測試學員/測試教職快速選取，並提供管理端維護工具中的「清除本機測試身分」。

後續建議：

後端再加入正式環境旗標，從根源拒絕測試 token。

### 4. 確認公開 Web App 存取設定是刻意設計

目前設定：

`appsscript.json` 使用 `webapp.access = ANYONE_ANONYMOUS`。

說明：

LINE LIFF / Webhook 類型系統常需要公開入口，因此此設定可以合理存在，但所有敏感 API 都必須依靠後端 token 與角色檢查保護。

## 強烈建議項目

### 1. 後端配置集中化

目前前端 `src/web/index.html` 仍有固定 GAS Web App URL 與 LIFF ID。後續若要複製給第二間健身房，建議改由後端 bootstrap config 或公開設定 API 提供，降低多客戶部署時的手動修改成本。

### 2. 維護工具只保留給管理端

已完成方向：

學員端不顯示齒輪；管理端才顯示齒輪。版本號連點 5 次後，僅開啟「維護工具」，不再包裝成一般開發者模式。

### 3. LINE 圖文選單同步需二次確認

已完成方向：

執行「一鍵同步 LINE 圖文選單」前，系統會跳出確認視窗，提醒此操作可能重新建立或覆蓋官方帳號圖文選單。

### 4. 部署流程避免提交 scratch

已完成方向：

- `.gitignore` 已加入 `scratch/`。
- `deploy.ps1` 已避免使用 `git add .`。
- 已從 Git 追蹤中移除既有 scratch 檔案，但保留本機檔案。

## 正式配置檢查清單

- GAS Script Property `SPREADSHEET_ID` 指向正式客戶試算表。
- Config 表含有正式 `LINE_CHANNEL_ACCESS_TOKEN`。
- Config 表含有正式 `LIFF_ID`。
- Config 表含有正確 `GOOGLE_CALENDAR_ID`，或明確使用預設日曆。
- 若使用 GCP 服務帳號日曆模式，Script Property `GCP_SERVICE_ACCOUNT_KEY` 已設定且屬於正確專案。
- Staff 表只保留真實且啟用中的管理員/教練 LINE UID。
- 正式資料中不保留測試學員或測試教職。

## Git 與部署備註

- `deploy.ps1` 已改為只加入正式檔案與指定目錄。
- `scratch/` 已加入 `.gitignore`。
- 已追蹤的 `scratch/` 檔案已從 Git 索引移除，但本機仍保留。
- 此次檢查期間 `npm.cmd run tc` 已通過。

## 建議下一步

下一個優先事項是後端安全加固：

1. 新增正式環境設定旗標。
2. 將 `TEST_UID_` 與原始 UID 測試登入限制在 `ALLOW_TEST_AUTH=true`。
3. 移除公開診斷路由，或改為管理員限定。
4. 確保正式環境前端不使用殘留測試 token。
