# GymOS v3.0 開發任務清單

- [x] **階段一：本地核心架構建立**
  - [x] 建立 `Setup.ts` 自動資料庫初始化 (11 張 Sheets)
  - [x] 建立 `SheetHelper.ts` 物件化 ORM
  - [x] 建立 `Config.ts` 系統設定快取
  - [x] 建立 `AuthService.ts` LINE Profile 登入認證與 RBAC 權限
  - [x] 建立 `ClassEngine.ts` 開班排程展開與 Google 日曆同步
  - [x] 建立 `Main.ts` CORS 統一 API 路由控制器
  - [x] 執行本地 TypeScript 編譯與型別檢測 (`npm run tc`)

- [ ] **階段二：雲端部署與遠端備份**
  - [ ] 執行 `clasp push` 將程式碼部署到 GAS 雲端
  - [ ] 在 Google 試算表內執行 `setupDatabase()` 初始化資料結構
  - [ ] 執行 `git commit & push` 將程式碼提交至 GitHub 儲存庫

- [ ] **階段三：核心業務邏輯開發**
  - [ ] 實作學員身分綁定與學員資訊 (`MemberService.ts`)
  - [ ] 實作學員請假（下課前皆可請假）與「下期學費折抵規則」引擎 (`LeaveService.ts`)
  - [ ] 實作學員補課媒合與「缺課作廢」限制 (`MakeupService.ts`)
  - [ ] 實作教練現場出席異常校正回報 (`CoachService.ts`)
  - [ ] 實作管理端開班設定與選課學員綁定 (`AdminService.ts`)

- [ ] **階段四：前端 SPA 頁面與 LINE LIFF 整合**
  - [ ] 管理後台開班設定表單
  - [ ] 串接 FullCalendar.js 展示視覺化共享日曆
  - [ ] 學員端 LINE Flex Message 請假/補課步驟引導卡片
