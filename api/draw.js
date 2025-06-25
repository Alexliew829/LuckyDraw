export default async function handler(req, res) {
  const PAGE_ID = process.env.PAGE_ID;
  const PAGE_TOKEN = process.env.FB_ACCESS_TOKEN;
  const DEBUG = req.query.debug !== undefined;

  try {
    // 获取最新贴文 ID
    const postRes = await fetch(`https://graph.facebook.com/${PAGE_ID}/posts?access_token=${PAGE_TOKEN}&limit=1`);
    const postData = await postRes.json();
    const postId = postData?.data?.[0]?.id;

    if (!postId) {
      return res.status(404).json({ error: '无法获取贴文 ID', raw: postData });
    }

    // 获取所有留言
    const allComments = [];
    let nextPage = `https://graph.facebook.com/${postId}/comments?access_token=${PAGE_TOKEN}&fields=id,message,from&limit=100`;

    while (nextPage) {
      const res = await fetch(nextPage);
      const data = await res.json();
      allComments.push(...(data.data || []));
      nextPage = data.paging?.next || null;
    }

    // 筛选有效留言
    const validEntries = [];
    const regex = /\b([1-9][0-9]?)\b/;

    for (const comment of allComments) {
      const msg = comment.message || '';
      const match = msg.match(regex);
      const userId = comment.from?.id || null;
      const userName = comment.from?.name || null;

      if (!match || userId === PAGE_ID) continue;

      const number = match[1].padStart(2, '0');

      validEntries.push({
        commentId: comment.id,
        from: userId ? { id: userId, name: userName } : null,
        number,
        message: msg,
      });
    }

    // 随机抽出 3 个不同访客 + 不同号码
    function shuffle(array) {
      let i = array.length;
      while (i) {
        const j = Math.floor(Math.random() * i--);
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    }

    const winners = [];
    const usedUserIds = new Set();
    const usedNumbers = new Set();

    for (const entry of shuffle(validEntries)) {
      const uniqueUserKey = entry.from?.id || entry.commentId;
      if (usedUserIds.has(uniqueUserKey)) continue;
      if (usedNumbers.has(entry.number)) continue;

      winners.push(entry);
      usedUserIds.add(uniqueUserKey);
      usedNumbers.add(entry.number);
      if (winners.length === 3) break;
    }

    if (winners.length < 3) {
      return res.status(400).json({
        error: '有效留言不足 3 条（需不同访客与不同号码）',
        total: validEntries.length,
      });
    }

    // 回复中奖人
    const replyMessage = `🎉🎊 恭喜你获得折扣卷 RM100.00 🎉🎊\n🎉🎉 Congratulations! You’ve won a RM100 discount voucher! 🎉🎉\n⚠️⚠️ 只限今天直播兑现，逾期无效 ⚠️⚠️\n⚠️⚠️ Valid only during today’s live stream. ⚠️⚠️\n❌❌ 不得转让 ❌❌\n❌❌ Non-transferable ❌❌`;

    async function delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    const results = [];

    for (const winner of winners) {
      try {
        const replyRes = await fetch(`https://graph.facebook.com/${winner.commentId}/comments?access_token=${PAGE_TOKEN}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: replyMessage }),
        });
        const replyData = await replyRes.json();
        results.push({ ...winner, reply: replyData });
        await delay(2000);
      } catch (err) {
        results.push({ ...winner, reply: { error: err.message } });
        await delay(2000);
      }
    }

    // 总结留言
    const list = winners.map(w => {
      if (w.from?.id && w.from?.name) {
        return `@\[${w.from.id}](${w.from.name}) ${w.number}`;
      } else {
        return `匿名用户 ${w.number}`;
      }
    }).join('\n');

    const summary = `🎉🎊 恭喜三位得奖者,获得折扣卷 RM100.00 🎊🎉\n${list}\n⚠️⚠️ 只限今天直播兑现，逾期无效 ⚠️⚠️`;

    const summaryRes = await fetch(`https://graph.facebook.com/${postId}/comments?access_token=${PAGE_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: summary }),
    });

    if (DEBUG) {
      return res.status(200).json({
        postId,
        totalValid: validEntries.length,
        winners,
        summaryStatus: await summaryRes.json(),
      });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('错误:', err);
    return res.status(500).json({ error: '服务器错误', detail: err.message });
  }
}
