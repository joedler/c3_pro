# GymOS v3.0 營運管理升級與自動續期開發計畫

本文件詳細記載了 GymOS v3.0 針對「獨立 GAS 架構」優化、單班獨立開班、一鍵自動續期、學員 Rollover 轉移、以及學費收退點與 LINE 收據推送的完整規劃與實裝清單。

---

## 🎯 升級核心目標

1. **獨立 GAS 架構解耦**：徹底消除舊有的試算表 UI 菜單依賴，將所有系統初始化、重置、以及開班維護功能 100% 移至 **Web App (LIFF) 管理端** 中完成。
2. **極致安全防護 (Reset Lock)**：對極具破壞性的「一鍵重置資料庫」功能實施安全鎖定與雙重門控，確保正式營運數據 100% 安全。
3. **單班精準開班**：解決測試階段的數據生成需求，支援對單一班級進行獨立 Sessions 展開與日曆批次同步，不影響現有學員與點名數據。
4. **自動化期數續期與學員 Rollover**：為健身房打造「新季度/新期數」一鍵續期系統，支持舊學員一鍵帶入，自動標記為 `pending_payment`（待繳費），並在行政確認收費後，自動變更為 `active` 並同步推送 LINE Flex Message 繳費收據。

---

## 📋 系統開發任務清單 (TODO List)

### 1. 🛡️ 「一鍵重置資料庫」安全性降級與防誤觸鎖定
- [ ] **系統開關保護 (Reset Lock)**：
  * 在 `Config` (系統設定) 表格中新增一個鍵值對 `ALLOW_DATABASE_RESET`，預設寫死為 `false`。
- [ ] **後端 API 門控防禦**：
  * 修改 `admin.resetDatabase` API 路由，當且僅當 `ALLOW_DATABASE_RESET` 為 `true` 時才允許執行，否則返回 `403 Forbidden` 錯誤，徹底防範誤觸或惡意呼叫。
- [ ] **維運操作手冊撰寫**：
  * 將「一鍵重置資料庫」的破壞性、災難復原步驟與限制條件，詳細寫入《GymOS 維運操作手冊》，使用 GitHub-style `[!CAUTION]` 紅色高能警示加粗標註。

### 2. ⚡ 「單班獨立開班 / 展開課表」功能實現
- [ ] **後端 API 優化**：
  * 確認並優化現有的 `admin.generateSessions` 路由，確保它在不重置 any 其他表格的情況下，僅針對單一班級進行 Session 展開與 Google 日曆批次同步。
- [ ] **Web App 管理端 UI 整合**：
  * 在管理端「班級設定」列表中，為每一個班級右側新增一個玻璃擬態的 **「⚡ 點擊開班」** 按鈕。
  * 當點擊時，單獨調用後端 `admin.generateSessions`，讓該班級單獨展開 Sessions 寫入試算表並同步 Google Calendar。

### 3. 🔄 「一鍵續期開班」與「學員名單自動轉移 (Rollover)」系統開發
- [ ] **後端 API 新增 (`admin.renewClass`)**：
  * 接收參數：`classId` (班級ID), `newStartDate` (新一期開始日期), `renewMemberIds` (續期學員 ID 陣列), `termRemark` (期數標記)。
  * **Classes 表更新**：將該班的 `period_start` 更新為新日期。
  * **Sessions 累加展開**：續期新一期的 12 週課堂，其課堂序號（Session Seq）自動從前一期的結尾累加（例如 13-24），或使用包含期數的 ID（例如 `SES-A-MON-1900-2026Q3-01`），同步建立 Google 日曆事件。
  * **Enrollments 學員自動續期**：自動為所有勾選學員新增一筆新一期選課紀錄，**狀態設為 `pending_payment` (待繳費)**。
- [ ] **Web App 管理端 🔄 續期 UI 與互動彈窗**：
  * 在班級列表旁，當進度達到 11/12 週時，亮起 **`🔄 一鍵續期`** 按鈕。
  * 點擊按鈕彈出精緻毛玻璃彈窗，提供：
    1. 推算好的新開課日期（預設下一週）。
    2. 勾選帶入的上一期活躍學員清單。
    3. 期數標記輸入框。

### 4. 💵 「學費核點與 LINE 繳費收據」閉環管理
- [ ] **Web App 管理端「學費核點中心」 (Tuition Ledger)**：
  * 條列所有 `pending_payment` 狀態的學員與班級。
  * 提供 **`💰 確認已繳費`** 綠色微動態按鈕。
- [ ] **後端 API 新增 (`admin.confirmPayment`)**：
  * 當點擊確認收費時，自動更新 `Enrollments` 的學員選課狀態為 `active`。
  * **LINE 繳費通知自動推送**：透過 LINE Messaging API 主動推送高質感的 **Flex Message 繳費收據**給該學員（例如：「Joe 您的學費已核點成功！下一期基礎重訓班 (12週) 已成功開通！🎉」）。

---

## 🔮 系統驗證方案

### 1. 單單獨立開班驗證
1. 在 `Classes` 中新增一班，狀態設為 `active`。
2. 在網頁點擊該班級右側的 「⚡ 點擊開班」。
3. 檢查 `Sessions` 工作表是否單獨生成該班級的 12 週課堂，且 Google Calendar 上出現 12 個對應的活動。
4. 檢查 `Members` 與 `Enrollments` 等其他分頁是否 100% 完整無缺。

### 2. 班級續期與 Rollover 驗證
1. 選擇一個已有 2 位活躍正式學員（status = 'active'）的即將結課班級。
2. 點擊 「🔄 一鍵續期」，彈窗中保留這 2 位學員的勾選，設定新開課日期。
3. 檢查 `Enrollments` 是否自動為這 2 位學員新增一筆新一期的紀錄，且 status 為 `pending_payment`。
4. 檢查 `Sessions` 表中的堂數序號是否從上一期的結尾（如 13）開始遞增展開，日曆中順利生成新期活動。

### 3. 學費核點與 LINE Flex 收據推送驗證
1. 進入 Web App 的「學費核點中心」，找到剛剛處於 `pending_payment` 的學員。
2. 點擊 「💰 確認已繳費」。
3. 檢查 `Enrollments` 該筆選課紀錄 status 是否自動變更為 `active`。
4. 檢查該學員的 LINE 視窗是否即時收到精美的繳費成功 Flex 收據。
