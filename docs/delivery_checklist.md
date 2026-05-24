# GymOS 正式交付檢查清單

本清單用於健身房客戶正式交付、上線前驗收或重要版本更新前的最後確認。  
目標是確保程式、GAS、LINE、LIFF、GitHub Pages、Google Sheets 與 Google Calendar 都處於一致且可交付狀態。

## 1. 版本與範圍確認

- [ ] 確認本次交付客戶名稱、品牌名稱與 LINE 官方帳號正確。
- [ ] 確認本次交付範圍：功能修正、UI 調整、LINE Flex 訊息、資料結構、部署設定或文件更新。
- [ ] 確認 Git 工作區乾淨，沒有未說明的本機變更。
- [ ] 確認 `scratch/`、測試檔、臨時圖片與私密憑證不會被 commit。
- [ ] 記錄本次 Git commit hash。
- [ ] 記錄本次 GAS Web App 版本號。

## 2. GAS 指令碼屬性

正式環境設定集中於 GAS Script Properties，不再放在試算表 `Config/系統設定` 分頁。

- [ ] `SPREADSHEET_ID` 已指向正式客戶試算表。
- [ ] `GCP_SERVICE_ACCOUNT_KEY` 已設定，且 Google Calendar API 可正常使用。
- [ ] `GOOGLE_CALENDAR_ID` 已設定為正式日曆。
- [ ] `LIFF_ID` 已設定為正式 LIFF ID。
- [ ] `LINE_CHANNEL_ACCESS_TOKEN` 已設定為正式 LINE Bot Token。
- [ ] `LINE_CHANNEL_SECRET` 已設定。
- [ ] `RICH_MENU_MEMBER` 已存在且對應學員版圖文選單。
- [ ] `RICH_MENU_COACH` 已存在且對應教練版圖文選單。
- [ ] `RICH_MENU_ADMIN` 已存在且對應管理員版圖文選單。
- [ ] `BRAND_TITLE` 已設定，例如 `C3 Fitness`。
- [ ] `LINE_AUTO_PUSH_RENEW` 已設定為預期值，通常正式初期建議 `false`。
- [ ] `ALLOW_DATABASE_RESET` 未設定、為空或為 `false`；只有重建資料庫時可短暫改為 `true`。
- [ ] 若 OAuth 模式未啟用，`GOOGLE_OAUTH_CLIENT_ID`、`GOOGLE_OAUTH_CLIENT_SECRET`、`GOOGLE_OAUTH_REFRESH_TOKEN` 不影響正式流程。

## 3. Google Sheets 檢查

- [ ] 試算表已共用給系統執行帳號，權限足以讀寫。
- [ ] `Config/系統設定` 分頁已刪除，或確認刪除後系統仍正常。
- [ ] 主要資料分頁存在：學員資料、班級設定、課堂紀錄、選課紀錄、出勤紀錄、請假申請、補課申請、系統公告、教職員資料、教室設定。
- [ ] 欄位標題未被手動改名或刪除。
- [ ] 正式環境不保留測試學員、測試教練或假資料。
- [ ] `ALLOW_DATABASE_RESET` 不留在試算表內。

## 4. Google Calendar 檢查

- [ ] 正式日曆已共用給系統執行帳號或服務帳號。
- [ ] 管理端新增班級或重建課堂時，可建立 Calendar 事件。
- [ ] 請假後，Calendar 課堂描述會更新已請假名單。
- [ ] 補課後，Calendar 課堂描述會更新補課名單。
- [ ] 臨時停課或課程調整會同步 Calendar。

## 5. GitHub Pages / LIFF 檢查

- [ ] GitHub Pages 可開啟：`https://joedler.github.io/c3_pro/`
- [ ] LINE Developers 的 LIFF Endpoint 指向 GitHub Pages，不指向 GAS Web App。
- [ ] Rich Menu 使用 `https://liff.line.me/{LIFF_ID}` 開啟，不直接硬貼 GitHub Pages 參數網址。
- [ ] `img/logo/logo.png` 可由 GitHub Pages 正常載入。
- [ ] `img/rich-menu/member.jpg`、`coach.jpg`、`admin.jpg` 可由 GitHub Pages 正常載入。

## 6. LINE / Rich Menu 檢查

- [ ] 一鍵同步 LINE 圖文選單成功。
- [ ] 學員版 Rich Menu 連到學員首頁。
- [ ] 管理員版 Rich Menu 連到管理端。
- [ ] 教練版 Rich Menu 行為符合目前交付範圍。
- [ ] 學員綁定後，LINE Rich Menu 可切換為學員版。
- [ ] 管理員身分開啟時，可維持管理員版 Rich Menu。
- [ ] LINE 主動推播開關符合 `LINE_AUTO_PUSH_RENEW` 預期。

## 7. 管理端流程

- [ ] 管理端首頁可正常載入。
- [ ] 首頁公告列可顯示與發布公告。
- [ ] 首頁四格數據卡可切換，且明細直接出現、無多餘動畫。
- [ ] 課程列表可查看已開辦課程。
- [ ] 班級經營可查看班級與課堂資料。
- [ ] 繳費確認頁標題顯示「學費確認/課程啟用」。
- [ ] 管理員確認學員繳費後，選課狀態會由待收費審核轉為預排上課或啟用狀態。
- [ ] 齒輪設定只在管理端顯示。
- [ ] 齒輪內不顯示學員不該理解的系統設定。
- [ ] 頁面模式預覽與維護工具仍隱藏於版本號連點 5 次後。

## 8. 學員端流程

- [ ] 學員首頁可正常載入。
- [ ] 學員綁定流程可完成。
- [ ] 學員加課可送出待繳費審核。
- [ ] 管理員確認繳費後，學員課程與時數顯示正確。
- [ ] 學員收到已繳費或課程啟用通知時，內容正確。
- [ ] 我的課表顯示剩餘堂數、已出席、請假、補課與可補額度。
- [ ] 學員端不顯示右上角齒輪。

## 9. 請假與補課規則

- [ ] 請假只能由已綁定且啟用中的學員執行。
- [ ] 請假課堂必須存在，且不可為 `cancelled`。
- [ ] 學員必須有該班級有效選課紀錄。
- [ ] 下課後不可再請假。
- [ ] 同一堂課不可重複請假。
- [ ] 請假成功後會寫入 `Leave_Requests` 與 `Attendance`。
- [ ] 補課只可使用本人已核准、尚未使用的請假紀錄。
- [ ] 補課清單不顯示學員自己的已報名班級。
- [ ] 補課送出端會阻擋補回自己的原班級或已報名班級。
- [ ] 補課目標課堂必須為未來且 `scheduled`。
- [ ] 補課目標班級必須允許補課，且不可為「不固定」難度。
- [ ] 程度與性別限制正常生效。
- [ ] 額滿課堂不出現在可補課清單。

## 10. LINE Flex / 通知檢查

- [ ] 學員已繳費收據通知內容正確。
- [ ] 課程啟用通知內容正確。
- [ ] 請假成功通知內容正確。
- [ ] 補課成功通知內容正確。
- [ ] Flex 訊息品牌名稱、Logo、配色與 C3 風格一致。
- [ ] Flex 訊息不暴露不必要的內部 ID、Token 或管理資訊。
- [ ] LINE 免費推播額度與主動通知策略已確認。

## 11. 效能與快取檢查

- [ ] 管理端首頁載入時間約在可接受範圍內。
- [ ] 學員端首頁載入時間約在可接受範圍內。
- [ ] `admin.bootstrap` 正常回傳管理端首頁資料。
- [ ] `member.bootstrap` 正常回傳學員端首頁資料。
- [ ] 學員綁定、加課、請假、補課成功後會清除學員快取。
- [ ] 前端 console 分段計時是否保留，已依交付策略確認。

## 12. 部署流程

- [ ] 執行 `npm.cmd run tc` 通過。
- [ ] 執行 `npm.cmd run deploy`。
- [ ] Tailwind CSS build 成功。
- [ ] `src/web/index.html` 已同步到 `src/gas/index.html`。
- [ ] `clasp push` 成功。
- [ ] `clasp deploy -i ...` 是更新既有部署，不是新增部署。
- [ ] Web App URL 維持不變。
- [ ] Git commit 成功。
- [ ] Git push 成功。

## 13. 部署後冒煙測試

- [ ] 開啟正式管理端。
- [ ] 開啟正式學員端。
- [ ] 從 LINE Rich Menu 開啟學員首頁。
- [ ] 測試管理端首頁、學員首頁、請假、補課。
- [ ] 測試學員加課、管理員確認繳費、課程啟用。
- [ ] 確認 GAS Logs 沒有連續錯誤。
- [ ] 確認 GitHub Pages 圖片沒有 404。

## 14. 客戶交付資料

- [ ] 提供管理員入口。
- [ ] 提供 LINE 官方帳號使用方式。
- [ ] 提供管理員手冊。
- [ ] 提供學員使用指南。
- [ ] 提供本次 Release Note。
- [ ] 列出目前已知限制與延後項目。
- [ ] 確認上線後支援窗口與聯絡方式。
