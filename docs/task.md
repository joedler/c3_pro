# GymOS v3.0 開發任務清單

- [x] **階段一：本地核心架構建立**
  - [x] 建立 `Setup.ts` 自動資料庫初始化 (11 張 Sheets)
  - [x] 建立 `SheetHelper.ts` 物件化 ORM
  - [x] 建立 `Config.ts` 系統設定快取
  - [x] 建立 `AuthService.ts` LINE Profile 登入認證與 RBAC 權限
  - [x] 建立 `ClassEngine.ts` 開班排程展開與 Google 日曆同步
  - [x] 建立 `Main.ts` CORS 統一 API 路由控制器
  - [x] 執行本地 TypeScript 編譯與型別檢測 (`npm run tc`)

- [x] **階段二：雲端部署與遠端備份**
  - [x] 執行 `clasp push` 將程式碼部署到 GAS 雲端
  - [x] 在 Google 試算表內執行 `setupDatabase()` 初始化資料結構
  - [x] 執行 `git commit & push` 將程式碼提交至 GitHub 儲存庫

- [x] **階段三：核心業務邏輯開發**
  - [x] 實作學員身分綁定與學員資訊 (`MemberService.ts`)
  - [x] 實作學員請假（下課前皆可請假）與「下期學費折抵規則」引擎 (`LeaveService.ts`)
  - [x] 實作學員補課媒合與「缺課作廢」限制 (`MakeupService.ts`)
  - [x] 實作教練現場出席異常校正回報 (`CoachService.ts`)
  - [x] 實作管理端開班設定與選課學員綁定 (`AdminService.ts`)

- [x] **階段四：前端 SPA 頁面與 LINE LIFF 整合**
  - [x] 管理後台開班設定表單與學員預登記
  - [x] 串接 FullCalendar.js 展示視覺化共享日曆名冊
  - [x] 學員端與教練端 LINE LIFF 整合（請假、補課預約、現場出席校正）

- [x] **階段五：實作 v2.0 學員綁定與 17 班課程種子對接**
  - [x] 1. 擴充 `SheetHelper.ts` 與 `Setup.ts` 資料庫欄位（性別、身高、體重、目前人數、性別限制、開放補課）
  - [x] 2. 實作 `Setup.ts` 內 `seedClasses()` 一鍵自動導入 17 班課程種子
  - [x] 3. 實作 `MemberService.ts` 內可用課程時段篩選 API (`classes.available`)，攔截男學員選限女班
  - [x] 4. 重構 `MemberService.bind` 以完整對接 4 步驟綁定資料，寫入 `Enrollments` 且對應 class `enrolled` 自動加 1
  - [x] 5. 本地 TypeScript 型別安全編譯檢測並上傳 GAS (`npm run push`)
  - [x] 6. 進行試算表結構格式化與種子課程聯調測試驗證

- [ ] **階段六：營運管理升級與自動續期開發 (v3.0)**
  * 詳細規劃請參閱：[gym_os_v3_management_upgrade_plan.md](file:///d:/_LINE%20BOT/_C3_PRO/docs/gym_os_v3_management_upgrade_plan.md)
  - [ ] 1. 🛡️ 實施「一鍵重置資料庫」防誤觸安全鎖定及操作手冊編寫
  - [ ] 2. ⚡ 實作 Web App 管理端「單班獨立點擊開班/展開課表」
  - [ ] 3. 🔄 開發後端 `admin.renewClass` API 與 Web App「一鍵自動續期/Rollover」彈窗
  - [ ] 4. 💰 開發 Web App「待核繳學費面板」與收費自動觸發 LINE Flex Message 繳費收據推送
