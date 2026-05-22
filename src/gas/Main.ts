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

function doGet(e: GoogleAppsScript.Events.DoGet): any {
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
      },
      'public.diagnose': () => {
        const token = e.parameter.token;
        let staffRows: any[] = [];
        let memberRows: any[] = [];
        try {
          staffRows = SheetHelper.getRows<any>('Staff');
        } catch(e){}
        try {
          memberRows = SheetHelper.getRows<any>('Members');
        } catch(e){}
        
        let resolvedUser: any = null;
        let verificationError: string | null = null;
        if (token) {
          try {
            resolvedUser = AuthService.verify(token);
          } catch(err) {
            verificationError = err instanceof Error ? err.message : String(err);
          }
        }
        
        return {
          systemLiffId: Config.get('LIFF_ID'),
          inputToken: token || null,
          resolvedUser: resolvedUser,
          verificationError: verificationError,
          staffCount: staffRows.length,
          staffList: staffRows.map(s => ({
            staff_id: s.staff_id,
            line_uid_length: s.line_uid ? String(s.line_uid).length : 0,
            line_uid_masked: s.line_uid ? (String(s.line_uid).substring(0, 8) + '...' + String(s.line_uid).substring(String(s.line_uid).length - 4)) : null,
            real_name: s.real_name,
            role: s.role,
            status: s.status
          })),
          memberCount: memberRows.length,
          memberListSample: memberRows.slice(0, 10).map(m => ({
            member_id: m.member_id,
            line_uid_length: m.line_uid ? String(m.line_uid).length : 0,
            line_uid_masked: m.line_uid ? (String(m.line_uid).substring(0, 8) + '...' + String(m.line_uid).substring(String(m.line_uid).length - 4)) : null,
            real_name: m.real_name,
            status: m.status
          }))
        };
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

    // 每次前端 API 呼叫時，動態修復並自動完成所有已過期的 scheduled 課堂
    try {
      ClassEngine.autoCompletePastSessions();
    } catch (err) {
      Logger.log(`[系統防呆自動結課錯誤] ${err}`);
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
      'member.getUpcomingSessions': () => {
        AuthService.requireRole(user, ['member']);
        return MemberService.getUpcomingSessions(user);
      },
      'member.getPendingLeaves': () => {
        AuthService.requireRole(user, ['member']);
        return MemberService.getPendingLeaves(user);
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
      'makeup.diagnose': () => {
        const logs: string[] = [];
        const logFn = (msg: string) => { logs.push(msg); Logger.log(msg); };
        try {
          testDiagnoseMakeup(logFn);
        } catch(e: any) {
          logs.push('Error during execution: ' + (e.message || e));
        }
        return { logs };
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
      'admin.resetDatabase': () => {
        AuthService.requireRole(user, ['admin']);
        
        // 安全門控檢驗：驗證是否啟用重置開關
        const allowReset = Config.get('ALLOW_DATABASE_RESET', 'false');
        if (allowReset !== 'true') {
          throw new Error('【權限遭拒】系統目前處於安全鎖定狀態，拒絕重置資料庫！\n請先至後台「系統設定」分頁將 ALLOW_DATABASE_RESET 設定為 true 後再執行！');
        }

        setupDatabase();
        seedClasses();
        return { message: '資料庫初始化與 17 班課程種子成功展開並同步至 Google Calendar！' };
      },
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
      'admin.getClasses': () => {
        AuthService.requireRole(user, ['admin']);
        const classes = SheetHelper.getRows<any>('Classes');
        const staff = SheetHelper.getRows<any>('Staff');
        const rooms = SheetHelper.getRows<any>('Rooms');
        
        return classes.map(c => {
          const coach = staff.find(s => s.line_uid === c.coach_line_uid);
          const room = rooms.find(r => r.room_id === c.room_id);
          
          let formattedStartDate = '';
          try {
            if (c.period_start) {
              const d = new Date(c.period_start);
              if (!isNaN(d.getTime())) {
                formattedStartDate = d.toISOString().split('T')[0];
              }
            }
          } catch(e) {}
          
          return {
            classId: c.class_id,
            className: c.class_name,
            classType: c.class_type,
            level: c.level,
            coachName: coach ? coach.real_name : '未定教練',
            roomName: room ? room.room_name : '未定教室',
            maxCapacity: Number(c.max_capacity) || 0,
            enrolled: Number(c.enrolled) || 0,
            dayOfWeek: c.day_of_week,
            startTime: c.start_time,
            endTime: c.end_time,
            periodStart: formattedStartDate || String(c.period_start).substring(0, 10),
            periodWeeks: Number(c.period_weeks) || 0,
            status: c.status
          };
        });
      },
      'admin.getFormMetaData': () => {
        AuthService.requireRole(user, ['admin']);
        const staff = SheetHelper.getRows<any>('Staff').filter(s => s.status === 'active' && (s.role === 'coach' || s.role === 'admin'));
        const rooms = SheetHelper.getRows<any>('Rooms');
        return {
          coaches: staff.map(s => ({ lineUid: s.line_uid, name: s.real_name })),
          rooms: rooms.map(r => ({ roomId: r.room_id, roomName: r.room_name }))
        };
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
      'admin.renewClass': () => {
        AuthService.requireRole(user, ['admin']);
        if (!data || !data.classId || !data.newStartDate || !data.renewMemberIds) {
          throw new Error('缺少續期必要參數 (classId, newStartDate, renewMemberIds)');
        }
        const result = ClassEngine.renew(
          data.classId,
          data.newStartDate,
          data.renewMemberIds,
          data.termRemark || '續期'
        );
        return { message: '班級續期展開與學員轉移成功', data: result };
      },
      'admin.confirmPayment': () => {
        AuthService.requireRole(user, ['admin']);
        if (!data || !data.classId || !data.memberId) {
          throw new Error('缺少確認繳費必要參數 (classId, memberId)');
        }
        
        const enrollments = SheetHelper.getRows<any>('Enrollments');
        const enrollIdx = enrollments.findIndex(
          e => e.class_id === data.classId && e.member_id === data.memberId && e.status === 'pending_payment'
        );
        
        if (enrollIdx === -1) {
          throw new Error('找不到該學員對應該課程的「待繳費」選課紀錄');
        }

        const cls = SheetHelper.getRow<any>('Classes', 'class_id', data.classId);
        if (!cls) {
          throw new Error('找不到該班級設定');
        }

        const totalSessions = Number(cls.total_sessions || (cls.period_weeks * cls.sessions_per_week));
        
        // 1. 更新選課紀錄狀態為 active 並填入已繳堂數
        const enrollSheet = SheetHelper.getSheet('Enrollments');
        const rowNum = enrollIdx + 2;
        
        const colMap = SheetHelper.COLUMN_MAP['Enrollments'];
        const headers = enrollSheet.getRange(1, 1, 1, enrollSheet.getLastColumn()).getValues()[0];
        const statusCol = headers.indexOf(colMap.status) + 1;
        const paidSessionsCol = headers.indexOf(colMap.total_paid_sessions) + 1;
        
        if (statusCol > 0) {
          enrollSheet.getRange(rowNum, statusCol).setValue('active');
        }
        if (paidSessionsCol > 0) {
          enrollSheet.getRange(rowNum, paidSessionsCol).setValue(totalSessions);
        }

        // 2. 獲取學員 LINE 資訊以進行 LINE Flex Push
        const member = SheetHelper.getRow<any>('Members', 'member_id', data.memberId);
        if (member && member.line_uid) {
          try {
            const flexContent = {
              type: 'bubble',
              size: 'mega',
              header: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: 'C3 Fitness 繳費核點收據 🧾',
                    color: '#ffffff',
                    weight: 'bold',
                    size: 'md'
                  }
                ],
                backgroundColor: '#10b981'
              },
              body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                  {
                    type: 'text',
                    text: `親愛的 ${member.real_name} 您好：`,
                    weight: 'bold',
                    size: 'sm',
                    color: '#1e293b'
                  },
                  {
                    type: 'text',
                    text: '系統已成功核收您下一期班級的學費，課程狀態已正式啟用，祝您上課愉快！',
                    wrap: true,
                    size: 'xs',
                    color: '#475569'
                  },
                  {
                    type: 'separator',
                    margin: 'lg'
                  },
                  {
                    type: 'box',
                    layout: 'vertical',
                    margin: 'lg',
                    spacing: 'sm',
                    contents: [
                      {
                        type: 'box',
                        layout: 'horizontal',
                        contents: [
                          { type: 'text', text: '續期班級', size: 'xs', color: '#64748b', flex: 3 },
                          { type: 'text', text: cls.class_name, size: 'xs', color: '#1e293b', flex: 7, weight: 'bold', wrap: true }
                        ]
                      },
                      {
                        type: 'box',
                        layout: 'horizontal',
                        contents: [
                          { type: 'text', text: '課程難度', size: 'xs', color: '#64748b', flex: 3 },
                          { type: 'text', text: `${cls.level}`, size: 'xs', color: '#1e293b', flex: 7 }
                        ]
                      },
                      {
                        type: 'box',
                        layout: 'horizontal',
                        contents: [
                          { type: 'text', text: '本期堂數', size: 'xs', color: '#64748b', flex: 3 },
                          { type: 'text', text: `${totalSessions} 堂 (共 ${cls.period_weeks} 週)`, size: 'xs', color: '#10b981', flex: 7, weight: 'bold' }
                        ]
                      },
                      {
                        type: 'box',
                        layout: 'horizontal',
                        contents: [
                          { type: 'text', text: '開始日期', size: 'xs', color: '#64748b', flex: 3 },
                          { type: 'text', text: Utilities.formatDate(new Date(cls.period_start), 'Asia/Taipei', 'yyyy-MM-dd'), size: 'xs', color: '#1e293b', flex: 7 }
                        ]
                      }
                    ]
                  }
                ]
              },
              footer: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'button',
                    action: {
                      type: 'uri',
                      label: '📊 查看我的課表與點數',
                      uri: `https://liff.line.me/${Config.get('LIFF_ID')}?mode=leave`
                    },
                    style: 'primary',
                    color: '#10b981'
                  }
                ]
              }
            };

            LineHandler.pushMessage(member.line_uid, [
              {
                type: 'flex',
                altText: 'C3 Fitness 學費繳納成功收據',
                contents: flexContent
              }
            ]);
          } catch(e) {
            Logger.log(`[繳費通知推送失敗] Member: ${member.real_name}, Error: ${e instanceof Error ? e.message : e}`);
          }
        }

        return { message: '學員選課已啟用，繳費收據 Flex Message 已主動發送！' };
      },
      'admin.getPendingPayments': () => {
        AuthService.requireRole(user, ['admin']);
        const enrollments = SheetHelper.getRows<any>('Enrollments').filter(e => e.status === 'pending_payment');
        const members = SheetHelper.getRows<any>('Members');
        const classes = SheetHelper.getRows<any>('Classes');
        
        return enrollments.map(e => {
          const member = members.find(m => m.member_id === e.member_id);
          const cls = classes.find(c => c.class_id === e.class_id);
          
          return {
            classId: e.class_id,
            className: cls ? cls.class_name : '未知班級',
            level: cls ? cls.level : '未知程度',
            memberId: e.member_id,
            realName: member ? member.real_name : '未知學員',
            gender: member ? member.gender : '',
            notes: e.notes,
            enrollDate: e.enroll_date
          };
        });
      },
      'admin.getClassMembers': () => {
        AuthService.requireRole(user, ['admin']);
        if (!data || !data.classId) {
          throw new Error('缺少 classId 參數');
        }
        const enrollments = SheetHelper.getRows<any>('Enrollments').filter(
          e => e.class_id === data.classId && e.status === 'active'
        );
        const members = SheetHelper.getRows<any>('Members');
        return enrollments.map(e => {
          const m = members.find(member => member.member_id === e.member_id);
          return {
            memberId: e.member_id,
            realName: m ? m.real_name : '未知學員',
            gender: m ? m.gender : ''
          };
        });
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
