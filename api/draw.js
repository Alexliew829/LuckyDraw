// pages/api/draw.js
export default async function handler(req, res) {
  const PAGE_ID = process.env.PAGE_ID;
  const PAGE_TOKEN = process.env.FB_ACCESS_TOKEN;
  const DEBUG = req.query.debug !== undefined;
  const POST_ID = req.query.postId || null;

  try {
    let postId = POST_ID;
    if (!postId) {
      const postRes = await fetch(`https://graph.facebook.com/${PAGE_ID}/posts?access_token=${PAGE_TOKEN}&limit=5`);
      const postData = await postRes.json();
      if (!postData?.data?.length) {
        return res.status(404).json({ error: '找不到贴文（API 返回空）', raw: postData });
      }
      postId = postData.data[0].id;
    }

    const allComments = [];
    let nextPage = `https://graph.facebook.com/${postId}/comments?access_token=${PAGE_TOKEN}&fields=id,message,from&limit=100`;

    while (nextPage) {
      const res = await fetch(nextPage);
      const data = await res.json();
      allComments.push(...(data.data || []));
      nextPage = data.paging?.next || null;
    }

    const validEntries = [];
    const regex = /([1-9][0-9]?)/;
    for (const comment of allComments) {
      const msg = comment.message || '';
      const match = msg.match(regex);
      const userId = comment.from?.id || null;

      if (!match || userId === PAGE_ID) continue;

      const number = match[1].padStart(2, '0');

      validEntries.push({
        commentId: comment.id,
        from: { id: userId },
        number,
        message: msg,
      });
    }

    const winners = [];
    const usedIds = new Set();
    const usedNumbers = new Set();
    for (const entry of validEntries) {
      const uid = entry.from.id;
      const num = entry.number;
      if (usedIds.has(uid) || usedNumbers.has(num)) continue;

      winners.push(entry);
      usedIds.add(uid);
      usedNumbers.add(num);
      if (winners.length === 3) break;
    }

    if (winners.length < 3) {
      return res.status(400).json({ error: '有效留言不足 3 条（需不同访客与不同号码）', total: winners.length });
    }

    const replyMessage = `🎉🎊 恭喜你获得折扣卷 RM100.00 🎉🎊\n🎉🎉 Congratulations! You’ve won a RM100 discount voucher! 🎉🎉\n⚠️⚠️ 只限今天直播兑现，逾期无效 ⚠️⚠️\n⚠️⚠️ Valid only during today’s live stream. ⚠️⚠️\n❌❌ 不得转让 ❌❌\n❌❌ Non-transferable ❌❌`;
    const results = [];

    function delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    for (const winner of winners) {
      try {
        const replyRes = await fetch(`https://graph.facebook.com/${winner.commentId}/comments?access_token=${PAGE_TOKEN}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: replyMessage })
        });
        const replyData = await replyRes.json();
        results.push({ ...winner, replyStatus: replyData });
        await delay(3000);
      } catch (err) {
        results.push({ ...winner, replyStatus: { error: err.message } });
        await delay(3000);
      }
    }

    const list = winners.map(w => `第一个留言号码 ${w.number}`).join('\n');
    const summaryMessage = `🎉🎊 恭喜三位得奖者,获得折扣卷 RM100.00 🎊🎉\n${list}\n⚠️⚠️ 只限今天直播兑现，逾期无效 ⚠️⚠️`;

    const postCommentRes = await fetch(`https://graph.facebook.com/${postId}/comments?access_token=${PAGE_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: summaryMessage })
    });

    if (DEBUG) {
      return res.status(200).json({ postId, winners, summaryMessage });
    }

    return res.status(200).json({ success: true, replied: results });

  } catch (err) {
    return res.status(500).json({ error: '抽奖失败，请检查网络或参数', detail: err.message });
  }
}
