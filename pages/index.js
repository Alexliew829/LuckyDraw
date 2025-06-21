// pages/index.js
export default function HomePage() {
  const handleClick = () => {
    const hasDrawn = typeof window !== 'undefined' && localStorage.getItem('drawn');
    if (hasDrawn) {
      const confirmDraw = confirm("⚠️ 已抽奖一次，确认要再抽奖吗？");
      if (!confirmDraw) return;
    }
    localStorage.setItem('drawn', 'yes');
    window.location.href = '/api/drawTrigger';
  };

  return (
    <div style={{ background: '#f8f8f8', textAlign: 'center', paddingTop: '80px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
      <img src="/apple-touch-icon.png" alt="幸运图标" width="120" style={{ borderRadius: '24px' }} /><br /><br />
      <h2>点击按钮启动幸运抽奖</h2>
      <button
        onClick={handleClick}
        style={{
          fontSize: '24px',
          padding: '20px 40px',
          backgroundColor: '#c0392b',
          color: 'white',
          border: 'none',
          borderRadius: '16px',
          boxShadow: '2px 2px 12px rgba(0,0,0,0.2)'
        }}
      >
        🎉 开始抽奖
      </button>
    </div>
  );
}
