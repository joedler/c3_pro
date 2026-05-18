# GymOS v3.0 實作計畫

本計畫旨在構建一套完全零成本、高度安全、UI精美的健身房管理系統。採用 **GitHub Pages (前端 SPA)** 與 **Google Apps Script (後端 Serverless API) 雙端分離架構**。

## 目前開發進度與規劃

我們已完成本地開發的「資料庫基礎結構、安全驗證、統一 API 路由、日曆同步開班引擎」核心架構。

### 階段一：本地核心架構（100% 完成）
- [x] **[Setup.ts](file:///d:/_LINE%20BOT/_C3_PRO/src/gas/Setup.ts)**：11 張 Sheets 資料庫結構與測試教室一鍵建立。
- [x] **[appsscript.json](file:///d:/_LINE%20BOT/_C3_PRO/src/gas/appsscript.json)**：匿名 Web App 與日曆、Gmail 權限配置。
- [x] **[SheetHelper.ts](file:///d:/_LINE%20BOT/_C3_PRO/src/gas/utils/SheetHelper.ts)**：極簡高效 ORM。
- [x] **[Config.ts](file:///d:/_LINE%20BOT/_C3_PRO/src/gas/utils/Config.ts)**：系統設定高速緩存。
- [x] **[AuthService.ts](file:///d:/_LINE%20BOT/_C3_PRO/src/gas/auth/AuthService.ts)**：LINE Profile API 真實身分認證與 RBAC 守衛。
- [x] **[ClassEngine.ts](file:///d:/_LINE%20BOT/_C3_PRO/src/gas/modules/ClassEngine.ts)**：排程引擎、節假日跳過與 Google 日曆雙向實名單同步。
- [x] **[Main.ts](file:///d:/_LINE%20BOT/_C3_PRO/src/gas/Main.ts)**：CORS 處理與 API 多路分發入口。

### 階段二：雲端同步與測試（進行中 🚀）
- [ ] **Clasp 雲端部署**：將本地 TypeScript 程式碼編譯並 Push 至 Google Apps Script 雲端。
- [ ] **初始化資料庫測試**：於試算表執行 `setupDatabase()` 展開 11 張 Sheets。
- [ ] **Git & GitHub 備份**：將本地程式碼 Commit 並 Push 至遠端 GitHub 儲存庫。

### 階段三：剩餘業務邏輯實作（規劃中）
- [ ] **學員模組 (`MemberService.ts` / `LeaveService.ts`)**：綁定與請假折抵學費計算。
- [ ] **教練模組 (`CoachService.ts`)**：手機出席異常校正回報。
- [ ] **管理端 API 串接**：開班表單與學員選課名單寫入。
- [ ] **前端頁面整合**：Alpine.js 動態調用 GAS API 與 FullCalendar 日曆渲染。

---

## 為什麼你看不到程式？

因為我們目前採用的是**專業的 clasp 本地開發流**：
1. 我們所有的程式碼都是在**你本地的電腦資料夾中 (`d:\_LINE BOT\_C3_PRO\src\gas`) 撰寫與儲存**。
2. **GAS 雲端看不到**：因為我們還沒有執行 `clasp push`（本地推送至雲端）指令。
3. **GitHub 看不到**：因為我們還沒有執行 `git commit & push`（提交並推送到遠端儲存庫）指令。

我可以在你允許後，立刻替你執行 `npm run push` 將程式碼一口氣推上你的 GAS 雲端！

---

## 開發模式對比：哪一種最適合你？

在 Google 試算表與 LINE Bot 的開發中，常見以下三種架構模式：

| 模式 | 架構 | 優點 | 缺點 | 適合對象 |
|------|------|------|------|----------|
| **模式 A：單體式 GAS** | 全部 HTML/JS/CSS 都寫在 GAS 專案內 | 部署極簡，不需額外伺服器 | 頁面 URL 極醜，無法做 SEO，多人開發極易衝突 | 個人玩具、小型試用 |
| **模式 B：試算表綁定 UI** | 在 Sheet 內建立 Sidebar 或 Modal 網頁 | 操作便利，免去跳轉網頁 | 無法推廣給一般學員使用（學員不該看到 Sheet 原始檔案） | 健身房員工內部工具 |
| **模式 C：分離式 SPA 雙架構 <br>(PRD v3.0 採用)** | **GitHub Pages (前端)** + <br>**GAS Web App (後端 API)** | 1. **100% 免費** (Pages 與 GAS 均免伺服器費)<br>2. **超美 UI** (支援 Tailwind CSS 與 JS 框架)<br>3. **安全隔離** (學員在 LINE 看 LIFF，完全碰不到 Sheet 原始檔)<br>4. **輕鬆複製** (多租戶白牌部署只需拷貝 Sheet + 換 URL) | 需要 clasp 工具鏈與 Git 本地版控（我們已幫你架設好） | **完全符合你需求的商業級/產品化方案** |

### 結論
**模式 C（GitHub Pages 前端 + GAS 後端 API）最適合你！**
這是一套能夠直接上架銷售、支援多租戶、外觀高大上（Tailwind + Alpine），且擁有極高安全性與**完全零月租成本**的頂級商業架構！
