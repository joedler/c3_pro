/**
 * Main.ts
 * Google Apps Script Web App 統一入口路由與 CORS 控制 (PRD v3.0)
 */

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🛠️ GymOS 管理工具')
    .addItem('🖼️ 一鍵更新 LINE 圖文選單', 'uiUpdateRichMenus')
    .addItem('🗃️ 一鍵重置資料庫與課程種子', 'uiResetDatabaseAndSeed')
    .addToUi();
}

/**
 * 專屬提供給 Google Sheets UI 選單使用的「一鍵重置資料庫並寫入課程種子」按鈕
 */
function uiResetDatabaseAndSeed() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('⚠️ 警告', '確定要初始化（清除）所有資料表，並導入最新的 17 班課程種子資料嗎？', ui.ButtonSet.YES_NO);
  if (response === ui.Button.YES) {
    try {
      setupDatabase();
      seedClasses();
      ui.alert('🎉 成功！資料表結構已全部重建，且 17 班課程種子已成功匯入！');
    } catch (e) {
      ui.alert('❌ 重置失敗：' + (e instanceof Error ? e.message : e));
    }
  }
}

function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.Content.TextOutput {
  try {
    const action = e.parameter.action;
    
    // 定義公開 API 路由 (不需要驗證 Token)
    const publicRoutes: Record<string, () => any> = {
      'schedule.public': () => {
        return PublicService.getPublicSchedule();
      },
      'announcements': () => {
        return PublicService.getActiveAnnouncements();
      },
      'public.getLiffId': () => {
        return { liffId: Config.get('LIFF_ID') };
      }
    };

    if (!action || !publicRoutes[action]) {
      return respond(400, { error: `未知的 action: ${action}` });
    }

    const result = publicRoutes[action]();
    return respond(200, result);
  } catch (error) {
    return respond(500, { error: error instanceof Error ? error.message : '系統內部錯誤' });
  }
}

function doPost(e: GoogleAppsScript.Events.DoPost): any {
  try {
    // 1. 安全解析 Payload
    if (!e.postData || !e.postData.contents) {
      return respond(400, { error: '缺少 POST Body' });
    }

    const payload = JSON.parse(e.postData.contents);

    // 2. 特殊處理 LINE Webhook 事件 (由 LINE 伺服器主動發送)
    if (payload.events) {
      LineHandler.process(payload);
      // 隱式回傳 200 OK 空白內容，徹底避免 GAS ContentService 302 重新導向與超時問題！
      return;
    }

    // 3. 一般前端 Web App (LIFF) 的 API 請求
    const { action, token, data } = payload;
    
    if (!action) {
      return respond(400, { error: '缺少 action 參數' });
    }

    // 4. 用戶身份驗證 (取得 UID 與 Role)
    const user = AuthService.verify(token);

    // 5. API 門控路由分發 (根據 Action 比對 Role)
    const routes: Record<string, () => any> = {
      // --- 學員模組 ---
      'classes.available': () => {
        // 免登入門控，供綁定流程的步驟 3 動態獲取可用班級時段
        return MemberService.getAvailableClasses(data);
      },
      'member.bind': () => {
        return MemberService.bind(data, user);
      },
      'member.getInfo': () => {
        return MemberService.getInfo(user);
      },
      'leave.request': () => {
        AuthService.requireRole(user, ['member']);
        return LeaveService.request(data, user);
      },
      'makeup.request': () => {
        AuthService.requireRole(user, ['member']);
        return MakeupService.request(data, user);
      },
      'makeup.available': () => {
        AuthService.requireRole(user, ['member']);
        return MakeupService.getAvailable(data, user);
      },

      // --- 教練模組 ---
      'coach.getSchedule': () => {
        AuthService.requireRole(user, ['coach']);
        return CoachService.getSchedule(data, user);
      },
      'coach.checkin': () => {
        AuthService.requireRole(user, ['coach']);
        return CoachService.checkin(data, user);
      },
      'coach.adjustSession': () => {
        AuthService.requireRole(user, ['coach']);
        return CoachService.adjustSession(data, user);
      },

      // --- 管理員模組 ---
      'admin.getSessions': () => {
        AuthService.requireRole(user, ['admin']);
        const sessions = SheetHelper.getRows<any>('Sessions');
        return sessions
          .filter(s => s.status !== 'cancelled')
          .map(s => {
            let formattedDate = '';
            try {
              if (s.date) {
                const d = new Date(s.date);
                if (!isNaN(d.getTime())) {
                  formattedDate = d.toISOString().split('T')[0];
                }
              }
            } catch(e) {}
            return {
              sessionId: s.session_id,
              classId: s.class_id,
              className: s.class_name,
              date: formattedDate || String(s.date).substring(0, 10),
              startTime: s.start_time,
              endTime: s.end_time
            };
          })
          .sort((a, b) => b.date.localeCompare(a.date)); // Sort descending by date
      },
      'admin.createClass': () => {
        AuthService.requireRole(user, ['admin']);
        return AdminService.createClass(data, user);
      },
      'admin.generateSessions': () => {
        AuthService.requireRole(user, ['admin']);
        if (!data || !data.classId) {
          throw new Error('缺少 classId 參數');
        }
        const result = ClassEngine.generate(data.classId);
        return { message: '課堂排程展開與 Google 日曆批次同步成功', data: result };
      },
      'admin.suspendSession': () => {
        AuthService.requireRole(user, ['admin']);
        if (!data || !data.reason) {
          throw new Error('缺少必要參數 (reason)');
        }
        
        const extendWeeks = Number(data.extendWeeks) || 0;
        const grantMakeupPoints = data.grantMakeupPoints === true || String(data.grantMakeupPoints).toLowerCase() === 'true';

        if (data.suspendDate) {
          // 整日停課一日
          const allSessions = SheetHelper.getRows<any>('Sessions');
          const targetSessionIds = allSessions
            .filter(s => {
              if (s.status === 'cancelled') return false;
              // 比對日期字串
              const sDateStr = String(s.date || s.session_date).substring(0, 10);
              return sDateStr === data.suspendDate;
            })
            .map(s => s.session_id);
          
          if (targetSessionIds.length > 0) {
            ClassEngine.suspendSessions(targetSessionIds, data.reason, null, extendWeeks, grantMakeupPoints);
          }
          return { message: `成功將 ${data.suspendDate} 當日全部 ${targetSessionIds.length} 堂班級課堂停課一日！` };
        } else if (data.sessionIds) {
          ClassEngine.suspendSessions(data.sessionIds, data.reason, data.substituteCoachUid || null, extendWeeks, grantMakeupPoints);
          return { message: '已成功停課/調整課程，並同步至 Google 日曆' };
        } else {
          throw new Error('缺少必要參數 (sessionIds 或 suspendDate)');
        }
      },
      'admin.announcement': () => {
        AuthService.requireRole(user, ['admin']);
        return AdminService.createAnnouncement(data, user);
      },
      'admin.updateRichMenus': () => {
        AuthService.requireRole(user, ['admin']);
        setupRichMenus();
        return { message: '圖文選單重新建立與圖片同步成功' };
      }
    };

    if (!routes[action]) {
      return respond(400, { error: `未授權或未知的 Action: ${action}` });
    }

    // 執行對應模組邏輯
    const responseData = routes[action]();
    return respond(200, responseData);

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    Logger.log(`[doPost 出錯] ${errMsg}`);
    
    // 支援規格書 v2.0 的自訂 REST 狀態碼 (如 409, 422)
    if (errMsg.indexOf('409:') === 0) {
      return respond(409, { error: errMsg.substring(4) });
    }
    if (errMsg.indexOf('422:') === 0) {
      return respond(422, { error: errMsg.substring(4) });
    }
    
    return respond(500, { error: errMsg });
  }
}

/**
 * 統一格式化 JSON 輸出，並自動處理 GAS CORS 機制
 */
function respond(status: number, data: any): GoogleAppsScript.Content.TextOutput {
  const output = JSON.stringify({ status, data });
  return ContentService
    .createTextOutput(output)
    .setMimeType(ContentService.MimeType.JSON);
}
