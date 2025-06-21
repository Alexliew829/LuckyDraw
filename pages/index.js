// pages/index.js

import Head from 'next/head';

export default function Home() {
  return (
    <>
      <Head>
        <title>幸运抽奖</title>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="幸运抽奖" />
        <style>{`
          body {
            background: #f8f8f8;
            text-align: center;
            padding-top: 80px;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          }
          button {
            font-size: 24px;
            padding: 20px 40px;
            background-color: #c0392b;
            color: white;
            border: none;
            border-radius: 16px;
            box-shadow: 2px 2px 12px rgba(0,0,0,0.2);
          }
        `}</style>
      </Head>

      <main>
        <img src="/apple-touch-icon.png" alt="幸运图标" width="120" style={{ borderRadius: "24px" }} /><br /><br />
        <h2>点击按钮启动幸运抽奖</h2>
        <button onClick={() => {
          const hasDrawn = typeof window !== 'undefined' && localStorage.getItem('drawn');
          if (hasDrawn) {
            const confirmDraw = confirm("⚠️ 已抽奖一次，确认要再抽奖吗？");
            if (!confirmDraw) return;
          }
          localStorage.setItem('drawn', 'yes');
          window.location.href = '/api/draw'; // ⚠️ 使用你的域名路径
        }}>
          🎉 开始抽奖
        </button>
      </main>
    </>
  );
}
