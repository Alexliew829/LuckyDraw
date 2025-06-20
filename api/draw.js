export default async function handler(req, res) {
  const PAGE_ID = process.env.PAGE_ID;
  const PAGE_TOKEN = process.env.FB_ACCESS_TOKEN;
  const DEBUG = req.query.debug !== undefined;
  const MAKE_WEBHOOK = process.env.MAKE_WEBHOOK_URL;
  const POST_ID = req.query.postId || null;

  try {
    let postId = POST_ID;
    if (!postId) {
      const postRes = await fetch(`https://graph.facebook.com/${PAGE_ID}/posts?access_token=${PAGE_TOKEN}&limit=5`);
      const postData = await postRes.json();
      if (!postData?.data?.length) {
        return res.status(404).json({ error: '找不到贴文（API 返回空）', raw: postData });
      }
      postId = postData.data[0].id;
    }

    // 抓取留言
    const allComments = [];
    let nextPage = `https://graph.facebook.com/${postId}/comments?access_token=${PAGE_TOKEN}&fields=id,message,from&limit=100`;

    while (nextPage) {
      const res = await fetch(nextPage);
      const data = await res.json();
      allComments.push(...(data.data || []));
      nextPage = data.paging?.next || null;
    }

    const validEntries = [];
    const regex = /([1-9][0-9]?)/;

    for (const comment of allComments) {
      const msg = comment.message || '';
      const match = msg.match(regex);
      const userId = comment.from?.id || null;
      const userName = comment.from?.name || null;

      if (!match || userId === PAGE_ID) continue;

      const number = match[1].padStart(2, '0');
      validEntries.push({
        comment_id: comment.id,
        from: userId ? { id: userId, name: userName } : null,
        number,
        message: msg,
      });
    }

    if (validEntries.length < 3) {
      return res.status(400).json({ error: '有效留言不足 3 条', total: validEntries.length });
    }

    function shuffle(array) {
      let currentIndex = array.length;
      while (currentIndex !== 0) {
        const randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
      }
      return array;
    }

    const winners = [];
    const usedIds = new Set();
    const usedNumbers = new Set();

    for (const entry of shuffle(validEntries)) {
      const uid = entry.from?.id || entry.comment_id;
      if (usedIds.has(uid)) continue;
      if (usedNumbers.has(entry.number)) continue;

      winners.push(entry);
      usedIds.add(uid);
      usedNumbers.add(entry.number);
      if (winners.length === 3) break;
    }

    if (winners.length < 3) {
      return res.status(400).json({ error: '无法抽出三位不重复用户+号码', total: winners.length });
    }

    const replyMessage = `🎉🎊 恭喜你获得折扣卷 RM100.00 🎉🎊\n🎉🎉 Congratulations! You’ve won a RM100 discount voucher! 🎉🎉\n⚠️⚠️ 只限今天直播兑现，逾期无效 ⚠️⚠️\n⚠️⚠️ Valid only during today’s live stream. ⚠️⚠️\n❌❌ 不得转让 ❌❌\n❌❌ Non-transferable ❌❌`;
    const results = [];

    function delay(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    for (const winner of winne
