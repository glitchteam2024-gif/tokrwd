// Guards the PARTNER-facing portal API. Run after touching api/partner.js,
// api/_lib/partner-access.js, or the hosts half of partner-store.js:
//   node "api/_lib/_partner-portal.test.mjs"
//
// The portal is opened by people who are NOT the operator, so the properties worth
// pinning are all about blast radius:
//   - an access code identifies you; it never selects who you are asking about
//   - a partner can change their own Carrd pages, and nothing else
//   - one partner can never claim, see, or route another partner's page
//
// Drives the REAL api/partner.js and api/c/[slug].js against a stub Upstash.
// In _tracking-audit's SKIP_FILES: its fixtures are network URLs.
import http from 'node:http';

const ROOT = new URL('../../', import.meta.url).pathname;

const DB = new Map();
const kv = http.createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  const [op, key, value] = JSON.parse(body);
  res.setHeader('Content-Type', 'application/json');
  if (op === 'GET') return res.end(JSON.stringify({ result: DB.has(key) ? DB.get(key) : null }));
  if (op === 'SET') { DB.set(key, value); return res.end(JSON.stringify({ result: 'OK' })); }
  // EVAL — the compare-and-swap. [EVAL, script, numKeys, key, expected, next].
  if (op === 'EVAL') {
    const [, , , k, expected, next] = JSON.parse(body);
    const cur = DB.has(k) ? DB.get(k) : null;
    const match = cur === null ? expected === '__ABSENT__' : cur === expected;
    if (match) DB.set(k, next);
    return res.end(JSON.stringify({ result: match ? 1 : 0 }));
  }
  res.end(JSON.stringify({ error: 'unsupported' }));
});
await new Promise(r => kv.listen(0, '127.0.0.1', r));

process.env.KV_REST_API_URL = `http://127.0.0.1:${kv.address().port}`;
process.env.KV_REST_API_TOKEN = 'stub-token';
process.env.ADMIN_KEY = 'devkey';

const admin = (await import(`${ROOT}api/admin/data.js`)).default;
const partnerApi = (await import(`${ROOT}api/partner.js`)).default;
const cFn = (await import(`${ROOT}api/c/[slug].js`)).default;
const { _resetPartnerCache } = await import(`${ROOT}api/_lib/partner-store.js`);
const { normaliseAccessCode, hashAccessCode, mintAccessCode } =
  await import(`${ROOT}api/_lib/partner-access.js`);

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) { console.log('   got: ', JSON.stringify(got)); console.log('   want:', JSON.stringify(want)); fail++; }
  else pass++;
};

function mockRes() {
  const r = { code: 200, headers: {}, body: null, location: null };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.send = (b) => { r.body = b; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  r.redirect = (c, u) => { r.code = c; r.location = u; return r; };
  return r;
}
const adminPost = async (body, headers = {}) => {
  const res = mockRes();
  await admin({
    method: 'POST',
    headers: { 'x-admin-key': 'devkey', host: 'www.tokrwd.co', ...headers },
    query: {}, body,
  }, res);
  return res;
};
const portal = async (body) => {
  const res = mockRes();
  await partnerApi({ method: 'POST', headers: {}, body }, res);
  return res;
};
const hitC = async (query) => { const res = mockRes(); await cFn({ query }, res); return res; };

// ── the code itself ──────────────────────────────────────────────────────────
eq('a minted code is 4 groups of 5', /^[A-Z0-9]{5}(-[A-Z0-9]{5}){3}$/.test(mintAccessCode()), true);
eq('minting twice does not repeat', mintAccessCode() === mintAccessCode(), false);
// It gets read aloud, retyped on phones and pasted out of chat apps, so casing,
// spacing and stray dashes must not be the secret.
eq('normalising ignores case, spaces and dashes',
  normaliseAccessCode(' abcde-fghjk mnpqr STUVW '), 'ABCDEFGHJKMNPQRSTUVW');
eq('the same code hashes the same however it was typed',
  hashAccessCode('abcde fghjk-mnpqr-stuvw') === hashAccessCode('ABCDE-FGHJK-MNPQR-STUVW'), true);
eq('an empty code hashes to nothing', hashAccessCode(''), '');

// ── the origin gate on writes ────────────────────────────────────────────────
// Browsers attach Origin to EVERY non-GET request, the panel's own included, so
// this runs on every save — not just on the rare cross-site attempt it exists for.
let r = await adminPost({ action: 'issue_access', key: 'edwin' },
  { origin: 'https://a-preview-deploy.vercel.app', host: 'a-preview-deploy.vercel.app' });
eq('a save from the panel\'s OWN host is allowed, whatever that host is', r.code, 200);
r = await adminPost({ action: 'issue_access', key: 'edwin' },
  { origin: 'http://localhost:8910', host: 'localhost:8910' });
eq('…including a local run', r.code, 200);
r = await adminPost({ action: 'issue_access', key: 'edwin' },
  { origin: 'https://evil.example', host: 'www.tokrwd.co' });
eq('…but a genuinely foreign origin is refused', r.code, 403);

// ── issuing ──────────────────────────────────────────────────────────────────
r = await adminPost({ action: 'issue_access', key: 'nobody-here' });
eq('a code cannot be issued for a partner that does not exist', r.code, 400);

r = await adminPost({ action: 'issue_access', key: 'edwin' });
eq('a code is issued for a committed partner', [r.code, r.body.success], [200, true]);
const EDWIN_CODE = r.body.access_code;
eq('…and returned in plaintext exactly once', typeof EDWIN_CODE, 'string');

r = await adminPost({ action: 'issue_access', key: 'fuomgi' });
const FUOMGI_CODE = r.body.access_code;

// The stored form must never be the code. A datastore dump is not a set of logins.
const accessDoc = JSON.parse(DB.get('tokrwd:partner_access:v1'));
eq('the datastore holds no plaintext code',
  JSON.stringify(accessDoc).includes(EDWIN_CODE.replace(/-/g, '')), false);
eq('…it holds a hash keyed to the partner',
  accessDoc.codes[hashAccessCode(EDWIN_CODE)].partner, 'edwin');

// ── logging in ───────────────────────────────────────────────────────────────
r = await portal({ action: 'me', access: EDWIN_CODE });
eq('a valid code opens that partner\'s portal', [r.code, r.body.success], [200, true]);
eq('…showing THEIR code', r.body.view.code, 'EDWIN-01');
eq('…their own affiliate link', r.body.view.offer_link, 'https://www.phef6trk.com/213T8QJ/32BB7QT/');
eq('…their landing page', r.body.view.landing_page, 'https://www.tokrwd.co/ESGP');
eq('…and their page, with their campid already on the ad link',
  r.body.view.pages.map(p => p.ad_link),
  ['https://laboedomegan.carrd.co/?campid=EDWIN-01']);
eq('…the operator-set page cannot be removed by them',
  r.body.view.pages[0].removable, false);

r = await portal({ action: 'me', access: 'NOT-A-REAL-CODE' });
eq('a wrong code is refused', r.code, 401);
r = await portal({ action: 'me', access: '' });
eq('an empty code is refused', r.code, 401);

// The response must be scoped BY the code, never selected by the request. Passing a
// partner key alongside a valid code must change nothing.
r = await portal({ action: 'me', access: EDWIN_CODE, key: 'fuomgi', partner: 'fuomgi' });
eq('a partner key in the request cannot redirect the answer', r.body.view.code, 'EDWIN-01');
eq('…and no other partner appears anywhere in it',
  JSON.stringify(r.body.view).includes('FUOMGI-01'), false);

// ── a partner registering their own page ─────────────────────────────────────
r = await portal({ action: 'add_page', access: EDWIN_CODE, host: 'edwinsecondpage.carrd.co' });
eq('a partner can add a page', [r.code, r.body.success], [200, true]);
eq('…and it appears with their campid on it',
  r.body.view.pages.map(p => p.ad_link).includes('https://edwinsecondpage.carrd.co/?campid=EDWIN-01'), true);
eq('…and this one they may remove',
  r.body.view.pages.find(p => p.host === 'edwinsecondpage.carrd.co').removable, true);

// Bare subdomains, full URLs and stray www must all land on the same page.
r = await portal({ action: 'add_page', access: EDWIN_CODE, host: 'https://www.edwinthird.carrd.co/' });
eq('a full URL is accepted and normalised',
  r.body.view.pages.some(p => p.host === 'edwinthird.carrd.co'), true);
r = await portal({ action: 'add_page', access: EDWIN_CODE, host: 'edwinfourth' });
eq('a bare subdomain expands to .carrd.co',
  r.body.view.pages.some(p => p.host === 'edwinfourth.carrd.co'), true);

r = await portal({ action: 'add_page', access: EDWIN_CODE, host: 'not a hostname' });
eq('rubbish is refused', r.code, 400);

// THE hijack test: one partner must never be able to claim another's page.
r = await portal({ action: 'add_page', access: FUOMGI_CODE, host: 'laboedomegan.carrd.co' });
eq("a partner cannot claim someone else's committed page", r.code, 400);
r = await portal({ action: 'add_page', access: FUOMGI_CODE, host: 'edwinsecondpage.carrd.co' });
eq("…nor a page another partner registered", r.code, 400);
r = await portal({ action: 'me', access: FUOMGI_CODE });
eq('…and their own portal still shows only their page',
  r.body.view.pages.map(p => p.host), ['fuomgihatetiktok.carrd.co']);

// ── the page they added actually routes ──────────────────────────────────────
_resetPartnerCache();
const { resolveLander } = await import(`${ROOT}api/_lib/links-config.js`);
const { getPartnerRows } = await import(`${ROOT}api/_lib/partner-store.js`);
const rows = await getPartnerRows();
eq('a self-registered page resolves to that partner\'s lander',
  resolveLander({
    carrdUrl: 'https://edwinsecondpage.carrd.co/?campid=EDWIN-01',
    campid: 'EDWIN-01', campaigns: {}, partners: rows,
  }),
  { url: 'https://www.tokrwd.co/ESGP', source: 'carrd_route', offer: 'gravypass-esgp',
    partner: 'edwin', offerConflict: null });

r = await hitC({ slug: 'esgp-off', campid: 'EDWIN-01' });
eq('…and a click off it still lands on their own affiliate link', r.location,
  'https://www.phef6trk.com/213T8QJ/32BB7QT/?sub1=EDWIN-01');

// ── removing ─────────────────────────────────────────────────────────────────
r = await portal({ action: 'remove_page', access: EDWIN_CODE, host: 'edwinsecondpage.carrd.co' });
eq('a partner can remove a page they added',
  r.body.view.pages.some(p => p.host === 'edwinsecondpage.carrd.co'), false);
_resetPartnerCache();
eq('…and it stops routing',
  resolveLander({
    carrdUrl: 'https://edwinsecondpage.carrd.co/?campid=EDWIN-01',
    campid: 'EDWIN-01', campaigns: {}, partners: await getPartnerRows(),
  }).source,
  'default');

// ── the portal cannot reach anything else ────────────────────────────────────
for (const action of ['save_partner', 'delete_partner', 'issue_access', 'update_settings', 'trace_chain']) {
  r = await portal({ action, access: EDWIN_CODE, key: 'edwin' });
  eq(`the portal refuses the admin action "${action}"`, r.code, 400);
}

// An admin save must not wipe the pages partners registered for themselves.
r = await adminPost({
  action: 'save_partner', key: 'someoneelse', owner: 'Someone Else',
  carrd: 'someoneelse.carrd.co', lander: 'esgp', code: 'ELSE-01',
  destination: 'https://www.phef6trk.com/ELSE/ONE/', forward_param: 'sub1',
});
eq('an unrelated admin save succeeds', r.body.success, true);
r = await portal({ action: 'me', access: EDWIN_CODE });
eq('…and the partner keeps the pages they had registered',
  r.body.view.pages.map(p => p.host).sort(),
  ['edwinfourth.carrd.co', 'edwinthird.carrd.co', 'laboedomegan.carrd.co']);

// ── revoking ─────────────────────────────────────────────────────────────────
r = await adminPost({ action: 'revoke_access', key: 'edwin' });
eq('a code can be revoked', [r.code, r.body.removed], [200, 1]);
r = await portal({ action: 'me', access: EDWIN_CODE });
eq('…and it stops working at once', r.code, 401);

// Re-issuing must invalidate the old code, or one shared with the wrong person
// stays live forever.
r = await adminPost({ action: 'issue_access', key: 'fuomgi' });
const FUOMGI_NEW = r.body.access_code;
eq('re-issuing gives a different code', FUOMGI_NEW === FUOMGI_CODE, false);
r = await portal({ action: 'me', access: FUOMGI_CODE });
eq('…and the previous one no longer opens the portal', r.code, 401);
r = await portal({ action: 'me', access: FUOMGI_NEW });
eq('…while the new one does', r.body.view.code, 'FUOMGI-01');

/* ── regressions found by adversarial review, 2026-07-28 ─────────────────────
 * Two independent kinds of writer now share one document — the operator in /admin
 * and the partners in their own portal — so every one of these is about one of
 * them silently discarding the other's change.
 */

console.log('\n── concurrent writes cannot discard each other ──\n');

const { kvGetRaw } = await import(`${ROOT}api/_lib/kv.js`);
const { setPartnerHost, readStoredRows: readRows } = await import(`${ROOT}api/_lib/partner-store.js`);

// Set up a partner whose destination the operator is about to correct.
await adminPost({
  action: 'save_partner', key: 'osv', owner: 'Osvaldo', carrd: 'osvmain.carrd.co',
  lander: 'esgp', code: 'OSVALDO-01',
  destination: 'https://www.phef6trk.com/OLD/LINK/', forward_param: 'sub1',
});

// The partner's add_page and the operator's save overlap. Before the compare-and-swap
// this reverted the operator's correction, and the live click proved it.
const both = await Promise.all([
  portal({ action: 'add_page', access: (await adminPost({ action: 'issue_access', key: 'osv' })).body.access_code, host: 'osvextra.carrd.co' }),
  adminPost({
    action: 'save_partner', key: 'osv', owner: 'Osvaldo', carrd: 'osvmain.carrd.co',
    lander: 'esgp', code: 'OSVALDO-01',
    destination: 'https://www.phef6trk.com/NEW/LINK/', forward_param: 'sub1',
  }),
]);
eq('both concurrent writes answered', both.every(x => x.code === 200 || x.code === 400 || x.code === 503), true);
_resetPartnerCache();
const osv = (await readRows()).find(r => r.key === 'osv');
eq("the operator's correction survived the partner's write",
  osv.destination, 'https://www.phef6trk.com/NEW/LINK/');
r = await hitC({ slug: 'esgp-off', campid: 'OSVALDO-01' });
eq('…and the live click proves it', r.location,
  'https://www.phef6trk.com/NEW/LINK/?sub1=OSVALDO-01');

// A partner's write must never run the operator's rows through this lambda's
// validator: anything it rejects would be permanently deleted, and the list
// truncated at MAX_ROWS.
const raw = JSON.parse(await kvGetRaw('tokrwd:partner_links:v1'));
raw.rows.push({ key: 'legacy', owner: 'Legacy row', carrd: 'legacy.carrd.co',
                lander: 'esgp', code: 'LEGACY-01', destination: 'not-a-valid-url' });
await (await import(`${ROOT}api/_lib/kv.js`)).kvSetJson('tokrwd:partner_links:v1', raw);
const before = JSON.parse(await kvGetRaw('tokrwd:partner_links:v1')).rows.length;
await setPartnerHost('osv', 'osvthird.carrd.co');
const after = JSON.parse(await kvGetRaw('tokrwd:partner_links:v1')).rows.length;
eq('a partner adding a page does not delete rows it cannot parse', after, before);

console.log('\n── deleting a partner takes their login and their pages with it ──\n');

r = await adminPost({ action: 'issue_access', key: 'osv' });
const OSV_CODE = r.body.access_code;
r = await portal({ action: 'me', access: OSV_CODE });
eq('the code works before deletion', r.code, 200);

await adminPost({ action: 'delete_partner', key: 'osv' });
r = await portal({ action: 'me', access: OSV_CODE });
eq('…and stops working after', r.code, 401);
// Left alive, the code would open the portal of whoever next used that key slug.
r = await adminPost({
  action: 'save_partner', key: 'osv', owner: 'A DIFFERENT PERSON', carrd: 'brandnew.carrd.co',
  lander: 'esgp', code: 'NEWPERSON-99',
  destination: 'https://www.phef6trk.com/NEW/PERSON/', forward_param: 'sub1',
});
eq('the key can be reused for someone else', r.body.success, true);
r = await portal({ action: 'me', access: OSV_CODE });
eq("…and the old holder cannot see the new person's account", r.code, 401);
// Their registered pages must be released, or the host stays claimed by nobody.
r = await portal({ action: 'add_page', access: (await adminPost({ action: 'issue_access', key: 'edwin' })).body.access_code, host: 'osvextra.carrd.co' });
eq('a deleted partner\'s page can be claimed again', r.code, 200);

console.log('\n── the operator cannot silently take a page a partner registered ──\n');

r = await adminPost({
  action: 'save_partner', key: 'thief', owner: 'Thief', carrd: 'osvextra.carrd.co',
  lander: 'esgp', code: 'THIEF-01',
  destination: 'https://www.phef6trk.com/TH/IEF/', forward_param: 'sub1',
});
eq('saving a row on a page a partner already runs is refused', r.code, 400);
eq('…and the message names who already has it',
  /already (used by|bound to)/.test(r.body.error || '') && /edwin/.test(r.body.error || ''), true);

console.log('\n── one normaliser, so no spelling slips past the ownership check ──\n');

const { normaliseHost: nh } = await import(`${ROOT}api/_lib/partner-store.js`);
eq('every spelling of one page normalises the same',
  [...new Set(['Osv.carrd.co', 'www.osv.carrd.co', 'www.www.osv.carrd.co',
               'https://osv.carrd.co/x?y=1', 'OSV', 'osv'].map(nh))],
  ['osv.carrd.co']);
// The stored side used to normalise differently from the request side, which is
// what let one partner claim another's page.
r = await adminPost({
  action: 'save_partner', key: 'norm', owner: 'Norm', carrd: 'www.www.normpage',
  lander: 'esgp', code: 'NORM-01',
  destination: 'https://www.phef6trk.com/NO/RM/', forward_param: 'sub1',
});
eq('a doubled www. is stored fully normalised', r.body.success, true);
_resetPartnerCache();
eq('…as the canonical host',
  ((await readRows()).find(x => x.key === 'norm') || {}).carrd, 'normpage.carrd.co');
r = await portal({ action: 'add_page', access: (await adminPost({ action: 'issue_access', key: 'edwin' })).body.access_code, host: 'normpage.carrd.co' });
eq("…and another partner still cannot claim it", r.code, 400);

console.log('\n── a partner cannot squat our own infrastructure ──\n');

const EDWIN2 = (await adminPost({ action: 'issue_access', key: 'edwin' })).body.access_code;
for (const host of ['www.tokrwd.co', 'tokrwd.co', 'sprktrax.org', 'appflowconnect.com', 'carrd.co']) {
  r = await portal({ action: 'add_page', access: EDWIN2, host });
  eq(`${host} is refused`, r.code, 400);
}

console.log('\n── a partner sets their OWN offer link ──\n');

const OWN = (await adminPost({ action: 'issue_access', key: 'fuomgi' })).body.access_code;

r = await portal({ action: 'me', access: OWN });
eq('it starts as the operator-set link', r.body.view.offer_origin, 'operator');

r = await portal({ action: 'set_offer', access: OWN,
  destination: 'https://www.phef6trk.com/MY/OWNLINK/', forward_param: 'sub2' });
eq('a partner can set their own offer link', [r.code, r.body.success], [200, true]);
eq('…the portal reflects it immediately', r.body.view.offer_link, 'https://www.phef6trk.com/MY/OWNLINK/');
eq('…and marks it as theirs', r.body.view.offer_origin, 'partner');

_resetPartnerCache();
r = await hitC({ slug: 'esgp-off', campid: 'FUOMGI-01' });
eq('a LIVE click now lands on the link they set, with their sub-ID param',
  r.location, 'https://www.phef6trk.com/MY/OWNLINK/?sub2=FUOMGI-01');

// Their change is theirs alone.
r = await hitC({ slug: 'esgp-off', campid: 'EDWIN-01' });
eq('…and nobody else moved', r.location,
  'https://www.phef6trk.com/213T8QJ/32BB7QT/?sub1=EDWIN-01');

// The operator has to be able to SEE that the live link is not the one they set.
r = await adminPost({ action: 'noop' });   // any read to refresh
const panel = mockRes();
await admin({ method: 'GET', headers: { 'x-admin-key': 'devkey', host: 'www.tokrwd.co' }, query: {} }, panel);
const fRow = panel.body.partners.find(p => p.key === 'fuomgi');
eq('the panel flags the link as partner-set', fRow.offer_origin, 'partner');
eq('…and still shows what the operator had set',
  fRow.operator_destination, 'https://www.phef6trk.com/213T8QJ/32BB7QT/');

// The gate is the same one an operator-supplied destination goes through.
for (const [bad, why] of [
  ['http://www.phef6trk.com/x', 'not https'],
  ['https://www.phef6trk.com@evil.example/x', 'userinfo trick'],
  ['https://169.254.169.254/', 'IP literal'],
  ['https://www.tokrwd.co/c/esgp-off', 'loops into our own funnel'],
  ['https://sprktrax.org/api/link/x', 'our door'],
  ['https://www.phef6trk.com/x#frag', 'fragment swallows the sub-ID'],
  ['not a url at all', 'not a URL'],
  ['', 'empty'],
]) {
  r = await portal({ action: 'set_offer', access: OWN, destination: bad });
  eq(`a destination that is ${why} is refused`, r.code, 400);
}
r = await portal({ action: 'set_offer', access: OWN,
  destination: 'https://www.phef6trk.com/OK/', forward_param: 'bad param' });
eq('a bad sub-ID parameter is refused', r.code, 400);

// A refused change must not have moved anything.
_resetPartnerCache();
r = await hitC({ slug: 'esgp-off', campid: 'FUOMGI-01' });
eq('…and none of those refusals changed the live link',
  r.location, 'https://www.phef6trk.com/MY/OWNLINK/?sub2=FUOMGI-01');

// Scoping: setting your own link must never touch anyone else's.
r = await portal({ action: 'set_offer', access: OWN, key: 'edwin', partner: 'edwin',
  destination: 'https://www.phef6trk.com/HIJACK/' });
eq('a partner key in the request cannot redirect the write', r.body.view.code, 'FUOMGI-01');
_resetPartnerCache();
r = await hitC({ slug: 'esgp-off', campid: 'EDWIN-01' });
eq("…and the other partner's link is untouched", r.location,
  'https://www.phef6trk.com/213T8QJ/32BB7QT/?sub1=EDWIN-01');

console.log('\n── the login is not lost to a datastore blip ──\n');

r = await portal({ action: 'me', access: EDWIN2 });
eq('a healthy store opens the portal', r.code, 200);
eq('…and a last_used stamp is recorded', typeof (await adminPost({ action: 'issue_access', key: 'fuomgi' })).body.access_code, 'string');

await new Promise(res => kv.close(res));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
