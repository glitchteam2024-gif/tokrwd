// Page switch, client half — runs the SHIPPED prelander script, not a re-typed copy of it.
//
//   node "api/_lib/_prelander-switch.test.mjs"
//
// WHY THIS EXISTS
// Every page carrying the x-pre meta marker runs ONE byte-identical script (_tracking-audit pins the
// hash). That script now asks the same-origin /api/hop, at load, whether the code in s1/sub1 has
// been switched to another lander path (`t`) and, for a move to another offer, which sibling code
// to carry (`y`). That puts a value read off the network in front of a navigation on ~900 paid
// pages, so the properties below are executed, not eyeballed:
//
//   - no code: no request and no hold — the page is exactly what it was;
//   - an answer that arrives in time sends Continue to `t`, with ONLY the code token swapped;
//   - an answer that is late, malformed, off-origin, a reserved route, a prelander, or carries a
//     `y` without a `t` is ignored, and Continue goes to the page's own x-dest / go/ with the
//     ORIGINAL code — never the other offer's page with the old code, never the new code
//     without that page (that pairing is what misattributes money);
//   - a tap while the answer is pending is ignored (no navigation, button stays live), and the
//     next tap works;
//   - nothing about fetch / AbortController being missing or throwing can kill Continue: the
//     click handler is attached at the END of the same function, so one synchronous throw in
//     the new block would have left every prelander with a dead button.
//
// The marker tag itself is never spelled out in this file: _tracking-audit treats any scanned
// file containing it as a prelander and would hash this one into the set.
// Scheme strings are deliberately never written out here (they are cloak patterns that
// _tracking-audit greps every .mjs for); a navigation is normalised with a generic
// /^[a-z-]+:\/\// strip before it is compared.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const ORIGIN = 'https://www.myrewardscorner.com';
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Mobile/15E148';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const SID = '0123456789abcdef0123456789abcdef';
const X = 'SPK-A1B2-C3D4';
const Y = 'SPK-E5F6-A789';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const ok = g === w;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) { console.log(`   got:  ${g}`); console.log(`   want: ${w}`); fail++; } else pass++;
};

const SCRIPT_RE = /<script\b[^>]*>([\s\S]*?)<\/script>/i;
function page(rel) {
  const html = readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
  const m = SCRIPT_RE.exec(html);
  const xdest = (/^<meta name="x-dest" content="([^"]+)">/m.exec(html) || [])[1] || null;
  const htmlTag = /<html\b([^>]*)>/i.exec(html)[1];
  const attr = (k) => ((new RegExp(`${k}="([^"]*)"`)).exec(htmlTag) || [])[1];
  return { rel, src: m ? m[1] : '', xdest, slice: attr('data-slice'), geo: attr('data-geo') };
}

const FLAT = page('gravypassusa-pre.html');     // flat: <meta name="x-dest" content="/gravypassusa.html">
const CLONE = page('GP/GP1/index.html');        // clone folder: no meta, resolves to ./go/

const flush = () => new Promise((r) => setImmediate(r));

/**
 * Execute one prelander's script in a fake DOM with a controllable clock and fetch.
 *
 * fetchMode: 'stub' (a fetch this test answers by hand), 'none' (fetch undefined),
 *            'throws' (fetch throws synchronously), 'nopromise' (returns a non-thenable)
 * abort:     false -> AbortController is undefined
 */
function run({ pg = FLAT, pathname, query = `s1=${X}&ttclid=TT1&s3=acct7`, ua = IOS_UA,
               fetchMode = 'stub', abort = true } = {}) {
  let now = 0, tid = 0;
  const timers = [];
  const setTimeoutF = (fn, ms) => { const id = ++tid; timers.push({ id, at: now + (Number(ms) || 0), fn }); return id; };
  const clearTimeoutF = (id) => { const t = timers.find((x) => x.id === id); if (t) t.cancelled = true; };

  const calls = [];
  let pending = null;
  const stubFetch = (url, init) => {
    calls.push({ url, init });
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
      if (init && init.signal) init.signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
  };
  const fetchImpl = fetchMode === 'none' ? undefined
    : fetchMode === 'throws' ? (url, init) => { calls.push({ url, init }); throw new TypeError('fetch blew up'); }
    : fetchMode === 'nopromise' ? (url, init) => { calls.push({ url, init }); return 42; }
    : stubFetch;

  const navigated = [], replaced = [], beacons = [];
  const path = pathname || (pg === CLONE ? '/GP/GP1/' : `/${pg.rel}`);
  const location = {
    origin: ORIGIN, pathname: path, search: '?' + query,
    get href() { return ORIGIN + path + '?' + query; },
    set href(v) { navigated.push(v); },
    replace(v) { replaced.push(v); },
  };
  const winHandlers = {}, docHandlers = {};
  const window = { location, addEventListener(ev, fn) { winHandlers[ev] = fn; } };
  window.top = window;

  const btn = {
    disabled: false, textContent: 'Continue', onclick: null, handlers: {},
    addEventListener(ev, fn) { this.handlers[ev] = fn; },
  };
  const sub = { innerHTML: '' };
  const meta = pg.xdest ? { getAttribute: (k) => (k === 'content' ? pg.xdest : null) } : null;
  const document = {
    hidden: false,
    documentElement: { getAttribute: (k) => (k === 'data-slice' ? pg.slice || null : k === 'data-geo' ? pg.geo || null : null) },
    getElementById: (id) => (id === 'ctaBtn' ? btn : null),
    querySelector: (sel) => (sel === 'meta[name="x-dest"]' ? meta : sel === '.sub' ? sub : null),
    addEventListener(ev, fn) { docHandlers[ev] = fn; },
  };
  function Blob(parts) { this.payload = JSON.parse(parts[0]); }
  const navigator = { userAgent: ua, sendBeacon(url, b) { beacons.push(b.payload.event); return true; } };
  const crypto = { randomUUID: () => '01234567-89ab-cdef-0123-456789abcdef' };

  // EVERY free identifier the script could reach is a parameter, so nothing falls through to
  // this process's real fetch / timers.
  const ctx = {
    window, location, document, navigator, Blob, URLSearchParams, crypto,
    setTimeout: setTimeoutF, clearTimeout: clearTimeoutF,
    fetch: fetchImpl, AbortController: abort ? AbortController : undefined,
  };
  let threw = null;
  try { new Function(...Object.keys(ctx), pg.src)(...Object.values(ctx)); } catch (e) { threw = e; }

  const api = {
    threw, calls, beacons, btn, replaced,
    get hasHandler() { return typeof btn.handlers.click === 'function'; },
    /** Move the fake clock forward, firing due timers in order. */
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = timers.filter((t) => !t.cancelled && !t.done && t.at <= end)
          .sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!due) break;
        now = due.at; due.done = true; due.fn();
      }
      now = end;
    },
    async respond(body, { ok = true, badJson = false } = {}) {
      pending.resolve({ ok, status: ok ? 200 : 500, json: () => (badJson ? Promise.reject(new SyntaxError('bad')) : Promise.resolve(body)) });
      await flush();
    },
    async fail() { pending.reject(new TypeError('network')); await flush(); },
    /** A tap as the browser delivers it: nothing at all on a disabled button. */
    tap() {
      if (btn.disabled) return 'disabled';
      if (typeof btn.handlers.click !== 'function') return 'no handler';
      let prevented = false;
      btn.handlers.click({ preventDefault() { prevented = true; } });
      return prevented ? 'handled' : 'unhandled';
    },
    /** Where the tap sent the visitor: the first scheme attempt, scheme normalised to https. */
    dest() { return navigated.length ? navigated[0].replace(/^[a-z-]+:\/\//, 'https://') : null; },
    navigatedCount() { return navigated.length; },
    rawFirst() { return navigated[0] || null; },
  };
  return api;
}

const qsWith = (s1Key, s1Val, extra = '') =>
  `${s1Key}=${encodeURIComponent(s1Val).replace(/%20/g, '+')}&ttclid=TT1&s3=acct7${extra}&sid=${SID}`;
const FLAT_DEST = (s1 = X, key = 's1') => `${ORIGIN}/gravypassusa.html?${qsWith(key, s1)}`;
const CLONE_DEST = (s1 = X) => `${ORIGIN}/GP/GP1/go/?${qsWith('s1', s1)}`;

// ── the test is not vacuous ─────────────────────────────────────────────────────────────────
{
  eq('the flat and the clone prelander ship the identical script', FLAT.src === CLONE.src, true);
  eq('…and it is the one with the page switch in it', /\/api\/hop\?c=/.test(FLAT.src), true);
  eq('…hashing the same as a few others across the estate',
    ['PG52/US1/index.html', 'RC51/US1/index.html', 'playfulusa-pre.html', 'mgfc-pre2.html']
      .map((r) => createHash('sha256').update(page(r).src).digest('hex'))
      .every((h) => h === createHash('sha256').update(FLAT.src).digest('hex')), true);
  eq('the flat page names its lander in x-dest', FLAT.xdest, '/gravypassusa.html');
  eq('the clone page has no x-dest', CLONE.xdest, null);
}

// ── no code: no request, no hold, today's behaviour exactly ──────────────────────────────────
for (const pg of [FLAT, CLONE]) {
  const label = pg === FLAT ? 'flat' : 'clone';
  const r = run({ pg, query: 'ttclid=TT1&s3=acct7' });
  eq(`[${label}] no code: the script ran clean`, r.threw, null);
  eq(`[${label}] no code: no request is made`, r.calls.length, 0);
  eq(`[${label}] no code: the first tap goes straight through`, r.tap(), 'handled');
  eq(`[${label}] no code: …to the built-in lander`, r.dest(),
    `${ORIGIN}${pg === FLAT ? '/gravypassusa.html' : '/GP/GP1/go/'}?ttclid=TT1&s3=acct7&sid=${SID}`);

  const s1NoCode = run({ pg, query: 's1=freeformlabel&sub1=' + X });
  eq(`[${label}] s1 set without a code: no request (the lander reads s1 first, too)`, s1NoCode.calls.length, 0);
}

// ── an answer in time: Continue goes to t, only the token is swapped ─────────────────────────
for (const pg of [FLAT, CLONE]) {
  const label = pg === FLAT ? 'flat' : 'clone';
  const r = run({ pg });
  eq(`[${label}] a code asks the hop once, same-origin, by the exact code`, r.calls.map((c) => c.url), [`/api/hop?c=${X}`]);
  eq(`[${label}] …without cookies`, r.calls[0].init.credentials, 'omit');
  eq(`[${label}] …with an abort signal when AbortController exists`, !!r.calls[0].init.signal, true);
  await r.respond({ t: '/GP/GP22/go/', y: Y });
  eq(`[${label}] the tap after the answer goes through`, r.tap(), 'handled');
  eq(`[${label}] …to t, with s1 swapped to y and everything else kept`, r.dest(), `${ORIGIN}/GP/GP22/go/?${qsWith('s1', Y)}`);
  eq(`[${label}] …and the pre_tap beacon fired`, r.beacons.includes('pre_tap'), true);
}
{
  // Compound s1: only the token moves; the user/affiliate/geo parts stay.
  const r = run({ query: `s1=user_aff_${X}_US&ttclid=TT1&s3=acct7` });
  eq('a compound s1 asks by the code inside it', r.calls[0].url, `/api/hop?c=${X}`);
  await r.respond({ t: '/gravypassusa2.html', y: Y });
  r.tap();
  eq('…and only the token is swapped', new URL(r.dest()).searchParams.get('s1'), `user_aff_${Y}_US`);
  eq('…on the switched lander', new URL(r.dest()).pathname, '/gravypassusa2.html');

  // sub1 carries the code.
  const s = run({ query: `sub1=${X}&ttclid=TT1&s3=acct7` });
  eq('a code in sub1 is asked about too', s.calls[0].url, `/api/hop?c=${X}`);
  await s.respond({ t: '/gravypassusa2.html', y: Y });
  s.tap();
  eq('…and sub1 is the param that is swapped', s.dest(), `${ORIGIN}/gravypassusa2.html?${qsWith('sub1', Y)}`);

  // Lowercased by an ad platform: looked up uppercased, swapped all the same.
  const lc = run({ query: `s1=${X.toLowerCase()}&ttclid=TT1&s3=acct7` });
  eq('a lowercased code is asked about uppercased', lc.calls[0].url, `/api/hop?c=${X}`);
  await lc.respond({ t: '/gravypassusa2.html', y: Y });
  lc.tap();
  eq('…and the lowercased token is swapped', new URL(lc.dest()).searchParams.get('s1'), Y);

  // Same offer, another design: t alone, the code is kept.
  const p = run({});
  await p.respond({ t: '/gravypassusa2.html' });
  p.tap();
  eq('a t-only answer keeps the original code', p.dest(), `${ORIGIN}/gravypassusa2.html?${qsWith('s1', X)}`);

  // The rescue path ("Continue anyway") uses the same, once-computed destination.
  const rs = run({});
  await rs.respond({ t: '/GP/GP22/go/', y: Y });
  rs.tap();
  rs.advance(5000);
  eq('if the browser hand-off is refused, the rescue tap is wired', typeof rs.btn.onclick, 'function');
  rs.btn.onclick({ preventDefault() {} });
  eq('…and it goes to the SAME switched lander', rs.replaced, [`${ORIGIN}/GP/GP22/go/?${qsWith('s1', Y)}`]);

  // Android takes the same destination through its own hand-off.
  const an = run({ ua: ANDROID_UA });
  await an.respond({ t: '/GP/GP22/go/', y: Y });
  an.tap();
  eq('Android hands off the same switched lander',
    an.rawFirst().includes(`/GP/GP22/go/?${qsWith('s1', Y)}`), true);
}

// ── late answer: dropped, built-in lander, original code ─────────────────────────────────────
{
  const r = run({});
  r.advance(801);
  eq('after 800 ms the request is aborted', r.calls[0].init.signal.aborted, true);
  await r.respond({ t: '/GP/GP22/go/', y: Y });
  eq('a tap after the hold goes through', r.tap(), 'handled');
  eq('…to the built-in lander with the original code, the late answer ignored', r.dest(), FLAT_DEST());

  const c = run({ pg: CLONE });
  c.advance(800);
  await c.respond({ t: '/GP/GP22/go/', y: Y });
  c.tap();
  eq('[clone] the same, landing on its own go/', c.dest(), CLONE_DEST());
}

// ── a tap while pending is ignored, and the next one works ───────────────────────────────────
{
  const r = run({});
  eq('a tap while the answer is pending is swallowed', r.tap(), 'handled');
  eq('…nothing navigates', r.navigatedCount(), 0);
  eq('…the button is NOT disabled (no visual change)', r.btn.disabled, false);
  eq('…and no pre_tap is counted', r.beacons.includes('pre_tap'), false);
  await r.respond({ t: '/GP/GP22/go/', y: Y });
  r.tap();
  eq('the next tap goes to the answer', r.dest(), `${ORIGIN}/GP/GP22/go/?${qsWith('s1', Y)}`);

  const n = run({});
  n.tap();
  n.advance(800);
  eq('a pending answer that never comes releases the hold at 800 ms', n.tap(), 'handled');
  eq('…to the built-in lander', n.dest(), FLAT_DEST());
}

// ── nothing about fetch can kill Continue ─────────────────────────────────────────────────────
for (const [label, opts] of [
  ['fetch is undefined', { fetchMode: 'none' }],
  ['fetch throws synchronously', { fetchMode: 'throws' }],
  ['fetch returns a non-promise', { fetchMode: 'nopromise' }],
  ['fetch AND AbortController are undefined', { fetchMode: 'none', abort: false }],
  ['AbortController undefined, fetch throws', { fetchMode: 'throws', abort: false }],
]) {
  for (const pg of [FLAT, CLONE]) {
    const r = run({ pg, ...opts });
    eq(`${label} [${pg === FLAT ? 'flat' : 'clone'}]: the script did not throw`, r.threw, null);
    eq(`${label} [${pg === FLAT ? 'flat' : 'clone'}]: Continue is still attached`, r.hasHandler, true);
    eq(`${label} [${pg === FLAT ? 'flat' : 'clone'}]: the FIRST tap reaches the built-in lander with X`,
      [r.tap(), r.dest()], ['handled', pg === FLAT ? FLAT_DEST() : CLONE_DEST()]);
  }
}
{
  // No AbortController: the timer flag alone releases the hold, and a late answer is dropped.
  const r = run({ abort: false });
  eq('without AbortController the request goes out with no signal', r.calls[0].init.signal, undefined);
  await r.respond({ t: '/GP/GP22/go/', y: Y });
  r.tap();
  eq('…an in-time answer still switches', r.dest(), `${ORIGIN}/GP/GP22/go/?${qsWith('s1', Y)}`);
  const l = run({ abort: false });
  l.advance(800);
  await l.respond({ t: '/GP/GP22/go/', y: Y });
  l.tap();
  eq('…and a late one is still dropped', l.dest(), FLAT_DEST());

  for (const [label, act] of [
    ['a network error', (x) => x.fail()],
    ['a 500', (x) => x.respond({ t: '/GP/GP22/go/', y: Y }, { ok: false })],
    ['a body that is not JSON', (x) => x.respond(null, { badJson: true })],
    ['an empty answer {}', (x) => x.respond({})],
    ['null', (x) => x.respond(null)],
    ['an array', (x) => x.respond(['/GP/GP22/go/'])],
  ]) {
    const x = run({});
    await act(x);
    eq(`${label} releases the hold`, x.tap(), 'handled');
    eq(`…and lands on the built-in lander with X (${label})`, x.dest(), FLAT_DEST());
  }
}

// ── a bad t is never followed ─────────────────────────────────────────────────────────────────
for (const t of [
  '//evil.com/x.html', '//evil.com/go/', 'https://evil.com/x.html', '/\\evil.com/x.html',
  '/api/x.html', '/api/hop/go/', '/click.html', '/c/slug/go/', '/r/x.html', '/u/abc/go/', '/pre/x.html',
  '/admin/index.html', '/portal/index.html', '/js/x.html',
  '/../x.html', '/GP/../admin/go/',
  // a '.' segment, folded away by the browser AFTER the checks: a reserved route in disguise
  '/./c/evil.html', '/./u/abc/go/', '/./pre/x.html', '/./admin/index.html', '/GP/./GP22/go/', '/.well-known/x.html',
  // the ROOT /go/ is the orphaned redirector, never a lander
  '/go/', '/go.html',
  '/gravypassusa-pre.html', '/mgfc-pre2.html', '/GP/GP1', '/GP/GP1/', '/gravypassusa', '/x.htm',
  '/x.html?y=1', '/x.html#a', '/x y.html', '', '/', 42, null, '/' + 'a'.repeat(200) + '.html',
]) {
  const r = run({});
  await r.respond({ t, y: Y });
  r.tap();
  eq(`bad t refused: ${JSON.stringify(t).slice(0, 40)}`, r.dest(), FLAT_DEST());
}
{
  // A clone page reached at its literal index.html: a t equal to the page's own path is refused.
  const r = run({ pg: CLONE, pathname: '/GP/GP1/index.html' });
  await r.respond({ t: '/GP/GP1/index.html' });
  r.tap();
  eq('t equal to the page itself is refused', r.dest(), `${ORIGIN}/GP/GP1/go/?${qsWith('s1', X)}`);
}
for (const [pathname, t] of [['/GP/GP1/', '/GP/GP1/index.html'], ['/GP/GP1', '/GP/GP1/index.html'], ['/GP/GP1/index.html', '/gp/gp1/index.html']]) {
  // The same page under another spelling ('/X/Y/', '/X/Y', '/X/Y/index.html') is still this page.
  const r = run({ pg: CLONE, pathname });
  await r.respond({ t });
  r.tap();
  eq(`t naming this page another way is refused (${pathname} vs ${t})`, r.dest(), `${ORIGIN}${pathname.replace(/index\.html$/, '').replace(/\/?$/, '/')}go/?${qsWith('s1', X)}`);
}

// ── y only with t; a bad y voids the whole answer ─────────────────────────────────────────────
{
  const r = run({});
  await r.respond({ y: Y });
  r.tap();
  eq('y without t is ignored: built-in lander, X untouched', r.dest(), FLAT_DEST());

  for (const y of [`${Y}-2`, Y.toLowerCase(), 'SPK-E5F6', X, 'SPK-ZZZZ-ZZZZ', 7, ['x'], { a: 1 }]) {
    const b = run({});
    await b.respond({ t: '/GP/GP22/go/', y });
    b.tap();
    eq(`a bad y voids the answer (never t with the old code): ${JSON.stringify(y)}`, b.dest(), FLAT_DEST());
  }
}

// ── a -N code is looked up as itself and never switched ───────────────────────────────────────
{
  const XN = `${X}-2`;
  const r = run({ query: `s1=${XN}&ttclid=TT1&s3=acct7` });
  eq('a -N code is asked about whole, suffix included', r.calls[0].url, `/api/hop?c=${XN}`);
  await r.respond({ t: '/GP/GP22/go/', y: Y });
  r.tap();
  eq('…and even if an answer came back it is not used: -N untouched, built-in lander', r.dest(), FLAT_DEST(XN));

  // A canonical X switch must not eat the suffix of a different -N token sitting in sub1.
  const both = run({ query: `s1=${X}&sub1=${XN}` });
  await both.respond({ t: '/GP/GP22/go/', y: Y });
  both.tap();
  const u = new URL(both.dest());
  eq('the exact X token in s1 is swapped', u.searchParams.get('s1'), Y);
  eq('…while the -N token in sub1 is left exactly as it was', u.searchParams.get('sub1'), XN);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
