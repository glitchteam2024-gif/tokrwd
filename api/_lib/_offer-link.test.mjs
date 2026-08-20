// Every lander CTA must hand the network the affiliate code and NOTHING ELSE.
// Run: node "api/_lib/_offer-link.test.mjs"
//
// Migi's rule, 2026-08-20: "moving forward it only ever carries the s1 and then the link."
// The door is gone, so the URL this page assembles IS the money path. What this pins:
//
//   1. ONE parameter on the outbound URL. Not s2/s3/s4/s5, not ttclid, not lg/campid/sid,
//      not mc_attr — one. Anything else is door-era plumbing creeping back.
//   2. That parameter carries the affiliate code, unmodified.
//   3. Its NAME matches the destination's dialect: Everflow-family trackers read `sub1` and
//      discard `s1`, CAKE/Monetise read `s1`. Same value, different envelope — forcing one
//      name everywhere zeroes out attribution on whichever family loses.
//   4. Exactly one '?', so the param is actually visible to the network.
//   5. An untagged visit appends NOTHING and fabricates NOTHING — it just goes to the offer.
//   6. No lander points at the retired sprktrax door.
//
// It executes the SHIPPED builder out of the deployed HTML, so an edit to a page or a
// generator cannot drift away from what is asserted here.

import { readFileSync, readdirSync, statSync } from 'node:fs';

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
function build(ex, search) {
  const location = { search, href: 'https://www.tokrwd.co/x' + search, pathname: '/x' };
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

const files = walk('');
const landers = [];
const unparsed = [];
for (const rel of files) {
  const src = readFileSync(new URL(rel, REPO), 'utf8');
  if (!/(?:var|let|const)\s+OFFER_(?:LINK|URL|BASE)\s*=|window\.__OFFER_LINK__\s*=/.test(src)) continue;
  const ex = extract(src);
  if (ex) landers.push([rel, ex]); else unparsed.push(rel);
}

console.log(`\nexecuting the shipped CTA builder in ${landers.length} landers\n`);
ok('every lander with an offer link exposes a parsable builder', unparsed.length === 0,
   unparsed.slice(0, 8).join('\n         '));
ok('the estate is actually covered', landers.length > 7000, `only ${landers.length}`);

// The wire is compound: <username>_<affId>_<SPK>_<GEO>_<campaign>. ac2992a decided only the SPK
// leaves for the network, so the expected outbound VALUE is the extracted code, not the whole wire.
const S1 = 'SPK-05BD-7BF1';
const WIRE = `migi_26_${S1}_US_1799887766`;
const SEARCH = `?s1=${WIRE}&s2=pub9&s3=acct7&s4=&s5=zz&sub2=q&ttclid=TT_TEST_1&lg=US&campid=${WIRE}&sid=abc&mc_attr=e%3Dx`;
const BANNED = ['s2', 's3', 's4', 's5', 'sub2', 'sub3', 'sub4', 'sub5', 'ttclid', 'lg', 'campid', 'sid', 'mc_attr'];

const bad = { threw: [], doubleQ: [], extra: [], wrongVal: [], wrongName: [], bareAppends: [], door: [], unbound: [], lowercased: [], scaler: [] };

for (const [rel, ex] of landers) {
  if (/sprktrax\.org/.test(ex.base)) bad.door.push(rel);

  // The builder names a base identifier. The PAGE must declare it — this harness supplies the
  // binding when it executes the body, so without this check a builder referencing a variable
  // that does not exist on the page runs green here and throws ReferenceError in the browser,
  // leaving a dead CTA. That exact bug shipped into 702 pages during the s1-only migration.
  const ref = /return (\w+) \+ \(\1\.indexOf\('\?'\)/.exec(ex.body)?.[1];
  if (ref && ref !== ex.arg &&
      !new RegExp(`(?:var|let|const)\\s+${ref}\\s*=`).test(ex.src)) {
    bad.unbound.push(`${rel}: builder uses ${ref}, page never declares it`);
  }

  let url;
  try { url = build(ex, SEARCH); } catch (e) { bad.threw.push(`${rel}: ${e.message}`); continue; }
  if ((url.match(/\?/g) || []).length !== 1) { bad.doubleQ.push(`${rel}: ${url}`); continue; }

  let u; try { u = new URL(url); } catch { bad.threw.push(`${rel}: unparseable ${url}`); continue; }
  const baseKeys = new Set([...new URL(ex.base).searchParams.keys()]);
  const added = [...u.searchParams.keys()].filter(k => !baseKeys.has(k));

  if (added.length !== 1) { bad.extra.push(`${rel}: added ${JSON.stringify(added)}`); continue; }
  const name = added[0];
  if (name !== 's1' && name !== 'sub1') bad.wrongName.push(`${rel}: ${name}`);
  if (u.searchParams.get(name) !== S1) bad.wrongVal.push(`${rel}: ${name}=${u.searchParams.get(name)}`);
  for (const b of BANNED) if (!baseKeys.has(b) && u.searchParams.has(b)) bad.extra.push(`${rel}: leaked ${b}`);

  let bare;
  try { bare = build(ex, '?utm_source=x'); } catch (e) { bad.threw.push(`${rel}: bare threw ${e.message}`); continue; }
  if (bare !== ex.base) bad.bareAppends.push(`${rel}: ${bare}`);

  // A lowercasing ad platform must still yield the code, not the whole wire. This is the exact
  // bug ac2992a's commit message calls out: a case-sensitive match fell through to `|| _s1`.
  try {
    const lc = new URL(build(ex, `?s1=${WIRE.toLowerCase()}`));
    const k = [...lc.searchParams.keys()].filter(x => x === 's1' || x === 'sub1')[0];
    if (lc.searchParams.get(k) !== S1) bad.lowercased.push(`${rel}: ${k}=${lc.searchParams.get(k)}`);
  } catch (e) { bad.threw.push(`${rel}: lowercase threw ${e.message}`); }

  // A scaler's free-form label has no SPK in it and must go out VERBATIM — blanking it pays
  // them nothing, so `|| _s1` in the builder is load-bearing, not a fallback to tidy away.
  try {
    const sc = new URL(build(ex, '?s1=TRAE_spark97_US'));
    const k = [...sc.searchParams.keys()].filter(x => x === 's1' || x === 'sub1')[0];
    if (sc.searchParams.get(k) !== 'TRAE_spark97_US') bad.scaler.push(`${rel}: ${k}=${sc.searchParams.get(k)}`);
  } catch (e) { bad.threw.push(`${rel}: scaler threw ${e.message}`); }
}

const rep = (name, arr) => ok(name, arr.length === 0,
  arr.slice(0, 6).join('\n         ') + (arr.length > 6 ? `\n         …and ${arr.length - 6} more` : ''));

rep('every builder runs', bad.threw);
rep("exactly one '?' in the outbound URL", bad.doubleQ);
rep('exactly ONE parameter is added, and nothing leaks', bad.extra);
rep('it is named s1 or sub1 (the destination decides which)', bad.wrongName);
rep('it carries the affiliate code unmodified', bad.wrongVal);
rep('an untagged visit appends nothing and fabricates nothing', bad.bareAppends);
rep('no lander points at the retired sprktrax door', bad.door);
rep("the builder's base variable is declared on the page (no dead CTA)", bad.unbound);
rep('a lowercased wire still yields the CODE, not the whole wire', bad.lowercased);
rep("a scaler's code-less label goes out verbatim", bad.scaler);

console.log(`\n${pass} passed, ${fail} failed   (${landers.length} landers executed)`);
process.exit(fail ? 1 : 0);
