export default function handler(req, res) {
  const SAFE_PAGE  = 'https://tokrwd.co/Rewards/';
  const CLICK_BASE = 'https://kpevc9.mcgo2.com/click'; // ✅ FIXED

  // --- BOT GATE ---
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  const botPatterns = [
    'googlebot','bingbot','slurp','duckduckbot','baiduspider',
    'yandexbot','facebookexternalhit','facebot','twitterbot',
    'linkedinbot','whatsapp','telegrambot','discordbot','pinterest',
    'semrushbot','ahrefsbot','mj12bot','dotbot','petalbot',
    'bytespider','applebot','crawler','spider','scraper',
    'headless','phantom','selenium','puppeteer','playwright',
    'wget','curl','httpie','python-requests','go-http-client',
    'java/','apache-httpclient','okhttp','node-fetch','axios'
  ];
  const isBot   = botPatterns.some(p => ua.includes(p));
  const hasNoUA = !req.headers['user-agent'] || req.headers['user-agent'].trim() === '';
  if (isBot || hasNoUA) {
    res.setHeader('Cache-Control','no-store');
    return res.redirect(302, SAFE_PAGE);
  }

  // --- READ PARAMS MAXCONV PASSES TO THIS LANDER ---
  // In MaxConv, set your lander URL as:
  // https://yourdomain.com/api/fc1?s1={s1}&click_id={click_id}&ttclid={ttclid}
  const s1      = (req.query.s1       || req.query.campid || '').toString().trim();
  const clickId = (req.query.click_id || '').toString().trim();
  const ttclid  = (req.query.ttclid   || '').toString().trim();

  // Build click URL server-side — never exposed in raw source
  const clickUrl = new URL(CLICK_BASE);
  if (s1)      clickUrl.searchParams.set('s1',       s1);
  if (clickId) clickUrl.searchParams.set('click_id', clickId);
  if (ttclid)  clickUrl.searchParams.set('ttclid',   ttclid);
  const CTA_URL = clickUrl.toString();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover,maximum-scale=1.0,user-scalable=no">
<meta name="theme-color" content="#000">
<meta name="robots" content="noindex,nofollow">
<title>Freecash — Get Paid to Play</title>
<style>
:root{
  --g:#22c55e;--g2:#16a34a;--glow:rgba(34,197,94,.5);
  --bg:#060606;--card:#111;--border:rgba(255,255,255,.07);--muted:#6b7280;
}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,sans-serif;
  background:var(--bg);color:#fff;
  -webkit-font-smoothing:antialiased;
  -webkit-tap-highlight-color:transparent;
  touch-action:manipulation;overflow-x:hidden;
}

/* NOTIFY BAR */
.notify-bar{
  background:linear-gradient(90deg,rgba(34,197,94,.15),rgba(34,197,94,.08));
  border-bottom:1px solid rgba(34,197,94,.2);
  padding:10px 16px;text-align:center;
  font-size:12px;color:#86efac;font-weight:500;letter-spacing:.3px;
}
.notify-bar span{color:#fff;font-weight:700}

/* HERO */
.hero{padding:32px 20px 24px;text-align:center;position:relative;overflow:hidden}
.hero::before{
  content:'';position:absolute;top:-80px;left:50%;transform:translateX(-50%);
  width:500px;height:500px;
  background:radial-gradient(circle,rgba(34,197,94,.12) 0%,transparent 65%);
  pointer-events:none;
}
.logo{
  display:inline-flex;align-items:center;gap:8px;
  margin-bottom:24px;font-size:20px;font-weight:800;
  color:var(--g);letter-spacing:-.5px;
}
.logo-dot{
  width:8px;height:8px;border-radius:50%;
  background:var(--g);animation:pulse 2s infinite;
}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.3)}}
.badge{
  display:inline-block;
  background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.3);
  color:var(--g);font-size:11px;font-weight:600;letter-spacing:1.5px;
  text-transform:uppercase;padding:5px 12px;border-radius:999px;margin-bottom:16px;
}
.hero h1{font-size:28px;font-weight:800;line-height:1.2;margin-bottom:12px;letter-spacing:-.5px}
.hero h1 em{color:var(--g);font-style:normal}
.hero p{
  font-size:15px;color:#9ca3af;line-height:1.6;margin-bottom:28px;
  max-width:320px;margin-left:auto;margin-right:auto;
}

/* CTA */
.cta-btn{
  display:block;width:100%;max-width:420px;margin:0 auto;
  background:linear-gradient(135deg,var(--g),var(--g2));
  color:#000;font-size:15px;font-weight:800;text-align:center;
  padding:18px 24px;border-radius:14px;text-decoration:none;
  letter-spacing:.5px;text-transform:uppercase;border:0;
  font-family:inherit;cursor:pointer;
  box-shadow:0 0 40px var(--glow),0 8px 32px rgba(0,0,0,.5);
  animation:ctaPulse 2.5s ease-in-out infinite;
  position:relative;overflow:hidden;
}
.cta-btn::after{
  content:'';position:absolute;inset:0;
  background:linear-gradient(135deg,rgba(255,255,255,.15) 0%,transparent 60%);
  pointer-events:none;
}
.cta-btn:active{transform:scale(.97)}
@keyframes ctaPulse{
  0%,100%{box-shadow:0 0 40px var(--glow),0 8px 32px rgba(0,0,0,.5)}
  50%{box-shadow:0 0 80px var(--glow),0 8px 32px rgba(0,0,0,.5)}
}
.cta-sub{font-size:12px;color:#4b5563;text-align:center;margin-top:10px}

/* STATS */
.stats{
  display:grid;grid-template-columns:repeat(3,1fr);
  gap:1px;background:var(--border);
  border-top:1px solid var(--border);border-bottom:1px solid var(--border);
  margin:24px 0;
}
.stat{background:var(--bg);padding:16px 8px;text-align:center}
.stat-val{font-size:18px;font-weight:800;color:var(--g);line-height:1;margin-bottom:4px}
.stat-lbl{font-size:10px;color:var(--muted);line-height:1.3;text-transform:uppercase;letter-spacing:.5px}

/* SECTION */
.section{padding:24px 20px}
.section-title{
  font-size:11px;font-weight:700;color:var(--muted);
  text-transform:uppercase;letter-spacing:1.5px;margin-bottom:16px;
}

/* OFFER CARDS */
.offers{display:flex;flex-direction:column;gap:12px}
.offer-card{
  background:var(--card);border:1px solid var(--border);
  border-radius:16px;padding:16px;
  display:flex;align-items:center;gap:14px;
  position:relative;overflow:hidden;
}
.offer-card::before{
  content:'';position:absolute;top:0;left:0;
  width:3px;height:100%;background:var(--g);
}
.offer-icon{
  width:48px;height:48px;border-radius:12px;
  background:linear-gradient(135deg,#1a1a1a,#222);
  border:1px solid var(--border);
  display:flex;align-items:center;justify-content:center;
  font-size:22px;flex-shrink:0;
}
.offer-info{flex:1;min-width:0}
.offer-name{font-size:14px;font-weight:700;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.offer-type{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px}
.offer-earn{text-align:right;flex-shrink:0}
.offer-earn-lbl{font-size:9px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px}
.offer-earn-val{font-size:20px;font-weight:800;color:var(--g);line-height:1}

/* STEPS */
.steps{display:flex;flex-direction:column;gap:16px}
.step{display:flex;gap:14px;align-items:flex-start}
.step-num{
  width:32px;height:32px;border-radius:50%;
  background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.3);
  display:flex;align-items:center;justify-content:center;
  font-size:13px;font-weight:800;color:var(--g);flex-shrink:0;
}
.step-text h3{font-size:14px;font-weight:700;margin-bottom:3px}
.step-text p{font-size:13px;color:var(--muted);line-height:1.5}

/* REVIEWS */
.reviews{display:flex;flex-direction:column;gap:12px}
.review{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px}
.review-stars{color:#fbbf24;font-size:12px;margin-bottom:8px}
.review-text{font-size:13px;color:#d1d5db;line-height:1.6;margin-bottom:10px}
.review-author{display:flex;align-items:center;gap:8px}
.review-avatar{
  width:28px;height:28px;border-radius:50%;
  background:linear-gradient(135deg,var(--g),var(--g2));
  display:flex;align-items:center;justify-content:center;
  font-size:11px;font-weight:700;color:#000;
}
.review-name{font-size:12px;font-weight:600}
.review-time{font-size:11px;color:var(--muted)}

/* PAYMENT */
.payment-row{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}
.pay-badge{
  background:var(--card);border:1px solid var(--border);
  border-radius:8px;padding:8px 14px;font-size:12px;font-weight:600;color:#9ca3af;
}

/* TRUST BAR */
.trust-bar{
  background:var(--card);
  border-top:1px solid var(--border);border-bottom:1px solid var(--border);
  padding:14px 20px;
  display:flex;align-items:center;justify-content:center;gap:10px;
  margin:8px 0;
}
.trust-score{font-size:22px;font-weight:800}
.trust-label{font-size:11px;color:var(--muted);line-height:1.4}
.trust-stars{color:#00b67a;font-size:16px;display:block}

/* STICKY CTA */
.sticky-cta{
  position:fixed;bottom:0;left:0;right:0;
  background:rgba(6,6,6,.97);
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  border-top:1px solid rgba(34,197,94,.2);
  padding:12px 20px calc(12px + env(safe-area-inset-bottom));
  z-index:100;
}
.sticky-inner{max-width:480px;margin:0 auto;display:flex;align-items:center;gap:12px}
.sticky-info{flex:1}
.sticky-earn{font-size:11px;color:var(--muted);line-height:1.3}
.sticky-earn strong{color:var(--g);font-size:14px;display:block}
.sticky-btn{
  background:linear-gradient(135deg,var(--g),var(--g2));
  color:#000;font-size:13px;font-weight:800;
  padding:14px 20px;border-radius:12px;border:0;
  font-family:inherit;cursor:pointer;white-space:nowrap;
  letter-spacing:.3px;text-transform:uppercase;flex-shrink:0;
  box-shadow:0 0 24px var(--glow);
}
.sticky-btn:active{transform:scale(.97)}
.bottom-pad{height:90px}
.divider{height:1px;background:var(--border);margin:4px 0}
</style>
</head>
<body>

<!-- TOP BAR -->
<div class="notify-bar">
  🔥 <span>115,876+</span> people joined in the last 24 hours — offers filling fast
</div>

<!-- HERO -->
<div class="hero">
  <div class="logo"><div class="logo-dot"></div>Freecash</div>
  <div class="badge">✓ Verified Earning Platform</div>
  <h1>Get Paid for Playing<br><em>Games & Surveys</em></h1>
  <p>Test apps, play casual games, and complete surveys — earn real cash and gift cards, paid out instantly.</p>
  <button class="cta-btn" id="heroCta">Start Earning — It's Free</button>
  <p class="cta-sub">Free to join · No payment info needed · Instant cashouts</p>
</div>

<!-- STATS ROW -->
<div class="stats">
  <div class="stat">
    <div class="stat-val">$391</div>
    <div class="stat-lbl">Max Per<br>Offer</div>
  </div>
  <div class="stat">
    <div class="stat-val">1,169</div>
    <div class="stat-lbl">Offers<br>Live Now</div>
  </div>
  <div class="stat">
    <div class="stat-val">$300M+</div>
    <div class="stat-lbl">Total<br>Paid Out</div>
  </div>
</div>

<!-- OFFER CARDS -->
<div class="section">
  <div class="section-title">🎮 Top Offers Right Now</div>
  <div class="offers">
    <div class="offer-card">
      <div class="offer-icon">🏝️</div>
      <div class="offer-info">
        <div class="offer-name">Sunshine Island</div>
        <div class="offer-type">Get Gift Cards</div>
      </div>
      <div class="offer-earn">
        <div class="offer-earn-lbl">Up to</div>
        <div class="offer-earn-val">$391</div>
      </div>
    </div>
    <div class="offer-card">
      <div class="offer-icon">🏰</div>
      <div class="offer-info">
        <div class="offer-name">Domino Dreams</div>
        <div class="offer-type">Play & Earn</div>
      </div>
      <div class="offer-earn">
        <div class="offer-earn-lbl">Up to</div>
        <div class="offer-earn-val">$300</div>
      </div>
    </div>
    <div class="offer-card">
      <div class="offer-icon">🥗</div>
      <div class="offer-info">
        <div class="offer-name">HelloFresh</div>
        <div class="offer-type">Order & Earn</div>
      </div>
      <div class="offer-earn">
        <div class="offer-earn-lbl">Up to</div>
        <div class="offer-earn-val">$22</div>
      </div>
    </div>
  </div>
</div>

<div class="divider"></div>

<!-- HOW IT WORKS -->
<div class="section">
  <div class="section-title">⚡ How It Works</div>
  <div class="steps">
    <div class="step">
      <div class="step-num">1</div>
      <div class="step-text">
        <h3>Create Your Free Account</h3>
        <p>Sign up in under 60 seconds. No payment info, no commitment.</p>
      </div>
    </div>
    <div class="step">
      <div class="step-num">2</div>
      <div class="step-text">
        <h3>Complete Offers</h3>
        <p>Pick from 1,169+ live offers — play games, test apps, take surveys. Most take 5–10 minutes.</p>
      </div>
    </div>
    <div class="step">
      <div class="step-num">3</div>
      <div class="step-text">
        <h3>Get Paid Instantly</h3>
        <p>Cash out to PayPal, Bitcoin, Amazon, Google Play and more. Min cashout as low as $5.</p>
      </div>
    </div>
  </div>
</div>

<div class="divider"></div>

<!-- TRUSTPILOT -->
<div class="trust-bar">
  <div class="trust-score">4.8</div>
  <div class="trust-label">
    <span class="trust-stars">★★★★★</span>
    Based on <strong>297,844 reviews</strong> on Trustpilot
  </div>
</div>

<!-- REVIEWS -->
<div class="section">
  <div class="section-title">💬 What Members Say</div>
  <div class="reviews">
    <div class="review">
      <div class="review-stars">★★★★★</div>
      <div class="review-text">Freecash is one of the most reliable platforms I've used. Payments are superfast — I received my first payout within minutes of signing up.</div>
      <div class="review-author">
        <div class="review-avatar">R</div>
        <div>
          <div class="review-name">Ruslan</div>
          <div class="review-time">1 day ago</div>
        </div>
      </div>
    </div>
    <div class="review">
      <div class="review-stars">★★★★★</div>
      <div class="review-text">Honest review: you can make real cash and cash out daily multiple times. Was skeptical at first but I WAS WRONG. LOVE FREECASH.</div>
      <div class="review-author">
        <div class="review-avatar">D</div>
        <div>
          <div class="review-name">Diamond Extracts</div>
          <div class="review-time">5 days ago</div>
        </div>
      </div>
    </div>
    <div class="review">
      <div class="review-stars">★★★★★</div>
      <div class="review-text">Best play-to-earn source I've found. My mother made almost $2k in a couple months. Highest paying offers and fastest cashouts — no other site compares.</div>
      <div class="review-author">
        <div class="review-avatar">S</div>
        <div>
          <div class="review-name">dylan_m</div>
          <div class="review-time">9 days ago</div>
        </div>
      </div>
    </div>
  </div>
</div>

<div class="divider"></div>

<!-- PAYMENT METHODS -->
<div class="section" style="text-align:center">
  <div class="section-title" style="text-align:center">💳 Cash Out Via</div>
  <div class="payment-row">
    <div class="pay-badge">PayPal</div>
    <div class="pay-badge">Bitcoin</div>
    <div class="pay-badge">Amazon</div>
    <div class="pay-badge">Google Play</div>
    <div class="pay-badge">Ethereum</div>
    <div class="pay-badge">Gift Cards</div>
  </div>
</div>

<!-- BOTTOM CTA -->
<div class="section">
  <button class="cta-btn" id="bottomCta" style="max-width:100%">Claim Your Rewards — Start Now</button>
  <p class="cta-sub" style="margin-top:10px">$23.90 avg. withdrawal yesterday · First earn in ~17 minutes</p>
</div>

<div class="bottom-pad"></div>

<!-- STICKY FOOTER -->
<div class="sticky-cta">
  <div class="sticky-inner">
    <div class="sticky-info">
      <div class="sticky-earn">
        <strong>Earn up to $391</strong>
        per offer · Free to join
      </div>
    </div>
    <button class="sticky-btn" id="stickyCta">Start Now →</button>
  </div>
</div>

<script>
(function(){
  var URL=${JSON.stringify(CTA_URL).replace(/</g,'\\u003c')};

  function go(e){
    if(e){e.preventDefault();e.stopPropagation();}
    window.location.href=URL;
  }

  document.getElementById('heroCta').addEventListener('click',go);
  document.getElementById('bottomCta').addEventListener('click',go);
  document.getElementById('stickyCta').addEventListener('click',go);

  // Devtools trap
  document.addEventListener('contextmenu',function(e){e.preventDefault();});
  document.onkeydown=function(e){
    if(e.keyCode===123||(e.ctrlKey&&e.shiftKey&&(e.keyCode===73||e.keyCode===74))||(e.ctrlKey&&e.keyCode===85))return false;
  };
  setInterval(function(){
    var t=performance.now();debugger;
    if(performance.now()-t>100){window.location.href='https://tokrwd.co/Rewards/';}
  },1000);
})();
</script>
</body>
</html>`;

  res.setHeader('Cache-Control','no-store');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.setHeader('X-Frame-Options','ALLOWALL');
  res.setHeader('Content-Security-Policy',"frame-ancestors *; script-src 'self' 'unsafe-inline'");
  return res.status(200).send(html);
}
