export default async function handler(req, res) {
  const DEBUG = req.query.debug !== undefined;

  try {
    // 模拟留言数据（你要用自己的留言来源替代这部分）
    const mockComments = [
      { comment_id: 'c1', message: '我要88', user_id: '111', user_name: 'Alex', number: '88' },
      { comment_id: 'c2', message: '我选50', user_id: '222', user_name: 'Ben', number: '50' },
      { comment_id: 'c3', message: 'B01中我了', user_id: '333', user_name: 'Sky', number: '1' },
      // 可添加更多模拟数据
    ];

    const allEntries = mockComments; // 实际中请替换为你系统传来的留言数据

    // 筛选有效留言：1~99 号码，去除重复 user 和重复号码
    const validEntries = [];
    const usedIds = new Set();
    const usedNumbers = new Set();

    for (const entry of allEntries) {
      const { user_id, number } = entry;
      const uid = user_id || entry.comment_id; // 匿名 fallback

      const numValue = parseInt(number);
      if (isNaN(numValue) || numValue < 1 || numValue > 99) continue;
      if (usedIds.has(uid)) continue;
      if (usedNumbers.has(number)) continue;

      validEntries.push(entry);
      usedIds.add(uid);
      usedNumbers.add(number);
      if (validEntries.length === 3) break;
    }

    if (validEntries.length < 3 && !DEBUG) {
      return res.status(400).json({ error: '有效留言不足 3 条（需不同访客与号码）', total: validEntries.length });
    }

    // 生成中奖列表内容
    const resultLines = validEntries.map(entry => {
      if (entry.user_id && entry.user_name) {
        return `- @[${entry.user_id}](${entry.user_name}) ${entry.number}`;
      } else {
        return `- 第一个留言 ${entry.number}`;
      }
    }).join('\n');

    const summary = `🎉🎊 本场直播抽奖结果 🎉🎊\n系统已自动回复中奖者：\n${resultLines}\n⚠️ 请查看你的号码下是否有回复！⚠️\n⚠️ 只限今天直播兑现，逾期无效 ⚠️`;

    return res.status(200).json({ success: true, winners: validEntries, message: summary });

  } catch (err) {
    return res.status(500).json({ error: '服务器错误', details: err.message });
  }
}
