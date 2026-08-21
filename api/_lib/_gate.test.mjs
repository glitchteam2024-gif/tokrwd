// The /click gate: logs every CTA click server-side, then 302s to the offer UNCHANGED.
// Run: node "api/_lib/_gate.test.mjs"
//
// Drives the REAL handlers (api/click.js, api/c/[slug].js) with a stubbed ingest, the way
// _front-routing drives /r. What this pins:
//
//   1. A valid gate hit 302s to `u` byte-for-byte and ships ONE log row with the raw wire,
//      the click_id, the visitor's IP and Vercel geo, and the derived creative key.
//   2. The log is attempted BEFORE the redirect is written — so the write runs inside the
//      invocation rather than after res.end(), where Vercel does not guarantee it completes.
//   3. `u` is an open-redirect surface: off-allowlist hosts, http://, our own hosts and a
//      /click loop are all refused. A 404 here is a crafted URL, never a paid click.
//   4. A dead or exploding ingest costs the row, never the click.
//   5. GATE_OVERRIDES rows reroute a whole creative family and rebuild the outbound with
//      the same one-param contract the pages use.
//   6. /c/ direct mode now logs the same row shape (key c-<slug>), redirect-first too.

// gate-log.js reads GATE_INGEST_KEY at module load (no committed fallback any more), so it must be
// set BEFORE the module graph loads — hence dynamic imports below rather than static ones.
process.env.GATE_INGEST_KEY = 'test-gate-key';

const { default: handler } = await import('../click.js');
const { default: cHandler } = await import('../c/[slug].js');
const { GATE_OVERRIDES, isAllowedGateDestination } = await import('./links-config.js');
const { deriveGateKey, mintClickId, geoFromHeaders, clientIp } = await import('./gate-log.js');

let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; } else { fail++; console.log(`  FAIL ${n}${d ? `\n         ${d}` : ''}`); } };

function makeRes() {
  return {
    headers: {}, statusCode: 0, body: null, redirected: null, headersSent: false,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    send(b) { this.body = b; this.headersSent = true; return this; },
    json(b) { this.body = b; this.headersSent = true; return this; },
    redirect(code, url) { this.statusCode = code; this.redirected = url; this.headersSent = true; return this; },
  };
}

const VISITOR_HEADERS = {
  host: 'www.myrewardscorner.com',
  'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
  'x-forwarded-for': '203.0.113.7, 64.29.17.1',
  'x-vercel-ip-country': 'US',
  'x-vercel-ip-country-region': 'TX',
  'x-vercel-ip-city': 'San%20Antonio',
  'x-vercel-ip-latitude': '29.4241',
  'x-vercel-ip-longitude': '-98.4936',
};

const calls = [];
let fetchBehavior = 'ok';
globalThis.fetch = async (url, opts) => {
  calls.push({ url, opts, atSend: null });
  if (fetchBehavior === 'throw') throw new Error('boom');
  if (fetchBehavior === 'refuse') return { ok: false, status: 401 };
  return { ok: true, status: 204 };
};

const OFFER = 'https://montrk5.co.uk/?a=26648&c=55504&s1=SPK-05BD-7BF1';

/** The gate appends EXACTLY ONE param to the page's URL: the click token, in the slot the
 *  destination's network reads `cid=` from. Split it back off so every other assertion can
 *  talk about the page's URL as the page built it. */
function splitToken(redirected, pageUrl) {
  if (typeof redirected !== 'string') return { base: null, name: null, value: null };
  const sep = pageUrl.indexOf('?') > -1 ? '&' : '?';
  if (!redirected.startsWith(pageUrl + sep)) return { base: redirected, name: null, value: null };
  const tail = redirected.slice((pageUrl + sep).length);
  const eq = tail.indexOf('=');
  return { base: pageUrl, name: tail.slice(0, eq), value: decodeURIComponent(tail.slice(eq + 1)) };
}
const TOKEN_SHAPE = /^[0-9A-Za-z]{22}$/;
const WIRE = 'migi_26_SPK-05BD-7BF1_US_1799887766';

async function hit(query, headers = VISITOR_HEADERS) {
  calls.length = 0;
  const res = makeRes();
  // record whether the redirect had already been written when the log fired
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { const r = await orig(url, opts); calls[calls.length - 1].atSend = res.headersSent; return r; };
  await handler({ query, headers }, res);
  globalThis.fetch = orig;
  return res;
}

// ── 1. the happy path ────────────────────────────────────────────────────────
{
  const res = await hit({ u: OFFER, s1: WIRE, lp: '/frcusa.html', t: 'TT_1' });
  const tok = splitToken(res.redirected, OFFER);
  ok('valid hit 302s to the page URL with the token appended', res.statusCode === 302 && tok.base === OFFER, res.redirected);
  ok('the appended param is the CAKE click slot (s5)', tok.name === 's5', String(tok.name));
  ok('the token is a 22-char base62 click id', TOKEN_SHAPE.test(tok.value || ''), String(tok.value));
  ok('exactly one log row shipped', calls.length === 1, String(calls.length));
  const p = calls[0] ? JSON.parse(calls[0].opts.body) : {};
  ok('the log is attempted BEFORE the redirect (write runs inside the invocation)', calls[0] && calls[0].atSend === false);
  ok('log carries a 22-char base62 click_id', /^[0-9A-Za-z]{22}$/.test(p.click_id || ''), p.click_id);
  ok('log carries the RAW wire', p.s1 === WIRE, p.s1);
  ok('log key derives from the lander path', p.key === 'frcusa', p.key);
  ok('log carries the destination actually served', p.dest === res.redirected);
  // The whole reason the token exists: the value on the wire must be the id in the row, or a
  // postback that echoes it back resolves to nothing.
  ok('the token on the wire IS the logged click_id', p.click_id === tok.value, p.click_id + ' vs ' + tok.value);
  ok('log carries ttclid', p.ttclid === 'TT_1');
  ok('log carries the visitor IP (first x-forwarded-for hop)', p.ip === '203.0.113.7', p.ip);
  ok('log carries decoded Vercel geo', p.country === 'US' && p.city === 'San Antonio' && p.lat === 29.4241, JSON.stringify([p.country, p.city, p.lat]));
  ok('log carries the serving domain', p.domain === 'www.myrewardscorner.com');
  ok('log says via=page', p.via === 'page');
  ok('the ingest key rides a header, not the body', !!calls[0].opts.headers['x-gate-key']);
  ok('no-store + no-referrer on the gate response', /no-store/.test(res.headers['Cache-Control']) && res.headers['Referrer-Policy'] === 'no-referrer');
}

// ── 2. the open-redirect gate ────────────────────────────────────────────────
for (const [name, u] of [
  ['an off-allowlist host', 'https://evil.example.com/x'],
  ['plain http', 'http://montrk5.co.uk/?a=1'],
  ['our own host (loop guard)', 'https://www.tokrwd.co/click?u=x'],
  ['a userinfo smuggle', 'https://montrk5.co.uk@evil.com/'],
  ['garbage', '::::'],
  ['nothing', ''],
]) {
  const res = await hit({ u, s1: WIRE, lp: '/frcusa.html' });
  ok(`${name} is refused`, res.statusCode === 404 && !res.redirected, `${res.statusCode} → ${res.redirected}`);
  ok(`${name} ships no log row`, calls.length === 0, String(calls.length));
}
ok('allowlist: every live network family accepted',
   ['https://montrk5.co.uk/?a=1', 'https://monetisetrk2.co.uk/?a=1', 'https://montrk.co.uk/?a=1',
    'https://www.fkn8s74mztrk.com/F2R45HNR/GS3NQC1D/', 'https://giftclick.org/aff_c?offer_id=1',
    'https://www.phef6trk.com/213T8QJ/32BB7QT/'].every(isAllowedGateDestination));
ok('allowlist: lookalike hosts refused',
   ['https://montrk5.co.uk.evil.com/', 'https://xmontrk5.co.uk/', 'https://fkn8s74mztrk.com.co/',
    'https://montrk99999.co.uk/',   // \\d{0,2} bounds the numeric suffix — absurd numbers refused
    'https://montrk5.co.uk/€']  // non-ASCII would throw at the Location header — refused early
     .every(u => !isAllowedGateDestination(u)));

// ── 3. an untagged visit still lands ─────────────────────────────────────────
{
  const BARE = 'https://montrk5.co.uk/?a=26648&c=55504';
  const res = await hit({ u: BARE, lp: '/frcusa.html' });
  const t2 = splitToken(res.redirected, BARE);
  ok('untagged visit still 302s to the bare link (plus the token)', res.statusCode === 302 && t2.base === BARE, res.redirected);
  ok('untagged visit adds no affiliate param of its own', !/[?&]s1=/.test(res.redirected || ''), res.redirected);
  const p = JSON.parse(calls[0].opts.body);
  ok('untagged log row has null s1', p.s1 === null, String(p.s1));
}

// ── 4. a dead ingest never costs the click ───────────────────────────────────
{
  fetchBehavior = 'throw';
  const res = await hit({ u: OFFER, s1: WIRE, lp: '/frcusa.html' });
  ok('ingest exploding → click still 302s', res.statusCode === 302 && splitToken(res.redirected, OFFER).base === OFFER, res.redirected);
  fetchBehavior = 'refuse';
  const res2 = await hit({ u: OFFER, s1: WIRE, lp: '/frcusa.html' });
  ok('ingest refusing → click still 302s', res2.statusCode === 302);
  fetchBehavior = 'ok';
}

// ── 5. overrides reroute a family without touching its clones ────────────────
{
  GATE_OVERRIDES['ak52-gb'] = { destination: 'https://monetisetrk2.co.uk/?a=26648&c=99999', forwardParam: 's1', enabled: true };
  const res = await hit({ u: OFFER, s1: WIRE, lp: '/AK52/GB7' });
  const OV = 'https://monetisetrk2.co.uk/?a=26648&c=99999&s1=SPK-05BD-7BF1';
  ok('override wins over u and rebuilds the one-param outbound',
     splitToken(res.redirected, OV).base === OV, res.redirected);
  const p = JSON.parse(calls[0].opts.body);
  ok('override log says via=override and keeps the raw wire', p.via === 'override' && p.s1 === WIRE);

  GATE_OVERRIDES['ak52-gb'].enabled = false;
  const res2 = await hit({ u: OFFER, s1: WIRE, lp: '/AK52/GB7' });
  ok('a disabled override falls back to the page URL', splitToken(res2.redirected, OFFER).base === OFFER, res2.redirected);
  delete GATE_OVERRIDES['ak52-gb'];

  // A row that OMITS forwardParam must not default to sub1 for a CAKE (.co.uk) destination —
  // that ships a param the endpoint discards and zeroes attribution. getGateOverride infers s1.
  GATE_OVERRIDES['cake-fam'] = { destination: 'https://montrk5.co.uk/?a=1&c=2', enabled: true };
  const res3 = await hit({ u: OFFER, s1: WIRE, lp: '/CAKE/FAM' });
  const CK = 'https://montrk5.co.uk/?a=1&c=2&s1=SPK-05BD-7BF1';
  const t3 = splitToken(res3.redirected, CK);
  ok('override with no forwardParam infers s1 for a .co.uk host', t3.base === CK, res3.redirected);
  ok('a CAKE destination gets its token in s5', t3.name === 's5', String(t3.name));
  delete GATE_OVERRIDES['cake-fam'];

  // An Everflow (.com) destination with no forwardParam infers sub1.
  GATE_OVERRIDES['ef-fam'] = { destination: 'https://www.fkn8s74mztrk.com/A/B/', enabled: true };
  const res4 = await hit({ u: OFFER, s1: WIRE, lp: '/EF/FAM' });
  const EF = 'https://www.fkn8s74mztrk.com/A/B/?sub1=SPK-05BD-7BF1';
  const t4 = splitToken(res4.redirected, EF);
  ok('override with no forwardParam infers sub1 for a .com host', t4.base === EF, res4.redirected);
  ok('an Everflow destination gets its token in sub2', t4.name === 'sub2', String(t4.name));
  delete GATE_OVERRIDES['ef-fam'];
}

// ── 5b. the ingest key is fail-closed: unset → no POST at all ─────────────────
// gate-log reads the key at module load, so load a FRESH copy with the env unset and drive
// sendGateLog directly — no committed fallback means an unconfigured deploy never POSTs an
// unauthenticated body the ingest would only 401.
{
  const savedKey = process.env.GATE_INGEST_KEY;
  delete process.env.GATE_INGEST_KEY;
  const { sendGateLog: freshSend } = await import('./gate-log.js?nokey');
  calls.length = 0;
  await freshSend({ click_id: 'x' });
  ok('no key configured → nothing is POSTed (no unauthenticated body on the wire)', calls.length === 0, String(calls.length));
  process.env.GATE_INGEST_KEY = savedKey;
}

// ── 6. repeated params (Vercel array form) ───────────────────────────────────
{
  const res = await hit({ u: [OFFER, OFFER], s1: [WIRE], lp: ['/frcusa.html'] });
  ok('array-form params resolve to first non-empty', res.statusCode === 302 && splitToken(res.redirected, OFFER).base === OFFER, res.redirected);
}

// ── 6b. probe mode: answers without acting ───────────────────────────────────
{
  const KEYED = { ...VISITOR_HEADERS, 'x-gate-key': 'test-gate-key' };
  calls.length = 0;
  const res = makeRes();
  await handler({ query: { u: OFFER, s1: WIRE, lp: '/frcusa.html', probe: '1' }, headers: KEYED }, res);
  ok('probe answers 200, not a redirect', res.statusCode === 200 && !res.redirected, String(res.statusCode));
  const body = res.body && typeof res.body === 'object' ? res.body : null;
  // THE ASSERTION THAT WAS MISSING, and the reason probe mode shipped broken: it answered with the
  // pre-token target, so a mass-test could pass while the gate sent something else entirely.
  const ptok = splitToken(body && body.target, OFFER);
  ok('probe reports the target it WOULD have sent, token INCLUDED',
     body && ptok.base === OFFER && TOKEN_SHAPE.test(ptok.value || ''), JSON.stringify(res.body));
  ok('the probe target is the FINAL string, not an intermediate',
     body && /[?&](s5|sub2)=/.test(body.target || ''), body && body.target);
  ok('probe reports the click slot', body && body.slot === 's5', body && body.slot);
  ok('probe reports the derived creative key', body && body.key === 'frcusa', body && body.key);
  // THE POINT: mass-testing every lander must not poison the click log or fire real clicks.
  ok('probe writes NO log row', calls.length === 0, String(calls.length));

  // An UNKEYED probe must behave like a normal click — otherwise anyone could append probe=1
  // to a real ad link and silently suppress its logging.
  calls.length = 0;
  const res2 = makeRes();
  await handler({ query: { u: OFFER, s1: WIRE, lp: '/frcusa.html', probe: '1' }, headers: VISITOR_HEADERS }, res2);
  ok('an UNKEYED probe=1 is ignored — the click still redirects', res2.statusCode === 302, String(res2.statusCode));
  ok('an UNKEYED probe=1 still logs, so it cannot suppress a real click', calls.length === 1, String(calls.length));

  // A probe of a bad destination must still be refused, or the test would pass a dead lander.
  const res3 = makeRes();
  await handler({ query: { u: 'https://evil.example.com/x', probe: '1' }, headers: KEYED }, res3);
  ok('probe still refuses an off-allowlist destination', res3.statusCode === 404, String(res3.statusCode));
}

// ── 7. deriveGateKey ─────────────────────────────────────────────────────────
for (const [lp, want] of [
  ['/frcusa.html', 'frcusa'],
  ['/AK52/GB7', 'ak52-gb'],
  ['/AK52/GB7/index.html', 'ak52-gb'],
  ['/50FC/FC12/index.html', '50fc-fc'],
  ['/SHEIN/GB', 'shein-gb'],
  ['/GP/ob/index.html', 'gp-ob'],
  ['/', ''],
  ['', ''],
  ['/../etc/passwd', ''],
  ['/x?y=1', 'x'],
  ['/<script>', ''],
]) ok(`deriveGateKey(${JSON.stringify(lp)}) = ${JSON.stringify(want)}`, deriveGateKey(lp) === want, deriveGateKey(lp));

// ── 8. helpers hold their edges ──────────────────────────────────────────────
ok('mintClickId shape', /^[0-9A-Za-z]{22}$/.test(mintClickId()) && mintClickId() !== mintClickId());
ok('clientIp: absent header → null', clientIp({}) === null);
ok('geo: broken percent-encoding survives', geoFromHeaders({ 'x-vercel-ip-city': 'Bad%%%enc' }).city === 'Bad%%%enc');
ok('geo: absent headers → nulls', geoFromHeaders({}).lat === null && geoFromHeaders({}).country === null);

// ── 9. /c/ direct mode logs the same row shape, redirect-first ───────────────
{
  calls.length = 0;
  const res = makeRes();
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { const r = await orig(url, opts); calls[calls.length - 1].atSend = res.headersSent; return r; };
  await cHandler({
    query: { slug: 'esgp-off', campid: 'FUOMGI-01' },
    headers: { ...VISITOR_HEADERS, referer: 'https://www.tokrwd.co/ESGP?campid=FUOMGI-01' },
  }, res);
  globalThis.fetch = orig;
  // getPartnerRows may hit the (absent) KV env — fail-open keeps this deterministic.
  ok('/c/ direct still 302s', res.statusCode === 302 && /phef6trk/.test(res.redirected || ''), res.redirected);
  const row = calls.filter(c => /gate-click/.test(String(c.url)));
  ok('/c/ ships one gate row', row.length === 1, String(calls.length));
  if (row.length === 1) {
    const p = JSON.parse(row[0].opts.body);
    ok('/c/ row key is c-<slug>', p.key === 'c-esgp-off', p.key);
    ok('/c/ row keeps the inbound sub-ID raw', p.s1 === 'FUOMGI-01', p.s1);
    // NB: exercises the referer-parsing path. ESGP's live CTA opens /c/ with rel=noreferrer, so in
    // production lp is usually null here — the click is still logged by key; lp is enrichment only.
    ok('/c/ row lp comes from the referer when present', p.lp === '/ESGP', p.lp);
    ok('/c/ logs before it redirects', row[0].atSend === false);
  } else { fail += 4; }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
