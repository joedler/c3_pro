# GymOS v2.0 — 模組化健身房管理系統 (內部開發需求規格)

> **定位**：零成本基礎設施、低維護負擔、模組化架構，可作為 SaaS 商業產品。
> **目標讀者**：開發者自己（備忘與規格對照）。
> **核心技術**：GitHub Pages + GAS (clasp + TS) + Google Sheets + Google Calendar + LINE Bot。

---

## 1. 系統願景與架構總覽

### 1.1 核心特性
*   **零成本基礎設施**：運用 GitHub Pages, GAS, Google Sheets, LINE 免費額度。
*   **模組化與高擴充性**：支援未來擴充功能（線上繳費、多場館）。
*   **強型別防護**：使用 TypeScript (透過 clasp) 進行 GAS 開發。

### 1.2 技術架構圖
```text
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND TIER                             │
│   GitHub Pages (靜態)          LINE 官方帳號 (LIFF App)          │
│   • 管理後台 SPA               • 學員操作介面 (直接登入)            │
│   • 教練日曆與回報表單           • 個人資訊卡片                     │
│   • 公開課表展示                • 請假 / 補課                      │
└───────────────────┬───────────────────────┬─────────────────────┘
                    │ HTTPS fetch/AJAX       │ LINE Webhook
┌───────────────────▼───────────────────────▼─────────────────────┐
│                     GAS WEB APP TIER (TypeScript)                 │
│  doGet(e)  → 公開資料查詢 / do_Post(e) → 操作 API                  │
└───────────────────┬───────────────────────┬─────────────────────┘
                    │ SpreadsheetApp         │ UrlFetchApp
┌───────────────────▼──────┐  ┌─────────────▼─────────────────────┐
│    Google Sheets DB       │  │   External Services               │
│  (Config, Members, 等)    │  │  (LINE API, Calendar API 等)      │
└───────────────────────────┘  └───────────────────────────────────┘
```

---

## 2. 資料架構 (Google Sheets Schema)

每間健身房對應一份獨立的 Spreadsheet。

### 2.1 Config (系統設定)
*   `key`: 設定鍵名 (如 GYM_NAME, LINE_CHANNEL_TOKEN)
*   `value`: 設定值
*   `description`: 說明

### 2.2 Members (學員資料)
*   `member_id`: UUID
*   `line_uid`: LINE User ID (透過 LIFF 自動取得並綁定)
*   `name`: 真實姓名
*   `level`: 程度 (L1~L10)
*   `status`: active / inactive

### 2.3 Classes (班級定義)
*   `class_id`: UUID
*   `class_name`: 班級名稱
*   `difficulty`: 課程難度 (初級 / 中級 / 高級)
*   `coach_line_uid`: 授課教練
*   `room`: 教室
*   `fee`: 單堂學費 (保留欄位，未來實作學費計算)
*   `schedule`: 上課星期與時段

### 2.4 Sessions (每堂課紀錄)
*   `session_id`: UUID
*   `class_id`: FK
*   `session_date`: 上課日期
*   `status`: scheduled / completed / cancelled

### 2.5 Attendance, Leave_Requests, Makeup_Requests, Announcements
(延續 v1.0 結構，負責出勤、請假、補課、公告邏輯)

---

## 3. 核心功能模組

### 3.1 學員端 (LINE + LIFF)
*   **無縫綁定**：學員加入 LINE 後，透過 LIFF 開啟網頁直接取得 LINE 身份，免額外輸入驗證碼，自動與 Sheets 資料關聯。
*   **請假與補課**：LIFF 介面操作。請假後獲得補課額度，補課時過濾同難度 (初/中/高) 且有空位的班級。

### 3.2 教練端 (Calendar + Web Form)
*   **行程查看**：GAS 自動將課程與名單同步至教練的 Google Calendar，教練直接看日曆即可。
*   **實況回報**：教練點擊日曆事件內的連結，開啟 GitHub Pages 上的簡易表單，回報出席異常，由 GAS 更新回 Sheets。

### 3.3 管理端 (GitHub Pages)
*   **班級與排程**：設定班級後，GAS 自動展開 Sessions 並建立 Calendar 事件。
*   **學費折抵**：依據缺課與全勤狀況計算下期學費折抵 (目前僅保留資料結構，計算邏輯留待後續進階版實作)。

---

## 4. AI 開發團隊角色分工 (模擬團隊)

為了高效開發，我們設定以下 AI 協作角色，你可以在後續提示中呼叫對應角色來執行任務：

1.  **👨‍💻 架構師 (Architect)**：負責整體系統設計、資料庫結構優化、API 路由規劃。
2.  **🎨 前端工程師 (Frontend Dev)**：負責 GitHub Pages、LIFF 頁面開發 (Alpine.js + Tailwind CSS)。
3.  **⚙️ 後端工程師 (Backend Dev)**：負責 GAS TypeScript 開發、LINE Reply API 串接、Google Calendar 同步。
4.  **🕵️ 測試與維運 (QA/Ops)**：負責撰寫測試案例、部署腳本 (GitHub Actions)、錯誤日誌追蹤。

---

## 5. CI/CD 與自動化 Wiki 更新 (GitHub Actions)

我們採用 GitHub Actions 來取代較為複雜的 MCP，達成程式碼更新與文件同步的自動化。

**工作流流程 (`.github/workflows/update-wiki.yml`)**：
1.  **觸發條件**：當 `main` 分支有程式碼推送 (Push) 時。
2.  **執行動作**：
    *   自動將 `src/web/` 的最新代碼部署到 GitHub Pages。
    *   透過腳本讀取程式碼中的 JSDoc 或 Markdown 文件更新，並自動 `git push` 到專案的 `.wiki.git` 儲存庫，實現 Wiki 的自動更新。

---

## 6. 專屬開發 Skills 建議清單

為了解決這個專案的特殊性，建議建立以下 AI 協作 Prompt Skills（你可以在與我對話時直接套用這些要求）：

*   **Skill: GAS-TS-Generator**：產生程式碼時，必須符合 `module: "none"` 的 GAS TypeScript 規範，且不使用 `import/export`，變數與介面宣告於全域 `types.ts`。
*   **Skill: LIFF-UI-Builder**：產出前端頁面時，強制使用 Tailwind CSS (暗色主題) + Alpine.js，並且確保支援 LINE LIFF SDK 的初始化。
*   **Skill: Sheet-DB-Operator**：操作資料庫邏輯時，必須確保資料讀寫的效能 (批次 getValues/setValues)，並考慮併發鎖 (LockService)。
