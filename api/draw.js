// pages/api/draw.js
let lastDrawPostId = null;
let lastDrawTime = null;

export default async function handler(req, res) {
  const PAGE_ID = process.env.PAGE_ID;
  const PAGE_TOKEN = process.env.FB_ACCESS_TOKEN;
  const DEBUG = req.query.debug !== undefined;
  const POST_ID = req.query.postId || null;

  try {
    let postId = POST_ID;
    if (!postId) {
      const videoRes = await fetch(`https://graph.facebook.com/${PAGE_ID}/videos?access_token=${PAGE_TOKEN}&limit=5`);
      const videoData = await videoRes.json();
      if (!videoData?.data?.length) {
        return res.status(404).json({ error: '找不到视频（API 返回空）', raw: videoData });
      }

      const videoId = videoData.data[0].id;
      const detailRes = await fetch(`https://graph.facebook.com/${videoId}?fields=permalink_url&access_token=${PAGE_TOKEN}`);
      const detailData = await detailRes.json();
      const permalink = detailData.permalink_url;

      if (!permalink || !permalink.includes('/videos/')) {
        return res.status(404).json({ error: '无法解析贴文 ID（permalink_url 无效）', raw: detailData });
      }

      const parsedId = permalink.split('/videos/')[1];
      postId = parsedId?.split(/[/?]/)[0]; // 清除后缀参数
    }

    if (!DEBUG && lastDrawPostId === postId) {
      return res.status(200).json({ alreadyDrawn: true });
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
    const regex = /(\d{1,3})/;

    for (const comment of allComments) {
      const msg = comment.message || '';
      const match = msg.match(regex);
      if (!match) continue;

      const number = match[1].padStart(2, '0');
      const numValue = parseInt(number);
      if (numValue < 1 || numValue > 99) continue;

      const userId = comment.from?.id || null;
      const userName = comment.from?.name || null;

      validEntries.push({
        commentId: comment.id,
        from: userId ? { id: userId, name: userName } : null,
        number,
        message: msg,
      });
    }

    console.log('总共筛选出留言：', validEntries.length);
    console.log('留言访客名单：', validEntries.map(v => v.from));

    if (validEntries.length < 3 && !DEBUG) {
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

    if (winners.length < 3 && !DEBUG) {
      return res.status(400).json({ error: '无法抽出 3 位不重复用户和号码', total: winners.length });
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

        const replyText = await replyRes.text();
        let replyData;
        try {
          replyData = JSON.parse(replyText);
        } catch (jsonErr) {
          replyData = { raw: replyText, parseError: jsonErr.message };
        }

        results.push({
          number: winner.number,
          commentId: winner.commentId,
          originalMessage: winner.message,
          from: winner.from,
          replyStatus: replyData
        });

        console.log(`✅ 已回复 ${winner.from?.name || '匿名用户'}:`, replyData);
        await delay(3000);

      } catch (err) {
        results.push({
          number: winner.number,
          commentId: winner.commentId,
          originalMessage: winner.message,
          from: winner.from,
          replyStatus: { error: err.message }
        });
        console.warn(`❌ 回复失败 (${winner.from?.name || '匿名用户'})：`, err.message);
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

    await fetch(`https://graph.facebook.com/${postId}/comments?access_token=${PAGE_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: summaryMessage })
    });

    lastDrawPostId = postId;
    lastDrawTime = Date.now();

    return res.status(200).json({ success: true, postId, replied: results });

  } catch (err) {
    return res.status(500).json({ error: '服务器错误', details: err.message });
  }
}
