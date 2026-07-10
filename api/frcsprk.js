export default function handler(req, res) {
  // ===================================================================
  // frcsprk — Server-side 302 redirect (WebView breakout replacement)
  //
  // This replaces the old frcsprk/index.html which served an HTML page
  // with JavaScript breakout logic. That caused iOS to show an "Open in
  // browser" prompt. A pure 302 redirect at the HTTP level is invisible
  // to the user — the WebView/browser silently follows the redirect
  // without rendering any page (like cs350.com/ob-b).
  //
  // Flow: TikTok ad → tokrwd.co/frcsprk?dest=<encoded MaxConv URL>&ttclid=X
  //       → 302 to the dest URL with all params forwarded
  // ===================================================================

  // --- Bot/Crawler Detection (server-side) ---
  const SAFE_PAGE = 'https://www.tokrwd.co/Rewards/';
  const ua = (req.headers['user-agent'] || '').toLowerCase();

  const botPatterns = [
    'googlebot', 'bingbot', 'slurp', 'duckduckbot', 'baiduspider',
    'yandexbot', 'facebookexternalhit', 'facebot', 'twitterbot',
    'linkedinbot', 'whatsapp', 'telegrambot', 'discordbot', 'pinterest',
    'semrushbot', 'ahrefsbot', 'mj12bot', 'dotbot', 'petalbot',
    'bytespider', 'applebot', 'crawler', 'spider', 'scraper',
    'headless', 'phantom', 'selenium', 'puppeteer', 'playwright',
    'wget', 'curl', 'httpie', 'python-requests', 'go-http-client',
    'java/', 'apache-httpclient', 'okhttp', 'node-fetch', 'axios'
  ];

  const isBot = botPatterns.some(p => ua.includes(p));
  if (isBot) {
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, SAFE_PAGE);
  }

  // --- Validate ttclid (no real click = silent fail) ---
  const ttclid = (req.query.ttclid || '').toString().trim();
  if (!ttclid || ttclid === '__CLICKID__' || ttclid.length < 5) {
    // Silent fail — return 200 with empty body (no redirect, no page)
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send('');
  }

  // --- Read dest param ---
  const dest = (req.query.dest || '').toString().trim();
  if (!dest) {
    // No destination — silent fail
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send('');
  }

  // --- Build final redirect URL ---
  let targetUrl;
  try {
    targetUrl = new URL(dest);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send('');
  }

  // Forward all query params from the incoming request onto the dest URL
  // (except 'dest' itself and reserved keys s1/s2)
  const skip = new Set(['dest', 's1', 's2']);
  for (const [key, value] of Object.entries(req.query)) {
    if (!skip.has(key)) {
      targetUrl.searchParams.set(key, value);
    }
  }

  // Tag s1 with variant suffix so MaxConv can identify this path
  const existingS1 = targetUrl.searchParams.get('s1') || '';
  const taggedS1 = existingS1 ? existingS1 + 'frcsprk' : 'frcsprk';
  targetUrl.searchParams.set('s1', taggedS1);

  // lp_variant for MaxConv Token 9
  targetUrl.searchParams.set('lp_variant', 'frcsprk');

  // --- Issue the 302 redirect ---
  const finalUrl = targetUrl.toString();

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');

  return res.redirect(302, finalUrl);
}
