// Proves the STORED path end to end: a row in the datastore -> a live click routed
// by it, and the committed fallback when the store is gone. Run after touching
// partner-store.js or kv.js (the admin panel that used to write rows was removed
// 2026-10-16; rows are seeded here through partner-store's own read/write calls):
//   node "api/_lib/_partner-store.test.mjs"
//
// Nothing here is a mock of our own code. It stands up an Upstash-REST-compatible
// stub and then drives the REAL partner-store.js and api/c/[slug].js handler, so
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

const cFn = (await import(`${ROOT}api/c/[slug].js`)).default;
const { _resetPartnerCache, readStoredRows, writeStoredRows } = await import(`${ROOT}api/_lib/partner-store.js`);

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

// The same two store calls the removed admin panel made for Save / Delete.
async function saveRow(row) {
  const existing = await readStoredRows();
  return writeStoredRows([...existing.filter(r => r.key !== row.key), { ...row, updated: new Date().toISOString() }]);
}
async function deleteRow(key) {
  const existing = await readStoredRows();
  return writeStoredRows(existing.filter(r => r.key !== key));
}
async function hitC(query) {
  const res = mockRes();
  await cFn({ query }, res);
  return res;
}

const ROW = {
  key: 'newguy', owner: 'New Scaler', carrd: 'brandnewpage.carrd.co', lander: 'esgp',
  code: 'NEWGUY-01', destination: 'https://www.phef6trk.com/NEW/GUY/', forwardParam: 'sub1',
};

console.log('\n── save, then route by it ──\n');
let r;
await saveRow(ROW);
eq('it was actually written to the store', writes >= 1, true);

r = await hitC({ slug: 'esgp-off', campid: 'NEWGUY-01' });
eq('a click on the saved code now goes to THEIR link', [r.code, r.location],
  [302, 'https://www.phef6trk.com/NEW/GUY/?sub1=NEWGUY-01']);

r = await hitC({ slug: 'esgp-off', campid: 'EDWIN-01' });
eq('…and the committed partner is untouched', r.location,
  'https://www.phef6trk.com/213T8QJ/32BB7QT/?sub1=EDWIN-01');

console.log('\n── delete ──\n');
await deleteRow('newguy');
eq('a stored row can be deleted', (await readStoredRows()).some(x => x.key === 'newguy'), false);

r = await hitC({ slug: 'esgp-off', campid: 'NEWGUY-01' });
eq('…and the click falls back to the committed destination', r.location,
  'https://www.phef6trk.com/213T8QJ/32BB7QT/?sub1=NEWGUY-01');

console.log('\n── the store going away must never drop a click ──\n');
await saveRow(ROW);
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
await saveRow(ROW);
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
await deleteRow('newguy');
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

console.log(`\n${pass} passed, ${fail} failed  (store reads: ${reads}, writes: ${writes})`);
process.exit(fail ? 1 : 0);
