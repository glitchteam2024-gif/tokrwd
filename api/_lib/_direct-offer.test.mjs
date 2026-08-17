// Every lander CTA must build a VALID network URL. Run: node "api/_lib/_direct-offer.test.mjs"
//
// The sprktrax door was removed from the funnel on 2026-08-17 (Migi). Landers now link straight
// to the network, which means the URL the page assembles IS the money path — there is no door
// left to normalise it. Four ways that silently loses a paid click, all of which this pins:
//
//   1. TWO '?' — the old builder hardcoded '?' because a door URL had no query. Every network URL
//      already has one, so the second makes s1/s2/s3/ttclid invisible and the click pays nobody.
//   2. s1 TWICE — the old follow-up `if (s1) url += ...` line had to be removed when the builder
//      started appending s1 itself. A first-match tracker reads the wrong one.
//   3. s1 NOT LAST — ad automations append to the tail; the wire contract puts s1 there.
//   4. NO UNIQUE s5 — Monetise returns a real txid on ~1.2% of conversions, so postback dedups on
//      (network, spark, sub2..sub5) within 120s, and s1/s2/s3 are CONSTANT per creative. Without a
//      unique s5, two genuine leads collapse into one payment.
//
// This runs the SHIPPED builder out of the deployed HTML rather than a copy of it, so a future
// edit to the generators cannot drift away from what is asserted here.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { webcrypto } from 'node:crypto';

const REPO = new URL('../../', import.meta.url);
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; } else { fail++; console.log(`  FAIL ${n}${d ? `\n         ${d}` : ''}`); } };

const SKIP_DIRS = new Set(['.git', 'node_modules', '_lp-generator', 'justincase', 'SIGNAT~1', 'admin', 'api', 'js', 'safe', 'portal', 'pre']);
function walk(dir, out = []) {
  for (const name of readdirSync(new URL(dir, REPO))) {
    if (SKIP_DIRS.has(name) || name.startsWith('.')) continue;
    const rel = dir + name;
    if (statSync(new URL(rel, REPO)).isDirectory()) walk(rel + '/', out);
    else if (name.endsWith('.html')) out.push(rel);
  }
  return out;
}

/** Pull the shipped builder IIFE and its DOOR base out of a lander. */
function extract(src) {
  const door =
    src.match(/window\.__DOOR_URL__\s*=\s*window\.__DOOR_URL__\s*\|\|\s*["']([^"']+)["']/)?.[1] ||
    src.match(/(?:var|let|const)\s+DOOR\s*=\s*(?:window\.__DOOR_URL__\s*\|\|\s*)?["']([^"']+)["']/)?.[1];
  const i = src.indexOf('SPRK-DIRECT-OFFER v2');
  if (i < 0 || !door) return null;
  const start = src.indexOf('(function () {', i);
  const end = src.indexOf('})();', start);
  if (start < 0 || end < 0) return null;
  return { door, body: src.slice(start, end + 5) };
}

/** Run that builder with a controlled query string. */
function build({ door, body }, search) {
  const q = new URLSearchParams(search);
  const qs = (() => { const o = new URLSearchParams(search); o.delete('s1'); o.delete('lg'); return o.toString(); })();
  const s1 = q.get('s1') || '';
  const win = {};
  const fn = new Function('DOOR', 'qs', 'q', 's1', 'window', 'crypto', `return ${body}`);
  return fn(door, qs, q, s1, win, webcrypto);
}

const files = walk('');
const landers = [];
for (const rel of files) {
  const src = readFileSync(new URL(rel, REPO), 'utf8');
  const ex = extract(src);
  if (ex) landers.push([rel, ex]);
}
console.log(`\nchecking the shipped CTA builder in ${landers.length} landers\n`);
ok('the migration actually reached the landers', landers.length > 6000, `only ${landers.length} found`);

const SEARCH = '?s1=SPK-05BD-7BF1&s2=pub9&s3=acct7&s4=&ttclid=TT_TEST_1&lg=US&campid=SPK-05BD-7BF1';
const bad = { doubleQ: [], dupS1: [], notLast: [], noS5: [], lostS2: [], lostS3: [], lostTt: [], leaked: [], badUrl: [] };
const s5s = new Set();
let checked = 0;

for (const [rel, ex] of landers) {
  let url;
  try { url = build(ex, SEARCH); } catch (e) { bad.badUrl.push(`${rel}: threw ${e.message}`); continue; }
  checked++;
  if ((url.match(/\?/g) || []).length !== 1) bad.doubleQ.push(`${rel}: ${url}`);
  let u; try { u = new URL(url); } catch { bad.badUrl.push(`${rel}: unparseable ${url}`); continue; }
  const keys = [...u.searchParams.keys()];
  if (keys.filter(k => k === 's1').length !== 1) bad.dupS1.push(`${rel}: s1 x${keys.filter(k => k === 's1').length}`);
  if (keys[keys.length - 1] !== 's1') bad.notLast.push(`${rel}: ends ${keys[keys.length - 1]}`);
  if (u.searchParams.get('s1') !== 'SPK-05BD-7BF1') bad.dupS1.push(`${rel}: s1=${u.searchParams.get('s1')}`);
  const s5 = u.searchParams.get('s5');
  if (!s5 || s5.length < 16) bad.noS5.push(`${rel}: s5=${s5}`); else s5s.add(s5);
  if (u.searchParams.get('s2') !== 'pub9') bad.lostS2.push(`${rel}: s2=${u.searchParams.get('s2')}`);
  if (u.searchParams.get('s3') !== 'acct7') bad.lostS3.push(`${rel}: s3=${u.searchParams.get('s3')}`);
  if (u.searchParams.get('ttclid') !== 'TT_TEST_1') bad.lostTt.push(`${rel}: ttclid=${u.searchParams.get('ttclid')}`);
  if (keys.includes('lg') || keys.includes('campid')) bad.leaked.push(`${rel}: leaked lander-only param`);
}

const show = (a) => a.slice(0, 4).join('\n         ') + (a.length > 4 ? `\n         …and ${a.length - 4} more` : '');
ok('every built URL parses', !bad.badUrl.length, show(bad.badUrl));
ok('exactly one "?" in every built URL', !bad.doubleQ.length, show(bad.doubleQ));
ok('s1 appears exactly once, with the right value', !bad.dupS1.length, show(bad.dupS1));
ok('s1 is the LAST param', !bad.notLast.length, show(bad.notLast));
ok('a unique s5 is minted', !bad.noS5.length, show(bad.noS5));
ok('s5 really is unique per build', s5s.size === checked, `${s5s.size} distinct across ${checked} builds`);
ok('s2 (publisher) survives', !bad.lostS2.length, show(bad.lostS2));
ok('s3 (ad account) survives', !bad.lostS3.length, show(bad.lostS3));
ok('ttclid survives', !bad.lostTt.length, show(bad.lostTt));
ok('lander-only params (lg, campid) never reach the network', !bad.leaked.length, show(bad.leaked));

// an untagged visit must NOT fabricate an s1 — it simply converts to nobody
const untagged = build(landers[0][1], '?s2=pub9');
ok('an untagged visit does not fabricate s1', !new URL(untagged).searchParams.get('s1'), untagged);

// ── the landers still on the door, and why ───────────────────────────────────
//
// These are NOT an oversight and NOT a migration bug: every one of them advertises an offer that
// no longer exists in SPRK. The offer row was deleted or archived, so `offers.destination_by_geo`
// has nothing in it — there is literally no network link to point them at. They keep calling the
// door, which 404s, exactly as they did before the migration. Nothing got worse; nothing could
// get better without a product decision.
//
// Retiring or re-branding them is Migi's call, so this is an EXCEPTIONS list printed on every run
// rather than a silent pass. Anything NOT on this list that still calls the door is a real
// regression — a lander that had a live offer and lost it.
const DOOR_ONLY = new Map(Object.entries({
  'applepay1000-us': 101, 'applepay1000-us-b': 101, 'applepay1000-us-c': 101,  // no US Apple Pay $1000 offer exists
  'sephora-us': 31, 'sephora-gb': 31, 'sephora-ca': 31, 'sephora-au': 31,      // Sephora is gone entirely
  'cash-gb': 31, 'cash-au': 31,                                                // only the US Cash offer survives
  'shein-ca': 31,                                                              // no CA Shein offer
  'ubereats-gb': 31,                                                           // no Uber Eats offer
  'playful-rewards-cash-us-b': 31, 'playful-rewards-cash-us-c': 31,            // offer archived
  'cash': 1, 'applepay1000': 1, 'shein': 1, 'ubereats': 1, 'sephora': 1, 'applepay750': 1, // bare canonicals
}));
const DOOR_RE = /sprktrax\.org\/api\/link\/([a-z0-9-]+)["']/;
const stillDoor = new Map();
for (const f of files) {
  const m = DOOR_RE.exec(readFileSync(new URL(f, REPO), 'utf8'));
  if (m) stillDoor.set(m[1], (stillDoor.get(m[1]) || 0) + 1);
}
const unexpected = [...stillDoor].filter(([slug]) => !DOOR_ONLY.has(slug)).map(([s, n]) => `${s} (${n} files)`);
ok('the only landers still on the door are the ones with no offer to point at', !unexpected.length, show(unexpected));

const total = [...stillDoor.values()].reduce((a, b) => a + b, 0);
console.log(`\n  ${total} lander(s) still call the door because their offer no longer exists:`);
for (const [slug, n] of [...stillDoor].sort((a, b) => b[1] - a[1])) {
  console.log(`    ${slug.padEnd(28)} ${String(n).padStart(4)} file(s)`);
}
console.log('  Retire or re-brand these — they cannot be fixed in code.');

console.log(`\n${pass} passed, ${fail} failed   (${checked} landers exercised)`);
process.exit(fail ? 1 : 0);
