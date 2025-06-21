// pages/api/draw.js

const FB_TOKEN = process.env.FB_ACCESS_TOKEN;
const PAGE_ID = process.env.PAGE_ID;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

const usedDraws = {}; // 内存中记录每日贴文是否抽奖（仅用于调试）

export default async function handler(req, res) {
  const debug = req.query.debug !== undefined;

  try {
    // 获取最新贴文 ID
    const postRes = await fetch(
      `https://graph.facebook.com/${PAGE_ID}/posts?access_token=${FB_TOKEN}&limit=1`
    );
    const postData = await postRes.json();
    const postId = postData?.data?.[0]?.id;

    if (!postId) {
      return res.status(500).json({ success: false, message: '❌ 无法取得贴文 ID' });
    }

    // 检查是否已抽过奖（除非 debug 模式）
    if (usedDraws[postId] && !debug) {
      return res.status(403).json({
        success: false,
        message: '⚠️ 本场直播已经抽过奖了（如需测试请加 ?debug）'
      });
    }

    // 获取所有留言
    const commentsRes = await fetch(
      `https://graph.facebook.com/${postId}/comments?access_token=${FB_TOKEN}&filter=stream&limit=1000`
    );
    const commentsData = await commentsRes.json();

    const raw = commentsData?.data || [];

    // 提取有效号码留言（含 1~99 的数字），忽略主页留言
    const numbers = [];
    const seenUsers = new Set();
    const seenNums = new Set();

    for (const c of raw) {
      const msg = c.message || '';
      const match = msg.match(/\b([1-9][0-9]?)\b/); // 01-99
      const uid = c.from?.id;
      const uname = c.from?.name;
      const cid = c.id;

      if (!match) continue;
      if (uid === PAGE_ID) continue; // 排除主页账号
      const number = parseInt(match[1], 10);
      if (seenNums.has(number)) continue;
      if (seenUsers.has(uid)) continue;

      seenNums.add(number);
      seenUsers.add(uid);
      numbers.push({
        number,
        user_id: uid,
        user_name: uname,
        comment_id: cid,
        message: msg
      });
    }

    // 随机抽 3 个
    const winners = [];
    while (winners.length < 3 && numbers.length > 0) {
      const i = Math.floor(Math.random() * numbers.length);
      winners.push(numbers[i]);
      numbers.splice(i, 1);
    }

    // 标记今日已抽奖（除非是 debug 模式）
    if (!debug) usedDraws[postId] = true;

    // 通知 Make Webhook
    await fetch(MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postId,
        winners
      })
    });

    return res.status(200).json({
      success: true,
      postId,
      message: debug ? '✅ 测试抽奖已触发（debug 模式）' : '✅ 成功触发抽奖',
      winners
    });
  } catch (err) {
    console.error('抽奖错误:', err);
    return res.status(500).json({ success: false, message: '❌ 服务器错误', error: err.message });
  }
}
