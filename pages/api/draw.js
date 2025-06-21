// pages/api/draw.js

import fetch from 'node-fetch';

const PAGE_ID = process.env.PAGE_ID;
const ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL; // 场景B的 Webhook

export default async function handler(req, res) {
  try {
    // 获取最新贴文 ID
    const postRes = await fetch(
      `https://graph.facebook.com/${PAGE_ID}/posts?access_token=${ACCESS_TOKEN}&limit=1`
    );
    const postData = await postRes.json();
    const postId = postData?.data?.[0]?.id;

    if (!postId) {
      return res.status(404).json({ success: false, message: '❌ 无法取得最新贴文 ID' });
    }

    // 传送到 Make 抽奖流程（场景B）
    const makeRes = await fetch(MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId })
    });

    const result = await makeRes.text();

    return res.status(200).json({
      success: true,
      postId,
      message: '✅ 成功触发抽奖',
      winners: [],
      makeResult: result
    });
  } catch (err) {
    console.error('❌ 抽奖失败:', err);
    return res.status(500).json({
      success: false,
      message: '❌ 抽奖失败',
      error: err.message
    });
  }
}
