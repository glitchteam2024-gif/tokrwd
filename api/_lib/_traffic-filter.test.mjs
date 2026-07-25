// Corroboration layer for /r. Run: node "api/_lib/_traffic-filter.test.mjs"
//
// The FIRST block is the one that matters: every user-agent a real buyer can arrive with must
// pass, with and without client hints. This layer exists to catch a client that lies about its
// device — if it ever starts costing real traffic it is worse than the bypass it closes.
import { evaluateRequest, isPositivelyDesktop, looksMobile } from './traffic-filter.js';

let pass = 0, fail = 0;
const eq = (n, g, w) => {
  const ok = JSON.stringify(g) === JSON.stringify(w);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`);
  if (!ok) { console.log(`   got:  ${JSON.stringify(g)}`); console.log(`   want: ${JSON.stringify(w)}`); fail++; } else pass++;
};

const ORIGIN = { origin: 'https://junielaoi.carrd.co' };
const ok = (ua, headers) => !evaluateRequest({
  userAgent: ua, clientDevice: 'm',
  headers: Object.assign({}, ORIGIN, headers), ttclid: 'E.C.P.abc123def456ghi',
}).reject;

const REAL = {
  'TikTok in-app iOS': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_34.5.0 JsSdk/2.0 NetType/WIFI',
  'TikTok in-app Android': 'Mozilla/5.0 (Linux; Android 13; SM-S918B Build/TP1A.220624.014) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 trill_340503 AppName/musical_ly',
  'TikTok Lite / BytedanceWebview': 'Mozilla/5.0 (Linux; Android 12; RMX3085) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36 BytedanceWebview/d8a21c6',
  'Safari iOS': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  'Chrome Android': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  'Firefox Android': 'Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0',
};
for (const [name, ua] of Object.entries(REAL)) eq(`real buyer passes — ${name}`, ok(ua), true);

// WebKit and Firefox never send Sec-CH-UA-*. Absence must never be evidence, or every iPhone
// buyer is dropped while headless Chromium passes.
eq('iOS Safari with NO client hints passes', ok(REAL['Safari iOS']), true);
eq('Chrome Android with Sec-CH-UA-Mobile ?1 passes',
  ok(REAL['Chrome Android'], { 'sec-ch-ua-mobile': '?1', 'sec-ch-ua-platform': '"Android"' }), true);
eq('missing Origin alone never rejects (privacy tools strip it)',
  !evaluateRequest({ userAgent: REAL['Safari iOS'], clientDevice: 'm', headers: {}, ttclid: 'E.C.P.abc' }).reject, true);
eq('short/placeholder ttclid alone never rejects — no published format to validate against',
  !evaluateRequest({ userAgent: REAL['Safari iOS'], clientDevice: 'm', headers: ORIGIN, ttclid: 'x' }).reject, true);

// ── the bypass this layer exists to close ────────────────────────────────────
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
eq('desktop UA claiming d=m is rejected', ok(DESKTOP), false);
eq('Windows UA claiming d=m is rejected', ok(WINDOWS), false);
eq('mobile UA but Sec-CH-UA-Mobile ?0 is rejected', ok(REAL['Chrome Android'], { 'sec-ch-ua-mobile': '?0' }), false);
eq('desktop platform hint + mobile claim is rejected',
  ok('Mozilla/5.0 (Unknown)', { 'sec-ch-ua-platform': '"Windows"' }), false);

// An honest desktop client is left to the existing device gate, not double-judged here.
eq('honest d=d raises no contradiction',
  evaluateRequest({ userAgent: DESKTOP, clientDevice: 'd', headers: ORIGIN, ttclid: 'x' }).reject, false);

// ── classifier edges ─────────────────────────────────────────────────────────
eq('unknown UA is NOT assumed desktop', isPositivelyDesktop('Mozilla/5.0 (Unknown Device)'), false);
eq('empty UA is NOT assumed desktop', isPositivelyDesktop(''), false);
eq('android tablet (no Mobile token) is not positively desktop', isPositivelyDesktop('Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 Safari/537.36'), false);
eq('iPadOS desktop-mode UA reads as desktop', isPositivelyDesktop('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15'), true);
eq('looksMobile on in-app Android', looksMobile(REAL['TikTok in-app Android']), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
