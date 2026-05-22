# 後台「批次核收學費」與「手動/自動輪詢更新」實現計劃

本計劃旨在為 GymOS 管理後台升級高負載運營支援，包含：
1. **「一鍵全選 + 批次確認已繳費」**：管理員能勾選多個待繳費學員，透過單次優化 API 完成批量核收與日曆同步。
2. **「🔄 手動刷新按鈕 + 30 秒自動輪詢」**：免去管理人頻繁重開視窗的繁瑣，實現實時數據大屏般的主動更新。

---

## Proposed Changes

### 1. 後端優化與批次 API (Google Apps Script)

#### [MODIFY] [Main.ts](file:///d:/_LINE%20BOT/_C3_PRO/src/gas/Main.ts)
1. 在 `routes` 門控中註冊全新的管理員 Action: `'admin.batchConfirmPayments'`。
2. 實作 `'admin.batchConfirmPayments'` 方法：
   * **輸入**：接收待繳費項目陣列 `items: Array<{ classId: string; memberId: string }>`。
   * **批量寫入**：讀取 `Enrollments` 試算表，定位匹配的行，直接批量修改狀態為 `'active'` 並填入計算出的應繳堂數。
   * **落盤保障**：執行 `SpreadsheetApp.flush()` 強制所有狀態變更即時存檔。
   * **日曆去重同步**：收集所有涉及到的獨特 `classId`，僅針對這些班級的未來 `scheduled` 課堂調用 `ClassEngine.syncCalendarEvent` 進行同步，防止重複調用 Calendar API。
   * **發送 Flex Message 收據**：為所有成功確認繳費的學員發送「C3 Fitness 繳費證明」LINE Flex Message。
   * **回傳**：回傳成功核收的人數與明細。

---

### 2. 前端 UI 重構與輪詢機制 (index.html)

#### [MODIFY] [index.html](file:///d:/_LINE%20BOT/_C3_PRO/src/web/index.html)

##### 1. 「一鍵全選與批次核收」前端實作：
* 在管理員「💰 學費」頁面的待繳費表格中，新增「複選框」欄位：
  * 表頭 Checkbox：一鍵全選/取消全選所有目前的待繳費項目。
  * 每列 Checkbox：個別勾選該項目，綁定至 Vue data 陣列 `selectedEnrollments`。
* 表格上方新增亮眼的 **「🚀 批量確認已繳費 (已選 {count} 筆)」** 按鈕（僅在 `selectedEnrollments.length > 0` 時啟用）。
* 點擊時，跳出高質感確認 Modal。確認後，調用 `apiCall('admin.batchConfirmPayments', { items: [...] })`，發送全局 Loading 遮罩並顯示 Toast 提示進度。

##### 2. 「🔄 手動刷新與 30 秒自動輪詢」機制：
* **手動刷新按鈕**：
  * 在管理員控制面板頂部（或導航列右側）加入一個優雅的「🔄 重新整理」浮動或固定按鈕。
  * 點擊時，觸發 `loadInitialData()`，並為刷新圖示套用 HSL 漸層旋轉的 `spin` 微動畫，增強科技質感與操作回饋。
* **30 秒定時自動輪詢**：
  * 在 Vue `mounted` 生命週期中，若檢測到是管理員，啟動一個 `setInterval` 定時器，每 30 秒執行一次 `loadInitialData()`。
  * **智慧型效能防護 (Tab Visibility Detection)**：輪詢觸發前，先判斷 `document.visibilityState === 'visible'`。若管理員最小化視窗或切換到其他瀏覽器分頁，則自動暫停輪詢，防止無謂消耗 GAS 運算配額與 Google API 額度。
  * **定時器銷毀**：在 `beforeUnmount` 生命週期或當管理員切換角色時，徹底清除 `setInterval` 定時器，避免內存洩漏。

---

## Verification Plan

### Automated & Manual Verification
1. **複選控制測試**：
   * 進入管理後台的「💰 學費」分頁。
   * 點選表頭複選框，確認全部待繳費項目皆被勾選。再次點選，確認全部取消勾選。
   * 勾選其中兩筆，確認「批量確認已繳費 (已選 2 筆)」按鈕由灰轉綠啟用。
2. **批次繳費核查與日曆同步測試**：
   * 勾選多位待繳費學員，點擊「批量確認已繳費」。
   * **預期結果 1**：所有選取學員的 LINE 立刻收到「C3 Fitness 繳費證明」Flex 卡片。
   * **預期結果 2**：Google 試算表 `Enrollments` 的狀態瞬間轉為 `active`。
   * **預期結果 3**：Google 日曆中，該班級的出席名單與人數即時增加，且**沒有發生任何 API 重複寫入報錯**。
3. **🔄 手動重新整理測試**：
   * 點擊右上角「🔄」按鈕，確認旋轉微動畫正常播放，且資料列表無閃爍完成就地重新整理。
4. **自動輪詢測試**：
   * 開啟管理頁面，用另一部手機綁定新學員。
   * **預期結果**：在不點選任何按鈕、不關閉視窗的情況下，管理頁面的待繳費名單在 30 秒內自動彈出該新學員，體驗完全即時！
