// 公開前台設定；API 由 Cloudflare Pages 的 _worker.js 處理。
// 後端網址可在 Pages 設定 POS_API_BASE；預設沿用原後端。
window.POS_CONFIG = Object.freeze({
  brand: "TENDER'S BAR",
  subtitle: '長庚大學飲料調製研究社',
  apiBase: '/api',
  currency: 'TWD',
  // false：桌號只能來自掃碼網址；true：允許顧客從清單手動選桌。
  allowSeatSelection: false,
  seatTTLHours: 12,
  catalogCacheMinutes: 15,
  historyRefreshSeconds: 30
});
