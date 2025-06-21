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

  // 判断是否已抽奖
  const key = `drawn-${postId}`;
  const cache = global.drawnCache ||= {};
  const hasDrawn = cache[key];
  cache[key] = true;

  // 获取留言
  const commentRes = await fetch(`https://graph.facebook.com/${postId}/comments?access_token=${ACCESS_TOKEN}&filter=stream&limit=200`);
  const commentData = await commentRes.json();
  const comments = commentData?.data || [];

  // 筛选有效留言（01~99），排除主页与匿名
  const candidates = [];
  const numberSet = new Set();
  const userSet = new Set();

  for (const c of comments) {
    const msg = c.message;
    if (!msg || !c.from || c.from.id === PAGE_ID) continue;

    const match = msg.match(/\b(?:[AaBb]?\s*0?[1-9]|[AaBb]?\s*[1-9][0-9])\b/);
    if (!match) continue;

    const number = parseInt(match[0].replace(/[^0-9]/g, ''), 10);
    if (number < 1 || number > 99) continue;

    const uid = c.from?.id;
    const uname = c.from?.name;
    if (!uid || !uname) continue;

    candidates.push({
      number,
      user_id: uid,
      user_name: uname,
      comment_id: c.id,
      message: msg,
    });
  }

  // 随机抽奖（不同人、不同号码）
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

  // 回复每位中奖者
  const replyMessage = `🎉🎊 恭喜你获得折扣卷 RM100.00 🎉🎊\n🎉🎉 Congratulations! You’ve won a RM100 discount voucher! 🎉🎉\n⚠️⚠️ 只限今天直播兑现，逾期无效 ⚠️⚠️\n⚠️⚠️ Valid only during today’s live stream. ⚠️⚠️\n❌❌ 不得转让 ❌❌\n❌❌ Non-transferable ❌❌`;

  for (const w of winners) {
    await fetch(`https://graph.facebook.com/${w.comment_id}/comments?access_token=${ACCESS_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: replyMessage }),
    });
  }

  // 公布得奖名单（显示名字 + 号码）
  const summaryList = winners.map(w => `${w.user_name} ${w.number}`).join('\n');
  const summary = `🎉🎊 本场直播抽奖结果 🎉🎊  \n系统已自动回复中奖者：  \n\n${summaryList}\n\n⚠️ 请查看你的号码下是否有回复！⚠️  \n⚠️ 只限今天直播兑现，逾期无效 ⚠️`;

  await fetch(`https://graph.facebook.com/${postId}/comments?access_token=${ACCESS_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: summary }),
  });

  return res.status(200).json({
    success: true,
    message: hasDrawn
      ? '⚠️ 本场直播已抽过奖，此次为重复测试'
      : '✅ 抽奖完成，已公布中奖名单',
    winners,
  });
}
