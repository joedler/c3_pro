# 🤖 GymOS v3.0 系統核心功能與端到端測試手冊 (Cheatsheet)

本手冊為 GymOS v3.0（Google Apps Script 雲端架構 + LINE 智慧對話機器人 + LIFF SPA 網頁端）的完整測試引導。內容包含：LINE 對話指令、網頁端模擬測試路徑、以及後端完整業務 API 驗證清單。

---

## 1. LINE 對話框指令集及功能清單 (Chatroom Commands)

在手機 LINE 官方帳號內，直接在對話視窗中輸入以下字詞，可觸發對應的系統核心行為：

<table>
  <thead>
    <tr style="background-color: #f3f4f6;">
      <th style="width: 20%; text-align: left; padding: 8px;">指令關鍵字</th>
      <th style="width: 15%; text-align: left; padding: 8px;">適用身分</th>
      <th style="width: 35%; text-align: left; padding: 8px;">觸發功能描述</th>
      <th style="width: 30%; text-align: left; padding: 8px;">預期回覆內容</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding: 8px;"><b><code>診斷</code></b><br>(或 <code>身分</code> / <code>我的ID</code>)</td>
      <td style="padding: 8px;"><b>所有人</b> (含訪客)</td>
      <td style="padding: 8px;"><b>系統診斷報告</b>：讀取真實 UID、試算表 ID、欄位對照與教職員前 5 筆原始資料。</td>
      <td style="padding: 8px;">傳送含有真實 UID、試算表資訊的診斷報告文字。</td>
    </tr>
    <tr>
      <td style="padding: 8px;"><b><code>更新</code></b><br>(或 <code>同步選單</code>)</td>
      <td style="padding: 8px;"><b>所有人</b> (含訪客)</td>
      <td style="padding: 8px;"><b>選單同步與權限刷新</b>：重新撈取身分，強制更新用戶手機圖文選單（管理員/教練/學員）。</td>
      <td style="padding: 8px;">回傳 <code>✅ 選單同步更新成功</code> 氣泡卡片。 <i>(需重開對話框)</i></td>
    </tr>
    <tr>
      <td style="padding: 8px;"><b><code>今日課表</code></b></td>
      <td style="padding: 8px;">📋 <b>教練 / 管理員</b></td>
      <td style="padding: 8px;"><b>今日授課看板入口</b>：呼叫教練專區快速卡片，提供教練點選進入點名與出席校正。</td>
      <td style="padding: 8px;">回傳「教練今日授課看板」Flex 卡片，附帶「進入教練中心」按鈕。</td>
    </tr>
    <tr>
      <td style="padding: 8px;"><b><code>我的課程</code></b><br>(或 <code>請假補課</code>)</td>
      <td style="padding: 8px;">📊 <b>學員 (Member)</b></td>
      <td style="padding: 8px;"><b>學員課務儀表板</b>：即時查詢學員累計上課堂數、累計請假與補課次數。</td>
      <td style="padding: 8px;">回傳「GymOS 課務大數據儀表板」Flex 卡片，附帶「查詢課程」與「線上請假」按鈕。</td>
    </tr>
    <tr>
      <td style="padding: 8px;"><b>隨意輸入字詞</b><br>(有綁定者)</td>
      <td style="padding: 8px;"><b>已綁定者</b></td>
      <td style="padding: 8px;"><b>預設幫助引導 fallback</b>：已綁定身分者輸入非指令關鍵字時，彈出快速服務選單。</td>
      <td style="padding: 8px;">回傳「💡 GymOS 快速服務選單」圖文 Flex 氣泡。</td>
    </tr>
    <tr>
      <td style="padding: 8px;"><b>隨意輸入字詞</b><br>(未綁定者)</td>
      <td style="padding: 8px;">👤 <b>未綁定訪客</b></td>
      <td style="padding: 8px;"><b>未綁定安全攔截</b>：未綁定訪客或狀態停用者，一律進行綁定攔截。</td>
      <td style="padding: 8px;">回傳 <code>⚠️ 您尚未綁定帳號</code> 質感 Flex 卡片，附帶 <code>🔑 一鍵安全綁定</code> LIFF 按鈕。</td>
    </tr>
  </tbody>
</table>

---

## 2. 網頁端測試資源與各身分模擬 LINE Token

為方便在電腦 Local 瀏覽器中直接測試與開發 SPA 網頁端功能，系統支援**「開發者測試模擬門控」**。只需在前端的 Web App 設定中，將 Token 填入 `TEST_UID_[LINE_ID]`，系統將會繞過 LINE 的認證，自動判定為對應的角色進行操作：

### 🔗 系統生產環境 Web App 部署網址 (Web App URL)
> **`https://script.google.com/macros/s/AKfycbw5qd3RILHE1zkWfFLJfcDL-Mitfx2UcHj9cyzETaISKgwONltAcm1SL36Z_EK3lFAp/exec`**

### 🔑 模擬測試 Token (Tokens for Emulation)

*   👑 **系統管理員 (Admin) 測試**
    *   **賴祖昌** 模擬 Token: `TEST_UID_U4abb6fb071cf072db0cc950d59780e11`
    *   **李宗倫** 模擬 Token: `TEST_UID_Ucfe0098302932d8c25b0e298771694b6`
*   📋 **授課教練 (Coach) 測試**
    *   **教練 H** 模擬 Token: `TEST_UID_U028285d818d2fb6acc952c416b833e33`
*   📊 **一般學員 (Member) 測試**
    *   *自訂方法*：在試算表 `學員資料 (Members)` 中手動隨意新增一筆資料（例如設定 LINE 帳號 ID 為 `TEST_MEMBER_999`），接著在網頁 Token 欄位輸入：
        👉 `TEST_UID_TEST_MEMBER_999` 即可測試學員專屬 LIFF 功能。
*   👤 **未綁定訪客 (Guest) 測試**
    *   使用 any 隱含不存在於試算表中的 UID 模擬 Token，例如：
        👉 `TEST_UID_RANDOM_GUEST_777` 即可模擬訪客首次點入系統、要求綁定之安全防禦機制。

---

## 3. 系統可執行核心功能 API 分佈（準備端到端測試）

後端 `doPost` 控制器目前已將所有業務邏輯「物件模組化」，你可以透過以下 API Action 執行所有端到端測試：

### 📣 A. 公開模組 (Public Service) — 不需要驗證 Token
1.  **`schedule.public`**：取得健身房所有對外公開期班與課表資訊。
2.  **`announcements`**：取得健身房當前生效的跑馬燈公告。
3.  **`public.getLiffId`**：取得健身房對接之 LINE LIFF App ID。

### 🔑 B. 學員模組 (Member Service) — 需 `member` 權限
1.  **`member.bind`**：首次點入 LIFF，提交「真實姓名 + 生日」進行試算表安全配對綁定。
2.  **`member.getInfo`**：抓取學員所屬班級、出席率、累計請假次數與剩餘補課點數。
3.  **`leave.request`**：學員線上請假（支援下課前隨時請假），並自動觸發「下期學費折抵點數引擎」運算。
4.  **`makeup.available`**：根據學員擁有的請假剩餘點數，自動比對並篩選出有剩餘安全名額的課堂作為「補課推薦選項」。
5.  **`makeup.request`**：學員選擇特定課堂進行補課預約，後端扣減該堂空位、扣減學員點數並寫入歷史。

### 📋 C. 教練模組 (Coach Service) — 需 `coach` 權限
1.  **`coach.getSchedule`**：教練讀取今日與本週的排班課表。
2.  **`coach.checkin`**：教練現場進行學員點名簽到（確認出席、請假、補課狀態）。
3.  **`coach.adjustSession`**：現場人數與系統不符時，教練可直接對出席名單進行**「現場出席校正上報」**，校正資訊會寫入資料庫。

### 👑 D. 管理員模組 (Admin Service) — 需 `admin` 權限
1.  **`admin.createClass`**：管理員在後台建立期班課程（如「星期二 19:00 重訓班」）。
2.  **`admin.generateSessions`**：**「排程自動展開引擎」**。根據期班設定，一鍵自動計算日期並將該期 12 周（或自訂）所有單堂課寫入資料庫，同時**自動批次同步至 Google 日曆**。
3.  **`admin.suspendSession`**：管理員對單堂課進行臨時更動（如：教練請假、單堂停課、更換代課教練），異動將**即時與 Google 日曆自動連動同步**。
4.  **`admin.announcement`**：發布最新的跑馬燈或通知公告。
5.  **`admin.updateRichMenus`**：一鍵將雲端最新的圖文選單按鈕，強制重刷至所有使用者的手機上。
