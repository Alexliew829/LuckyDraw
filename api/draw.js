// pages/api/draw.js
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const firebasePrivateKey = process.env.FIREBASE_ADMIN_KEY;
const PAGE_ID = process.env.PAGE_ID;
const PAGE_TOKEN = process.env.FB_ACCESS_TOKEN;

if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(firebasePrivateKey))
  });
}

export default async function handler(req, res) {
  const isDebug = req.query.debug !== undefined;

  try {
    // 获取最新贴文 ID
    const postRes = await fetch(`https://graph.facebook.com/${PAGE_ID}/posts?access_token=${PAGE_TOKEN}&limit=1`);
    const postData = await postRes.json();
    const post_id = postData?.data?.[0]?.id;

    if (!post_id) {
      return res.status(404).json({ error: '无法获取贴文 ID', raw: postData });
    }

    // 获取所有留言
    const commentsRes = await fetch(`https://graph.facebook.com/${post_id}/comments?filter=stream&limit=100&access_token=${PAGE_TOKEN}`);
    const commentsData = await commentsRes.json();

    const rawComments = commentsData?.data || [];

    // 处理留言：只要非主页留言就加入
    const valid = [];
    const seenUsers = new Set();
    const seenNumbers = new Set();

    for (const c of rawComments) {
      if (!c.from || c.from.id === PAGE_ID) continue; // 跳过主页留言

      const numberMatch = c.message.match(/\b(\d{1,2})\b/);
      if (!numberMatch) continue; // 没有号码

      const number = numberMatch[1];
      const userId = c.from.id;

      if (seenUsers.has(userId)) continue; // 不同人
      if (seenNumbers.has(number)) continue; // 不同号码

      seenUsers.add(userId);
      seenNumbers.add(number);

      valid.push({
        number,
        user_id: userId,
        user_name: c.from.name || '匿名用户',
        comment_id: c.id
      });
    }

    if (isDebug) {
      return res.status(200).json({
        message: 'Debug 模式',
        post_id,
        total_raw: rawComments.length,
        total_valid: valid.length,
        sample: valid.slice(0, 10)
      });
    }

    if (valid.length < 3) {
      return res.status(400).json({
        error: '抽奖失败：有效留言不足 3 条（需包含号码、访客、非主页）',
        total: valid.length
      });
    }

    // 随机抽取 3 位不同得奖者
    const shuffled = valid.sort(() => 0.5 - Math.random());
    const winners = shuffled.slice(0, 3);

    return res.status(200).json({
      success: true,
      post_id,
      winners
    });
  } catch (err) {
    return res.status(500).json({
      error: '系统错误，请稍后再试',
      details: err.message
    });
  }
}
