// pages/api/draw.js
import fetch from 'node-fetch';

const PAGE_ID = process.env.PAGE_ID;
const ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;

export default async function handler(req, res) {
  const isDebug = req.query.debug !== undefined;

  // 获取最新贴文 ID
  const postRes = await fetch(`https://graph.facebook.com/${PAGE_ID}/posts?access_token=${ACCESS_TOKEN}&limit=1`);
  const postData = await postRes.json();
  const postId = postData?.data?.[0]?.id;

  if (!postId) {
    return res.status(404).json({ success: false, message: '❌ 无法取得最新贴文 ID' });
  }

  // 非 debug 模式，只允许抽一次
  if (!isDebug) {
    const key = `drawn-${postId}`;
    const cache = global.drawnCache ||= {};
    if (cache[key]) {
      return res.status(403).json({ success: false, message: '⚠️ 本场直播已抽奖，不能重复' });
    }
    cache[key] = true;
  }

  // 获取留言
  const commentRes = await fetch(`https://graph.facebook.com/${postId}/comments?access_token=${ACCESS_TOKEN}&filter=stream&limit=200`);
  const commentData = await commentRes.json();
  const comments = commentData?.data || [];

  // 提取有效留言（01~99）
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
      number,
      user_id: uid,
      user_name: uname,
      comment_id: c.id,
      message: msg,
    });
  }

  // 随机抽奖：不同人、不同号码
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

  // 回复每位中奖者留言
  for (const w of winners) {
    const replyMessage = `🎉 恭喜你获得折扣卷 RM100.00 🎉\n🎉 Congratulations! You’ve won a RM100 discount voucher! 🎉\n⚠️ 只限今天直播兑现，逾期无效 ⚠️\n⚠️ Valid only during today’s live stream. ⚠️\n❌❌ 不得转让 ❌❌\n❌❌ Non-transferable ❌❌`;
    await fetch(`https://graph.facebook.com/v19.0/${w.comment_id}/comments?access_token=${ACCESS_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: replyMessage }),
    });
  }

  // 总结信息
  const summaryList = winners.map(w => {
    return w.user_name
      ? `@[${w.user_id}](${w.user_name}) ${w.number}`
      : `匿名用户 ${w.number}`;
  }).join('\n');

  const summaryMessage = `🎉🎊 本场直播抽奖结果 🎉🎊\n系统已自动回复得奖者：\n${summaryList}\n⚠️⚠️ 只限今天直播兑现，逾期无效 ⚠️⚠️`;

  // 公布中奖名单
  await fetch(`https://graph.facebook.com/v19.0/${postId}/comments?access_token=${ACCESS_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: summaryMessage }),
  });

  res.json({ success: true, winners });
}
