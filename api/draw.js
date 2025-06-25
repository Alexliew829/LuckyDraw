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
    const usedIds = new Set();
    const usedNumbers = new Set();
    const regex = /([1-9][0-9]?)/; // 支持 01~99

    for (const comment of allComments) {
      const msg = comment.message || '';
      const match = msg.match(regex);
      const userId = comment.from?.id || null;
      const userName = comment.from?.name || null;

      if (!match || userId === PAGE_ID) continue;

      const number = match[1].padStart(2, '0');

      // 保证每人、每号码只记录一次
      if (usedIds.has(userId) || usedNumbers.has(number)) continue;

      usedIds.add(userId);
      usedNumbers.add(number);

      validEntries.push({
        commentId: comment.id,
        from: userId ? { id: userId, name: userName } : null,
        number,
        message: msg,
      });
    }

    if (validEntries.length < 3) {
      return res.status(400).json({
        error: '抽奖失败：有效留言不足 3 条（需包含号码、访客、非主页）',
        total: validEntries.length,
      });
    }

    // 抽出 3 个中奖者（不重复）
    function shuffle(array) {
      let currentIndex = array.length;
      while (currentIndex !== 0) {
        const randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
      }
      return array;
    }

    const winners = shuffle(validEntries).slice(0, 3);

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
        message: '调试模式',
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
    return res.status(500).json({ error: '服务器错误', details: err.messag
