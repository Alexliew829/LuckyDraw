// pages/api/draw.js

const PAGE_ID = process.env.PAGE_ID;
const PAGE_TOKEN = process.env.FB_ACCESS_TOKEN;
const WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

// 全局标记避免重复抽奖
let drawnOnce = false;

export default async function handler(req, res) {
  try {
    // 获取最新贴文 ID
    const postRes = await fetch(`https://graph.facebook.com/${PAGE_ID}/posts?access_token=${PAGE_TOKEN}&limit=1`);
    const postData = await postRes.json();
    const post_id = postData?.data?.[0]?.id;
    if (!post_id) return res.status(404).json({ error: '无法获取贴文 ID', raw: postData });

    // 如果已抽奖，提示前端弹窗（由前端确认后再次访问此 API 即可再次抽奖）
    if (drawnOnce && req.query.confirm !== 'yes') {
      return res.status(403).json({ error: '本场已抽奖一次，是否确认再次抽奖？', confirm: true });
    }

    // 获取留言
    const commentsRes = await fetch(`https://graph.facebook.com/${post_id}/comments?access_token=${PAGE_TOKEN}&filter=stream&limit=100`);
    const commentsData = await commentsRes.json();
    const rawComments = commentsData?.data || [];

    // 筛选有效留言
    const valid = [];
    const usedNumbers = new Set();
    const usedUsers = new Set();
    const numberRegex = /(?:\D|^)(\d{1,2})(?:\D|$)/;

    for (const c of rawComments) {
      const from = c.from;
      if (!from || from.id === PAGE_ID) continue;

      const match = c.message?.match(numberRegex);
      if (!match) continue;
      const number = parseInt(match[1], 10);
      if (number < 1 || number > 99) continue;
      if (usedNumbers.has(number) || usedUsers.has(from.id)) continue;

      usedNumbers.add(number);
      usedUsers.add(from.id);
      valid.push({
        comment_id: c.id,
        number,
        user_id: from.id,
        user_name: from.name || null
      });
    }

    if (valid.length < 3) {
      return res.status(400).json({ error: '抽奖失败：有效留言不足 3 条（需包含号码、访客、非主页）', total: valid.length });
    }

    // 抽出 3 位中奖者
    const winners = [];
    while (winners.length < 3 && valid.length > 0) {
      const i = Math.floor(Math.random() * valid.length);
      winners.push(valid[i]);
      valid.splice(i, 1);
    }

    // 通知每位中奖者
    for (const w of winners) {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ post_id, ...w })
      });
    }

    // 公布成绩（简洁格式）
    const resultMsg = `🎉🎊 本场直播抽奖结果 🎉🎊\n` +
      `系统已自动回复中奖者：\n` +
      winners.map(w => `- 留言号码 ${w.number}`).join('\n') +
      `\n⚠️ 请查看你的号码下是否有回复！⚠️\n⚠️ 只限今天直播兑现，逾期无效 ⚠️`;

    await fetch(`https://graph.facebook.com/${post_id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: resultMsg, access_token: PAGE_TOKEN })
    });

    drawnOnce = true;
    return res.status(200).json({ success: true, winners });
  } catch (err) {
    return res.status(500).json({ error: '抽奖失败', message: err.message });
  }
}
