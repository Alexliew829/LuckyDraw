// pages/api/draw.js
import { getApps, cert, initializeApp } from 'firebase-admin/app';
import { randomUUID } from 'crypto';

const PAGE_ID = process.env.PAGE_ID;
const PAGE_TOKEN = process.env.FB_ACCESS_TOKEN;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

export default async function handler(req, res) {
  const isDebug = req.query.debug !== undefined;

  try {
    // 获取最新贴文 ID
    const postRes = await fetch(`https://graph.facebook.com/${PAGE_ID}/posts?access_token=${PAGE_TOKEN}&limit=1`);
    const postData = await postRes.json();
    const postId = postData?.data?.[0]?.id;

    if (!postId) {
      return res.status(500).json({ error: '无法取得贴文 ID', raw: postData });
    }

    // 获取所有留言
    const comments = await getAllComments(postId);
    const valid = [];
    const usedNumbers = new Set();
    const usedUsers = new Set();

    for (const c of comments) {
      const message = c.message || '';
      const match = message.match(/\b([1-9][0-9]?)\b/);
      if (!match) continue;

      const number = match[1];
      const userId = c.from?.id;
      const userName = c.from?.name || null;
      const isFromPage = userId === PAGE_ID;

      if (!number || !userId || isFromPage || usedNumbers.has(number) || usedUsers.has(userId)) continue;

      valid.push({
        comment_id: c.id,
        number,
        userId,
        userName
      });

      usedNumbers.add(number);
      usedUsers.add(userId);

      if (valid.length === 3) break;
    }

    if (valid.length < 3) {
      return res.status(400).json({ error: '抽奖失败：有效留言不足 3 条（需包含号码、访客、非主页）', total: valid.length });
    }

    // 整理中奖信息并发送到 Make
    const resultText =
      `🎉🎊 本场直播抽奖结果 🎉🎊\n` +
      `系统已自动回复中奖者：\n` +
      valid.map(w => `- 留言号码 ${w.number}`).join('\n') +
      `\n⚠️ 请查看你的号码下是否有回复！⚠️\n⚠️ 只限今天直播兑现，逾期无效 ⚠️`;

    await fetch(MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId, winners: valid, resultText })
    });

    return res.status(200).json({ success: true, winners: valid });
  } catch (err) {
    return res.status(500).json({ error: '抽奖失败', detail: err.message });
  }
}

async function getAllComments(postId) {
  const all = [];
  let url = `https://graph.facebook.com/${postId}/comments?access_token=${PAGE_TOKEN}&limit=100`;

  while (url) {
    const res = await fetch(url);
    const json = await res.json();
    const data = json?.data || [];
    all.push(...data);
    url = json.paging?.next || null;
  }

  return all;
}
