// Every lander CTA must walk the first-party /click stamp, and the offer URL riding
// inside it must hand the network the affiliate code and NOTHING ELSE.
// Run: node "api/_lib/_offer-link.test.mjs"
//
// Two contracts stack here, and this file pins BOTH:
//
// Migi's rule, 2026-08-20: "moving forward it only ever carries the s1 and then the link."
// Migi's ask,  2026-08-21: every CTA click stamps through our own gate first, so no click
// can reach the network without first landing in our log.
//
// So the shipped builder must return:
//
//   /click?u=<network URL + exactly ONE param carrying the code>&s1=<raw wire>&lp=<path>[&t=<ttclid>]
//
// What this pins, by executing the SHIPPED builder out of the deployed HTML:
//
//   1. The CTA is a relative /click URL — same-origin on every alias domain, and the gate
//      carries ONLY u / s1 / lp / t. The raw wire stays on OUR url (that is the log), the
//      network still sees just the link and the code.
//   2. `u` decodes to the offer URL with ONE added parameter, named for the destination's
//      dialect (`sub1` Everflow, `s1` CAKE/Monetise), carrying the code unmodified. Not
//      s2/s3/s4/s5, not ttclid, not lg/campid/sid — one. Exactly one '?'.
//   3. `u` passes isAllowedGateDestination — a base host missing from the gate's allowlist
//      would 404 every paid click on that lander, so allowlist drift fails HERE, not live.
//   4. An untagged visit ships u=<bare offer link> and NO s1 — nothing fabricated.
//   5. No lander points at the retired sprktrax door.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { isAllowedGateDestination } from './links-config.js';

const REPO = new URL('../../', import.meta.url);
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; } else { fail++; console.log(`  FAIL ${n}${d ? `\n         ${d}` : ''}`); } };

const SKIP_DIRS = new Set(['.git', 'node_modules', '_lp-generator', 'justincase', 'SIGNAT~1',
                           'admin', 'api', 'js', 'safe', 'portal', 'pre', 'images']);
function walk(dir, out = []) {
  for (const name of readdirSync(new URL(dir, REPO))) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
    const rel = dir + name;
    if (statSync(new URL(rel, REPO)).isDirectory()) walk(rel + '/', out);
    else if (name.endsWith('.html')) out.push(rel);
  }
  return out;
}

/** The offer link the page will use, and the builder that decorates it. */
function extract(src) {
  const base =
    src.match(/window\.__OFFER_LINK__\s*=\s*window\.__OFFER_LINK__\s*\|\|\s*["']([^"']+)["']/)?.[1] ||
    src.match(/(?:var|let|const)\s+OFFER_LINK\s*=\s*(?:window\.__OFFER_(?:LINK|URL)__\s*\|\|\s*)?["']([^"']+)["']/)?.[1] ||
    src.match(/(?:var|let|const)\s+OFFER_(?:URL|BASE)\s*=\s*["']([^"']+)["']/)?.[1];
  if (!base) return null;

  // shape A: function buildOfferUrl() {…}   B: function __offerUrl(base) {…}
  // C: var <name> = (function () {…})();
  let m = src.match(/function buildOfferUrl\(\) \{([\s\S]*?)\n\s*\}\n/);
  if (m) return { base, kind: 'fn', body: m[1], src };
  m = src.match(/function __offerUrl\((\w+)\) \{([\s\S]*?)\n\s*\}\n/);
  if (m) return { base, kind: 'arg', arg: m[1], body: m[2], src };
  m = src.match(/SPRK-S1-ONLY v5[^\n]*\n\s*(?:var|let|const)\s+\w+\s*=\s*(\(function[\s\S]*?\}\)\(\));/);
  if (m) return { base, kind: 'iife', body: m[1], src };
  return null;
}

/** Run the shipped builder against a controlled query string. */
const PATHNAME = '/x/US7';
function build(ex, search) {
  const location = { search, href: 'https://www.tokrwd.co' + PATHNAME + search, pathname: PATHNAME };
  const s1 = new URLSearchParams(search).get('s1') || '';
  const win = {};
  if (ex.kind === 'fn') {
    return new Function('OFFER_LINK', 's1', 'location', 'window', 'URLSearchParams',
      `function buildOfferUrl(){${ex.body}\n}\nreturn buildOfferUrl();`)(ex.base, s1, location, win, URLSearchParams);
  }
  if (ex.kind === 'arg') {
    return new Function(ex.arg, 'location', 'window', 'URLSearchParams',
      `function __offerUrl(${ex.arg}){${ex.body}\n}\nreturn __offerUrl(${ex.arg});`)(ex.base, location, win, URLSearchParams);
  }
  return new Function('OFFER_LINK', 'OFFER_BASE', 'OFFER_URL', 's1', 'location', 'window', 'URLSearchParams',
    `return ${ex.body};`)(ex.base, ex.base, ex.base, s1, location, win, URLSearchParams);
}

/** Parse a builder result: must be a relative /click URL. Returns { gate, u } or null. */
function parseGate(url) {
  if (typeof url !== 'string' || !url.startsWith('/click?')) return null;
  const gate = new URL(url, 'https://www.tokrwd.co');
  const u = gate.searchParams.get('u');
  return { gate, u };
}

const files = walk('');
const landers = [];
const unparsed = [];
// Pages whose CTA deliberately does NOT walk /click: their outbound is our own /c/
// redirector (or resolved server-side), and /c/ writes the same gate log itself —
// wrapping them would double-log every click.
const C_ROUTED = new Set(['CLFCCA/index.html', 'CLFCUK/index.html', 'ESGP/index.html']);
for (const rel of files) {
  if (C_ROUTED.has(rel)) continue;
  const src = readFileSync(new URL(rel, REPO), 'utf8');
  if (!/(?:var|let|const)\s+OFFER_(?:LINK|URL|BASE)\s*=|window\.__OFFER_LINK__\s*=/.test(src)) continue;
  const ex = extract(src);
  if (ex) landers.push([rel, ex]); else unparsed.push(rel);
}

console.log(`\nexecuting the shipped CTA builder in ${landers.length} landers\n`);
ok('every lander with an offer link exposes a parsable builder', unparsed.length === 0,
   unparsed.slice(0, 8).join('\n         '));
ok('the estate is actually covered', landers.length > 7000, `only ${landers.length}`);

// The /click-skipped pages are NOT unchecked: each must still point its CTA at OUR /c/ redirector
// (never a raw network URL, and never accidentally swept onto /click) — that hop is what logs them.
// A future sweep that mangled one of these to a bare network link would silently un-gate it, so
// this asserts the property that keeps them covered by the /c/ path instead of the /click path.
for (const rel of C_ROUTED) {
  const src = readFileSync(new URL(rel, REPO), 'utf8');
  const links = [...src.matchAll(/['"](\/c\/[a-z0-9-]+|https?:\/\/[^'"]*\/c\/[a-z0-9-]+)['"]/gi)].length;
  ok(`${rel} still routes its CTA through our /c/ redirector`, links > 0, 'no /c/ hop found');
  ok(`${rel} was not accidentally swept onto /click`, !/SPRK-GATE v1/.test(src));
  ok(`${rel} names no raw network host in its CTA builder`, !/montrk|monetisetrk|fkn8s74mztrk|phef6trk|giftclick/i.test(src.replace(/<!--[\s\S]*?-->/g, '')));
}

// The wire is compound: <username>_<affId>_<SPK>_<GEO>_<campaign>. ac2992a decided only the SPK
// leaves for the network, so the expected value inside `u` is the extracted code — while the
// gate's own s1 param carries the WHOLE wire, because the log is where the wire lives now.
const S1 = 'SPK-05BD-7BF1';
const WIRE = `migi_26_${S1}_US_1799887766`;
const TTCLID = 'TT_TEST_1';
const SEARCH = `?s1=${WIRE}&s2=pub9&s3=acct7&s4=&s5=zz&sub2=q&ttclid=${TTCLID}&lg=US&campid=${WIRE}&sid=abc&mc_attr=e%3Dx`;
const BANNED = ['s2', 's3', 's4', 's5', 'sub2', 'sub3', 'sub4', 'sub5', 'ttclid', 'lg', 'campid', 'sid', 'mc_attr'];

/**
 * ROUND-TRIP EXCEPTIONS — printed on every run, so a carve-out can never quietly become
 * permanent (same discipline as the audit's EXCEPTIONS). A page listed here may add these keys
 * to the offer URL IN ADDITION to its one s1/sub1, each with the value it must carry (a string is
 * exact, a RegExp is a shape). Nothing else relaxes: s1 must still be present and correct, and
 * every other BANNED key still fails.
 *   EMPTY since 2026-09-04. mgfc.html held the only entry — the owner's TikTok S2S spec
 *   (2026-09-03, tiktok-s2s/README.md), where the click id rode out as s2 and the shared event id
 *   as s3 for Monetise to echo back to n8n. That page moved to Playful Rewards on Fluent, whose
 *   sub2/sub3 equivalents are BANNED above and which has no postback wired to echo them, so the
 *   carve-out no longer describes anything that ships. Do not re-add it without a network that
 *   actually echoes the keys back.
 */
const ROUNDTRIP_EXTRAS = {};

const bad = { threw: [], notGate: [], gateExtra: [], gateWire: [], gatePath: [], gateT: [],
              doubleQ: [], extra: [], wrongVal: [], wrongName: [], hostRefused: [],
              bareAppends: [], door: [], unbound: [], unswept: [], lowercased: [], scaler: [] };

for (const [rel, ex] of landers) {
  if (/sprktrax\.org/.test(ex.base)) bad.door.push(rel);
  if (!/SPRK-GATE v1/.test(ex.src)) bad.unswept.push(rel);

  // The builder names a base identifier. The PAGE must declare it — this harness supplies the
  // binding when it executes the body, so without this check a builder referencing a variable
  // that does not exist on the page runs green here and throws ReferenceError in the browser,
  // leaving a dead CTA. That exact bug shipped into 702 pages during the s1-only migration.
  const ref = /var _dest = !_send1 \? (\w+) :/.exec(ex.body)?.[1];
  if (ref && ref !== ex.arg &&
      !new RegExp(`(?:var|let|const)\\s+${ref}\\s*=`).test(ex.src)) {
    bad.unbound.push(`${rel}: builder uses ${ref}, page never declares it`);
  }

  let url;
  try { url = build(ex, SEARCH); } catch (e) { bad.threw.push(`${rel}: ${e.message}`); continue; }

  const g = parseGate(url);
  if (!g || !g.u) { bad.notGate.push(`${rel}: ${url}`); continue; }

  // The gate URL itself: only u / s1 / lp / t, wire verbatim, real pathname, ttclid carried.
  const gateKeys = [...g.gate.searchParams.keys()];
  const rogue = gateKeys.filter(k => !['u', 's1', 'lp', 't'].includes(k));
  if (rogue.length) bad.gateExtra.push(`${rel}: ${JSON.stringify(rogue)}`);
  if (g.gate.searchParams.get('s1') !== WIRE) bad.gateWire.push(`${rel}: s1=${g.gate.searchParams.get('s1')}`);
  if (g.gate.searchParams.get('lp') !== PATHNAME) bad.gatePath.push(`${rel}: lp=${g.gate.searchParams.get('lp')}`);
  if (g.gate.searchParams.get('t') !== TTCLID) bad.gateT.push(`${rel}: t=${g.gate.searchParams.get('t')}`);

  // The offer URL inside u: the 2026-08-20 one-param contract, unchanged.
  if ((g.u.match(/\?/g) || []).length !== 1) { bad.doubleQ.push(`${rel}: ${g.u}`); continue; }
  let u; try { u = new URL(g.u); } catch { bad.threw.push(`${rel}: unparseable u ${g.u}`); continue; }
  if (!isAllowedGateDestination(g.u)) bad.hostRefused.push(`${rel}: ${u.hostname}`);
  const baseKeys = new Set([...new URL(ex.base).searchParams.keys()]);
  const added = [...u.searchParams.keys()].filter(k => !baseKeys.has(k));

  const extras = ROUNDTRIP_EXTRAS[rel] || null;
  const core = added.filter(k => !(extras && Object.prototype.hasOwnProperty.call(extras, k)));
  if (core.length !== 1) { bad.extra.push(`${rel}: added ${JSON.stringify(added)}`); continue; }
  if (extras) for (const [k, want] of Object.entries(extras)) {
    const got = u.searchParams.get(k);
    const okv = got !== null && (want instanceof RegExp ? want.test(got) : got === want);
    if (!okv) bad.extra.push(`${rel}: round-trip ${k}=${got}`);
  }
  const name = core[0];
  if (name !== 's1' && name !== 'sub1') bad.wrongName.push(`${rel}: ${name}`);
  if (u.searchParams.get(name) !== S1) bad.wrongVal.push(`${rel}: ${name}=${u.searchParams.get(name)}`);
  for (const b of BANNED) if (!baseKeys.has(b) && !(extras && Object.prototype.hasOwnProperty.call(extras, b)) && u.searchParams.has(b)) bad.extra.push(`${rel}: leaked ${b}`);

  // Untagged visit: u is the bare offer link, and the gate URL carries no s1 and no t at all.
  let bare;
  try { bare = build(ex, '?utm_source=x'); } catch (e) { bad.threw.push(`${rel}: bare threw ${e.message}`); continue; }
  const bg = parseGate(bare);
  if (!bg || bg.u !== ex.base || bg.gate.searchParams.has('s1') || bg.gate.searchParams.has('t')) {
    bad.bareAppends.push(`${rel}: ${bare}`);
  }

  // A lowercasing ad platform must still yield the code inside u — while the gate's s1 keeps
  // the lowercase wire verbatim (the log records what actually arrived).
  try {
    const lg = parseGate(build(ex, `?s1=${WIRE.toLowerCase()}`));
    const lc = lg && lg.u ? new URL(lg.u) : null;
    const k = lc ? [...lc.searchParams.keys()].filter(x => x === 's1' || x === 'sub1')[0] : null;
    if (!lc || lc.searchParams.get(k) !== S1) bad.lowercased.push(`${rel}: ${k && lc ? lc.searchParams.get(k) : 'no gate url'}`);
    if (lg && lg.gate.searchParams.get('s1') !== WIRE.toLowerCase()) bad.gateWire.push(`${rel}: lowercase wire mangled`);
  } catch (e) { bad.threw.push(`${rel}: lowercase threw ${e.message}`); }

  // A scaler's free-form label has no SPK in it and must go out VERBATIM inside u — blanking it
  // pays them nothing, so `|| _s1` in the builder is load-bearing, not a fallback to tidy away.
  try {
    const sg = parseGate(build(ex, '?s1=TRAE_spark97_US'));
    const sc = sg && sg.u ? new URL(sg.u) : null;
    const k = sc ? [...sc.searchParams.keys()].filter(x => x === 's1' || x === 'sub1')[0] : null;
    if (!sc || sc.searchParams.get(k) !== 'TRAE_spark97_US') bad.scaler.push(`${rel}: ${k && sc ? sc.searchParams.get(k) : 'no gate url'}`);
  } catch (e) { bad.threw.push(`${rel}: scaler threw ${e.message}`); }
}

const rep = (name, arr) => ok(name, arr.length === 0,
  arr.slice(0, 6).join('\n         ') + (arr.length > 6 ? `\n         …and ${arr.length - 6} more` : ''));

if (Object.keys(ROUNDTRIP_EXTRAS).length) {
  console.log('\n  round-trip exceptions (printed every run, never silent):');
  for (const [f, ex] of Object.entries(ROUNDTRIP_EXTRAS)) console.log(`    ${f}: ${Object.keys(ex).join(', ')}`);
  console.log('');
}
rep('every builder runs', bad.threw);
rep('every CTA walks the first-party /click stamp', bad.notGate);
rep('every swept page carries the SPRK-GATE v1 marker', bad.unswept);
rep('the gate URL carries only u / s1 / lp / t', bad.gateExtra);
rep("the gate's s1 is the RAW wire, verbatim (the log keeps the wire)", bad.gateWire);
rep("the gate's lp is the page's own pathname", bad.gatePath);
rep("the gate's t carries the ttclid when one is present", bad.gateT);
rep("exactly one '?' in the offer URL inside u", bad.doubleQ);
rep('exactly ONE parameter is added to the offer URL, and nothing leaks', bad.extra);
rep('it is named s1 or sub1 (the destination decides which)', bad.wrongName);
rep('it carries the affiliate code unmodified', bad.wrongVal);
rep('every u passes the gate allowlist (no lander 404s at its own gate)', bad.hostRefused);
rep('an untagged visit ships the bare offer link and no s1/t', bad.bareAppends);
rep('no lander points at the retired sprktrax door', bad.door);
rep("the builder's base variable is declared on the page (no dead CTA)", bad.unbound);
rep('a lowercased wire still yields the CODE inside u', bad.lowercased);
rep("a scaler's code-less label goes out verbatim inside u", bad.scaler);

console.log(`\n${pass} passed, ${fail} failed   (${landers.length} landers executed)`);
process.exit(fail ? 1 : 0);
