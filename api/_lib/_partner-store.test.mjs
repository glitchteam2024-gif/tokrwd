// Proves the WRITE path end to end: admin Save -> datastore -> a live click routed
// by it. Run after touching partner-store.js, kv.js or the admin write gate:
//   node "api/_lib/_partner-store.test.mjs"
//
// Nothing here is a mock of our own code. It stands up an Upstash-REST-compatible
// stub and then drives the REAL api/admin/data.js and api/c/[slug].js handlers, so
// what is asserted is what Vercel will run.
//
// The property most worth pinning is the last section: when the datastore is
// unreachable, a paid click must still redirect, to the committed destination. The
// failure it prevents — every partner click quietly paying the house — shows up on
// no dashboard until the invoices disagree.
//
// This file is in _tracking-audit's SKIP_FILES: its fixtures are network URLs.
import http from 'node:http';

const ROOT = new URL('../../', import.meta.url).pathname;

// ── the stub store ───────────────────────────────────────────────────────────
const DB = new Map();
let reads = 0, writes = 0;
const kv = http.createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  const [op, key, value] = JSON.parse(body);
  res.setHeader('Content-Type', 'application/json');
  if (op === 'GET') { reads++; return res.end(JSON.stringify({ result: DB.has(key) ? DB.get(key) : null })); }
  if (op === 'SET') { writes++; DB.set(key, value); return res.end(JSON.stringify({ result: 'OK' })); }
  // EVAL — the compare-and-swap. Args arrive as [EVAL, script, numKeys, key, expected, next];
  // this reproduces what the Lua does, which is all the code under test depends on.
  if (op === 'EVAL') {
    const [, , , k, expected, next] = JSON.parse(body);
    reads++;
    const cur = DB.has(k) ? DB.get(k) : null;
    const match = cur === null ? expected === '__ABSENT__' : cur === expected;
    if (match) { writes++; DB.set(k, next); }
    return res.end(JSON.stringify({ result: match ? 1 : 0 }));
  }
  res.end(JSON.stringify({ error: 'unsupported' }));
});
// Port 0: the OS picks a free one. A fixed port makes this fail for reasons that
// have nothing to do with the code under test.
await new Promise(r => kv.listen(0, '127.0.0.1', r));
const KV_PORT = kv.address().port;

// Set BEFORE importing: kv.js reads these into module-level consts at load time,
// exactly as it will on Vercel — which is why changing them there needs a redeploy.
process.env.KV_REST_API_URL = `http://127.0.0.1:${KV_PORT}`;
process.env.KV_REST_API_TOKEN = 'stub-token';
process.env.ADMIN_KEY = 'devkey';

const admin = (await import(`${ROOT}api/admin/data.js`)).default;
const cFn = (await import(`${ROOT}api/c/[slug].js`)).default;
const { _resetPartnerCache } = await import(`${ROOT}api/_lib/partner-store.js`);

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

async function post(body, headers = { 'x-admin-key': 'devkey' }) {
  const res = mockRes();
  await admin({ method: 'POST', headers, query: {}, body }, res);
  return res;
}
async function get(headers = { 'x-admin-key': 'devkey' }) {
  const res = mockRes();
  await admin({ method: 'GET', headers, query: {} }, res);
  return res;
}
async function hitC(query) {
  const res = mockRes();
  await cFn({ query }, res);
  return res;
}

const ROW = {
  action: 'save_partner',
  key: 'newguy', owner: 'New Scaler', carrd: 'brandnewpage.carrd.co', lander: 'esgp',
  code: 'NEWGUY-01', destination: 'https://www.phef6trk.com/NEW/GUY/', forward_param: 'sub1',
};

console.log('── writes are refused without the key ──\n');
let r = await post(ROW, {});
eq('a write with no admin key is 401', r.code, 401);
r = await post(ROW, { 'x-admin-key': 'wrong' });
eq('a write with the wrong key is 401', r.code, 401);
r = await post(ROW, { 'x-admin-key': 'devkey', origin: 'https://evil.com' });
eq('a write from a foreign origin is 403', r.code, 403);
r = await post({ action: 'trace_chain', lander: 'esgp', code: 'EDWIN-01' }, { 'x-admin-key': 'devkey' });
eq('a READ action still works (it is not in WRITE_ACTIONS)', r.code, 200);

console.log('\n── save, then route by it ──\n');
r = await post(ROW);
eq('save succeeds', [r.code, r.body.success], [200, true]);
eq('it was actually written to the store', writes >= 1, true);
eq('the response also hands back the row to commit', typeof r.body.config_line, 'string');

r = await hitC({ slug: 'esgp-off', campid: 'NEWGUY-01' });
eq('a click on the saved code now goes to THEIR link', [r.code, r.location],
  [302, 'https://www.phef6trk.com/NEW/GUY/?sub1=NEWGUY-01']);

r = await hitC({ slug: 'esgp-off', campid: 'EDWIN-01' });
eq('…and the committed partner is untouched', r.location,
  'https://www.phef6trk.com/213T8QJ/32BB7QT/?sub1=EDWIN-01');

r = await get();
eq('the panel lists the saved row as store-sourced',
  (r.body.partners.find(p => p.key === 'newguy') || {}).origin, 'store');
eq('…and the merged table is still valid', r.body.partner_problems, []);
eq('…and storage reports itself as live', r.body.storage, { enabled: true, writable: true, admin_key_from_env: true });

console.log('\n── the validator refuses what is silent at runtime ──\n');
r = await post({ ...ROW, key: 'dupe', carrd: 'other.carrd.co', code: 'EDWIN-01' });
eq('a code already taken by a committed partner is refused', r.code, 400);
eq('…and the error names the clash', /already belongs to/.test(r.body.error), true);

r = await post({ ...ROW, key: 'badurl', carrd: 'x1.carrd.co', code: 'X1-01', destination: 'https://evil.com@phef6trk.com/x' });
eq('a userinfo trick in the destination is refused', r.code, 400);

r = await post({ ...ROW, key: 'loop', carrd: 'x2.carrd.co', code: 'X2-01', destination: 'https://www.tokrwd.co/c/esgp-off' });
eq('a destination pointing back into our own funnel is refused', r.code, 400);

r = await post({ ...ROW, key: 'door', carrd: 'x3.carrd.co', code: 'X3-01', lander: 'https://www.tokrwd.co/CLFC' });
eq('a door-routed lander is refused', r.code, 400);

r = await post({ ...ROW, key: 'samehost', code: 'X4-01' });
eq('a Carrd page already assigned is refused', r.code, 400);

console.log('\n── delete ──\n');
r = await post({ action: 'delete_partner', key: 'edwin' });
eq('a committed row cannot be deleted from the panel', r.code, 400);

r = await post({ action: 'delete_partner', key: 'newguy' });
eq('a stored row can be deleted', [r.code, r.body.success], [200, true]);

r = await hitC({ slug: 'esgp-off', campid: 'NEWGUY-01' });
eq('…and the click falls back to the committed destination', r.location,
  'https://www.phef6trk.com/213T8QJ/32BB7QT/?sub1=NEWGUY-01');

console.log('\n── the store going away must never drop a click ──\n');
await post({ ...ROW, key: 'newguy' });
await new Promise(res => kv.close(res));   // the datastore is now dead
_resetPartnerCache();                      // stand in for the 30s in-lambda TTL lapsing
r = await hitC({ slug: 'esgp-off', campid: 'NEWGUY-01' });
eq('with the store unreachable, the click still 302s (committed fallback)', r.code, 302);
eq('…to the committed destination, not to nowhere', r.location,
  'https://www.phef6trk.com/213T8QJ/32BB7QT/?sub1=NEWGUY-01');
r = await hitC({ slug: 'esgp-off', campid: 'EDWIN-01' });
eq('…and a committed partner is entirely unaffected', r.location,
  'https://www.phef6trk.com/213T8QJ/32BB7QT/?sub1=EDWIN-01');

/* ── regressions found by adversarial review, 2026-07-28 ──────────────────── */

// The section above deliberately killed the store. Bring an identical one back on
// the same port — the handlers hold the URL in a module const, so the port has to
// match, exactly as a real Redis coming back up would.
const kvB = http.createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  const [op, key, value] = JSON.parse(body);
  res.setHeader('Content-Type', 'application/json');
  if (op === 'GET') { reads++; return res.end(JSON.stringify({ result: DB.has(key) ? DB.get(key) : null })); }
  if (op === 'SET') { writes++; DB.set(key, value); return res.end(JSON.stringify({ result: 'OK' })); }
  // EVAL — the compare-and-swap. Args arrive as [EVAL, script, numKeys, key, expected, next];
  // this reproduces what the Lua does, which is all the code under test depends on.
  if (op === 'EVAL') {
    const [, , , k, expected, next] = JSON.parse(body);
    reads++;
    const cur = DB.has(k) ? DB.get(k) : null;
    const match = cur === null ? expected === '__ABSENT__' : cur === expected;
    if (match) { writes++; DB.set(k, next); }
    return res.end(JSON.stringify({ result: match ? 1 : 0 }));
  }
  res.end(JSON.stringify({ error: 'unsupported' }));
});
await new Promise(res2 => kvB.listen(KV_PORT, '127.0.0.1', res2));
_resetPartnerCache();

console.log('\n── the sub-ID sent out is the one routing matched on ──\n');

// Routing normalises with partnerKey(); the wire used extractSparkCode() alone. So
// ?campid=edwin-01 routed as EDWIN-01 and then stamped sub1=edwin-01 — a value that
// reconciles against nothing in the partner's own reports.
await post({ ...ROW, key: 'newguy' });
_resetPartnerCache();
r = await hitC({ slug: 'esgp-off', campid: 'newguy-01' });
eq('a lower-case code routes AND stamps the normalised form', r.location,
  'https://www.phef6trk.com/NEW/GUY/?sub1=NEWGUY-01');
r = await hitC({ slug: 'esgp-off', campid: 'NeWgUy-01' });
eq('…whatever the mixed casing', r.location,
  'https://www.phef6trk.com/NEW/GUY/?sub1=NEWGUY-01');
// The house path is deliberately untouched: a scaler already registered in SPRK on
// a lowercase custom code must keep receiving it verbatim.
r = await hitC({ slug: 'frrcsh-us-off', campid: 'mIxEd-Case-99' });
eq('a house click still forwards its code verbatim', r.location,
  'https://monetisetrk2.co.uk/?a=26648&c=55504&s1=mIxEd-Case-99');

console.log('\n── an absent document is a cacheable answer, not a per-click question ──\n');

// This is the state the setup instructions create: connect the store, redeploy,
// save the first row later. Not caching it meant a live Redis round trip on EVERY
// paid click until that first save.
await post({ action: 'delete_partner', key: 'newguy' });
DB.clear();
_resetPartnerCache();
const before = reads;
for (let i = 0; i < 8; i++) await hitC({ slug: 'frrcsh-us-off', campid: 'HOUSE-' + i });
eq('8 clicks against an empty store cost ONE read', reads - before, 1);
eq('…and every one of them still redirected',
  (await hitC({ slug: 'frrcsh-us-off', campid: 'HOUSE-X' })).code, 302);

console.log('\n── a failing store backs off instead of retrying every click ──\n');

await new Promise(res2 => kvB.close(res2));
const kv2 = http.createServer((req, res) => { res.statusCode = 500; res.end('{"error":"boom"}'); });
await new Promise(res2 => kv2.listen(KV_PORT, '127.0.0.1', res2));
_resetPartnerCache();
const beforeFail = reads;
for (let i = 0; i < 5; i++) {
  r = await hitC({ slug: 'esgp-off', campid: 'EDWIN-01' });
}
eq('a broken store still redirects every click', r.code, 302);
eq('…to the committed destination', r.location,
  'https://www.phef6trk.com/213T8QJ/32BB7QT/?sub1=EDWIN-01');
eq('…and 5 clicks did not make 5 failed round trips', reads - beforeFail, 0);
await new Promise(res2 => kv2.close(res2));

console.log('\n── a store that is configured but unreachable reports honestly ──\n');

_resetPartnerCache();
r = await post({ ...ROW, key: 'whiledown', carrd: 'down.carrd.co', code: 'DOWN-01' });
eq('a save against an unreachable store answers 503, it does not reject', r.code, 503);
eq('…and still hands back a pasteable row', typeof r.body.config_line, 'string');
eq('…saying nothing was saved', /[Nn]othing was saved/.test(r.body.error), true);

console.log(`\n${pass} passed, ${fail} failed  (store reads: ${reads}, writes: ${writes})`);
process.exit(fail ? 1 : 0);
