export default async function handler(req, res) {
  const PAGE_ID = process.env.PAGE_ID;
  const PAGE_TOKEN = process.env.FB_ACCESS_TOKEN;
  const DEBUG = req.query.debug !== undefined;
  const POST_ID = req.query.postId || null;

  try {
    let postId = POST_ID;
    if (!postId) {
      const postRes = await fetch(`https://graph.facebook.com/${PAGE_ID}/posts?access_token=${PAGE_TOKEN}&limit=1`);
      const postData = await postRes.json();
      postId = postData?.data?.[0]?.id;
      if (!postId) return res.status(404).json({ error: '找不到贴文（API 返回空）', raw: postData });
    }

    // 检查是否已抽过奖
    const existingComments = await fetch(`https://graph.facebook.com/${postId}/comments?access_token=${PAGE_TOKEN}&limit=100`);
    const existingData = await existingComments.json();
    const alreadyDrawn = existingData.data?.some(c =>
      c.message?.includes('本场直播抽奖结果') ||
      c.message?.includes('已自动回复中奖者')
    );

    if (alreadyDrawn && !DEBUG) {
      return res.status(403).json({ error: '⚠️ 本场已抽奖一次，是否确认再次抽奖？加入 ?debug 可重新抽奖' });
    }

    // 抓所有留言
    const allComments = [];
    let next = `https://graph.facebook.com/${postId}/comments?access_token=${PAGE_TOKEN}&fields=id,message,from&limit=100`;

    while (next) {
      const page = await fetch(next);
      const data = await page.json();
      allComments.push(...(data.data || []));
      next = data.paging?.next || null;
    }

    // 筛选有效留言
    const regex = /([1-9][0-9]?)/;
    const valid = [];

    for (const c of allComments) {
      const msg = c.message || '';
      const match = msg.match(regex);
      const uid = c.from?.id;
      const uname = c.from?.name;

      if (!match || !uid || uid === PAGE_ID) continue;

      const number = match[1].padStart(2, '0');
      valid.push({
        commentId: c.id,
        from: { id: uid, name: uname },
        number,
        message: msg
      });
    }

    if (valid.length < 3) {
      return res.status(400).json({ error: '有效留言不足 3 条（需包含号码、访客、非主页）', total: valid.length });
    }

    // 随机抽奖（禁止重复用户与重复号码）
    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    const winners = [];
    const usedIds = new Set();
    const usedNumbers = new Set();

    for (const entry of shuffle(valid)) {
      if (usedIds.has(entry.from.id)) continue;
      if (usedNumbers.has(entry.number)) continue;

      winners.push(entry);
      usedIds.add(entry.from.id);
      usedNumbers.add(entry.number);

      if (winners.length >= 3) break;
    }

    if (winners.length < 3) {
      return res.status(400).json({ error: '无法抽出 3 位不重复用户和号码', total: winners.length });
    }

    // 回复中奖者
    const replyText = `🎉🎊 恭喜你获得折扣卷 RM100.00 🎉🎊\n🎉🎉 Congratulations! You’ve won a RM100 discount voucher! 🎉🎉\n⚠️⚠️ 只限今天直播兑现，逾期无效 ⚠️⚠️\n⚠️⚠️ Valid only during today’s live stream. ⚠️⚠️\n❌❌ 不得转让 ❌❌\n❌❌ Non-transferable ❌❌`;

    const results = [];

    for (const winner of winners) {
      const commentId = winner.commentId;
      const replyRes = await fetch(`https://graph.facebook.com/${commentId}/comments?access_token=${PAGE_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: replyText })
      });

      const replyData = await replyRes.json();
      results.push({ ...winner, reply: replyData });

      await new Promise(r => setTimeout(r, 2000));
    }

    // 公布总结果
    const list = winners.map(w => `- @[${w.from.id}](${w.from.name}) ${w.number}`).join('\n');
    const summary = `🎉🎊 本场直播抽奖结果 🎉🎊\n系统已自动回复中奖者：\n${list}\n⚠️ 请查看你的号码下是否有回复！⚠️\n⚠️ 只限今天直播兑现，逾期无效 ⚠️`;

    const postRes = await fetch(`https://graph.facebook.com/${postId}/comments?access_token=${PAGE_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: summary })
    });

    if (DEBUG) {
      return res.status(200).json({ debug: true, postId, winners, results });
    }

    return res.status(200).json({ success: true, winners, replied: results });

  } catch (err) {
    console.error('抽奖错误:', err);
    return res.status(500).json({ error: '服务器错误', details: err.message });
  }
}
