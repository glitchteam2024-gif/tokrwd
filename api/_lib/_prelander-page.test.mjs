// Prelander page audit — runs the SHIPPED js/breakout.js, not a re-typed copy of it.
//
//   node "api/_lib/_prelander-page.test.mjs"
//
// WHY THIS EXISTS
// /pre is a STATIC page. `to` arrives on a public URL and there is no server in front
// of it to sanitise anything, so js/breakout.js's cleanPath() is the only thing between
// a query param and an open redirect on www.tokrwd.co. _links-config.test.mjs pins the
// SERVER half (wrapPrelander/prelanderCanForward); this pins the CLIENT half, by
// executing the real file against a fake DOM and asserting where it would navigate.
//
// The first cut of this page failed three of the cases below. `//evil.com/x` satisfies
// ^/[A-Za-z0-9._/-]*$ and `new URL('//evil.com/x', origin)` resolves it to
// https://evil.com/x — the charset was never the control, the order of normalisation
// is. `to=/pre` looped forever, and `to=/c/<slug>` was a public way to fire our own
// redirector with an arbitrary sub-ID and no ad spend.
import { readFileSync } from 'node:fs';
import { PRELANDER_ALLOWED_ROOTS, wrapPrelander as wrapPrelanderFn } from './links-config.js';

const SRC = readFileSync(new URL('../../js/breakout.js', import.meta.url), 'utf8');
const ORIGIN = 'https://www.tokrwd.co';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const ok = g === w;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) { console.log(`   got:  ${g}`); console.log(`   want: ${w}`); fail++; } else pass++;
};

/** A TikTok iOS webview UA, so the escape path is the one under test. */
const IN_APP_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Mobile/15E148 musical_ly_34.5.0 JsSdk/2.0';
const SAFARI_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

/**
 * Load js/breakout.js into a minimal fake DOM and report what it did.
 *
 * Returns { target } — the href it put on the CTA, which IS the resolved destination —
 * plus `replaced` / `navigated` so a test can tell "went straight through" from
 * "attempted an OS scheme" from "refused and rendered".
 */
function runPage({ to, ua = IN_APP_UA, framed = false, preview = false, query = 's1=SPK-A1B2-C3D4&ttclid=TT1&s3=acct7' }) {
  let target = '', navigated = null, replaced = null, timers = [];
  const nodes = {};
  const handlers = { doc: {}, win: {}, el: {} };
  const node = (id) => ({
    _id: id, attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; if (k === 'href' && id === 'preOpen') target = v; },
    getAttribute(k) { return this.attrs[k] === undefined ? null : this.attrs[k]; },
    addEventListener(ev, fn) { (handlers.el[id] = handlers.el[id] || {})[ev] = fn; },
    style: {}, textContent: '',
  });

  const search = '?' + query +
    (to === undefined ? '' : '&to=' + encodeURIComponent(to)) +
    (preview ? '&preview=1' : '');

  const location = {
    origin: ORIGIN, pathname: '/pre', search,
    get href() { return ORIGIN + '/pre' + search; },
    set href(v) { navigated = v; },
    replace(v) { replaced = v; },
  };
  const window = { addEventListener(ev, fn) { handlers.win[ev] = fn; }, location };
  window.self = window;
  window.top = framed ? {} : window;

  const doc = {
    readyState: 'complete', hidden: false,
    addEventListener(ev, fn) { handlers.doc[ev] = fn; },
    getElementById: (id) => (nodes[id] = nodes[id] || node(id)),
    createElement: () => node(''), body: { appendChild() {}, removeChild() {} },
  };

  const scheduled = [];
  const ctx = {
    window, location, document: doc,
    navigator: { userAgent: ua, maxTouchPoints: 5 },
    sessionStorage: { getItem: () => null, setItem() {} },
    URL, URLSearchParams,
    // Nothing fires on its own — a test asserts on the immediate decision, and the
    // deferred callbacks stay addressable so the return/tap paths can be driven.
    setTimeout: (fn, ms) => { timers.push(ms); scheduled.push({ fn, ms }); return scheduled.length; },
    clearTimeout(id) { if (scheduled[id - 1]) scheduled[id - 1].cancelled = true; },
  };

  new Function(...Object.keys(ctx), SRC)(...Object.values(ctx));

  return {
    target, timers, nodes,
    get navigated() { return navigated; },
    get replaced() { return replaced; },
    /** Run every still-live timer at or before `ms`, oldest first. */
    tick(ms) {
      for (const t of scheduled.slice()) if (!t.cancelled && t.ms <= ms && !t.done) { t.done = true; t.fn(); }
    },
    hide() { doc.hidden = true; handlers.doc.visibilitychange && handlers.doc.visibilitychange(); },
    show() { doc.hidden = false; handlers.doc.visibilitychange && handlers.doc.visibilitychange(); },
    tap(id) { const h = handlers.el[id] && handlers.el[id].click; if (h) h({ preventDefault() {} }); },
    stage() { return nodes.preCard ? nodes.preCard.getAttribute('data-stage') : null; },
  };
}

// ── every lander the router can emit must resolve, with attribution intact ───
{
  const r = runPage({ to: '/50FC/FC7' });
  eq('a nested clone resolves to itself',
    r.target, `${ORIGIN}/50FC/FC7?s1=SPK-A1B2-C3D4&ttclid=TT1&s3=acct7`);
  eq('…s1 survives the hop', new URL(r.target).searchParams.get('s1'), 'SPK-A1B2-C3D4');
  eq('…ttclid survives the hop', new URL(r.target).searchParams.get('ttclid'), 'TT1');
  eq('…s3 survives the hop', new URL(r.target).searchParams.get('s3'), 'acct7');
  // The generated landers forward every param they receive to the door, so a leftover
  // `to` would ride into the network's reports as junk.
  eq('…and `to` does NOT', new URL(r.target).searchParams.get('to'), null);

  eq('the .html lander resolves', runPage({ to: '/FCTT.html' }).target,
    `${ORIGIN}/FCTT.html?s1=SPK-A1B2-C3D4&ttclid=TT1&s3=acct7`);
  // Vercel serves paths case-sensitively: lowercasing /ESGP 404s every one of
  // Edwin's clicks.
  eq('folder casing is preserved', new URL(runPage({ to: '/ESGP' }).target).pathname, '/ESGP');
  eq('a trailing newline is trimmed, not rejected',
    new URL(runPage({ to: '/CLFC\n' }).target).pathname, '/CLFC');
}

// ── nothing may ever leave our origin ────────────────────────────────────────
for (const hostile of ['//evil.com/x', '/\\evil.com', '\\\\evil.com', 'https://evil.com/CLFC', '//evil.com']) {
  const r = runPage({ to: hostile });
  const leaked = [r.target, r.navigated, r.replaced]
    .filter(Boolean).some(u => !String(u).startsWith(ORIGIN + '/'));
  eq(`open redirect refused: ${JSON.stringify(hostile)}`, leaked, false);
  eq(`…and no destination is offered for it`, r.target, '');
}

// ── reserved paths: the loop and the free-click-minting ones ─────────────────
for (const bad of ['/pre', '/pre/', '/c/esgp-off', '/api/admin/data', '/r', '/admin', '/js/breakout.js']) {
  eq(`reserved path refused: ${bad}`, runPage({ to: bad }).target, '');
}
eq('traversal refused', runPage({ to: '/../../etc/passwd' }).target, '');
eq('unknown root refused', runPage({ to: '/nope' }).target, '');
eq('absent `to` refused', runPage({ to: undefined }).target, '');
eq('empty `to` refused', runPage({ to: '' }).target, '');

// ── the escape fires ONLY where it belongs ───────────────────────────────────
{
  // A real browser goes straight through. Firing x-safari-https:// in Safari itself
  // renders "the address is invalid" and replaces the document — which would kill the
  // watchdog with it and lose the click, on the healthiest traffic there is.
  const safari = runPage({ to: '/CLFC', ua: SAFARI_UA });
  eq('real Safari is sent straight to the lander',
    safari.replaced, `${ORIGIN}/CLFC?s1=SPK-A1B2-C3D4&ttclid=TT1&s3=acct7`);
  eq('…with no scheme attempted', safari.navigated, null);

  // A crawler is not special-cased anywhere — it takes the same branch a desktop
  // buyer does and reaches the same lander. That is the whole no-cloaking claim.
  const bot = runPage({ to: '/CLFC', ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' });
  eq('a crawler gets the same lander as everyone else',
    bot.replaced, `${ORIGIN}/CLFC?s1=SPK-A1B2-C3D4&ttclid=TT1&s3=acct7`);
  eq('…and no scheme is attempted at it either', bot.navigated, null);

  // In the webview the page renders and schedules its handoff instead of navigating.
  const webview = runPage({ to: '/CLFC' });
  eq('an in-app webview is NOT navigated on load', webview.replaced, null);
  eq('…the escape + hint + watchdog are all scheduled', webview.timers.length, 3);
  eq('…and the watchdog is the last of them', Math.max(...webview.timers), webview.timers[2]);
}

// ── the click survives the visitor leaving and coming back ───────────────────
// The bug this pins: markLeft() latched `left = true` forever, so a webview that was
// backgrounded and restored silenced the hint AND the watchdog. On iOS that left the
// visitor looking at one button whose scheme WKWebView had already dropped — a dead
// click, and a paid one. Exposure was every notification, app switch or screen lock
// inside the first six seconds.
{
  const r = runPage({ to: '/CLFC' });
  eq('nothing is revealed while the handoff is still in flight', r.stage(), null);

  r.tick(250);                       // the escape attempt fires
  r.hide();                          // they leave (or the chooser opens)
  r.show();                          // …and they are back
  eq('coming back reveals the manual route', r.stage(), 'hint');
  // Critically NOT a navigation: if the handoff worked they are reading the lander in
  // their real browser, and replacing here hands them a second copy in the webview.
  eq('…without re-navigating them', r.replaced, null);
  eq('…and "Continue here" points at the lander',
    r.nodes.preStay.getAttribute('href'), `${ORIGIN}/CLFC?s1=SPK-A1B2-C3D4&ttclid=TT1&s3=acct7`);

  // The later timers must not undo it, whichever order they land in.
  r.tick(6000);
  eq('the manual route stays up after the timers pass', r.stage(), 'hint');

  // A tap that silently does nothing (the iOS case) still has to leave a way out.
  const t = runPage({ to: '/CLFC' });
  t.tap('preOpen');
  eq('a tap reveals the fallbacks even when the scheme is dropped', t.stage(), 'hint');
  eq('…and it did attempt the escape', /^x-safari-https:/.test(String(t.navigated)), true);

  // Undisturbed, the watchdog is still the backstop.
  const w = runPage({ to: '/CLFC' });
  w.tick(6000);
  eq('an untouched webview still lands on the lander',
    w.replaced, `${ORIGIN}/CLFC?s1=SPK-A1B2-C3D4&ttclid=TT1&s3=acct7`);
}

// ── the admin preview must never navigate the dashboard ──────────────────────
{
  const framed = runPage({ to: '/CLFC', framed: true, ua: SAFARI_UA });
  eq('a framed prelander does not navigate', [framed.replaced, framed.navigated], [null, null]);
  eq('…but still shows where it would go', framed.target !== '', true);
  const previewed = runPage({ to: '/CLFC', preview: true, ua: SAFARI_UA });
  eq('preview=1 does not navigate', [previewed.replaced, previewed.navigated], [null, null]);
  eq('…and preview=1 is stripped from the destination',
    new URL(previewed.target).searchParams.get('preview'), null);
}

// ── the allowlist the page enforces is the one the router assumes ────────────
{
  const declared = SRC.match(/var ALLOWED_ROOTS\s*=\s*\[([\s\S]*?)\]/);
  eq('js/breakout.js declares ALLOWED_ROOTS', !!declared, true);
  const roots = declared ? [...declared[1].matchAll(/'([^']+)'/g)].map(m => m[1]).sort() : [];
  eq('…identical to PRELANDER_ALLOWED_ROOTS', roots, [...PRELANDER_ALLOWED_ROOTS].sort());
  eq('…and lowercase, since the root is lowercased before lookup',
    roots.filter(r => r !== r.toLowerCase()), []);

  // The reserved list is the other half of the same contract and was unpinned. If the
  // page's copy ever drops an entry, /pre starts forwarding to /api or /c — the exact
  // free-click-minting hole the allowlist exists to close.
  const declaredReserved = SRC.match(/var RESERVED_ROOTS\s*=\s*\[([\s\S]*?)\]/);
  eq('js/breakout.js declares RESERVED_ROOTS', !!declaredReserved, true);
  const reserved = declaredReserved
    ? [...declaredReserved[1].matchAll(/'([^']+)'/g)].map(m => m[1]).sort() : [];
  eq('…covering every route the server reserves',
    ['admin', 'api', 'c', 'images', 'js', 'postback', 'pre', 'r'].filter(x => !reserved.includes(x)), []);
}

// ── the prelander only ever lives on a host we deploy ────────────────────────
// resolveLander's `campaign` branch returns a store-supplied lander_url gated only by
// isSafeDestination (https, ANY host). Without the own-host check, wrapPrelander would
// bolt /pre onto a third-party origin and every one of those clicks would 404.
{
  eq('a foreign lander is not wrapped',
    wrapPrelanderFn('https://someone-elses-site.com/CLFC?s1=X'),
    'https://someone-elses-site.com/CLFC?s1=X');
  eq('…while our own host still is',
    new URL(wrapPrelanderFn(`${ORIGIN}/CLFC?s1=X`)).pathname, '/pre');
}

// ── the page itself carries no cloak ─────────────────────────────────────────
{
  // Comments are documentation, not behaviour — the header of js/breakout.js names
  // looksLikeReview() and document.write() precisely to say it does NOT use them, and
  // that must not read as using them. Block/HTML comments and line-leading `//` only:
  // a blanket `//` strip would eat `intent://…` mid-statement and blind the check that
  // matters most.
  const code = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ');

  const html = code(readFileSync(new URL('../../pre/index.html', import.meta.url), 'utf8'));
  const js = code(SRC);
  // The mechanism is sanctioned here; serving a reviewer a different page is not, and
  // that distinction is the entire reason the 2026-07-21 prelanders were retired.
  eq('no blank-page gate in the prelander', /__SUBID_OK|display\s*:\s*none\s*!important/.test(html + js), false);
  eq('no document.write in the prelander', /document\.write/.test(html + js), false);
  eq('no review/bot scoring in the breakout', /webdriver|looksLikeReview|headless|phantom/i.test(js), false);
  eq('the CTA is a real href, not a dead #', /id="preOpen"[^>]*href="#"/.test(html), true);
}

// ── the dashboard that renders these previews still parses ───────────────────
// The whole admin panel is one 1500-line inline <script>. A syntax error anywhere in
// it means EVERY tab silently stops working — no tab switching, no fetch, and the
// page still looks fine because the markup renders. Caught the hard way: an HTML
// comment added inside a template literal contained backticks, which closed the
// literal and took the entire dashboard down.
{
  const html = readFileSync(new URL('../../admin/index.html', import.meta.url), 'utf8');
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  eq('the admin dashboard has an inline script', blocks.length > 0, true);
  for (const [i, js] of blocks.entries()) {
    let err = '';
    try {
      // eslint-disable-next-line no-new-func
      new Function(js);
    } catch (e) {
      err = `${e.name}: ${e.message}`;
    }
    eq(`admin/index.html inline script #${i + 1} parses`, err, '');
  }
  // The preview pair is what this whole file exists to protect.
  eq('…and it still renders the prelander beside the landing page',
    /hndPhonePair\s*\(/.test(html), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
