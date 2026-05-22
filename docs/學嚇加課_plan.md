# 已綁定學員「自主加選班級」設計與實現計劃

本計劃旨在為 GymOS 系統設計並實現一個全新的學員自主選課（加選班級）功能。學員可以直接在 LINE 內部的個人中心瀏覽可用班級，並一鍵加選。加選成功後，選課紀錄會以 `pending_payment` (待繳費) 狀態寫入資料庫，並同步更新班級人數與防止時段衝突。

## User Review Required

> [!IMPORTANT]
> **業務邏輯設計重點：**
> 1. **繳費啟用制 (O2O)**：學員自助加選後，選課狀態為 `pending_payment`，其「我的課表」**暫不會**顯現該班級課程。等到行政收到學費，並在後端「學費核點」點選「確認已繳費」後，狀態才會轉變為 `active` 並正式同步到課表與 Google 日曆！
> 2. **智慧時段衝突偵測**：當學員報名的新班級與其既有已報名班級（含已激活與待繳費的班級）在「星期」與「上課時段」上重疊時，系統會自動阻擋並提示「時段衝突」，防止重複報名。
> 3. **防超額報名（Race Condition 鎖定）**：系統會實時檢查班級容量，若報名已滿則不允許選課。

---

## Proposed Changes

### 1. 後端架構設計 (Google Apps Script)

#### [MODIFY] [MemberService.ts](file:///d:/_LINE%20BOT/_C3_PRO/src/gas/modules/MemberService.ts)
新增兩個核心 API 方法：
1. **`getClassesForEnrollment(user)`**：
   * 獲取該學員可報名的所有班級列表。
   * 過濾掉學員已經報名的班級。
   * 根據學員性別過濾（男性學員過濾限女專班）。
   * 標示哪些班級已額滿 (`full`)。
2. **`enrollNewClass(data: { classId: string }, user)`**：
   * 執行新班級報名。
   * 檢驗班級是否存在且開放報名、檢驗學員性別限制。
   * 實時檢驗剩餘名額。
   * **衝突檢測**：比對新班級上課星期與時間，如果與舊班級衝突，拋出錯誤。
   * 寫入 `Enrollments` 表（`status = 'pending_payment'`, `notes = '學員自主加選'`）。
   * 更新 `Classes` 表中的 `enrolled` 人數 + 1。

#### [MODIFY] [Main.ts](file:///d:/_LINE%20BOT/_C3_PRO/src/gas/Main.ts)
在 `doPost` 的 `routes` 門控路由分發中註冊這兩個全新 action：
*   `'member.getClassesForEnrollment'` (需要 `member` 角色)
*   `'member.enrollNewClass'` (需要 `member` 角色)

---

### 2. 前端介面重構與設計 (HTML / CSS / Alpine.js)

#### [MODIFY] [index.html](file:///d:/_LINE%20BOT/_C3_PRO/src/web/index.html)
1. **導航欄路由切換**：在 Dev Sandbox 中加入「學員加選」頁面切換。
2. **全新選課 UI 面板**：
   * 採用與整體 GymOS 暗黑科技風一致的設計（磨砂玻璃卡片、漸層背景、高對比易讀文字）。
   * 列出所有可加選的班級（包含班級名稱、星期、時間、教練、目前人數/上限、學費堂數）。
   * 針對已額滿的班級，顯示「已額滿」灰色按鈕。
   * 點擊「加選報名」按鈕後，會跳出高質感確認彈窗，並發送 API 請求。
   * 報名成功後，發送 Toast 提示，並自動更新「我的課程」及「學費待繳」列表。

---

## Verification Plan

### Manual Verification
1. **正常加選流程測試**：
   * 使用測試學員身分進入「學員加選」頁面，選擇一個未額滿、未報名且無時段衝突的班級點擊報名。
   * 預期：彈窗提示成功。`Enrollments` 工作表新增一筆 `pending_payment` 紀錄，班級 `enrolled` 數 + 1。
2. **時段衝突測試**：
   * 報名另一個與已選班級時段重疊（例如都是週一 19:00）的班級。
   * 預期：後端拋出衝突警報，前端 Toast 提示「上課時段與您已報名的基礎重訓班級衝突！」並阻擋寫入。
3. **行政收款測試**：
   * 以管理員身分切換到「💰 學費」頁面。
   * 預期：看見該學員剛加選的待繳費班級紀錄。
   * 點擊「確認已繳費」，預期狀態轉為 `active`，並成功開通該課程！
