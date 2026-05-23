# 健身房管理後台「極簡流線型版面」與「雙軌制公告系統」優化計劃

本計劃旨在為 GymOS 管理員控制台進行「生產環境級」的視覺與功能重構，消除早期開發測試期的冗餘噪音，最大化第一線營運的工作區域，並實現 SaaS 級的多租戶動態品牌替換與零成本雙軌制公告系統。

---

## 🎯 優化核心目標 (Core Objectives)

1. **SaaS 多租戶品牌動態更換**：後台 Logo 與標題不再硬編碼，改為從試算表 `Config` 工作表動態載入 `BRAND_TITLE` 與 `BRAND_LOGO_URL`，複製系統即可一秒換牌。
2. **極簡流線型版面 (Frameless & fluid)**：移除所有多餘外框、大容器邊距，在行動端貼邊最大化數據展示空間，防止表格折行。
3. **消除測試噪音，專注管理職能**：拔除首頁頂部的「學員綁定、請假、補課、教練端」等非管理員標籤。這些端點由學員/教練透過手機 LINE 獨立 LIFF 開啟，後台應專注管理員功能。
4. **「學費核點」正式更名為「繳費確認」**：避開“核點”字樣，防止學員在任何介面上看到產生誤會。
5. **課表直接嵌入 Google 日曆（無縫暗黑過濾）**：在後台「課表」分頁中直接內嵌 Google 日曆 Iframe，並透過 CSS Filter 進行暗色反轉，且提供「🌐 在 Google 日曆中開啟」的一鍵跳轉按鈕。
6. **建置「雙軌制公告系統」**：
   * **管道一 (LIFF 網頁內嵌，100% 免費 🆓)**：公告寫入試算表，學員打開 LINE 課表網頁時在頂部以跑馬燈/彈窗顯示，消耗 0 則 LINE 訊息額度。
   * **管道二 (LINE 全體群發 🚨)**：提供 `[ ] 緊急通知：同步推送至學員 LINE 聊天室` 勾選框，勾選時調用 LINE Broadcast API 進行群發，保障重要通知不漏接。
   * **後台發布入口**：管理員可在「首頁摘要」直接點擊「📢 發布新公告」彈窗填寫，自動寫入並同步派發。

---

## 📋 待確認開放問題 (Open Questions)

> [!NOTE]
> 1. **內嵌日曆的公開性**：Google 日曆的內嵌 iframe 必須將該日曆設定為「公開（檢視權限）」，否則未登入 Google 的管理員瀏覽器會顯示空白或需要權限。請確認此日曆已在 Google Calendar 設定中開啟「知道連結的任何人都可以檢視」權限（這不影響教練或學員在 LINE 中的點名，因為他們是透過服務帳號讀寫）。
> 2. **試算表 Config 初始化**：我們將在 `Config` 中新增 `BRAND_TITLE` 與 `BRAND_LOGO_URL`。預設標題為 "GymOS"，預設 Logo 為系統內建的閃電 SVG。你可以隨時在 Google Sheet 中更換。

---

## 💻 擬變更之檔案與實作細節

### 1. 後端與資料庫優化 (Google Apps Script)

#### [MODIFY] [SheetHelper.ts](file:///d:/_LINE%20BOT/_C3_PRO/src/gas/utils/SheetHelper.ts)
* 驗證並確保 `COLUMN_MAP` 的 `Announcements`（系統公告）工作表欄位結構：
  * `announcement_id`: '公告ID'
  * `title`: '標題'
  * `content`: '內容'
  * `type`: '公告類型' (例如: `'info'` / `'alert'`)
  * `send_line`: '同步發送LINE' (Boolean)
  * `publish_time`: '發布時間'
  * `expire_time`: '失效時間'

#### [MODIFY] [Main.ts](file:///d:/_LINE%20BOT/_C3_PRO/src/gas/Main.ts)
* 在門控路由中註冊新 Action：
  * `'admin.getBrandConfig'`：讀取試算表 `Config` 的品牌資訊。
  * `'admin.publishAnnouncement'`：發布公告 API：
    * 寫入 `Announcements` 試算表。
    * **雙軌制邏輯**：若 `sendLine === true`，呼叫 LINE 官方群發 API，將此公告以精美的 Flex Message 廣播至所有關注Bot的用戶。
  * `'admin.getAnnouncements'`：供管理後台與學員端 LIFF 讀取目前有效的公告清單。

---

### 2. 前端介面極致重構 (index.html)

#### [MODIFY] [index.html](file:///d:/_LINE%20BOT/_C3_PRO/src/web/index.html)

##### 視覺版面重構 (Maximized Frameless CSS)：
1. **去除邊邊角角外框**：將 `body` 和主容器 `main` 的外邊距、內邊距調至最小（特別是手機端左右 padding 改為 `px-2` 或 `px-0`），讓表格在小螢幕直接貼邊。
2. **CSS 變數化 (Light/Dark 預留)**：將背景色與文字色以 CSS Variables 定義在頂部，便於後續擴充一鍵切換亮色/暗色主題：
   ```css
   :root {
     --bg-main: #0b0f19;
     --bg-card: rgba(30, 41, 59, 0.4);
     --border-color: rgba(51, 65, 85, 0.5);
     --text-primary: #f8fafc;
     --text-secondary: #94a3b8;
     --brand-color: #8b5cf6;
   }
   ```

##### 頂部導航重構：
1. **動態更換 Logo 與標題**：
   * 左上角 Logo 區塊改為由 Alpine.js 綁定 `brandLogoUrl` 與 `brandTitle`。
   * 初始化時呼叫 `admin.getBrandConfig` 載入設定。
2. **移除非管理員標籤**：
   * 徹底拿掉原來的六個 sandbox 路由切換按鈕。
   * 將「⚙️ 系統設定」按鈕與「一鍵重置資料庫」、「一鍵同步 LINE 選單」等高風險按鈕收納在 Header 右上角的下拉選單中。

##### 分頁功能重整：
1. **【📊 首頁摘要】 (Dashboard)**：
   * **四個極簡數據指標卡片**：
     * 「今日授課」：幾堂課。
     * 「待繳學費」：幾人待繳（點擊直接跳轉至【💰 繳費確認】分頁）。
     * 「今日請假」：自動化統計（點擊展開顯示請假學員姓名、所屬班級）。
     * 「今日補課」：自動化統計（點擊展開顯示補課學員姓名、目標班級）。
   * **系統公告提示列**：
     * 首頁摘要頂部以 HSL 漸層跑馬燈/公告列，渲染出目前生效的公告清單。
     * 右側新增「📢 發布新公告」按鈕，點擊開啟彈窗填寫（包含緊急 LINE 同步群發勾選框）。
2. **【🏫 班級經營】 (Classes)**：
   * 移除與公告、連線檢驗相關的噪音，單純展示班級列表。
   * 提供獨立的「🆕 新增班級」按鈕。
3. **【💰 繳費確認】 (Tuition)**：
   * 介面文字完全隱藏「核點」字樣，改為「繳費確認」。
   * 表格支持 Checkbox 批量勾選，右上角擺放「🚀 批量確認已繳費」主操作鈕。
4. **【📅 課表看板】 (Calendar)**：
   * 直接使用 `iframe` 嵌入 Google Calendar。
   * 套用 CSS 反轉過濾器實現暗色風：`filter: invert(0.9) hue-rotate(180deg);`
   * 下方擺放一個質感極佳的「🌐 在 Google 日曆中開啟」一鍵外跳按鈕。

---

## 🧪 驗證與測試計劃 (Verification Plan)

### 1. SaaS 品牌替換驗證
* 修改試算表 `Config` 中的 `BRAND_TITLE` 為 "C3 Fitness 專業館"，`BRAND_LOGO_URL` 為一張自訂的圖片連結。
* 重新整理管理後台，確認左上角的標題文字、商標圖片、以及網頁瀏覽器標籤頁標題均在一秒內同步變更為新名稱。

### 2. 雙軌制公告功能驗證
* 點擊首頁的「📢 發布公告」，填入測試內容，**不勾選**「同步發送 LINE」。
  * **預期結果**：試算表寫入成功，後台首頁即時渲染出新公告，而 LINE 聊天室**完全沒有**收到訊息（零消耗）。
* 再次發布一則公告，**勾選**「緊急通知：同步推送至學員 LINE 聊天室」。
  * **預期結果**：學員手機 LINE 聊天室在一秒內收到一張精美的 Flex 廣播公告卡片。

### 3. 視覺與無框測試
* 使用 Chrome 開發者工具切換為行動端檢視（iPhone 12/14/15 Pro），確認表格在貼邊後完全沒有產生橫向滾動條，且文字能優雅地換行。
* 確認原先的首頁角色切換標籤、連線檢驗等冗餘資訊已完全消失。
