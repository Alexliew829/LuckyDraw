// pages/index.js
export default function Home() {
  return (
    <>
      <head>
        <title>幸运抽奖</title>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="幸运抽奖" />
      </head>

      <div style={{
        background: '#f8f8f8',
        textAlign: 'center',
        paddingTop: '80px',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif'
      }}>
        <img
          src="/apple-touch-icon.png"
          alt="幸运图标"
          width="120"
          style={{ borderRadius: '24px' }}
        /><br /><br />

        <h2>点击按钮启动幸运抽奖</h2>

        <button
          onClick={() => {
            window.location.href = 'https://lucky-draw-brown.vercel.app/api/draw';
          }}
          style={{
            fontSize: '24px',
            padding: '20px 40px',
            backgroundColor: '#c0392b',
            color: 'white',
            border: 'none',
            borderRadius: '16px',
            boxShadow: '2px 2px 12px rgba(0,0,0,0.2)',
          }}
        >
          🎉 开始抽奖
        </button>
      </div>
    </>
  );
}
