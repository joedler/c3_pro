# GymOS 環境建置與開發執行計劃

本計劃旨在為 `_C3_PRO` 的全新 **GymOS 健身房管理系統** 建立高標準的本地端 TypeScript + clasp 開發環境，並劃分出前端靜態網頁（GitHub Pages）與後端雲端引擎（Google Apps Script）的清晰目錄邊界。

---

## 🎯 當前已完成建置 (Current Progress)

我們已在 [d:\_LINE BOT\_C3_PRO](file:///d:/_LINE%20BOT/_C3_PRO) 自動完成了以下底層環境初始化：

1. **[`package.json`](file:///d:/_LINE%20BOT/_C3_PRO/package.json)**：引入 `typescript`、`@types/google-apps-script` 以及 `@google/clasp`，並已自動執行 `npm install` 安裝完畢。
2. **[`tsconfig.json`](file:///d:/_LINE%20BOT/_C3_PRO/tsconfig.json)**：配置專為 Google Apps Script 全域 V8 引擎設計的 TypeScript 編譯規則（`module: "none"`，防止模組解析衝突，並確保完美自動完成）。
3. **[`src/gas/appsscript.json`](file:///d:/_LINE%20BOT/_C3_PRO/src/gas/appsscript.json)**：Apps Script 專案設定檔，鎖定台北時區並配置為 Web App 模式。
4. **[`.clasp.json`](file:///d:/_LINE%20BOT/_C3_PRO/.clasp.json)**：預配置範本，並明確將 `rootDir` 導向 `./src/gas`，實現前後端徹底分離。
5. **[`.gitignore`](file:///d:/_LINE%20BOT/_C3_PRO/.gitignore)**：排除 `node_modules` 與 `clasp` 敏感憑證。
6. **[`src/web/index.html`](file:///d:/_LINE%20BOT/_C3_PRO/src/web/index.html)**：一個極具質感的 Tailwind CSS + Alpine.js 暗色系 Glassmorphism 管理中心首頁範本。

---

## 📋 後續環境建置清單 (Step-by-Step Environment Roadmap)

為了讓本地 TypeScript 順利推送到 Google 雲端，請依序完成以下 4 大關鍵步驟：

### 1️⃣ 步驟一：雲端啟用 Google Apps Script API (一次性)
在可以使用 `clasp` 登入前，必須在 Google 帳號中啟用 API 權限：
1. 瀏覽 [Google Apps Script 系統設定](https://script.google.com/home/usersettings)。
2. 將 **「Google Apps Script API」** 切換為 **開啟 (ON)**。

### 2️⃣ 步驟二：本地 clasp 授權登入
在終端機（PowerShell）中執行以下命令登入你的 Google 帳號：
```powershell
npx clasp login
```
*這會自動開啟瀏覽器，請允許 clasp 存取你的 Google 雲端硬碟與 Apps Script 專案。*

### 3️⃣ 步驟三：連結/建立雲端 Apps Script 專案
你可以選擇**新建**一個專案，或者**連結**已有的 Google Sheet 綁定專案：
*   **方法 A：新建獨立專案 (Web App Webhook 用)**
    ```powershell
    npx clasp create --title "GymOS_PROD" --type webapp --rootDir ./src/gas
    ```
*   **方法 B：連結已存在的試算表專案 (與試算表綁定)**
    如果你已有一個 Google Sheet，想直接綁定其 Script，請修改 [`.clasp.json`](file:///d:/_LINE%20BOT/_C3_PRO/.clasp.json) 中的 `scriptId`，將其替換為你的雲端 Script ID（可在雲端編輯器「專案設定」中複製）。

### 4️⃣ 步驟四：試算表資料庫 (Google Sheets) 建立與設定
建立一張名為 `GymOS DB` 的全新 Google Sheet，並根據 PRD v1.0 建立以下 9 張分頁（Sheets）：
*   `Config`（系統全域變數設定）
*   `Members`（學員基本資料與 LINE 綁定）
*   `Classes`（課程班級與開班設定）
*   `Sessions`（個別課程堂數歷史紀錄）
*   `Enrollments`（選課紀錄）
*   `Attendance`（出席與簽到狀態）
*   `Leave_Requests`（請假申請單）
*   `Makeup_Requests`（補課申請單）
*   `Announcements`（佈告欄置頂與公告）

---

## 🛠️ 開發與驗證命令 (Development Commands)

環境建置完成後，日常開發的常用指令已整合在 `package.json` 中：

*   **靜態檢查 TypeScript 是否有型別錯誤**：
    ```powershell
    npm run tc
    ```
*   **將本地 `src/gas/` 的 `.ts` 代碼編譯並上傳至雲端**：
    ```powershell
    npm run push
    ```
*   **熱偵測編譯（每次儲存自動 push 到雲端）**：
    ```powershell
    npm run watch
    ```

---

## 💬 待確認開放問題 (Open Questions)
> [!IMPORTANT]
> 1. **資料庫試算表形式**：你是要直接新建一個**全新空白**的 Google Sheet 來作為本系統的資料庫，還是從原有的 C3 試算表複製並修改架構？如果是全新空白，我們下一步可以提供自動化建立 9 張分頁的 GAS 初始化腳本。
> 2. **GitHub Pages 部署**：你是否有現成的 GitHub 儲存庫？如果需要，我們可以準備 GitHub Actions 自動化工作流（CI/CD），在每次 `git push` 時，自動將 `src/web/` 的前端靜態檔案部署至你的 GitHub Pages。
