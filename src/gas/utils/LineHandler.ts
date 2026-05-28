/**
 * LineHandler.ts
 * 處理 LINE Webhook 官方對話框事件、Flex Message 卡片發送與選單切換 (PRD v3.0)
 */

class LineHandler {
  private static readonly C3_GOLD = '#F5B400';
  private static readonly C3_SURFACE = '#FFFCF6';
  private static readonly C3_TEXT = '#0F172A';
  private static readonly C3_MUTED = '#64748B';
  private static readonly C3_LINE = '#E7DEC9';

  private static flexRow(label: string, value: string, valueColor: string = LineHandler.C3_TEXT): any {
    return {
      type: 'box',
      layout: 'horizontal',
      spacing: 'md',
      contents: [
        { type: 'text', text: label, size: 'xs', color: this.C3_MUTED, flex: 3 },
        { type: 'text', text: value || '-', size: 'xs', color: valueColor, weight: 'bold', flex: 7, wrap: true }
      ]
    };
  }

  private static buildC3InfoCard(data: {
    title: string;
    subtitle?: string;
    accentColor?: string;
    rows?: any[];
    note?: string;
    buttonLabel?: string;
    buttonUri?: string;
    secondaryButtonLabel?: string;
    secondaryMessage?: string;
  }): any {
    const accentColor = data.accentColor || this.C3_GOLD;
    const bodyContents: any[] = [
      {
        type: 'box',
        layout: 'horizontal',
        contents: [
          {
            type: 'box',
            layout: 'vertical',
            width: '40px',
            height: '40px',
            cornerRadius: '10px',
            backgroundColor: '#0A0A0A',
            alignItems: 'center',
            justifyContent: 'center',
            contents: [
              { type: 'text', text: 'C3', color: this.C3_GOLD, weight: 'bold', size: 'sm', align: 'center' }
            ]
          }
        ]
      },
      {
        type: 'text',
        text: data.title,
        weight: 'bold',
        size: 'xl',
        color: this.C3_TEXT,
        margin: 'lg',
        wrap: true
      }
    ];

    if (data.subtitle) {
      bodyContents.push({
        type: 'text',
        text: data.subtitle,
        wrap: true,
        size: 'xs',
        color: this.C3_MUTED,
        margin: 'md'
      });
    }

    if (data.rows && data.rows.length > 0) {
      bodyContents.push({ type: 'separator', margin: 'lg', color: this.C3_LINE });
      bodyContents.push({
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        margin: 'lg',
        contents: data.rows
      });
    }

    if (data.note) {
      bodyContents.push({ type: 'separator', margin: 'lg', color: this.C3_LINE });
      bodyContents.push({
        type: 'text',
        text: data.note,
        wrap: true,
        size: 'xxs',
        color: this.C3_MUTED,
        margin: 'md'
      });
    }

    const footerContents: any[] = [];
    if (data.buttonLabel && data.buttonUri) {
      footerContents.push({
        type: 'button',
        action: { type: 'uri', label: data.buttonLabel, uri: data.buttonUri },
        style: 'primary',
        color: accentColor
      });
    }
    if (data.secondaryButtonLabel && data.secondaryMessage) {
      footerContents.push({
        type: 'button',
        action: { type: 'message', label: data.secondaryButtonLabel, text: data.secondaryMessage },
        style: 'secondary'
      });
    }

    const bubble: any = {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        height: '8px',
        paddingAll: '0px',
        backgroundColor: accentColor,
        contents: [{ type: 'filler' }]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: bodyContents,
        backgroundColor: this.C3_SURFACE
      }
    };

    if (footerContents.length > 0) {
      bubble.footer = {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: footerContents,
        backgroundColor: this.C3_SURFACE
      };
    }

    return bubble;
  }

  public static buildPaymentActivationFlex(member: any, cls: any, totalSessions: number): any {
    const liffId = Config.get('LIFF_ID');
    const startDate = this.safeFormatSessionDate(cls.period_start);
    return this.buildC3InfoCard({
      title: '學費確認 / 課程啟用',
      subtitle: `${member.real_name || '學員'} 您好，系統已完成繳費確認，您的課程已正式啟用。`,
      accentColor: '#10B981',
      rows: [
        this.flexRow('課程班級', cls.class_name || '健身課程'),
        this.flexRow('課程難度', String(cls.level || '-')),
        this.flexRow('本期堂數', `${totalSessions} 堂`, '#10B981'),
        this.flexRow('開始日期', startDate)
      ],
      note: '課程已轉為預排上課，請依課表時間準時出席。',
      buttonLabel: '查看我的課程',
      buttonUri: `https://liff.line.me/${liffId}?mode=leave`
    });
  }

  public static buildAnnouncementFlex(title: string, content: string, type: string = 'info'): any {
    const liffId = Config.get('LIFF_ID');
    const isAlert = type === 'alert';
    return this.buildC3InfoCard({
      title: isAlert ? '重要公告通知' : '公告通知',
      subtitle: title,
      accentColor: isAlert ? '#E11D48' : this.C3_GOLD,
      rows: [
        this.flexRow('公告內容', content)
      ],
      buttonLabel: '開啟會員中心',
      buttonUri: `https://liff.line.me/${liffId}`
    });
  }

  public static buildRenewalReminderFlex(member: any, cls: any, newStartDate: string): any {
    const liffId = Config.get('LIFF_ID');
    return this.buildC3InfoCard({
      title: '自動續期 / 待繳費提醒',
      subtitle: `${member.real_name || '學員'} 您好，系統已為您保留新一期課程名額。`,
      accentColor: this.C3_GOLD,
      rows: [
        this.flexRow('續期班級', cls.class_name || '健身課程'),
        this.flexRow('新期首日', newStartDate),
        this.flexRow('目前狀態', '待確認繳費', '#F59E0B')
      ],
      note: '完成繳費並由管理員確認後，課程會正式啟用。',
      buttonLabel: '查看我的課程',
      buttonUri: `https://liff.line.me/${liffId}?mode=leave`
    });
  }

  private static buildServiceCenterFlex(role: 'admin' | 'coach' | 'member' | 'guest', liffId: string): any {
    if (role === 'admin') {
      return this.buildC3InfoCard({
        title: 'C3 Fitness 管理端服務中心',
        subtitle: '管理員可從後台查看首頁摘要、課程列表、班級經營與繳費確認。',
        accentColor: '#F5B400',
        rows: [
          this.flexRow('管理後台', '首頁摘要、課程列表、繳費確認'),
          this.flexRow('LINE 管理', '同步圖文選單、公告通知')
        ],
        buttonLabel: '開啟管理後台',
        buttonUri: `https://liff.line.me/${liffId}?mode=admin`,
        secondaryButtonLabel: '同步/更新選單權限',
        secondaryMessage: '同步選單'
      });
    }
    if (role === 'coach') {
      return this.buildC3InfoCard({
        title: 'C3 Fitness 教練服務中心',
        subtitle: '教練可查詢今日課表，確認授課時段與學員異動。',
        accentColor: '#111827',
        rows: [
          this.flexRow('授課查詢', '輸入「今日課表」查看 Google 行事曆'),
          this.flexRow('權限同步', '輸入「同步選單」更新教練選單')
        ],
        secondaryButtonLabel: '查看今日課表',
        secondaryMessage: '今日課表'
      });
    }
    if (role === 'guest') {
      return this.buildC3InfoCard({
        title: '請先完成帳號綁定',
        subtitle: '系統尚未辨識您的身份，請先完成安全綁定。',
        accentColor: '#7C3AED',
        buttonLabel: '一鍵安全綁定',
        buttonUri: `https://liff.line.me/${liffId}?mode=bind`
      });
    }
    return this.buildC3InfoCard({
      title: 'C3 Fitness 會員服務中心',
      subtitle: '查詢課程、線上請假、預約補課都可從會員中心進入。',
      accentColor: this.C3_GOLD,
      rows: [
        this.flexRow('課程查詢', '課表、堂數、請假與補課紀錄'),
        this.flexRow('線上服務', '請假申請、補課預約、選單同步')
      ],
      buttonLabel: '進入我的會員中心',
      buttonUri: `https://liff.line.me/${liffId}`,
      secondaryButtonLabel: '同步/更新選單權限',
      secondaryMessage: '同步選單'
    });
  }

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

    const welcomeFlex = this.buildC3InfoCard({
      title: '歡迎加入 / 請綁定',
      subtitle: '加入 LINE 官方帳號後，請先完成學員帳號安全綁定。',
      accentColor: '#7C3AED',
      rows: [
        this.flexRow('綁定用途', '課程查詢、線上請假、補課預約'),
        this.flexRow('需要資料', '真實姓名與生日')
      ],
      note: '完成綁定後，系統會為您建立課務資料與個人化圖文選單。',
      buttonLabel: '綁定我的學員帳號',
      buttonUri: bindUrl
    });

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
    const liffId = Config.get('LIFF_ID');

    // 3. 攔截教練自定義「我是教練」綁定流程
    if (cleanText.indexOf('我是教練') !== -1) {
      const namePart = cleanText.replace('我是教練', '').trim();
      const staffRows = SheetHelper.getRows<any>('Staff');
      
      if (!namePart) {
        // 沒有輸入名字，進行智慧自動匹配
        const pendingStaff = staffRows.filter(s => (!s.line_uid || s.line_uid === '') && s.status === 'active');
        if (pendingStaff.length === 1) {
          const target = pendingStaff[0];
          SheetHelper.updateRow('Staff', 'staff_id', target.staff_id, {
            line_uid: userId
          });
          LineRichMenu.link(userId, 'coach');
          const flexBubble = this.buildC3InfoCard({
            title: '教練綁定成功',
            subtitle: `${target.real_name} 教練您好，系統已自動匹配您的教練檔案並完成 LINE UID 對接。`,
            accentColor: '#111827',
            rows: [
              this.flexRow('目前身份', '授課教練'),
              this.flexRow('LINE UID', userId)
            ],
            note: '請接著輸入「同步選單」，即可開通最新的教練專屬功能。',
            secondaryButtonLabel: '同步選單',
            secondaryMessage: '同步選單'
          });
          this.sendReply(replyToken, [{ type: 'flex', altText: '教練綁定成功', contents: flexBubble }]);
          return;
        } else if (pendingStaff.length > 1) {
          const names = pendingStaff.map(s => s.real_name).join('、');
          const flexBubble = this.buildC3InfoCard({
            title: '教練綁定需要姓名',
            subtitle: '系統目前有多位教練尚未綁定，請輸入完整姓名完成精準綁定。',
            accentColor: '#F5B400',
            rows: [
              this.flexRow('待綁定教練', names),
              this.flexRow('輸入格式', `我是教練 ${pendingStaff[0].real_name}`)
            ]
          });
          this.sendReply(replyToken, [{ type: 'flex', altText: '請輸入教練姓名完成綁定', contents: flexBubble }]);
          return;
        } else {
          const flexBubble = this.buildC3InfoCard({
            title: '教練綁定異常',
            subtitle: '系統目前沒有尚未綁定的教練資料。',
            accentColor: '#E11D48',
            note: '請管理員先在教練資料中建立資料，並保持 LINE 帳號 ID 欄位空白。'
          });
          this.sendReply(replyToken, [{ type: 'flex', altText: '教練綁定異常', contents: flexBubble }]);
          return;
        }
      } else {
        // 有輸入名字，進行精準匹配
        const target = staffRows.find(s => s.real_name === namePart);
        if (target) {
          if (target.line_uid && target.line_uid !== userId) {
            const reply = `⚠️ 教練「${namePart}」在系統中已被其他 LINE 帳號綁定。若有疑問請洽管理員。`;
            this.sendReply(replyToken, [{ type: 'text', text: reply }]);
            return;
          }
          SheetHelper.updateRow('Staff', 'staff_id', target.staff_id, {
            line_uid: userId
          });
          LineRichMenu.link(userId, 'coach');
          const flexBubble = this.buildC3InfoCard({
            title: '教練綁定成功',
            subtitle: `${target.real_name} 教練您好，系統已完成您的 LINE 帳號對接。`,
            accentColor: '#111827',
            rows: [
              this.flexRow('目前身份', '授課教練'),
              this.flexRow('LINE UID', userId)
            ],
            note: '請接著輸入「同步選單」，即可開通最新的教練專屬功能。',
            secondaryButtonLabel: '同步選單',
            secondaryMessage: '同步選單'
          });
          this.sendReply(replyToken, [{ type: 'flex', altText: '教練綁定成功', contents: flexBubble }]);
          return;
        } else {
          const flexBubble = this.buildC3InfoCard({
            title: '教練綁定異常',
            subtitle: `找不到姓名為「${namePart}」的教練預設資料。`,
            accentColor: '#E11D48',
            note: '請確認姓名是否與管理員在教練資料中填寫的完全一致。'
          });
          this.sendReply(replyToken, [{ type: 'flex', altText: '教練綁定異常', contents: flexBubble }]);
          return;
        }
      }
    }

    // 0.5 攔截學員首次註冊綁定自動回覆
    if (cleanText.indexOf('【GymOS 帳號綁定】') !== -1) {
      const member = SheetHelper.getRow<any>('Members', 'line_uid', userId);
      if (member) {
        const enrollments = SheetHelper.getRows<any>('Enrollments')
          .filter(e => e.member_id === member.member_id)
          .sort((a, b) => b.enrollment_id.localeCompare(a.enrollment_id));
        
        if (enrollments.length > 0) {
          const lastEnroll = enrollments[0];
          const cls = SheetHelper.getRow<any>('Classes', 'class_id', lastEnroll.class_id);
          const className = cls ? cls.class_name : '未設定班級';
          const totalSessions = cls ? (Number(cls.total_sessions) || (Number(cls.period_weeks) * Number(cls.sessions_per_week))) : 0;
          
          const flexBubble = this.buildC3InfoCard({
            title: '學員綁定 / 選課成功',
            subtitle: `${member.real_name} 您好，帳號已完成安全綁定，並建立待繳費選課紀錄。`,
            accentColor: '#059669',
            rows: [
              this.flexRow('預約班級', className),
              this.flexRow('本期堂數', `${totalSessions} 堂`),
              this.flexRow('選課狀態', '待確認繳費', '#F59E0B')
            ],
            note: '管理員確認繳費後，課程會正式啟用並轉為預排上課。',
            buttonLabel: '進入我的課程',
            buttonUri: `https://liff.line.me/${liffId}?mode=leave`
          });

          this.sendReply(replyToken, [{ type: 'flex', altText: '帳號綁定與選課預約成功', contents: flexBubble }]);
          return;
        }
      }
    }

    // 0.6 攔截學員加選課程自動回覆
    if (cleanText.indexOf('【GymOS 加選課程】') !== -1) {
      const member = SheetHelper.getRow<any>('Members', 'line_uid', userId);
      if (member) {
        const enrollments = SheetHelper.getRows<any>('Enrollments')
          .filter(e => e.member_id === member.member_id)
          .sort((a, b) => b.enrollment_id.localeCompare(a.enrollment_id));

        if (enrollments.length > 0) {
          const lastEnroll = enrollments[0];
          const cls = SheetHelper.getRow<any>('Classes', 'class_id', lastEnroll.class_id);
          const className = cls ? cls.class_name : '未設定班級';
          const totalSessions = cls ? (Number(cls.total_sessions) || (Number(cls.period_weeks) * Number(cls.sessions_per_week))) : Number(lastEnroll.total_paid_sessions || 0);
          const flexBubble = this.buildC3InfoCard({
            title: '加選課程完成',
            subtitle: `${member.real_name} 您好，已為您建立加選課程紀錄，等待管理員確認繳費。`,
            accentColor: '#059669',
            rows: [
              this.flexRow('加選班級', className),
              this.flexRow('本期堂數', `${totalSessions} 堂`),
              this.flexRow('目前狀態', '待確認繳費', '#F59E0B')
            ],
            note: lastEnroll.notes || '管理員確認繳費後，課程會正式啟用。',
            buttonLabel: '查看我的課程',
            buttonUri: `https://liff.line.me/${liffId}?mode=leave`
          });

          this.sendReply(replyToken, [{ type: 'flex', altText: '加選課程完成，等待繳費確認', contents: flexBubble }]);
          return;
        }
      }
    }

    // 1. 攔截請假自動回覆
    if (cleanText.indexOf('【GymOS 請假申請】') !== -1) {
      const member = SheetHelper.getRow<any>('Members', 'line_uid', userId);
      if (member) {
        const leaves = SheetHelper.getRows<any>('Leave_Requests')
          .filter(l => l.member_id === member.member_id)
          .sort((a, b) => b.leave_id.localeCompare(a.leave_id)); // 依 LV ID 排序取最新
        
        if (leaves.length > 0) {
          const lastLeave = leaves[0];
          const session = SheetHelper.getRow<any>('Sessions', 'session_id', lastLeave.session_id);
          const cls = session ? SheetHelper.getRow<any>('Classes', 'class_id', session.class_id) : null;
          const className = cls ? cls.class_name : '健身課程';
          const sessionDate = session ? this.safeFormatSessionDate(session.session_date) : '未知日期';
          const sessionTime = session ? `${this.safeFormatTime(session.start_time)} ~ ${this.safeFormatTime(session.end_time)}` : '未知時間';
          
          const flexBubble = this.buildC3InfoCard({
            title: '請假登記成功',
            subtitle: `${member.real_name} 您好，系統已完成請假登記並自動釋出補課額度。`,
            accentColor: '#F5B400',
            rows: [
              this.flexRow('請假課程', className),
              this.flexRow('課程時間', `${sessionDate} ${sessionTime}`),
              this.flexRow('請假單號', lastLeave.leave_id, '#F5B400')
            ],
            note: '可於會員中心使用此補課額度預約其他可補課班級。',
            buttonLabel: '進入我的課表',
            buttonUri: `https://liff.line.me/${liffId}?mode=leave`
          });
          
          this.sendReply(replyToken, [{ type: 'flex', altText: 'GymOS 請假完成通知信', contents: flexBubble }]);
          return;
        }
      }
    }

    // 2. 攔截補課自動回覆
    if (cleanText.indexOf('【GymOS 補課預約】') !== -1) {
      const member = SheetHelper.getRow<any>('Members', 'line_uid', userId);
      if (member) {
        const makeups = SheetHelper.getRows<any>('Makeup_Requests')
          .filter(m => m.member_id === member.member_id)
          .sort((a, b) => b.makeup_id.localeCompare(a.makeup_id)); // 依 MK ID 排序取最新
        
        if (makeups.length > 0) {
          const lastMakeup = makeups[0];
          const session = SheetHelper.getRow<any>('Sessions', 'session_id', lastMakeup.target_session_id);
          const cls = session ? SheetHelper.getRow<any>('Classes', 'class_id', session.class_id) : null;
          const className = cls ? cls.class_name : '健身課程';
          const sessionDate = session ? this.safeFormatSessionDate(session.session_date) : '未知日期';
          const sessionTime = session ? `${this.safeFormatTime(session.start_time)} ~ ${this.safeFormatTime(session.end_time)}` : '未知時間';
          
          const flexBubble = this.buildC3InfoCard({
            title: '補課預約成功',
            subtitle: `${member.real_name} 您好，補課時段已寫入您的個人課表。`,
            accentColor: '#3B82F6',
            rows: [
              this.flexRow('補課班級', className),
              this.flexRow('補課時間', `${sessionDate} ${sessionTime}`),
              this.flexRow('補課單號', lastMakeup.makeup_id, '#3B82F6')
            ],
            note: '請準時出席，現場直接向授課教練點名即可。',
            buttonLabel: '展開我的課表',
            buttonUri: `https://liff.line.me/${liffId}?mode=leave`
          });
          
          this.sendReply(replyToken, [{ type: 'flex', altText: 'GymOS 補課預約成功通知', contents: flexBubble }]);
          return;
        }
      }
    }

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

    if (cleanText === '更新' || cleanText === '同步選單') {
      const staff = SheetHelper.getRow<any>('Staff', 'line_uid', userId);
      const member = SheetHelper.getRow<any>('Members', 'line_uid', userId);
      
      let resolvedRole: 'admin' | 'coach' | 'member' | 'guest' = 'guest';
      let realName = '';
      
      if (staff && String(staff.status).trim().toLowerCase() === 'active') {
        const cleanRole = String(staff.role).trim().toLowerCase();
        const isAdmin = cleanRole === 'admin' || cleanRole.includes('管理');
        resolvedRole = isAdmin ? 'admin' : 'coach';
        realName = staff.real_name || '教職員';
      } else if (member && String(member.status).trim().toLowerCase() === 'active') {
        resolvedRole = 'member';
        realName = member.real_name || '學員';
      }
      
      // 執行 LINE 伺服器圖文選單綁定
      if (resolvedRole === 'guest') {
        try {
          LineRichMenu.unlink(userId);
        } catch(e) {}
        const notBoundFlex = this.buildServiceCenterFlex('guest', liffId);
        this.sendReply(replyToken, [{ type: 'flex', altText: '請先完成 GymOS 帳號綁定', contents: notBoundFlex }]);
        return;
      }
      
      // 綁定對應選單
      try {
        LineRichMenu.link(userId, resolvedRole);
      } catch(e) {
        Logger.log(`[LINE RichMenu綁定出錯] ${e}`);
      }
      
      const roleNameMap = {
        admin: '👑 系統管理員 (Admin)',
        coach: '📋 授課教練 (Coach)',
        member: '📊 學員 (Member)'
      };
      
      const syncFlex = this.buildC3InfoCard({
        title: '選單同步更新成功',
        subtitle: `${realName} 您好，系統已完成最新圖文選單綁定。`,
        accentColor: '#059669',
        rows: [
          this.flexRow('目前權限', roleNameMap[resolvedRole])
        ],
        note: '請關閉此對話視窗並重新進入，即可看見新的功能按鈕鍵盤。'
      });
      
      this.sendReply(replyToken, [{ type: 'flex', altText: '選單更新成功', contents: syncFlex }]);
      return;
    }

    const member = SheetHelper.getRow<any>('Members', 'line_uid', userId);
    const staff = SheetHelper.getRow<any>('Staff', 'line_uid', userId);

    // (A) 若學員或職員皆未綁定
    if (!member && !staff) {
      const notBoundFlex = this.buildServiceCenterFlex('guest', liffId);

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
      const calendarId = Config.get('GOOGLE_CALENDAR_ID') || 'primary';
      const calendarUrl = `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(calendarId)}`;
      
      const coachFlex = this.buildC3InfoCard({
        title: '教練今日課表',
        subtitle: `${staff.real_name || '教練'} 您好，請用 Google 日曆開啟並訂閱 C3 課程日曆。`,
        accentColor: '#111827',
        rows: [
          this.flexRow('操作方式', '開啟 Google 日曆並加入/訂閱'),
          this.flexRow('顯示內容', '課堂時間、教室、出席與請假補課名單')
        ],
        note: '若手機已安裝 Google 日曆，系統通常會優先以 App 開啟；若未安裝則會以瀏覽器開啟。',
        buttonLabel: '訂閱/開啟 Google 日曆',
        buttonUri: calendarUrl
      });

      this.sendReply(replyToken, [
        {
          type: 'flex',
          altText: '教練授課日程表已備妥',
          contents: coachFlex
        }
      ]);
      return;
    }

    // (C) 若為學員指令
    if (member && (text === '我的課程' || text === '請假補課')) {
      const mainLiffUrl = `https://liff.line.me/${liffId}`;

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

      const dashboardFlex = this.buildC3InfoCard({
        title: '我的課程 / 課務摘要',
        subtitle: `${member.real_name} 您好，以下是您目前的課務統計摘要。`,
        accentColor: this.C3_GOLD,
        rows: [
          this.flexRow('所屬班級', classNames),
          this.flexRow('已上堂數', `${attendances.length} 堂`, '#059669'),
          this.flexRow('累計請假', `${leaves.length} 次`, '#E11D48'),
          this.flexRow('已補課', `${makeups.length} 次`, '#2563EB')
        ],
        buttonLabel: '開啟會員中心',
        buttonUri: mainLiffUrl
      });

      this.sendReply(replyToken, [
        {
          type: 'flex',
          altText: '您的學員課務儀表板已為您準備妥當',
          contents: dashboardFlex
        }
      ]);
      return;
    }

    // (D) 預設幫助引導依身份分流，避免管理員收到會員中心卡片
    let fallbackRole: 'admin' | 'coach' | 'member' = 'member';
    if (staff && String(staff.status).trim().toLowerCase() === 'active') {
      const cleanRole = String(staff.role).trim().toLowerCase();
      fallbackRole = (cleanRole === 'admin' || cleanRole.includes('管理')) ? 'admin' : 'coach';
    }
    const helpBubble = this.buildServiceCenterFlex(fallbackRole, liffId);

    this.sendReply(replyToken, [
      {
        type: 'flex',
        altText: 'C3 Fitness 服務選單',
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

  /**
   * 向特定 LINE 用戶主動推送訊息 (Push Message API)
   */
  public static pushMessage(userId: string, messages: any[]): void {
    const token = Config.get('LINE_CHANNEL_ACCESS_TOKEN');
    if (!token || token === 'YOUR_LINE_TOKEN') {
      Logger.log('[LINE Push] 尚未配置 LINE_CHANNEL_ACCESS_TOKEN，跳過推送。');
      return;
    }
    
    const url = 'https://api.line.me/v2/bot/message/push';
    const payload = {
      to: userId,
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
    Logger.log(`[LINE Push回傳] To: ${userId}, Code: ${response.getResponseCode()}, Body: ${response.getContentText()}`);
  }

  /**
   * 向所有加好友之用戶群發廣播訊息 (Broadcast Message API)
   */
  public static broadcastMessage(messages: any[]): void {
    const token = Config.get('LINE_CHANNEL_ACCESS_TOKEN');
    if (!token || token === 'YOUR_LINE_TOKEN') {
      Logger.log('[LINE Broadcast] 尚未配置 LINE_CHANNEL_ACCESS_TOKEN，跳過廣播。');
      return;
    }
    
    const url = 'https://api.line.me/v2/bot/message/broadcast';
    const payload = {
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
    Logger.log(`[LINE Broadcast回傳] Code: ${response.getResponseCode()}, Body: ${response.getContentText()}`);
  }

  private static safeFormatSessionDate(dateVal: any): string {
    if (!dateVal) return '';
    if (dateVal instanceof Date) {
      return Utilities.formatDate(dateVal, 'Asia/Taipei', 'yyyy-MM-dd');
    }
    const d = new Date(dateVal);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, 'Asia/Taipei', 'yyyy-MM-dd');
    }
    return String(dateVal).substring(0, 10);
  }

  private static safeFormatTime(timeVal: any): string {
    if (!timeVal) return '';
    if (timeVal instanceof Date) {
      return Utilities.formatDate(timeVal, 'Asia/Taipei', 'HH:mm');
    }
    return String(timeVal).trim();
  }
}
