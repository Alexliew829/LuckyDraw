// ✅ LuckyDraw 触发抽奖的主 API
// 路径：pages/api/drawTrigger.js

import fetch from 'node-fetch';

const PAGE_ID = process.env.PAGE_ID;
const ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
const MAKE_TRIGGER_WEBHOOK = process.env.MAKE_TRIGGER_WEBHOOK; // 场景1 Webhook

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

    // 发送 POST 请求到 Make 场景 1 Webhook，传送 postId
    const makeRes = await fetch(MAKE_TRIGGER_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId })
    });

    const result = await makeRes.text();

    return res.status(200).json({
      success: true,
      postId,
      makeResponse: result,
      message: '✅ 已成功触发抽奖流程'
    });
  } catch (err) {
    console.error('触发失败', err);
    return res.status(500).json({
      success: false,
      message: '❌ 抽奖触发失败',
      error: err.message
    });
  }
}
