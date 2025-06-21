// pages/api/draw.js

import fetch from 'node-fetch';

const PAGE_ID = process.env.PAGE_ID;
const PAGE_TOKEN = process.env.FB_ACCESS_TOKEN;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

function extractNumber(msg) {
  const match = msg.match(/\b(?:[AaBb][-\s]*)?(\d{1,2})\b/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return n >= 1 && n <= 99 ? n : null;
}

export default async function handler(req, res) {
  const isDebug = req.query.debug !== undefined;

  try {
    // 获取最新贴文
    const postRes = await fetch(`https://graph.facebook.com/${PAGE_ID}/posts?access_token=${PAGE_TOKEN}&limit=1`);
    const postData = await postRes.json();
    const postId = postData?.data?.[0]?.id;

    if (!postId) throw new Error('❌ 无法取得最新贴文 ID');

    // 获取留言
    const commentsRes = await fetch(`https://graph.facebook.com/${postId}/comments?access_token=${PAGE_TOKEN}&filter=stream&limit=200&fields=from,message,id`);
    const commentsData = await commentsRes.json();
    const raw = commentsData?.data || [];

    const candidates = [];
    const seenUsers = new Set();
    const seenNumbers = new Set();

    for (const c of raw) {
      if (!c.from || c.from.id === PAGE_ID) continue; // 排除主页
      const number = extractNumber(c.message);
      if (!number) continue;
      if (seenUsers.has(c.from.id)) continue; // 同一个用户只能中一次
      if (seenNumbers.has(number)) continue; // 同一个号码只能中一次

      seenUsers.add(c.from.id);
      seenNumbers.add(number);

      candidates.push({
        number,
        comment_id: c.id,
        user_id: c.from.id,
        user_name: c.from.name,
        message: c.message,
      });
    }

    // 随机抽出3位中奖者
    const winners = [];
    while (winners.length < 3 && candidates.length > 0) {
      const index = Math.floor(Math.random() * candidates.length);
      winners.push(candidates.splice(index, 1)[0]);
    }

    // 推送给 Make Webhook
    await fetch(MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId, winners }),
    });

    return res.status(200).json({
      success: true,
      postId,
      message: '✅ 成功触发抽奖',
      winners,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: '❌ 抽奖失败: ' + err.message,
    });
  }
}
