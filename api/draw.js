import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY);

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

export default async function handler(req, res) {
  const PAGE_ID = process.env.PAGE_ID;
  const PAGE_TOKEN = process.env.FB_ACCESS_TOKEN;

  try {
    // 获取最新贴文 ID
    const postRes = await fetch(`https://graph.facebook.com/${PAGE_ID}/posts?access_token=${PAGE_TOKEN}&limit=1`);
    const postData = await postRes.json();
    const post_id = postData?.data?.[0]?.id;

    if (!post_id) {
      return res.status(404).json({ error: '无法取得贴文 ID', raw: postData });
    }

    // 获取所有留言
    const allComments = [];
    let nextPage = `https://graph.facebook.com/${post_id}/comments?access_token=${PAGE_TOKEN}&fields=id,message,from&limit=100`;

    while (nextPage) {
      const resp = await fetch(nextPage);
      const data = await resp.json();
      allComments.push(...(data.data || []));
      nextPage = data.paging?.next || null;
    }

    // 过滤有效留言（留言包含 1~99 数字，且不是管理员自己）
    const regex = /([1-9][0-9]?)/;
    const entries = [];

    for (const c of allComments) {
      const msg = c.message || '';
      const match = msg.match(regex);
      const userId = c.from?.id;
      const userName = c.from?.name;

      if (!match || userId === PAGE_ID) continue;

      const number = match[1].padStart(2, '0');

      entries.push({
        comment_id: c.id,
        user_id: userId || '',
        user_name: userName || '',
        message: msg,
        number,
      });
    }

    // 随机抽取 3 个不同 user_id + number
    const winners = [];
    const usedUserIds = new Set();
    const usedNumbers = new Set();

    function shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }

    for (const entry of shuffle(entries)) {
      if (!usedUserIds.has(entry.user_id) && !usedNumbers.has(entry.number)) {
        winners.push(entry);
        usedUserIds.add(entry.user_id);
        usedNumbers.add(entry.number);
        if (winners.length === 3) break;
      }
    }

    if (winners.length < 3) {
      return res.status(400).json({ error: '有效留言不足 3 个不同人或号码', total: entries.length });
    }

    // 写入 Firestore lucky_draw_results
    const timestamp = new Date();

    for (const winner of winners) {
      await db.collection('lucky_draw_results').add({
        ...winner,
        post_id,
        timestamp,
      });
    }

    return res.status(200).json({
      success: true,
      post_id,
      winners,
      total: entries.length,
      message: '抽奖完成并写入 Firebase',
    });

  } catch (err) {
    console.error('[draw.js] 抽奖失败', err);
    return res.status(500).json({ error: '服务器错误', message: err.message });
  }
}
