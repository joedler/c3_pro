# GymOS v4.0 — LINE 官方帳號與圖文選單 (Rich Menu) 終極對接指南

本指南將指引您完成最後的生產環境對接，讓您的 GymOS 智慧健身房系統在實體手機上完美運行！

---

## 🛠️ 步驟一：設定試算表資料庫 Config 參數

您的執行引擎（GAS）現在會直接讀取客戶帳號下的 Google 試算表。請打開該試算表，切換到 **「系統設定 (Config)」** 工作表，並依序填入以下真實的金鑰設定：

| 設定鍵 (Key) | 設定值 (Value) | 說明 |
| :--- | :--- | :--- |
| **`LINE_CHANNEL_ACCESS_TOKEN`** | `eyJhbGciOiJIUzI1Ni...` *(填入你的 LINE Channel Access Token)* | 用於讓後端發送 Flex Message 與進行 Rich Menu 切換。 |
| **`LIFF_ID`** | `200456xxxx-xxxxxx` *(填入你的 LINE LIFF ID)* | 用於產生請假、補課、教練點名的行動端專屬連結。 |

*(填寫完成後，GAS 執行時會自動載入這些實時設定值。)*

---

## 📬 步驟二：對接 LINE Webhook 網址

1. 登入 **[LINE Developers Console](https://developers.line.biz/)**。
2. 點進您的 **Provider** ➡️ 點選您的 **Messaging API Channel**。
3. 切換到 **Messaging API** 頁籤，找到 **`Webhook URL`** 欄位。
4. 點選 Edit，貼上您在個人專案中取得的**全新 Apps Script Web App 網址**。
5. ⚠️ **啟用「Use webhook」開關**（務必開啟！）。
6. 點擊 **Verify** 進行連線測試，若顯示 **`Success`**，代表 Webhook 對接成功！

---

## 🗺️ 步驟三：設計並建立三個角色的圖文選單 (Rich Menu)

為了讓學員、教練、管理員在綁定後能動態切換專屬功能選單，您需要在 LINE Developers 後台（或 LINE 官方帳號管理後台）建立以下三組圖文選單。

### 1. 👤 學員版選單 (RICH_MENU_MEMBER)
*   **按鈕 1：📊 我的課程資訊**
    *   *類型*：`文字 (Message)`
    *   *文字內容*：`我的課程` *(會自動觸發 LineHandler 回傳黑金課務大數據儀表板！)*
*   **按鈕 2：🚫 線上請假**
    *   *類型*：`連結 (URI)`
    *   *網址*：`https://liff.line.me/YOUR_LIFF_ID?mode=leave`
*   **按鈕 3：🔄 跨班補課**
    *   *類型*：`連結 (URI)`
    *   *網址*：`https://liff.line.me/YOUR_LIFF_ID?mode=makeup`

### 2. 📋 教練版選單 (RICH_MENU_COACH)
*   **按鈕 1：🗓️ 今日授課課表**
    *   *類型*：`文字 (Message)`
    *   *文字內容*：`今日課表` *(會自動觸發 LineHandler 回傳教練今日課表！)*
*   **按鈕 2：✍️ 點名出勤校正**
    *   *類型*：`連結 (URI)`
    *   *網址*：`https://liff.line.me/YOUR_LIFF_ID?mode=coach`

### 3. 👑 管理員版選單 (RICH_MENU_ADMIN)
*   **按鈕 1：💻 系統管理主控台**
    *   *類型*：`連結 (URI)`
    *   *網址*：`https://liff.line.me/YOUR_LIFF_ID?mode=admin`

---

## 🚀 步驟四：取得選單 ID 並回填試算表

1. 建立完上述三組選單後，您會獲得三組 Rich Menu ID（格式如 `richmenu-xxxxxxxxxxxx`）。
2. 請將這三組 ID 回填至試算表 **「系統設定 (Config)」** 對應的格子：
    *   `RICH_MENU_MEMBER` ➡️ `richmenu-學員版ID`
    *   `RICH_MENU_COACH` ➡️ `richmenu-教練版ID`
    *   `RICH_MENU_ADMIN` ➡️ `richmenu-管理員版ID`

---

## 📱 實測您的商業級智慧健身房系統！

1. **加好友體驗**：掃描您的 LINE 官方帳號 QR Code 加好友。
2. **歡迎與註冊**：系統會自動發送精美的「歡迎綁定卡片」，點擊開啟註冊頁面，輸入真實姓名與生日送出。
3. **魔術選單切換**：綁定成功的瞬間，**您手機下方的 LINE 圖文選單會自動切換為對應的角色版**！
4. **對話框互動**：在對話框中輸入「`我的課程`」，系統會在一秒內為您畫出**黑金風大數據儀表板**！

恭喜您！您的 GymOS 已經完全正式商業化上線！
