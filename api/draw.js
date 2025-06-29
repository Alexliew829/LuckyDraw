let lastDrawTime = 0; // 用于判断是否重复抽奖

export default async function handler(req, res) {
  const DEBUG = req.query.debug !== undefined;

  // 限制：同一场直播只允许每次确认后再抽一次
  if (!DEBUG && Date.now() - lastDrawTime < 10000) {
    return res.status(200).json({ alreadyDrawn: true, message: '已经抽奖一次，确认要再次抽奖？' });
  }

  try {
    // 来自 Make 场景传入的留言数组（POST 请求）
    const allEntries = req.body.comments || [];

    // 从 message 中提取号码
    const validEntries = [];
    const usedIds = new Set();
    const usedNumbers = new Set();
    const regex = /(?:^|\\D)([1-9][0-9]?)(?:\\D|$)/; // 匹配 01~99，支持 B01、a-88 等格式

    for (const entry of allEntries) {
      const message = entry.message || '';
      const match = message.match(regex);
      if (!match) continue;

      const number = match[1].padStart(2, '0'); // 补齐两位
      const uid = entry.user_id || entry.comment_id || message;

      if (usedIds.has(uid)) continue;
      if (usedNumbers.has(number)) continue;

      validEntries.push({
        user_name: entry.user_name || '匿名用户',
        number
      });

      usedIds.add(uid);
      usedNumbers.add(number);

      if (validEntries.length === 3) break;
    }

    if (validEntries.length < 3 && !DEBUG) {
      return res.status(400).json({ error: '有效留言不足 3 条（需不同访客与号码）', total: validEntries.length });
    }

    const resultLines = validEntries.map(v => `${v.user_name} ${v.number}`).join('\\n');

    const summary = `🎉🎊 本场直播抽奖结果 🎉🎊\\n系统已自动回复中奖者：\\n${resultLines}\\n⚠️ 请查看你的号码下是否有回复！⚠️\\n⚠️ 只限今天直播兑现，逾期无效 ⚠️`;

    lastDrawTime = Date.now(); // 更新最后抽奖时间

    return res.status(200).json({
      success: true,
      winners: validEntries,
      summary
    });

  } catch (err) {
    return res.status(500).json({ error: '服务器错误', details: err.message });
  }
}
