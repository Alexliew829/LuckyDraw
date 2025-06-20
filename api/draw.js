export default async function handler(req, res) {
  const PAGE_ID = process.env.PAGE_ID;
  const PAGE_TOKEN = process.env.FB_ACCESS_TOKEN;
  const DEBUG = req.query.debug !== undefined;
  const POST_ID = req.query.postId || null;
  const MAKE_WEBHOOK_URL = 'https://hook.us2.make.com/jhs75mxiq6gioum1pb7cjjr5nks7y1gh';

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

    if (validEntries.length < 3) {
      return res.status(400).json({ error: '有效用户留言不足 3 条（可能是管理员或留言无数字）', total: validEntries.length });
    }

    function shuffle(array) {
      let currentIndex = array.length;
      while (currentIndex !== 0) {
        const randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
      }
      return array;
    }

    const winners = [];
    const usedIds = new Set();
    const usedNumbers = new Set();

    for (const entry of shuffle(validEntries)) {
      const uid = entry.from?.id || entry.commentId;
      if (usedIds.has(uid)) continue;
      if (usedNumbers.has(entry.number)) continue;

      winners.push(entry);
      usedIds.add(uid);
      usedNumbers.add(entry.number);
      if (winners.length === 3) break;
    }

    if (winners.length < 3) {
      return res.status(400).json({ error: '无法抽出 3 位不重复用户和号码', total: winners.length });
    }

    const replyMessage = `🎉🎊 恭喜你获得折扣卷 RM100.00 🎉🎊\n🎉🎉 Congratulations! You’ve won a RM100 discount voucher! 🎉🎉\n⚠️⚠️ 只限今天直播兑现，逾期无效 ⚠️⚠️\n⚠️⚠️ Valid only during today’s live stream. ⚠️⚠️\n❌❌ 不得转让 ❌❌\n❌❌ Non-transferable ❌❌`;
    const results = [];

    function delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    for (const winner of winners) {
      // ✅ 新增：发送给 Make Webhook
      try {
        await fetch(MAKE_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            comment_id: winner.commentId,
            user_id: winner.from?.id || null,
            user_name: winner.from?.name || null,
            number: winner.number,
            message: winner.message
          })
        });
      } catch (e) {
        console.warn('❗Webhook 发送失败：', e.message);
      }

      // ✅ 原有公开回复流程
      try {
        const replyRes = await fetch(`https://graph.facebook.com/${winner.commentId}/comments?access_token=${PAGE_TOKEN}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: replyMessage })
        });
        const replyData = await replyRes.json();
        results.push({
          number: winner.number,
          commentId: winner.commentId,
          originalMessage: winner.message,
          from: winner.from,
          replyStatus: replyData
        });
        await delay(3000);
      } catch (err) {
        results.push({
          number: winner.number,
          commentId: winner.commentId,
          originalMessage: winner.message,
          from: winner.from,
          replyStatus: { error: err.message }
        });
        console.warn('留言失败，已跳过：', err.message);
        await delay(3000);
      }
    }

    const list = winners.map(w => {
      if (w.from?.id && w.from?.name) {
        return `- @[${w.from.id}](${w.from.name}) ${w.number}`;
      } else {
        return `- 第一个留言 ${w.number}`;
      }
    }).join('\n');

    const summaryMessage = `🎉🎊 本场直播抽奖结果 🎉🎊\n系统已自动回复中奖者：\n${list}\n⚠️ 请查看你的号码下是否有回复！⚠️\n⚠️ 只限今天直播兑现，逾期无效 ⚠️`;

    const postCommentRes = await fetch(`https://graph.facebook.com/${postId}/comments?access_token=${PAGE_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: summaryMessage })
    });
    const postCommentData = await postCommentRes.json();

    if (DEBUG) {
      return res.status(200).json({
        message: '调试输出',
        postId,
        totalValid: validEntries.length,
        winners,
        results,
        summaryStatus: postCommentData
      });
    }

    return res.status(200).json({ success: true, postId, replied: results });

  } catch (err) {
    console.error('抽奖失败:', err);
    return res.status(500).json({ error: '服务器错误', details: err.message });
  }
}
