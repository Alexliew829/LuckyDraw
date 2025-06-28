// api/draw.js
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_KEY);
if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore();

export default async function handler(req, res) {
  const DEBUG = req.query.debug !== undefined;

  try {
    const snapshot = await db.collection('draw_comments').get();
    const allEntries = snapshot.docs.map(doc => doc.data());

    // 筛选有效留言：1~99 号码，去除重复 user 和重复号码
    const validEntries = [];
    const usedIds = new Set();
    const usedNumbers = new Set();

    for (const entry of allEntries) {
      const { user_id, number } = entry;
      const uid = user_id || entry.comment_id; // 匿名用户 fallback

      const numValue = parseInt(number);
      if (isNaN(numValue) || numValue < 1 || numValue > 99) continue;
      if (usedIds.has(uid)) continue;
      if (usedNumbers.has(number)) continue;

      validEntries.push(entry);
      usedIds.add(uid);
      usedNumbers.add(number);
      if (validEntries.length === 3) break;
    }

    if (validEntries.length < 3 && !DEBUG) {
      return res.status(400).json({ error: '有效留言不足 3 条（需不同访客与号码）', total: validEntries.length });
    }

    // 生成中奖列表内容
    const resultLines = validEntries.map(entry => {
      if (entry.user_id && entry.user_name) {
        return `- @[${entry.user_id}](${entry.user_name}) ${entry.number}`;
      } else {
        return `- 第一个留言 ${entry.number}`;
      }
    }).join('\n');

    const summary = `🎉🎊 本场直播抽奖结果 🎉🎊\n系统已自动回复中奖者：\n${resultLines}\n⚠️ 请查看你的号码下是否有回复！⚠️\n⚠️ 只限今天直播兑现，逾期无效 ⚠️`;

    return res.status(200).json({ success: true, winners: validEntries, message: summary });

  } catch (err) {
    return res.status(500).json({ error: '服务器错误', details: err.message });
  }
}
