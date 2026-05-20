/**
 * testMakeup.ts
 * 用於診斷補課篩選邏輯不匹配的臨時測試指令 (PRD v3.0)
 */

function testDiagnoseMakeup(logFn?: (msg: string) => void) {
  const log = logFn || ((msg: string) => Logger.log(msg));
  try {
    const members = SheetHelper.getRows<any>('Members');
    const member = members.find(m => m.status === 'active');
    
    if (!member) {
      log('❌ 診斷失敗：Members 表中沒有任何 active 學員！');
      return;
    }

    log(`=========================================`);
    log(`👤 開始診斷學員: ${member.real_name} (${member.member_id})`);
    log(`   - LINE UID: ${member.line_uid}`);
    log(`   - 級別: ${member.level}`);
    log(`   - 性別: ${member.gender}`);
    log(`=========================================`);

    // 2. 找到該學員的任一筆已核准請假紀錄
    const leaves = SheetHelper.getRows<any>('Leave_Requests').filter(
      l => l.member_id === member.member_id && l.status === 'approved'
    );
    
    if (leaves.length === 0) {
      log('⚠️ 警告：該學員在 Leave_Requests 表中沒有任何已核准 (approved) 的請假紀錄！');
      log('   請先在請假紀錄表中將該學員的請假狀態改為 approved 以便進行補課測試。');
      return;
    }

    const testLeave = leaves[0];
    log(`📝 匹配到的請假紀錄 ID: ${testLeave.leave_id}`);
    log(`   - 原始課堂 ID: ${testLeave.session_id}`);

    // 3. 診斷級別解析
    const memberLevelNum = MakeupService['getLevelNumber'](member.level);
    log(`   - 解析學員級別分數: ${memberLevelNum}`);

    // 4. 逐一檢驗 Classes 中的班級
    const allClasses = SheetHelper.getRows<any>('Classes');
    log(`\n📚 班級篩選診斷 (總共 ${allClasses.length} 個班級)：`);
    
    const validClassIds = new Set<string>();
    
    allClasses.forEach(c => {
      const classLevelNum = MakeupService['getLevelNumber'](c.level);
      let passed = true;
      let reason = 'OK';

      if (c.status !== 'active' && c.status !== 'open') {
        passed = false;
        reason = `狀態為 '${c.status}' (非 active 或 open)`;
      } else if (c.allow_makeup !== true && String(c.allow_makeup).toLowerCase() !== 'true') {
        passed = false;
        reason = `開放補課 (allow_makeup) 為 '${c.allow_makeup}' (非 true)`;
      } else if (memberLevelNum < classLevelNum) {
        passed = false;
        reason = `級別不符：學員等級 (${member.level}) < 班級等級 (${c.level})`;
      } else if (member.gender === '男' && c.gender_limit === 'female') {
        passed = false;
        reason = `性別限制：男生不能選女性專班`;
      }

      log(`   * 班級 [${c.class_id}] ${c.class_name}: [${passed ? '🟢 通過' : '🔴 排除'}] - 原因: ${reason} (班級級別數: ${classLevelNum})`);
      if (passed) {
        validClassIds.add(c.class_id);
      }
    });

    if (validClassIds.size === 0) {
      log('\n❌ 診斷結論：沒有任何班級通過篩選條件！');
      return;
    }

    // 5. 逐一檢驗 Sessions 課堂
    const now = new Date();
    const allSessions = SheetHelper.getRows<any>('Sessions');
    log(`\n🗓️ 課堂篩選診斷 (總共 ${allSessions.length} 個課堂)：`);
    
    let scheduledCount = 0;
    let futureCount = 0;
    let passedCount = 0;

    allSessions.forEach(s => {
      if (!validClassIds.has(s.class_id)) return;
      
      scheduledCount++;
      let sessionStart: Date;
      try {
        const parts = String(s.session_date).split('T')[0].split('-');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        sessionStart = new Date(year, month, day);
        
        let hours = 0;
        let minutes = 0;
        if (s.start_time) {
          const tParts = String(s.start_time).trim().replace('上午', '').replace('下午', '').split(':');
          if (tParts.length >= 2) {
            hours = parseInt(tParts[0], 10);
            minutes = parseInt(tParts[1], 10);
            if (String(s.start_time).includes('下午') && hours < 12) hours += 12;
            else if (String(s.start_time).includes('上午') && hours === 12) hours = 0;
          }
        }
        sessionStart.setHours(hours, minutes, 0, 0);
      } catch(e: any) {
        log(`   * 課堂 [${s.session_id}] 日期時間解析失敗: ${e.message || e}`);
        return;
      }

      const isFuture = sessionStart > now;
      if (isFuture) futureCount++;

      const isScheduled = s.status === 'scheduled';
      const passed = isFuture && isScheduled;

      if (passed) passedCount++;

      log(`   * 課堂 [${s.session_id}] 日期: ${s.session_date} ${s.start_time} - 狀態: ${s.status} - 是否在未來: ${isFuture ? '是' : '否'} - [${passed ? '🟢 通過' : '🔴 排除'}]`);
    });

    log(`\n📊 課堂診斷統計：`);
    log(`   - 符合班級的課堂總數: ${scheduledCount}`);
    log(`   - 其中在未來的課堂數: ${futureCount}`);
    log(`   - 通過篩選 (狀態為 scheduled 且在未來) 的課堂數: ${passedCount}`);
    log(`=========================================`);

  } catch (error: any) {
    log('❌ 診斷發生異常錯誤：' + (error.message || error));
  }
}
