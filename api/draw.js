// pages/api/draw.js
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PAGE_ID = process.env.PAGE_ID;
const PAGE_TOKEN = process.env.FB_ACCESS_TOKEN;
const WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

// 初始化 Firebase（虽然你不使用，但我们保留结构，方便以后拓展）
if (!getApps().length && process.env.FIREBASE_ADMIN_KEY) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY);
  initializeApp({ credential: cert(serviceAccount) });
}

export default async function handler(req, res) {
  const isDebug = req.query.debug !== undefined;

  try {
    // 获取最新贴文 ID
    const postRes = await fetch(`https://graph.facebook.com/${PAGE_ID}/posts?access_token=${PAGE_TOKEN}&limit=1`);
    const postData = await postRes.json();
    const post_id = postData?.data?.[0]?.id;
    if (!post_id) return res.status(404).json({ error: '无法获取贴文 ID', raw: postData });

    // 检查是否已抽奖（避免重复）
    const tag = `drawn_${post_id}`;
    global[tag] = global[tag] || false;
    if (global[tag] && !isDebug) {
      return res.status(403).json({ error: '已抽奖一次', confirmed: false });
    }

    // 获取贴文留言
    const commentsRes = await fetch(`https://graph.facebook.com/${post_id}/comments?access_token=${PAGE_TOKEN}&filter=stream&limit=100`);
    const commentsData = await commentsRes.json();
    const rawComments = commentsData?.data || [];

    // 过滤有效留言：访客、包含数字（1-99）、非主页
    const valid = [];
    const usedNumbers = new Set();
    const usedUsers = new Set();
    const numberRegex = /\b(\d{1,2})\b/;

    for (const c of rawComments) {
      const from = c.from;
      if (!from || from.id === PAGE_ID) continue; // 排除主页

      const match = c.message?.match(numberRegex);
      if (!match) continue;
      const number = parseInt(match[1], 10);
      if (number < 1 || number > 99) continue;
      if (usedNumbers.has(number)) continue;
      if (usedUsers.has(from.id)) continue;

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
      return res.status(400).json({ error: '有效留言不足 3 条（需包含号码、访客、非主页）', total: valid.length });
    }

    // 抽出三位中奖者
    const winners = [];
    while (winners.length < 3 && valid.length > 0) {
      const i = Math.floor(Math.random() * valid.length);
      winners.push(valid[i]);
      valid.splice(i, 1);
    }

    // 发出中奖评论回复（由 Make 处理）
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

    // 总结公告格式（简洁）
    const resultMsg =
      `🎉🎊 本场直播抽奖结果 🎉🎊\n` +
      `系统已自动回复中奖者：\n` +
      winners.map(w => `- 留言号码 ${w.number}`).join('\n') +
      `\n⚠️ 请查看你的号码下是否有回复！⚠️\n` +
      `⚠️ 只限今天直播兑现，逾期无效 ⚠️`;

    await fetch(`https://graph.facebook.com/${post_id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: resultMsg,
        access_token: PAGE_TOKEN
      })
    });

    // 标记本场已抽奖（除非 debug）
    if (!isDebug) global[tag] = true;

    res.status(200).json({ success: true, winners });
  } catch (err) {
    res.status(500).json({ error: '抽奖失败', message: err.message });
  }
}
