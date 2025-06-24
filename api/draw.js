// pages/api/draw.js
import fetch from 'node-fetch';

const PAGE_ID = process.env.PAGE_ID;
const PAGE_TOKEN = process.env.FB_ACCESS_TOKEN;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

let lastDrawnPostId = null;

export default async function handler(req, res) {
  const debug = req.query.debug !== undefined;

  try {
    const postRes = await fetch(`https://graph.facebook.com/${PAGE_ID}/posts?access_token=${PAGE_TOKEN}&limit=1`);
    const postData = await postRes.json();
    const postId = postData?.data?.[0]?.id;
    if (!postId) return res.status(500).json({ error: '无法获取贴文 ID', raw: postData });

    if (!debug && lastDrawnPostId === postId) {
      return res.status(200).json({ confirm: true, message: '⚠️ 本场可能已抽奖一次，是否确认再次抽奖？' });
    }

    const commentsRes = await fetch(`https://graph.facebook.com/${postId}/comments?access_token=${PAGE_TOKEN}&filter=stream&limit=200&fields=from,message`);
    const commentsData = await commentsRes.json();
    const comments = commentsData?.data || [];

    const numberPattern = /\b([1-9]|0[1-9]|[1-9][0-9])\b/g;

    const entries = comments
      .filter(c => c.from?.id !== PAGE_ID && numberPattern.test(c.message))
      .map(c => {
        const match = c.message.match(numberPattern);
        return match ? {
          commentId: c.id,
          number: match[0].padStart(2, '0'),
          from: c.from || null,
          message: c.message,
        } : null;
      })
      .filter(Boolean);

    const uniqueMap = new Map();
    const usedNumbers = new Set();
    const winners = [];

    for (const entry of entries) {
      const userKey = entry.from?.id || entry.commentId;
      if (!uniqueMap.has(userKey) && !usedNumbers.has(entry.number)) {
        uniqueMap.set(userKey, true);
        usedNumbers.add(entry.number);
        winners.push(entry);
      }
      if (winners.length === 3) break;
    }

    if (winners.length < 3) {
      return res.status(500).json({
        error: `无法抽出 ${3} 位不重复用户和号码`,
        totalValid: entries.length,
        uniqueVisitors: uniqueMap.size,
        uniqueNumbers: usedNumbers.size,
        validEntries: entries,
      });
    }

    lastDrawnPostId = postId;

    const summary = [
      "🎉🎊 本场直播抽奖结果 🎉🎊",
      "系统已自动回复中奖者：",
      ...winners.map((w, i) => {
        if (w.from?.id && w.from?.name) {
          return `- 第 ${i + 1} 位 @[${w.from.id}](${w.from.name}) ${w.number}`;
        } else {
          return `- 第 ${i + 1} 位留言 ${w.number}`;
        }
      }),
      "⚠️ 请查看你的号码下是否有回复！⚠️",
      "⚠️ 只限今天直播兑现，逾期无效 ⚠️",
    ].join('\n');

    if (!debug) {
      await fetch(MAKE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, winners, summary })
      });
    }

    res.status(200).json({ success: true, winners, summary });

  } catch (err) {
    res.status(500).json({ error: '抽奖失败', details: err.message });
  }
}
