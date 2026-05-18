/**
 * Main.ts
 * Google Apps Script Web App 統一入口路由與 CORS 控制 (PRD v3.0)
 */

function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.Content.TextOutput {
  try {
    const action = e.parameter.action;
    
    // 定義公開 API 路由 (不需要驗證 Token)
    const publicRoutes: Record<string, () => any> = {
      'schedule.public': () => {
        // TODO: 實作 ScheduleService.getPublic()
        return { message: '取得公開課表成功 (Stub)' };
      },
      'announcements': () => {
        // TODO: 實作 AnnouncementService.getActive()
        return { message: '取得最新公告成功 (Stub)' };
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

function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  try {
    // 1. 安全解析 Payload
    if (!e.postData || !e.postData.contents) {
      return respond(400, { error: '缺少 POST Body' });
    }

    const payload = JSON.parse(e.postData.contents);

    // 2. 特殊處理 LINE Webhook 事件 (由 LINE 伺服器主動發送)
    if (payload.events) {
      // TODO: 實作 LineHandler.process(payload)
      return respond(200, { message: 'LINE Webhook 接收成功' });
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
        if (!data || !data.sessionIds || !data.reason) {
          throw new Error('缺少必要參數 (sessionIds / reason)');
        }
        ClassEngine.suspendSessions(data.sessionIds, data.reason, data.substituteCoachUid || null);
        return { message: '已成功停課/調整課程，並同步至 Google 日曆' };
      },
      'admin.announcement': () => {
        AuthService.requireRole(user, ['admin']);
        return AdminService.createAnnouncement(data, user);
      }
    };

    if (!routes[action]) {
      return respond(400, { error: `未授權或未知的 Action: ${action}` });
    }

    // 執行對應模組邏輯
    const responseData = routes[action]();
    return respond(200, responseData);

  } catch (error) {
    Logger.log(`[doPost 出錯] ${error instanceof Error ? error.message : error}`);
    return respond(500, { error: error instanceof Error ? error.message : '系統內部錯誤' });
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
