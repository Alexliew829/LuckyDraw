// pages/api/draw.js
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const firebaseAdminKey = JSON.parse(process.env.FIREBASE_ADMIN_KEY);
if (!getApps().length) {
  initializeApp({ credential: cert(firebaseAdminKey) });
}
const db = getFirestore();

const PAGE_ID = process.env.PAGE_ID;
const PAGE_TOKEN = process.env.FB_ACCESS_TOKEN;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

export default async function handler(req, res) {
  const debugMode = req.query.debug !== undefined;

  try {
    // 获取最新贴文 ID
    const postRes = await fetch(`https://graph.facebook.com/${PAGE_ID}/posts?access_token=${PAGE_TOKEN}&limit=1`);
    const postData = await postRes.json();
    const postId = postData?.data?.[0]?.id;

    if (!postId) {
      return res.status(404).json({ error: '无法取得最新贴文 ID', raw: postData });
    }

    const docRef = db.collection('triggered_comments').doc(`draw_${postId}`);
    const exists = (await docRef.get()).exists;

    // 非 debug 模式只能抽一次
    if (!debugMode && exists) {
      return res.status(403).json({ error: '本场直播已抽过奖，不能重复抽奖' });
    }

    // 抓取所有留言
    const allComments = [];
    let nextPage = `https://graph.facebook.com/${postId}/comments?access_token=${PAGE_TOKEN}&fields=id,message,from&limit=100`;
    while (nextPage) {
      const response = await fetch(nextPage);
      const data = await response.json();
      allComments.push(...(data.data || []));
      nextPage = data.paging?.next || null;
    }

    // 抽取包含 01-99 数字的留言
    const validEntries = [];
    const regex = /\b([1-9][0-9]?)\b/;
    for (const c of allComments) {
      const text = c.message || '';
      const match = text.match(regex);
      if (!match) continue;
      const number = match[1].padStart(2, '0');
      const userId = c.from?.id || null;
      const userName = c.from?.name || null;
      if (userId === PAGE_ID) continue;

      validEntries.push({
        commentId: c.id,
        number,
        from: userId ? { id: userId, name: userName } : null,
        message: text
      });
    }

    // 去重用户与号码
    const winners = [];
    const usedUsers = new Set();
    const usedNumbers = new Set();
    for (const entry of shuffle(validEntries)) {
      const uid = entry.from?.id || entry.commentId;
      if (usedUsers.has(uid)) continue;
      if (usedNumbers.has(entry.number)) continue;
      winners.push(entry);
      usedUsers.add(uid);
      usedNumbers.add(entry.number);
      if (winners.length === 3) break;
    }

    if (winners.length < 3) {
      return res.status(400).json({ error: '有效留言不足 3 个不同人或号码', total: validEntries.length });
    }

    // 中奖格式整理
    const prizeText = `🎉🎊 恭喜你获得折扣卷 RM100.00 🎉🎊
🎉🎉 Congratulations! You’ve won a RM100 discount voucher! 🎉🎉
⚠️⚠️ 只限今天直播兑现，逾期无效 ⚠️⚠️
⚠️⚠️ Valid only during today’s live stream. ⚠️⚠️
❌❌ 不得转让 ❌❌
❌❌ Non-transferable ❌❌`;

    const replyList = winners.map(w => {
      if (w.from?.id && w.from?.name) {
        return `@[${w.from.id}](${w.from.name}) ${w.number}`;
      } else {
        return `匿名留言 ${w.number}`;
      }
    }).join('\n');

    const summaryText = `🎉🎊 本场直播抽奖结果 🎉🎊
系统已自动回复中奖者：
${replyList}
⚠️ 请查看你的号码下是否有回复！⚠️
⚠️ 只限今天直播兑现，逾期无效 ⚠️`;

    // 发给 Make Webhook 处理留言
    await fetch(MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_id: postId,
        winners,
        summary: summaryText,
        message: prizeText
      })
    });

    if (!debugMode) {
      await docRef.set({ timestamp: Date.now() });
    }

    return res.status(200).json({
      success: true,
      post_id: postId,
      total_valid: validEntries.length,
      winners
    });

  } catch (err) {
    console.error('抽奖错误:', err);
    return res.status(500).json({ error: '系统错误', details: err.message });
  }
}

// 工具函数：乱序
function shuffle(array) {
  let current = array.length;
  while (current) {
    const random = Math.floor(Math.random() * current--);
    [array[current], array[random]] = [array[random], array[current]];
  }
  return array;
}
