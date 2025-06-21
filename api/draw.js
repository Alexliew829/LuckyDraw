// pages/api/draw.js
import fetch from 'node-fetch';
const PAGE_ID = process.env.PAGE_ID;
const ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

export default async function handler(req, res) {
  const isDebug = req.query.debug !== undefined;

  const postRes = await fetch(`https://graph.facebook.com/${PAGE_ID}/posts?access_token=${ACCESS_TOKEN}&limit=1`);
  const postData = await postRes.json();
  const postId = postData?.data?.[0]?.id;

  if (!postId) {
    return res.status(404).json({ success: false, message: '❌ 无法取得最新贴文 ID' });
  }

  if (!isDebug) {
    const key = `drawn-${postId}`;
    const cache = global.drawnCache ||= {};
    if (cache[key]) {
      return res.status(403).json({ success: false, message: '⚠️ 本场直播已抽奖，不能重复' });
    }
    cache[key] = true;
  }

  const commentRes = await fetch(`https://graph.facebook.com/${postId}/comments?access_token=${ACCESS_TOKEN}&filter=stream&limit=200`);
  const commentData = await commentRes.json();
  const comments = commentData?.data || [];

  const candidates = [];
  const numberSet = new Set();
  const userSet = new Set();

  for (const c of comments) {
    const msg = c.message;
    const match = msg?.match(/\b\d{1,2}\b/);
    if (!match) continue;

    const number = parseInt(match[0], 10);
    if (number < 1 || number > 99) continue;

    const uid = c.from?.id || c.id;
    const uname = c.from?.name || null;

    candidates.push({
      number: number.toString().padStart(2, '0'),
      user_id: uid,
      user_name: uname,
      comment_id: c.id,
      message: msg,
    });
  }

  const winners = [];
  while (winners.length < 3 && candidates.length) {
    const i = Math.floor(Math.random() * candidates.length);
    const pick = candidates.splice(i, 1)[0];

    if (numberSet.has(pick.number) || userSet.has(pick.user_id)) continue;

    winners.push(pick);
    numberSet.add(pick.number);
    userSet.add(pick.user_id);
  }

  if (winners.length < 3) {
    return res.status(400).json({
      success: false,
      message: '有效留言不足 3 个不同人或号码',
      total: candidates.length,
    });
  }

  const summary = [
    '🎉🎊 本场直播抽奖结果 🎉🎊',
    '系统已自动回复中奖者：',
    '',
    ...winners.map(w =>
      w.user_name ? `@${w.user_name} ${w.number}` : `匿名用户 ${w.number}`
    ),
    '',
    '⚠️ 请查看你的号码下是否有回复！⚠️',
    '⚠️ 只限今天直播兑现，逾期无效 ⚠️'
  ].join('\n');

  await fetch(MAKE_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postId, winners, summary }),
  });

  res.json({ success: true, winners });
}
