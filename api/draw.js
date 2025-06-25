const PAGE_ID = process.env.PAGE_ID;
const PAGE_TOKEN = process.env.FB_ACCESS_TOKEN;
const WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

// 记录抽奖状态
let drawState = {};

export default async function handler(req, res) {
  const isDebug = req.query.debug !== undefined;
  const force = req.query.force === '1';

  try {
    // 获取最新贴文 ID
    const postRes = await fetch(`https://graph.facebook.com/${PAGE_ID}/posts?access_token=${PAGE_TOKEN}&limit=1`);
    const postData = await postRes.json();
    const post_id = postData?.data?.[0]?.id;
    if (!post_id) return res.status(404).json({ error: '无法获取贴文 ID', raw: postData });

    // 限制重复抽奖
    if (drawState[post_id] && !isDebug && !force) {
      return res.status(200).json({ confirm: true, message: '已抽过奖，要重新抽请加 ?force=1' });
    }

    // 抓留言
    const commentsRes = await fetch(`https://graph.facebook.com/${post_id}/comments?access_token=${PAGE_TOKEN}&filter=stream&limit=100`);
    const rawComments = (await commentsRes.json())?.data || [];

    const numberRegex = /\b(\d{1,2})\b/;
    const usedNumbers = new Set();
    const usedUsers = new Set();
    const valid = [];

    for (const c of rawComments) {
      const from = c.from;
      if (!from || from.id === PAGE_ID) continue;

      const match = c.message?.match(numberRegex);
      if (!match) continue;
      const number = parseInt(match[1], 10);
      if (number < 1 || number > 99) continue;

      const user_id = from.id;
      const user_name = from.name || null;

      const uniqueKey = `${user_id}-${number}`;
      if (usedUsers.has(user_id) || usedNumbers.has(number)) continue;

      usedUsers.add(user_id);
      usedNumbers.add(number);
      valid.push({
        comment_id: c.id,
        number,
        user_id,
        user_name
      });
    }

    if (valid.length < 3) {
      return res.status(400).json({ error: '抽奖失败：有效留言不足 3 条（需包含号码、访客、非主页）', total: valid.length });
    }

    // 随机抽取
    const winners = [];
    while (winners.length < 3 && valid.length > 0) {
      const i = Math.floor(Math.random() * valid.length);
      winners.push(valid[i]);
      valid.splice(i, 1);
    }

    // 逐个发送到 webhook 回复
    for (const w of winners) {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_id,
          comment_id: w.comment_id,
          number: w.number,
          user_id: w.user_id,
          user_name: w.user_name
        })
      });
    }

    // 简洁公告
    const msg =
      `🎉🎊 本场直播抽奖结果 🎉🎊\n` +
      `系统已自动回复中奖者：\n` +
      winners.map(w => `- 留言号码 ${w.number}`).join('\n') +
      `\n⚠️ 请查看你的号码下是否有回复！⚠️\n` +
      `⚠️ 只限今天直播兑现，逾期无效 ⚠️`;

    await fetch(`https://graph.facebook.com/${post_id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: msg,
        access_token: PAGE_TOKEN
      })
    });

    // 标记本场已抽奖
    if (!isDebug) drawState[post_id] = true;

    res.status(200).json({ success: true, winners });
  } catch (err) {
    res.status(500).json({ error: '抽奖失败', message: err.message, stack: err.stack });
  }
}
