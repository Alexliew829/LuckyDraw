// pages/api/draw.js
import { createHash } from 'crypto';

const PAGE_ID = process.env.PAGE_ID;
const PAGE_TOKEN = process.env.FB_ACCESS_TOKEN;

// 工具函数：提取留言中的号码（支持 B01、a88、08 等）
function extractNumber(text) {
  const match = text.match(/(?:^|\D)(\d{1,2})(?:\D|$)/);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  return num >= 1 && num <= 99 ? num.toString().padStart(2, '0') : null;
}

export default async function handler(req, res) {
  const isDebug = req.query.debug !== undefined;

  try {
    // 1. 获取最新贴文 ID
    const postRes = await fetch(`https://graph.facebook.com/${PAGE_ID}/posts?access_token=${PAGE_TOKEN}&limit=1`);
    const postData = await postRes.json();
    const post_id = postData?.data?.[0]?.id;
    if (!post_id) throw new Error('无法取得贴文 ID');

    // 2. 获取留言
    const commentsRes = await fetch(`https://graph.facebook.com/${post_id}/comments?access_token=${PAGE_TOKEN}&filter=stream&limit=200&fields=from,message`);
    const commentsData = await commentsRes.json();
    const comments = commentsData?.data || [];

    // 3. 筛选访客留言 + 抓号码
    const valid = [];
    const usedUsers = new Set();
    const usedNumbers = new Set();

    for (const c of comments) {
      if (!c.message) continue;
      if (c.from?.id === PAGE_ID) continue;
      const number = extractNumber(c.message);
      if (!number) continue;
      if (usedUsers.has(c.from?.id)) continue;
      if (usedNumbers.has(number)) continue;
      valid.push({ id: c.id, from: c.from, number });
      usedUsers.add(c.from?.id);
      usedNumbers.add(number);
      if (valid.length === 3) break;
    }

    if (valid.length < 3 && !isDebug) {
      return res.status(400).json({
        error: '抽奖失败：有效留言不足 3 条（需包含号码、访客、非主页）',
        total: comments.length
      });
    }

    // 4. 构建结果（中英文）
    const list = valid.map(w => {
      if (w.from?.id && w.from?.name) return `@[${w.from.id}](${w.from.name}) ${w.number}`;
      return `- 留言号码 ${w.number}`;
    }).join('\n');

    const result = `🎉🎊 本场直播抽奖结果 🎉🎊\n系统已自动回复中奖者：\n${list}\n⚠️ 请查看你的号码下是否有回复！⚠️\n⚠️ 只限今天直播兑现，逾期无效 ⚠️`;

    return res.status(200).json({ winners: valid, post_id, result });
  } catch (err) {
    return res.status(500).json({ error: '网络错误，请检查网络连接', details: err.message });
  }
}
