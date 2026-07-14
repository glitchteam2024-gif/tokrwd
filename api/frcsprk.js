module.exports = async function handler(req, res) {
  const dest = (req.query.dest || '').trim();

  if (!dest || !/^https?:\/\//i.test(dest)) {
    return res.status(400).send('Bad destination');
  }

  const escapedDest = JSON.stringify(dest);
  const attrDest    = dest.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta http-equiv="refresh" content="5; url=${attrDest}">
<style>
:root{--g:#22c55e;--g2:#16a34a;--glow:rgba(34,197,94,.55)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{-webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
body{
  font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,sans-serif;
  background:#000;color:#fff;
  min-height:100vh;min-height:100dvh;
  display:flex;align-items:center;justify-content:center;
  padding:24px;overflow:hidden;position:relative;
  cursor:pointer;-webkit-user-select:none;user-select:none
}
body::before{
  content:'';position:absolute;top:50%;left:50%;
  width:620px;height:620px;
  transform:translate(-50%,-50%);
  background:radial-gradient(circle,rgba(34,197,94,.15) 0%,rgba(34,197,94,.05) 35%,transparent 70%);
  filter:blur(40px);pointer-events:none;z-index:0
}
.wrap{position:relative;z-index:1;max-width:420px;width:100%;text-align:center}
.spinner{
  width:64px;height:64px;margin:0 auto 32px;
  border:3px solid rgba(34,197,94,.15);
  border-top-color:var(--g);
  border-radius:50%;animation:spin 1s linear infinite
}
@keyframes spin{to{transform:rotate(360deg)}}
.prog-wrap{
  width:100%;max-width:280px;margin:0 auto 24px;
  height:4px;background:rgba(255,255,255,.08);
  border-radius:4px;overflow:hidden
}
.prog-bar{
  height:100%;
  background:linear-gradient(90deg,var(--g),var(--g2));
  border-radius:4px;animation:load 1.8s ease-out forwards
}
@keyframes load{0%{width:0}60%{width:75%}80%{width:82%}100%{width:85%}}
h1{font-size:20px;font-weight:600;line-height:1.3;margin-bottom:10px;opacity:.9}
.sub{font-size:14px;color:#6a6f75;line-height:1.5;margin-bottom:32px}
.hint{font-size:13px;color:rgba(255,255,255,.35);opacity:0;animation:fadeIn .3s ease forwards;animation-delay:2.2s}
@keyframes fadeIn{to{opacity:1}}
.cta{
  display:block;width:100%;
  background:linear-gradient(135deg,var(--g),var(--g2));
  color:#000;font-size:15px;font-weight:700;
  text-align:center;padding:18px;border-radius:999px;
  letter-spacing:1.5px;text-transform:uppercase;
  border:0;font-family:inherit;cursor:pointer;
  box-shadow:0 0 40px var(--glow),0 6px 24px rgba(0,0,0,.4);
  margin-bottom:16px;animation:pulse 2s ease-in-out infinite
}
.cta:active{transform:scale(.97)}
@keyframes pulse{
  0%,100%{box-shadow:0 0 40px var(--glow),0 6px 24px rgba(0,0,0,.4)}
  50%{box-shadow:0 0 70px var(--glow),0 6px 24px rgba(0,0,0,.4)}
}
.lock{display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px;color:#4a4f55;margin-top:12px}
.lock svg{width:12px;height:12px}
</style>
</head>
<body id="body">
<div class="wrap">
  <div class="spinner"></div>
  <div class="prog-wrap"><div class="prog-bar"></div></div>
  <h1>Opening secure browser...</h1>
  <p class="sub">Connecting you to a secure page</p>
  <button class="cta" id="cta">Continue</button>
  <p class="hint">Tap anywhere to continue</p>
  <div class="lock">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
         stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
    <span>Secure connection</span>
  </div>
</div>

<script>
(function(){
  var DEST = ${escapedDest};
  var ua   = navigator.userAgent || '';

  function getDestParam(url, key) {
    try {
      var decoded = decodeURIComponent(url);
      var match   = decoded.match(new RegExp('[?&]' + key + '=([^&]+)'));
      return match ? decodeURIComponent(match[1]) : '';
    } catch(e) { return ''; }
  }

  var placement         = getDestParam(DEST, 'placement');
  var isTikTokPlacement = /tiktok/i.test(placement);

  var SOCIAL_RE = /TikTok|musical_ly|musical\\.ly|ByteLocX|ByteLocale|bytedance|BytedanceWebview|FBAN|FBAV|FB_IAB|FBIOS|Instagram|Snapchat|Pinterest|LinkedInApp|Line\\/|Twitter|WhatsApp/i;

  var isAndroid = /Android/i.test(ua);
  var isIOS     = /iPhone|iPad|iPod/i.test(ua);

  var inIAB = (
    isTikTokPlacement ||
    SOCIAL_RE.test(ua) ||
    (/wv/.test(ua) && isAndroid) ||
    (isIOS && /AppleWebKit/.test(ua) && !/Safari\\//.test(ua))
  );

  function navTo(url) {
    try { window.top.location.replace(url); } catch(e) {
      try { window.top.location.href = url; } catch(e2) {
        window.location.replace(url);
      }
    }
  }

  if (!inIAB) {
    navTo(DEST);
    return;
  }

  var _fired = false;

  function androidBreakout() {
    var intentUrl = 'intent://'
      + DEST.replace(/^https?:\\/\\//, '')
      + '#Intent;scheme=https;package=com.android.chrome;'
      + 'S.browser_fallback_url=' + encodeURIComponent(DEST) + ';end;';
    try { window.location.href = intentUrl; } catch(e) { navTo(DEST); }
    setTimeout(function(){ if (!document.hidden) navTo(DEST); }, 2500);
  }

  function iosBreakout() {
    try {
      window.location.href = 'googlechrome-x-callback://x-callback-url/open?url='
        + encodeURIComponent(DEST);
    } catch(e) {}

    setTimeout(function(){
      if (document.hidden) return;
      var w = null;
      try { w = window.open(DEST, '_blank'); } catch(e) {}
      if (!w || w.closed || typeof w.closed === 'undefined') {
        try {
          var a = document.createElement('a');
          a.href = DEST; a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.style.cssText = 'position:absolute;opacity:0;pointer-events:none';
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
        } catch(e2) {}
      }
    }, 350);

    setTimeout(function(){
      if (document.hidden) return;
      try { window.location.href = DEST.replace(/^https:\\/\\//, 'safari-https://'); } catch(e) {}
    }, 1100);

    setTimeout(function(){ if (!document.hidden) navTo(DEST); }, 3000);
  }

  function fire() {
    if (_fired) return;
    _fired = true;
    if (isAndroid)  androidBreakout();
    else if (isIOS) iosBreakout();
    else            navTo(DEST);
  }

  if (isIOS) {
    document.addEventListener('touchstart', function iosHandler(){
      document.removeEventListener('touchstart', iosHandler);
      fire();
    }, { passive: true, once: true });
    setTimeout(function(){
      if (!_fired && !document.hidden) {
        try {
          window.location.href = 'googlechrome-x-callback://x-callback-url/open?url='
            + encodeURIComponent(DEST);
        } catch(e) {}
      }
    }, 800);
  }

  var autoTimer = null;
  if (isAndroid) { autoTimer = setTimeout(fire, 1200); }

  function cancelAndFire() {
    if (autoTimer) clearTimeout(autoTimer);
    fire();
  }

  var cta = document.getElementById('cta');
  if (cta) {
    cta.addEventListener('touchstart', function(e){ e.preventDefault(); cancelAndFire(); }, { passive: false, once: true });
    cta.addEventListener('click',      function(e){ e.preventDefault(); cancelAndFire(); }, { once: true });
  }

  document.getElementById('body').addEventListener('click', function(){ cancelAndFire(); }, { once: true });

  setTimeout(function(){ if (!_fired) { _fired = true; navTo(DEST); } }, 5000);

})();
</script>
</body>
</html>`;

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy',
    "frame-ancestors *; script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  return res.status(200).send(html);
};
