// The front (/r) must answer every visitor the same way. Run: node "api/_lib/_front-routing.test.mjs"
//
// This is the regression test for the 2026-08-17 de-cloak. Before it, /r scored the
// visitor on user-agent, device class, ttclid presence and a client-hint contradiction
// check, and returned {} for anything it disliked — at which point the Carrd embed
// rendered js/decoy.js, a fabricated storefront, instead of the funnel. An ad reviewer
// on a desktop got a different website from the buyer on a phone.
//
// That is what gets a domain flagged, by TikTok ad review and by Safari/Chrome
// deceptive-site protection alike, and a flag is domain-wide: every campaign at once.
//
// So the assertions here are deliberately about SAMENESS, not about who gets through.
// The interesting cases are the ones the old gates rejected.

import handler from '../r.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ''}`); }
};

/** Drive the real handler with a fake req/res and return the parsed JSON body. */
async function post({ ua = '', headers = {}, body = {} } = {}) {
  const req = {
    method: 'POST',
    headers: { 'user-agent': ua, ...headers },
    body,
  };
  let payload, status;
  const res = {
    setHeader() {},
    status(c) { status = c; return res; },
    json(v) { payload = v; return res; },
    end() { return res; },
  };
  await handler(req, res);
  return { status, payload };
}

const CAMPID = 'SPK-A1B2-C3D4';
const CARRD = `https://example.carrd.co/?campid=${CAMPID}`;

const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const GOOGLEBOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const TIKTOK_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 BytedanceWebview/d8a21c6 musical_ly_31.5.0';

console.log('\n/r answers every visitor the same way\n');

// ── the four visitors the old gates split apart ──────────────────────────────
// Each of these was rejected by a DIFFERENT gate: desktop by the device test,
// googlebot by the bot-UA list, the no-ttclid phone by the ttclid requirement, and
// the desktop-claiming-mobile by the client-hint contradiction check.
const buyer = await post({
  ua: TIKTOK_UA,
  headers: { origin: 'https://example.carrd.co' },
  body: { c: CAMPID, h: `${CARRD}&ttclid=E.C.P.Preview_abc123def456` },
});
ok('a real in-app TikTok buyer is routed', !!buyer.payload?.url, JSON.stringify(buyer.payload));

const desktop = await post({ ua: DESKTOP_UA, body: { c: CAMPID, h: CARRD } });
ok('a DESKTOP with no ttclid is routed (old device gate)', !!desktop.payload?.url, JSON.stringify(desktop.payload));

const bot = await post({ ua: GOOGLEBOT_UA, body: { c: CAMPID, h: CARRD } });
ok('a declared CRAWLER is routed (old bot-UA gate)', !!bot.payload?.url, JSON.stringify(bot.payload));

const noTtclid = await post({ ua: IPHONE_UA, body: { c: CAMPID, h: CARRD } });
ok('a phone with NO ttclid is routed (old ttclid gate)', !!noTtclid.payload?.url, JSON.stringify(noTtclid.payload));

const contradiction = await post({
  ua: DESKTOP_UA,
  headers: { 'sec-ch-ua-mobile': '?0', 'sec-ch-ua-platform': '"Windows"' },
  body: { d: 'm', c: CAMPID, h: `${CARRD}&ttclid=abc123def456789` },
});
ok('a desktop CLAIMING mobile is routed (old contradiction gate)', !!contradiction.payload?.url,
  JSON.stringify(contradiction.payload));

const noUa = await post({ ua: '', body: { c: CAMPID, h: CARRD } });
ok('a request with NO user-agent at all is routed', !!noUa.payload?.url, JSON.stringify(noUa.payload));

// ── the actual invariant: same campid ⇒ same destination, whoever asks ────────
// This is the assertion that matters. Any future gate that varies the answer by
// client — however reasonable it looks in isolation — breaks here.
//
// ttclid is dropped before comparing, and only ttclid. Some of the visitors above
// arrive carrying one and some do not, so it differs between them — but that is
// INBOUND DATA being forwarded identically, not a decision /r made about who they
// are. What must not vary is the routing outcome: which landing page, and the spark
// code that reaches it. Comparing the raw query string would assert that every
// visitor sends the same params, which is a different (and false) claim.
const routingOutcome = (r) => {
  const u = r.payload?.url || '';
  try {
    const parsed = new URL(u);
    parsed.searchParams.delete('ttclid');
    // sort so param ORDER can never masquerade as a routing difference
    parsed.searchParams.sort();
    return parsed.pathname + '?' + parsed.searchParams.toString();
  } catch { return u; }
};
const distinct = new Set([buyer, desktop, bot, noTtclid, contradiction, noUa].map(routingOutcome));
ok('every visitor with the same campid gets the SAME destination', distinct.size === 1,
  [...distinct].join('\n         '));

// ── the stale `d=` field from an un-repasted Carrd embed must be inert ───────
// Rollout is by hand: the live embed is pasted into each Carrd page. An old page
// keeps sending d=d. It must no longer change anything server-side.
const staleEmbed = await post({ ua: DESKTOP_UA, body: { d: 'd', c: CAMPID, h: CARRD } });
ok('a stale embed still sending d=d is routed anyway', !!staleEmbed.payload?.url,
  JSON.stringify(staleEmbed.payload));
ok('d= no longer changes the answer',
  (staleEmbed.payload?.url || '') === (desktop.payload?.url || ''),
  `d=d: ${staleEmbed.payload?.url}\n         none: ${desktop.payload?.url}`);

// ── a campid with no spark code still gets a PAGE, not a fake store ──────────
// It is refused later, at the door, which 404s any click whose s1 is not a valid
// spark code. Failing closed there is right; failing closed at page render is what
// produced the decoy.
const junkCampid = await post({ ua: IPHONE_UA, body: { c: '   ...   ', h: 'https://example.carrd.co/' } });
ok('a campid carrying no spark code still gets a real page', !!junkCampid.payload?.url,
  JSON.stringify(junkCampid.payload));

// ── transport rules are not visitor tests ────────────────────────────────────
const viaGet = await post({});
const getRes = await (async () => {
  const req = { method: 'GET', headers: {}, body: {} };
  let payload; const res = { setHeader() {}, status() { return res; }, json(v) { payload = v; return res; }, end() { return res; } };
  await handler(req, res);
  return payload;
})();
ok('a GET returns nothing to route on', !getRes?.url, JSON.stringify(getRes));
void viaGet;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
