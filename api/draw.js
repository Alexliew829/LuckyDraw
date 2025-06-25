import fetch from 'node-fetch';

const PAGE_ID = process.env.PAGE_ID;
const PAGE_TOKEN = process.env.FB_ACCESS_TOKEN;

export default async function handler(req, res) {
  const debug = req.query.debug !== undefined;

  try {
    // Step 1: 获取最新贴文 ID
    const postRes = await fetch(`https://graph.facebook.com/${PAGE_ID}/posts?access_token=${PAGE_TOKEN}&limit=1`);
    const postData = await postRes.json();
    const postId = postData?.data?.[0]?.id;

    if (!postId) return res.status(500).json({ error: '无法取得贴文 ID', raw: postData });

    // Step 2: 获取留言
    const commentsRes = await fetch(`https://graph.facebook.com/${postId}/comments?access_token=${PAGE_TOKEN}&filter=stream&limit=100`);
    const commentsData = await commentsRes.json();
    const comments = commentsData?.data || [];

    // Step 3: 过滤有效留言（包含数字、非主页、访客）
    const numberRegex = /(?:^|\D)(\d{1,2})(?:\D|$)/;

    const validEntries = [];
    const seenUsers = new Set();
    const seenNumbers = new Set();

    for (const comment of comments) {
      const msg = comment.message || '';
      const match = msg.match(numberRegex);
      const number = match ? match[1].padStart(2, '0') : null;

      const from = comment.from;
      const userId = from?.id;
      const userName = from?.name || '匿名用户';

      if (!number || !userId || userId === PAGE_ID) continue; // 需要访客、有数字、非主页

      // 防重复用户 + 防重复号码
      if (seenUsers.has(userId) || seenNumbers.has(number)) continue;

      seenUsers.add(userId);
      seenNumbers.add(number);
      validEntries.push({ userId, userName, number, commentId: comment.id });
    }

    if (validEntries.length < 3) {
      return res.status(400).json({ error: '抽奖失败：有效留言不足 3 条（需包含号码、访客、非主页）', total: validEntries.length });
    }

    // Step 4: 随机抽出 3 个
    const winners = [];
    while (winners.length < 3 && validEntries.length > 0) {
      const index = Math.floor(Math.random() * validEntries.length);
      winners.push(validEntries.splice(index, 1)[0]);
    }

    // Step 5: 公布总结果（简洁版）
    const summary =
`🎉🎊 本场直播抽奖结果 🎉🎊
系统已自动回复中奖者：
${winners.map(w => `- 留言号码 ${w.number}`).join('\n')}
⚠️ 请查看你的号码下是否有回复！⚠️
⚠️ 只限今天直播兑现，逾期无效 ⚠️`;

    // Step 6: 自动回复每个中奖留言
    for (const winner of winners) {
      const replyUrl = `https://graph.facebook.com/${winner.commentId}/comments`;
      await fetch(replyUrl, {
        method: 'POST',
        body: new URLSearchParams({
          access_token: PAGE_TOKEN,
          message: `🎉 恭喜中奖！您的号码 ${winner.number} 已被抽中 🎉`
        }),
      });
    }

    // Step 7: 公布总留言
    await fetch(`https://graph.facebook.com/${postId}/comments`, {
      method: 'POST',
      body: new URLSearchParams({
        access_token: PAGE_TOKEN,
        message: summary
      }),
    });

    return res.status(200).json({ success: true, winners });
  } catch (err) {
    return res.status(500).json({ error: '系统错误', details: err.message });
  }
}
