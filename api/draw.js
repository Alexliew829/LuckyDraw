<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>幸运抽奖系统</title>
  <link rel="icon" href="/favicon.ico" />
  <style>
    body {
      font-family: sans-serif;
      text-align: center;
      padding: 2rem;
      background-color: #f5f5f5;
    }
    button {
      font-size: 1.5rem;
      padding: 1rem 2rem;
      border: none;
      background-color: #28a745;
      color: white;
      border-radius: 8px;
      cursor: pointer;
    }
    #result {
      margin-top: 2rem;
      font-size: 1rem;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <h1>🎁 Facebook 直播抽奖</h1>
  <p>请点击下方按钮开始抽奖</p>

  <button onclick="confirmDraw()">🎲 开始抽奖</button>

  <div id="result">📋 抽奖将从最新贴文留言中选出 3 位得奖者</div>

  <script>
    async function confirmDraw() {
      const confirmed = confirm("⚠️ 本场可能已抽奖一次，是否确认再次抽奖？");
      if (!confirmed) return;

      document.getElementById("result").innerText = "正在抽奖，请稍候...";

      try {
        const res = await fetch("/api/draw?debug");
        const data = await res.json();
        if (data.error) {
          document.getElementById("result").innerText = "❌ 抽奖失败：" + data.error;
        } else {
          document.getElementById("result").innerText = "✅ 抽奖成功！已留言通知中奖者 🎉\n请查看贴文留言区";
        }
      } catch (err) {
        document.getElementById("result").innerText = "❌ 网络错误：" + err.message;
      }
    }
  </script>
</body>
</html>
