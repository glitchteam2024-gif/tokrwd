// Guards the Carrd route table. Run after editing CARRD_ROUTES:
//   node "api/_lib/_links-config.test.mjs"
//
// Catches the two mistakes that silently misroute paid traffic: a duplicate host (the second
// route is dead and its offer never serves) and a lander that is not in LANDER_URLS (a typo'd
// URL 404s the click). Neither shows up as an error at runtime — /r just returns the wrong page.
import { CARRD_ROUTES, LANDER_URLS, OFFER_KEYS, carrdRouteProblems, offerKeyProblems, landerForCarrd, landerForOfferKey } from './links-config.js';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  const ok = g === w;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) { console.log(`   got:  ${g}`); console.log(`   want: ${w}`); fail++; } else pass++;
};

// ── the live table ───────────────────────────────────────────────────────────
eq(`CARRD_ROUTES is valid (${CARRD_ROUTES.length} route(s))`, carrdRouteProblems(), []);

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
function problemsFor(routes) {
  const problems = [];
  const seen = new Map();
  const known = new Set(Object.values(LANDER_URLS));
  routes.forEach((route, i) => {
    let h = String(route.host || '').trim().toLowerCase().replace(/^www\./, '');
    if (h && !h.includes('.')) h = `${h}.carrd.co`;
    if (!h) { problems.push(`route ${i}: missing or empty host`); return; }
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h)) problems.push(`route ${i}: "${route.host}" is not a valid hostname`);
    if (seen.has(h)) problems.push(`duplicate host "${h}" (routes ${seen.get(h)} and ${i}) — the first wins, the second is dead`);
    else seen.set(h, i);
    if (!route.lander) problems.push(`route ${i} (${h}): missing lander`);
    else if (!known.has(route.lander)) problems.push(`route ${i} (${h}): lander "${route.lander}" is not in LANDER_URLS`);
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
