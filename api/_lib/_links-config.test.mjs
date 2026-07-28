// Guards the Carrd route table. Run after editing CARRD_ROUTES:
//   node "api/_lib/_links-config.test.mjs"
//
// Catches the two mistakes that silently misroute paid traffic: a duplicate host (the second
// route is dead and its offer never serves) and a lander that is not in LANDER_URLS (a typo'd
// URL 404s the click). Neither shows up as an error at runtime — /r just returns the wrong page.
import { readFileSync } from 'node:fs';
import {
  CARRD_ROUTES, LANDER_URLS, OFFER_KEYS, OVERRIDE_LANDERS, OFFERS, LANDERS,
  DEFAULT_LANDER_ORIGIN, OVERRIDE_PARAM,
  carrdRouteProblems, offerKeyProblems, overrideLanderProblems, offerForLander,
  landerForCarrd, landerForOfferKey, landerForOverride,
  resolveOverrideLander, resolveLander, buildLanderUrl, isOwnLanderHost,
  resolveRouteLander, routableLanders,
} from './links-config.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const ok = g === w;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) { console.log(`   got:  ${g}`); console.log(`   want: ${w}`); fail++; } else pass++;
};

// ── the live table ───────────────────────────────────────────────────────────
eq(`CARRD_ROUTES is valid (${CARRD_ROUTES.length} route(s))`, carrdRouteProblems(), []);

// Route-target resolution. Placed here (not with the routing assertions further
// down) because it needs only hoisted helpers — the precedence checks that use the
// `route` const live after its definition.
//
// A route may name an OVERRIDE_LANDERS alias, because a scaler lander is kept out
// of LANDER_URLS so no public `o=` key can reach it.
eq('an override alias is a valid route target', resolveRouteLander('esgp'), `${DEFAULT_LANDER_ORIGIN}/ESGP`);
eq('alias route targets are case-insensitive', resolveRouteLander('ESGP'), `${DEFAULT_LANDER_ORIGIN}/ESGP`);
eq('a standing LANDER_URLS value is still a valid target',
  resolveRouteLander(LANDER_URLS.FCCA), LANDER_URLS.FCCA);
// Anything else must resolve to '' — handing the raw string to the Carrd script
// would 404 every click on that page instead of failing the build.
eq('an unknown alias is rejected', resolveRouteLander('nope'), '');
eq('an arbitrary URL is rejected even on our own host',
  resolveRouteLander('https://www.tokrwd.co/NOT-A-DECLARED-LANDER'), '');
eq('a foreign route target is rejected', resolveRouteLander('https://evil.com/x'), '');
eq('empty / null route targets are rejected',
  [resolveRouteLander(''), resolveRouteLander(null)], ['', '']);

// ── host-bound assignment: Edwin's Carrd page → his own lander ───────────────
eq('laboedomegan.carrd.co resolves to the ESGP lander',
  landerForCarrd('https://laboedomegan.carrd.co/?campid=EDWIN-01&ttclid=TT1'),
  `${DEFAULT_LANDER_ORIGIN}/ESGP`);
eq('www. and casing on the Carrd host do not break the match',
  landerForCarrd('https://WWW.LaboEdoMegan.carrd.co/?campid=X'), `${DEFAULT_LANDER_ORIGIN}/ESGP`);
// Exact-host matching still holds: a page whose name merely CONTAINS his must not
// inherit his lander, or its clicks silently credit Edwin's link.
eq('a longer lookalike host does not inherit the route',
  landerForCarrd('https://notlaboedomegan.carrd.co/?campid=X'), '');

// The routable-lander list feeds the admin dropdown; every row must be a target
// the validator would then accept, or the UI offers a choice that cannot work.
eq('every routableLanders() row resolves as a route target',
  routableLanders().filter(l => !resolveRouteLander(l.key)), []);
eq('routableLanders() covers both kinds',
  [...new Set(routableLanders().map(l => l.kind))].sort(), ['override', 'standing']);

// ── hostname matching is EXACT, not substring ────────────────────────────────
// This is the bug that appears once there are many similarly-named pages: a substring test
// lets 'hoodie.carrd.co' capture every click meant for 'thegoodhoodie.carrd.co'.
eq('unmapped host returns empty (caller applies the default)',
  landerForCarrd('https://nothing-here.carrd.co/?campid=X'), '');
eq('non-URL input does not throw', landerForCarrd('not-a-url'), '');
eq('empty input', landerForCarrd(''), '');
eq('null input', landerForCarrd(null), '');

// ── validator catches the mistakes that matter ───────────────────────────────
// Re-implemented against synthetic tables so the checks run regardless of what is configured.
// Mirrors carrdRouteProblems(), including its use of resolveRouteLander — so an
// alias target validates here exactly as it does in the real one. If this drifts
// from the real validator the synthetic cases below start proving nothing.
function problemsFor(routes) {
  const problems = [];
  const seen = new Map();
  routes.forEach((route, i) => {
    let h = String(route.host || '').trim().toLowerCase().replace(/^www\./, '');
    if (h && !h.includes('.')) h = `${h}.carrd.co`;
    if (!h) { problems.push(`route ${i}: missing or empty host`); return; }
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h)) problems.push(`route ${i}: "${route.host}" is not a valid hostname`);
    if (seen.has(h)) problems.push(`duplicate host "${h}" (routes ${seen.get(h)} and ${i}) — the first wins, the second is dead`);
    else seen.set(h, i);
    if (!route.lander) problems.push(`route ${i} (${h}): missing lander`);
    else if (!resolveRouteLander(route.lander)) {
      problems.push(`route ${i} (${h}): lander "${route.lander}" is neither a LANDER_URLS value nor an OVERRIDE_LANDERS alias`);
    }
  });
  return problems;
}

eq('duplicate host is reported',
  problemsFor([
    { host: 'a.carrd.co', lander: LANDER_URLS.FC },
    { host: 'a.carrd.co', lander: LANDER_URLS.TU },
  ]).length, 1);

eq('bare subdomain and full hostname collide as duplicates',
  problemsFor([
    { host: 'a', lander: LANDER_URLS.FC },
    { host: 'a.carrd.co', lander: LANDER_URLS.TU },
  ]).length, 1);

eq('unknown lander is reported',
  problemsFor([{ host: 'b.carrd.co', lander: 'https://www.tokrwd.co/TYPO' }]).length, 1);

eq('missing host is reported', problemsFor([{ lander: LANDER_URLS.FC }]).length, 1);
eq('missing lander is reported', problemsFor([{ host: 'c.carrd.co' }]).length, 1);
eq('a clean 3-route table has no problems',
  problemsFor([
    { host: 'one', lander: LANDER_URLS.FC },
    { host: 'two.carrd.co', lander: LANDER_URLS.FCUK },
    { host: 'three.carrd.co', lander: LANDER_URLS.FCCA },
  ]), []);

// ── scale: 50 routes ─────────────────────────────────────────────────────────
const fifty = Array.from({ length: 50 }, (_, i) => ({
  host: `page${i}.carrd.co`,
  lander: [LANDER_URLS.FC, LANDER_URLS.TU, LANDER_URLS.FCUK, LANDER_URLS.FCCA][i % 4],
}));
eq('50 routes validate clean', problemsFor(fifty), []);

// Prove exact matching holds at scale: a host that is a substring of another must NOT match it.
const tricky = [
  { host: 'hoodie.carrd.co', lander: LANDER_URLS.TU },
  { host: 'thegoodhoodie.carrd.co', lander: LANDER_URLS.FCCA },
];
eq('substring-similar hosts stay distinct', problemsFor(tricky), []);
const map = new Map(tricky.map(r => [r.host, r.lander]));
eq('thegoodhoodie resolves to its OWN lander, not hoodie\'s',
  map.get(new URL('https://thegoodhoodie.carrd.co/?campid=X').hostname), LANDER_URLS.FCCA);

// ── geo / offer-key table ────────────────────────────────────────────────────
eq(`OFFER_KEYS is consistent (${Object.keys(OFFER_KEYS).length} key(s))`, offerKeyProblems(), []);
eq('o=fcca resolves', landerForOfferKey('https://x.carrd.co/?o=fcca'), LANDER_URLS.FCCA);
eq('o=fcuk resolves', landerForOfferKey('https://x.carrd.co/?o=fcuk'), LANDER_URLS.FCUK);
eq('o=tu resolves',   landerForOfferKey('https://x.carrd.co/?o=tu'),   LANDER_URLS.TU);
eq('o= is case-insensitive', landerForOfferKey('https://x.carrd.co/?o=FCCA'), LANDER_URLS.FCCA);
eq('unknown o= falls through', landerForOfferKey('https://x.carrd.co/?o=zzz'), '');
eq('absent o= falls through',  landerForOfferKey('https://x.carrd.co/'), '');
eq('every geo lander is reachable by an o= key',
  Object.values(LANDER_URLS).filter(u => !Object.values(OFFER_KEYS).includes(u)), []);

// ── lander override (lp=) ────────────────────────────────────────────────────
// The param is on a PUBLIC ad link, so every one of these is a real input, not a
// hypothetical: the host allowlist is the only thing keeping /r from being an
// open redirect, and a silently-dropped override runs the test on the wrong page.
const AD = (qs) => `https://x.carrd.co/?campid=SPK-A1B2-C3D4&${qs}`;
// Precedence assertions care about WHICH RULE FIRED, not the offer binding that
// rides along — that is asserted on its own below. Comparing the whole object
// here would make every routing test fail whenever an offer mapping changes.
const route = (opts) => { const r = resolveLander(opts); return { url: r.url, source: r.source }; };

eq(`OVERRIDE_LANDERS is valid (${Object.keys(OVERRIDE_LANDERS).length} entr(y/ies))`, overrideLanderProblems(), []);

// ── the host assignment, end to end ──────────────────────────────────────────
// The whole point of a CARRD_ROUTES row is that the ad link carries NOTHING: no
// lp=, no o=. That bare form is what Edwin's live ads actually use, so it is the
// case worth asserting.
{
  const EDWIN = 'https://laboedomegan.carrd.co/?campid=EDWIN-01&ttclid=TT9';
  eq('a bare ad link routes by carrd_route, not to the default offer',
    route({ carrdUrl: EDWIN }),
    { url: `${DEFAULT_LANDER_ORIGIN}/ESGP`, source: 'carrd_route' });
  eq('…and reports Edwin\'s offer, so the admin panel can name it',
    resolveLander({ carrdUrl: EDWIN }).offer, 'gravypass-esgp');
  // A host assignment is not an `o=`, so there is no ad-vs-lander offer claim to
  // disagree with — this must not surface a phantom conflict.
  eq('…with no phantom offer conflict', resolveLander({ carrdUrl: EDWIN }).offerConflict, null);
  // s1 still has to reach the lander, or the sub-ID never gets to his network.
  const built = new URL(buildLanderUrl(resolveLander({ carrdUrl: EDWIN }).url, 'EDWIN-01', EDWIN));
  eq('a custom (non-SPK) scaler campid survives to the lander as s1',
    built.searchParams.get('s1'), 'EDWIN-01');
  eq('ttclid survives the host-assigned hop', built.searchParams.get('ttclid'), 'TT9');

  // lp= and o= must still WIN over a host assignment — that is what keeps them
  // usable for a one-off test on a page that is already assigned.
  eq('lp= still beats the host assignment',
    route({ carrdUrl: 'https://laboedomegan.carrd.co/?campid=X&lp=trt' }),
    { url: `${DEFAULT_LANDER_ORIGIN}/trt`, source: 'override' });
  eq('o= still beats the host assignment',
    route({ carrdUrl: 'https://laboedomegan.carrd.co/?campid=X&o=tu' }),
    { url: LANDER_URLS.TU, source: 'offer_key' });
}

// accepted forms
eq('bare path resolves to the lander site',
  resolveOverrideLander('trt-page'), `${DEFAULT_LANDER_ORIGIN}/trt-page`);
eq('leading slash is equivalent',
  resolveOverrideLander('/trt-page'), `${DEFAULT_LANDER_ORIGIN}/trt-page`);
eq('nested path resolves',
  resolveOverrideLander('50FC/FC7'), `${DEFAULT_LANDER_ORIGIN}/50FC/FC7`);
eq('a .html file resolves', resolveOverrideLander('FCTT.html'), `${DEFAULT_LANDER_ORIGIN}/FCTT.html`);
eq('full URL on our host resolves',
  resolveOverrideLander('https://www.tokrwd.co/trt-page'), 'https://www.tokrwd.co/trt-page');
// The live aliases, not fixtures: these assert the real OVERRIDE_LANDERS entries work.
eq('registered alias resolves', resolveOverrideLander('trt'), `${DEFAULT_LANDER_ORIGIN}/trt`);
eq('alias lookup is case-insensitive', resolveOverrideLander('TrT'), `${DEFAULT_LANDER_ORIGIN}/trt`);
// The alias key is lowercase but the PATH is not — /ESGP is an uppercase folder, and Vercel
// serves it case-sensitively. A lowercased path would 404 every one of Edwin's clicks.
eq('esgp alias resolves to the uppercase folder',
  resolveOverrideLander('esgp'), `${DEFAULT_LANDER_ORIGIN}/ESGP`);
eq('esgp alias is reachable in any case', resolveOverrideLander('ESGP'), `${DEFAULT_LANDER_ORIGIN}/ESGP`);
eq('esgp is bound to Edwin\'s offer', offerForLander(`${DEFAULT_LANDER_ORIGIN}/ESGP`), 'gravypass-esgp');
// Scaler landers are override-ONLY on purpose: no o= key and not in LANDER_URLS, so an
// affiliate cannot route their own traffic onto Edwin's link.
eq('no o= key reaches the esgp lander',
  Object.values(OFFER_KEYS).filter(u => /\/ESGP$/i.test(u)), []);

// rejected forms — each falls through to normal routing rather than erroring
eq('foreign host is rejected', resolveOverrideLander('https://evil.com/x'), '');
eq('http is rejected (https only)', resolveOverrideLander('http://www.tokrwd.co/X'), '');
eq('lookalike host is rejected', resolveOverrideLander('https://tokrwd.co.evil.com/X'), '');
eq('subdomain of our host is not implicitly trusted',
  resolveOverrideLander('https://anything.tokrwd.co/X'), '');
eq('javascript: is rejected', resolveOverrideLander('javascript:alert(1)'), '');
eq('data: is rejected', resolveOverrideLander('data:text/html,<h1>x'), '');
eq('path traversal is rejected', resolveOverrideLander('../../etc/passwd'), '');
eq('encoded traversal is rejected', resolveOverrideLander('%2e%2e/%2e%2e/x'), '');
eq('backslash is rejected', resolveOverrideLander('\\\\evil.com'), '');
eq('bare root is rejected', resolveOverrideLander('/'), '');
eq('empty / null are rejected', [resolveOverrideLander(''), resolveOverrideLander(null)], ['', '']);
eq('an over-long path is rejected', resolveOverrideLander('A'.repeat(300)), '');

// `//evil.com` must not survive as a protocol-relative URL — it degrades to a
// path on OUR origin, which 404s harmlessly instead of leaving the domain.
eq('protocol-relative cannot escape our origin',
  resolveOverrideLander('//evil.com/x'), `${DEFAULT_LANDER_ORIGIN}/evil.com/x`);

// The override must not be able to smuggle its own query params: an inbound s4
// SUPPRESSES the door's authoritative offer label, and s1 is the attribution key.
eq('query on the override is dropped',
  resolveOverrideLander('trt-page?s4=spoof&s1=NOPE'), `${DEFAULT_LANDER_ORIGIN}/trt-page`);
eq('hash on the override is dropped',
  resolveOverrideLander('trt-page#frag'), `${DEFAULT_LANDER_ORIGIN}/trt-page`);
eq('query on a full-URL override is dropped',
  resolveOverrideLander('https://www.tokrwd.co/trt-page?s4=spoof'), 'https://www.tokrwd.co/trt-page');

// reading it off the ad link
eq('lp= is read from the Carrd URL',
  landerForOverride(AD('lp=trt-page')), `${DEFAULT_LANDER_ORIGIN}/trt-page`);
eq('absent lp= returns empty', landerForOverride(AD('o=tu')), '');
eq('malformed carrd URL does not throw', landerForOverride('not-a-url'), '');

// The admin link builder uses URLSearchParams.set, which percent-encodes the slash
// in a nested path — so the wire form is `lp=50FC%2FFC7`, not the raw slash the
// tests above use. Assert the form the UI actually emits, not just the tidy one.
{
  const built = new URL('https://mypage.carrd.co/');
  built.searchParams.set('campid', 'SPK-A1B2-C3D4');
  built.searchParams.set('lp', '50FC/FC7');
  eq('encoded-slash lp= from the admin builder resolves',
    landerForOverride(built.toString()), `${DEFAULT_LANDER_ORIGIN}/50FC/FC7`);
}

// A campaign lander_url is stored by set_campaign with no validation and ends up in
// `location.replace()` on the Carrd page, so a non-https one must never route.
eq('a javascript: campaign lander_url does not route',
  route({ carrdUrl: AD('o=tu'), campid: 'C1', campaigns: { C1: { lander_url: 'javascript:alert(1)' } } }),
  { url: LANDER_URLS.TU, source: 'offer_key' });
eq('an http: campaign lander_url does not route',
  route({ carrdUrl: AD('o=tu'), campid: 'C1', campaigns: { C1: { lander_url: 'http://169.254.169.254/' } } }),
  { url: LANDER_URLS.TU, source: 'offer_key' });
eq('a valid https campaign lander_url still routes',
  route({ carrdUrl: AD('o=tu'), campid: 'C1', campaigns: { C1: { lander_url: 'https://www.tokrwd.co/CLTU' } } }),
  { url: 'https://www.tokrwd.co/CLTU', source: 'campaign' });

// Only own hosts may be fetched server-side by the admin reachability check.
eq('isOwnLanderHost accepts our lander site', isOwnLanderHost(`${DEFAULT_LANDER_ORIGIN}/trt`), true);
eq('isOwnLanderHost rejects a foreign host', isOwnLanderHost('https://evil.com/x'), false);
eq('isOwnLanderHost rejects link-local metadata', isOwnLanderHost('http://169.254.169.254/'), false);
eq('isOwnLanderHost rejects junk', isOwnLanderHost('not-a-url'), false);

// ── precedence: lp= beats everything ─────────────────────────────────────────
eq('lp= wins over o=',
  route({ carrdUrl: AD('o=tu&lp=trt-page') }),
  { url: `${DEFAULT_LANDER_ORIGIN}/trt-page`, source: 'override' });
eq('lp= wins over a campaign mapping',
  route({
    carrdUrl: AD('lp=trt-page'),
    campid: 'SPK-A1B2-C3D4',
    campaigns: { 'SPK-A1B2-C3D4': { lander_url: 'https://www.tokrwd.co/CLTU' } },
  }),
  { url: `${DEFAULT_LANDER_ORIGIN}/trt-page`, source: 'override' });
eq('an INVALID lp= falls through to o= rather than dropping the click',
  route({ carrdUrl: AD('o=tu&lp=https://evil.com/x') }),
  { url: LANDER_URLS.TU, source: 'offer_key' });
eq('no signals at all → the default lander',
  route({ carrdUrl: 'https://unmapped.carrd.co/?campid=X' }),
  { url: LANDERS[0].url, source: 'default' });

// campaigns is keyed by a client-supplied campid, so inherited keys must not resolve.
eq('a prototype key is not treated as a campaign mapping',
  route({ carrdUrl: AD('o=tu'), campid: 'constructor', campaigns: {} }),
  { url: LANDER_URLS.TU, source: 'offer_key' });

// ── the built URL ────────────────────────────────────────────────────────────
// s1 must be the spark code and must survive whatever the override said.
{
  const link = AD('lp=trt-page&ttclid=TT123&s3=acct7');
  const { url } = resolveLander({ carrdUrl: link, campid: 'SPK-A1B2-C3D4' });
  const built = new URL(buildLanderUrl(url, 'SPK-A1B2-C3D4', link));
  eq('override lander is the destination', built.origin + built.pathname, `${DEFAULT_LANDER_ORIGIN}/trt-page`);
  eq('s1 carries the spark code', built.searchParams.get('s1'), 'SPK-A1B2-C3D4');
  eq('ttclid survives to the lander', built.searchParams.get('ttclid'), 'TT123');
  eq('s3 survives to the lander', built.searchParams.get('s3'), 'acct7');
  eq('the override param itself is NOT forwarded', built.searchParams.get(OVERRIDE_PARAM), null);
}

// ── offer binding: the DECLARED offer must match the page's REAL door ─────────
// This is the check that makes the registry worth having. Every lander hardcodes
// its own door, so `lp=` pointing at the wrong page does not fail — it credits a
// different offer, and the campaign just reads as underperforming. Assert against
// the HTML on disk, not against another table, or the two tables agree with each
// other while both disagree with what actually ships.
const REPO = new URL('../../', import.meta.url);

function doorsIn(html) {
  // Every way a lander names its destination: the Path A `var DOOR` line, a
  // sprktrax door URL, or a /c/<slug> offer link on any of our cloaker domains.
  const found = new Set();
  for (const m of html.matchAll(/sprktrax\.org\/api\/link\/([a-z0-9-]+)/gi)) found.add(`sprktrax.org/api/link/${m[1].toLowerCase()}`);
  for (const m of html.matchAll(/\/c\/([a-z0-9-]+)/gi)) found.add(`/c/${m[1].toLowerCase()}`);
  return found;
}

for (const [key, entry] of Object.entries(OVERRIDE_LANDERS)) {
  const resolved = resolveOverrideLander(entry.path);
  const path = resolved.replace(DEFAULT_LANDER_ORIGIN, '').replace(/^\/+/, '');
  let html = '';
  try {
    html = readFileSync(new URL(`${path}/index.html`, REPO), 'utf8');
  } catch {
    try { html = readFileSync(new URL(`${path}`, REPO), 'utf8'); } catch { /* not local */ }
  }

  if (!html) {
    // A lander we cannot read cannot be verified. Say so loudly rather than
    // passing by default — silent success here is the whole failure mode.
    eq(`OVERRIDE_LANDERS.${key}: lander HTML is readable for offer verification`, `missing: ${path}`, 'readable');
    continue;
  }
  const expected = OFFERS[entry.offer].match.toLowerCase();
  const doors = doorsIn(html);
  eq(`OVERRIDE_LANDERS.${key}: /${path} really fires "${entry.offer}"`,
    doors.has(expected) || [...doors].some(d => d.endsWith(expected)), true);
  eq(`OVERRIDE_LANDERS.${key}: offerForLander agrees with the registry`,
    offerForLander(resolved), entry.offer);
}

// The standing CL* landers are bound too, so the admin panel can name the offer
// whichever routing rule won — not just on the override path.
for (const [name, url] of Object.entries(LANDER_URLS)) {
  const path = url.replace(DEFAULT_LANDER_ORIGIN, '').replace(/^\/+/, '');
  const offer = offerForLander(url);
  eq(`LANDER_URLS.${name} is bound to an offer`, !!offer, true);
  if (!offer) continue;
  let html = '';
  try { html = readFileSync(new URL(`${path}/index.html`, REPO), 'utf8'); } catch { /* skip */ }
  if (!html) {
    eq(`LANDER_URLS.${name}: lander HTML is readable`, `missing: ${path}`, 'readable');
    continue;
  }
  const expected = OFFERS[offer].match.toLowerCase();
  eq(`LANDER_URLS.${name}: /${path} really fires "${offer}"`,
    [...doorsIn(html)].some(d => d === expected || d.endsWith(expected)), true);
}

// ── offer mismatch is reported, not swallowed ────────────────────────────────
// The click must still go through: dropping paid traffic is worse than a wrong
// offer, and the override is the operator's explicit instruction.
{
  const conflict = resolveLander({ carrdUrl: AD('o=fc&lp=trt') });
  eq('lp= to a different offer than o= still routes', conflict.url, `${DEFAULT_LANDER_ORIGIN}/trt`);
  eq('…and reports the conflict',
    conflict.offerConflict, { adOffer: 'freecash', landerOffer: 'testerup-mon' });
  const agree = resolveLander({ carrdUrl: AD('o=tu&lp=CLTU') });
  eq('lp= agreeing with o= reports no conflict', agree.offerConflict, null);
  const noKey = resolveLander({ carrdUrl: AD('lp=trt') });
  eq('no o= on the link means nothing to conflict with', noKey.offerConflict, null);
  eq('the override still reports its own offer', noKey.offer, 'testerup-mon');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
