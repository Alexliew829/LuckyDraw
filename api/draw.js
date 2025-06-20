export default async function handler(req, res) {
  const PAGE_ID = process.env.PAGE_ID;
  const PAGE_TOKEN = process.env.FB_ACCESS_TOKEN;
  const DEBUG = req.query.debug !== undefined;

  try {
    // 取得最新贴文 ID
    const postRes = await fetch(`https://graph.facebook.com/${PAGE_ID}/posts?access_token=${PAGE_TOKEN}&limit=1`);
    const postData = await postRes.json();
    const postId = postData?.data?.[0]?.id;
    if (!postId) return res.status(404).json({ error: '无法取得贴文 ID' });

    // 取得所有留言
    let allComments = [], next = `https://graph.facebook.com/${postId}/comments?access_token=${PAGE_TOKEN}&fields=id,message,from&limit=100`;
    while (next) {
      const res = await fetch(next);
      const json = await res.json();
      allComments.push(...(json.data || []));
      next = json.paging?.next || null;
    }

    // 过滤包含 01~99 数字的留言
    const regex = /([1-9][0-9]?)/;
    const valid = [];
    const seenUsers = new Set();
    const seenNumbers = new Set();

    for (const c of allComments) {
      if (!c.message || !regex.test(c.message)) continue;
      const number = c.message.match(regex)[1].padStart(2, '0');
      const uid = c.from?.id || c.id;
      if (seenUsers.has(uid) || seenNumbers.has(number)) continue;
      seenUsers.add(uid);
      seenNumbers.add(number);
      valid.push({ commentId: c.id, number, from: c.from, message: c.message });
      if (valid.length >= 3) break;
    }

    if (valid.length < 3) {
      return res.status(400).json({
        error: '有效留言不足 3 个不同人或号码',
        total: allComments.length
      });
    }

    // 回复中奖者
    const replyText = `🎉🎊 恭喜你获得折扣卷 RM100.00 🎊🎉\n⚠️ 只限今天直播兑现，逾期无效 ⚠️`;
    for (const winner of valid) {
      await fetch(`https://graph.facebook.com/${winner.commentId}/comments?access_token=${PAGE_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyText })
      });
      await new Promise(r => setTimeout(r, 3000));
    }

    const resultText = valid.map(w =>
      w.from?.id && w.from?.name
        ? `@[\`${w.from.id}\`](${w.from.name}) 留言 ${w.number}`
        : `匿名留言 ${w.number}`
    ).join('\n');

    const summary = `🎊 本场直播抽奖结果 🎊\n系统已自动回复中奖者：\n${resultText}\n⚠️ 请查看你的号码下是否有回复！⚠️`;

    await fetch(`https://graph.facebook.com/${postId}/comments?access_token=${PAGE_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: summary })
    });

    return res.status(200).json({ success: true, winners: valid });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: '服务器错误', details: err.message });
  }
}
