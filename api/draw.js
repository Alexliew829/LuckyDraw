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
    const cache = (global.drawnCache ||= {});
    if (cache[key]) {
      return res.status(403).json({ success: false, message: '⚠️ 本场直播已抽奖，不能重复' });
    }
    cache[key] = true;
  }

  // 获取留言
  const commentRes = await fetch(`https://graph.facebook.com/${postId}/comments?access_token=${ACCESS_TOKEN}&filter=stream&limit=200`);
  const commentData = await commentRes.json();
  const comments = commentData?.data || [];

  // 提取有效留言（包含 01~99 数字）
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
      comment_id: c.i_
