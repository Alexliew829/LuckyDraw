<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>幸运抽奖</title>
</head>
<body style="text-align: center; font-family: Arial, sans-serif; background: #ffffff; padding: 2rem;">
  <img src="/flower.png" alt="flower" style="width: 150px; margin-bottom: 1rem;" />
  <h2 style="margin: 0;">点击按钮启动幸运抽奖</h2>

  <button id="drawButton" onclick="confirmDraw()" style="margin-top: 2rem; padding: 1rem 2rem; font-size: 1.5rem; background-color: #c0392b; color: white; border: none; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); cursor: pointer;">
    抽奖中...
  </button>

  <script>
    async function confirmDraw() {
      const confirmResult = confirm("⚠️ 本场可能已抽奖一次，是否确认再次抽奖？");
      if (!confirmResult) return;

      const button = document.getElementById("drawButton");
      button.disabled = true;
      button.innerText = "抽奖中...";

      try {
        const res = await fetch("/api/draw?debug");
        const data = await res.json();

        if (data.error) {
          alert("❌ 抽奖失败，请稍后再试\n\n" + data.error);
        } else {
          alert("✅ 抽奖完成，已自动回复中奖者 🎉");
        }
      } catch (err) {
        alert("❌ 网络错误，请重试\n\n" + err.message);
      }

      button.disabled = false;
      button.innerText = "抽奖中...";
    }
  </script>
</body>
</html>
