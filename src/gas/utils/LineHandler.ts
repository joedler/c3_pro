/**
 * LineHandler.ts
 * 處理 LINE Webhook 官方對話框事件、Flex Message 卡片發送與選單切換 (PRD v3.0)
 */

class LineHandler {
  /**
   * 處理 LINE 傳入的 Webhook Payload
   */
  public static process(payload: any): void {
    if (!payload || !payload.events || !Array.isArray(payload.events)) {
      return;
    }

    const token = Config.get('LINE_CHANNEL_ACCESS_TOKEN');
    if (!token || token === 'YOUR_LINE_TOKEN') {
      Logger.log('[LINE Webhook] 尚未配置 LINE_CHANNEL_ACCESS_TOKEN，跳過處理。');
      return;
    }

    payload.events.forEach((event: any) => {
      try {
        const replyToken = event.replyToken;
        const userId = event.source.userId;

        if (!replyToken) return;

        // 🚀 頂級效能優化：如果是 LINE 官方的 Webhook 驗證虛擬事件，直接秒速返回，不進行任何資料庫與外部 API 呼叫！
        if (replyToken === '00000000000000000000000000000000' || userId === 'U00000000000000000000000000000000') {
          Logger.log('[LINE Webhook] 攔截到官方驗證虛擬事件，已秒速快速返回。');
          return;
        }

        if (event.type === 'follow') {
          // 1. 處理新加入好友事件
          this.handleFollowEvent(replyToken, userId);
        } else if (event.type === 'message' && event.message.type === 'text') {
          // 2. 處理文字訊息指令
          const text = event.message.text.trim();
          this.handleTextMessage(replyToken, userId, text);
        }
      } catch (e) {
        Logger.log(`[LINE Event處理錯誤] ${e instanceof Error ? e.message : e}`);
      }
    });
  }

  /**
   * 處理 Follow 事件 (推送歡迎綁定卡片)
   */
  private static handleFollowEvent(replyToken: string, userId: string): void {
    const liffId = Config.get('LIFF_ID');
    const bindUrl = `https://liff.line.me/${liffId}?mode=bind`;

    const welcomeFlex = {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '歡迎使用 GymOS 智慧健身房',
            color: '#ffffff',
            weight: 'bold',
            size: 'md'
          }
        ],
        backgroundColor: '#7c3aed'
      },
      hero: {
        type: 'image',
        url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1000',
        size: 'full',
        aspectRatio: '20:13',
        aspectMode: 'cover'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '您好！為了向您提供精準的課程統計、秒速線上請假與智慧補課預約，請點擊下方按鈕，一秒完成真實姓名與生日安全綁定！',
            wrap: true,
            size: 'sm',
            color: '#475569'
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
              label: '👤 綁定我的學員帳號',
              uri: bindUrl
            },
            style: 'primary',
            color: '#7c3aed'
          }
        ]
      }
    };

    this.sendReply(replyToken, [
      {
        type: 'flex',
        altText: '歡迎加入 GymOS！請綁定您的學員帳號',
        contents: welcomeFlex
      }
    ]);
  }

  /**
   * 處理文字指令事件
   */
  private static handleTextMessage(replyToken: string, userId: string, text: string): void {
    const cleanText = text.trim();
    if (cleanText === '診斷' || cleanText === '我的ID' || cleanText === '身分') {
      const ss = SheetHelper['getSpreadsheet']();
      const ssName = ss.getName();
      const ssId = ss.getId();
      
      const staffRows = SheetHelper.getRows<any>('Staff');
      const sampleStaff = staffRows[0] || {};
      const staffHeaders = Object.keys(sampleStaff).filter(k => k !== '_rowNum');
      
      // 取得前5筆教職員的原始配對資訊
      const staffListDebug = staffRows.slice(0, 5).map(row => 
        `- ID: ${row.staff_id}, UID: ${row.line_uid}, Role: ${row.role}, Status: ${row.status}`
      ).join('\n');
      
      const memberRows = SheetHelper.getRows<any>('Members');
      const sampleMember = memberRows[0] || {};
      const memberHeaders = Object.keys(sampleMember).filter(k => k !== '_rowNum');
      
      const session = AuthService.verify(userId);
      
      const replyMsg = `🤖 GymOS 系統診斷報告\n` +
                       `------------------------\n` +
                       `🔹 您的真實 LINE UID:\n${userId}\n\n` +
                       `🔹 系統識別角色: ${session.role}\n` +
                       `🔹 識別姓名: ${session.name}\n\n` +
                       `🔹 讀取試算表名稱: ${ssName}\n` +
                       `🔹 讀取試算表 ID:\n${ssId}\n\n` +
                       `🔹 教職員表前5筆原始資料:\n${staffListDebug || '無資料'}\n\n` +
                       `🔹 教職員表解析欄位:\n${staffHeaders.join(', ')}`;
                       
      this.sendReply(replyToken, [{ type: 'text', text: replyMsg }]);
      return;
    }

    const member = SheetHelper.getRow<any>('Members', 'line_uid', userId);
    const staff = SheetHelper.getRow<any>('Staff', 'line_uid', userId);
    const liffId = Config.get('LIFF_ID');

    // (A) 若學員或職員皆未綁定
    if (!member && !staff) {
      const bindUrl = `https://liff.line.me/${liffId}?mode=bind`;
      const notBoundFlex = {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '⚠️ 您尚未綁定帳號',
              weight: 'bold',
              size: 'md',
              color: '#dc2626',
              margin: 'md'
            },
            {
              type: 'text',
              text: '目前無法使用課務查詢功能。請先點擊下方連結，填寫真實姓名與生日進行安全綁定！',
              wrap: true,
              size: 'xs',
              color: '#64748b',
              margin: 'lg'
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
                label: '🔑 一鍵安全綁定',
                uri: bindUrl
              },
              style: 'primary',
              color: '#8b5cf6'
            }
          ]
        }
      };

      this.sendReply(replyToken, [
        {
          type: 'flex',
          altText: '請先完成 GymOS 帳號綁定',
          contents: notBoundFlex
        }
      ]);
      return;
    }

    // (B) 若為教練指令
    if (staff && text === '今日課表') {
      const scheduleUrl = `https://liff.line.me/${liffId}?mode=coach`;
      
      const coachFlex = {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: `教練 ${staff.name} — 今日授課`,
              color: '#ffffff',
              weight: 'bold',
              size: 'md'
            }
          ],
          backgroundColor: '#0f172a'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '請點擊下方按鈕進入教練中心。您可以即時查看今日學員出席清單，當發現現場人數不符時，可一鍵進行出席異常校正回報！',
              wrap: true,
              size: 'sm',
              color: '#334155'
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
                label: '📋 進入教練出勤校正中心',
                uri: scheduleUrl
              },
              style: 'primary',
              color: '#0f172a'
            }
          ]
        }
      };

      this.sendReply(replyToken, [
        {
          type: 'flex',
          altText: '教練中心課表已備妥',
          contents: coachFlex
        }
      ]);
      return;
    }

    // (C) 若為學員指令
    if (member && (text === '我的課程' || text === '請假補課')) {
      const leaveUrl = `https://liff.line.me/${liffId}?mode=leave`;
      const makeupUrl = `https://liff.line.me/${liffId}?mode=makeup`;

      // 取得學員課務大數據
      const enrollments = SheetHelper.getRows<any>('Enrollments').filter(
        e => e.member_id === member.member_id && e.status === 'active'
      );
      
      const classNames = enrollments.map(e => {
        const cls = SheetHelper.getRow<any>('Classes', 'class_id', e.class_id);
        return cls ? cls.class_name : '未指派課程';
      }).join(', ') || '無選課紀錄';

      // 撈取出勤紀錄計算已上課堂
      const attendances = SheetHelper.getRows<any>('Attendance').filter(
        a => a.member_id === member.member_id && a.checkin_time && a.checkin_time !== ''
      );

      // 撈取請假與補課記錄
      const leaves = SheetHelper.getRows<any>('Leave_Requests').filter(
        l => l.member_id === member.member_id && l.status === 'approved'
      );
      const makeups = SheetHelper.getRows<any>('Makeup_Requests').filter(
        m => m.member_id === member.member_id && (m.status === 'approved' || m.status === 'completed')
      );

      const dashboardFlex = {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'GymOS 課務大數據儀表板',
              color: '#ffffff',
              weight: 'bold',
              size: 'md'
            }
          ],
          backgroundColor: '#8b5cf6'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'md',
          contents: [
            {
              type: 'text',
              text: `學員姓名: ${member.real_name}`,
              weight: 'bold',
              size: 'sm'
            },
            {
              type: 'text',
              text: `所屬班級: ${classNames}`,
              size: 'xs',
              color: '#4b5563',
              wrap: true
            },
            {
              type: 'separator',
              margin: 'md'
            },
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'md',
              contents: [
                {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    {
                      type: 'text',
                      text: '已上堂數',
                      size: 'xxs',
                      color: '#9ca3af',
                      align: 'center'
                    },
                    {
                      type: 'text',
                      text: `${attendances.length} 堂`,
                      weight: 'bold',
                      size: 'sm',
                      align: 'center',
                      color: '#10b981'
                    }
                  ]
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    {
                      type: 'text',
                      text: '累計請假',
                      size: 'xxs',
                      color: '#9ca3af',
                      align: 'center'
                    },
                    {
                      type: 'text',
                      text: `${leaves.length} 次`,
                      weight: 'bold',
                      size: 'sm',
                      align: 'center',
                      color: '#ef4444'
                    }
                  ]
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  contents: [
                    {
                      type: 'text',
                      text: '已補課',
                      size: 'xxs',
                      color: '#9ca3af',
                      align: 'center'
                    },
                    {
                      type: 'text',
                      text: `${makeups.length} 次`,
                      weight: 'bold',
                      size: 'sm',
                      align: 'center',
                      color: '#3b82f6'
                    }
                  ]
                }
              ]
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'horizontal',
          spacing: 'sm',
          contents: [
            {
              type: 'button',
              action: {
                type: 'uri',
                label: '🚫 線上請假',
                uri: leaveUrl
              },
              style: 'secondary',
              color: '#f3f4f6'
            },
            {
              type: 'button',
              action: {
                type: 'uri',
                label: '🔄 跨班補課',
                uri: makeupUrl
              },
              style: 'primary',
              color: '#8b5cf6'
            }
          ]
        }
      };

      this.sendReply(replyToken, [
        {
          type: 'flex',
          altText: '您的學員課務儀表板已為您準備妥當',
          contents: dashboardFlex
        }
      ]);
      return;
    }

    // (D) 預設幫助引導
    const helpBubble = {
      type: 'bubble',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: '💡 GymOS 快速服務選單',
            weight: 'bold',
            size: 'md'
          },
          {
            type: 'text',
            text: '點擊下方按鈕即可快速查詢您的課務資訊，或進行請假、補課預約與簽到！',
            wrap: true,
            size: 'xs',
            color: '#4b5563',
            margin: 'md'
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            action: {
              type: 'message',
              label: '📊 查詢我的課程資訊',
              text: '我的課程'
            },
            style: 'secondary'
          },
          {
            type: 'button',
            action: {
              type: 'uri',
              label: '🚫 立即線上請假',
              uri: `https://liff.line.me/${liffId}?mode=leave`
            },
            style: 'primary',
            color: '#ef4444'
          }
        ]
      }
    };

    this.sendReply(replyToken, [
      {
        type: 'flex',
        altText: 'GymOS 服務選單',
        contents: helpBubble
      }
    ]);
  }

  /**
   * 向 LINE 伺服器發送 Reply API 回應訊息
   */
  private static sendReply(replyToken: string, messages: any[]): void {
    const token = Config.get('LINE_CHANNEL_ACCESS_TOKEN');
    const url = 'https://api.line.me/v2/bot/message/reply';
    
    const payload = {
      replyToken: replyToken,
      messages: messages
    };

    const options: GoogleAppsScript.URL_Fetch.URLFetchRequestOptions = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: `Bearer ${token}`
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(url, options);
    Logger.log(`[LINE Reply回傳] Code: ${response.getResponseCode()}, Body: ${response.getContentText()}`);
  }
}
