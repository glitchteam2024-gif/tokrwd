// Page switch, server half — the store ladder behind /api/hop, and the endpoint itself.
//
//   node "api/_lib/_hop.test.mjs"
//
// Drives the REAL api/_lib/hop-store.js and api/hop.js against an Upstash-REST-compatible stub
// (the same shape _partner-store.test.mjs stands up), with the clock under test control so the
// 30 s cache and the 10 s back-off can be walked without waiting.
//
// The properties pinned here are the ones a visitor would feel:
//   - /api/hop NEVER answers 5xx and never answers anything but {} or {t[, y]};
//   - a store outage serves the last good table, or "no switch" — never an error;
//   - a table past its `exp` means "no switches" (a publisher that stopped must not leave
//     ended switches running forever on a warm lambda);
//   - a bad row is dropped and its siblings still switch;
//   - the edge may cache an answer read from a table, never one given because nothing could be read.
import http from 'node:http';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('../../', import.meta.url).pathname;

// ── the clock ─────────────────────────────────────────────────────────────────────────────────
const realNow = Date.now;
let skew = 0;
Date.now = () => realNow() + skew;

// ── the stub store ────────────────────────────────────────────────────────────────────────────
const DB = new Map();
let reads = 0;
let mode = 'ok';            // ok | slow | error | http500 | garbage
const kv = http.createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  const [op, key] = JSON.parse(body);
  res.setHeader('Content-Type', 'application/json');
  if (op !== 'GET') return res.end(JSON.stringify({ error: 'unsupported' }));
  reads++;
  if (mode === 'slow') await new Promise((r) => setTimeout(r, 600));
  if (mode === 'error') return res.end(JSON.stringify({ error: 'ERR something' }));
  if (mode === 'http500') { res.statusCode = 500; return res.end(JSON.stringify({ error: 'boom' })); }
  if (mode === 'garbage') return res.end('<html>not json');
  return res.end(JSON.stringify({ result: DB.has(key) ? DB.get(key) : null }));
});
await new Promise((r) => kv.listen(0, '127.0.0.1', r));
process.env.KV_REST_API_URL = `http://127.0.0.1:${kv.address().port}`;
process.env.KV_REST_API_TOKEN = 'stub-token';

const store = await import(`${ROOT}api/_lib/hop-store.js`);
const hopFn = (await import(`${ROOT}api/hop.js`)).default;
const { HOP_KEY, lookupHop, getHop, _resetHopCache, isValidHopPath, sanitizeHopRow, MAX_ROWS } = store;

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) { console.log('   got: ', JSON.stringify(got)); console.log('   want:', JSON.stringify(want)); fail++; }
  else pass++;
};

function mockRes() {
  const r = { code: 200, headers: {}, body: undefined };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}
async function hop(query, method = 'GET') {
  const res = mockRes();
  await hopFn({ method, query, headers: {} }, res);
  return res;
}

const X = 'SPK-A1B2-C3D4', Y = 'SPK-E5F6-A789', P = 'SPK-0000-1111';
const put = (doc) => DB.set(HOP_KEY, typeof doc === 'string' ? doc : JSON.stringify(doc));
const doc = (rows, { gen = Date.now(), exp = Date.now() + 6 * 3600e3, v = 1 } = {}) => ({ v, gen, exp, rows });
const fresh = () => { _resetHopCache(); mode = 'ok'; };

// ── what a valid path is ──────────────────────────────────────────────────────────────────────
console.log('── path and row validation ──\n');
for (const t of ['/gravypassusa2.html', '/GP/GP22/go/', '/PG51/GB7/go/', '/50FC/FC7/go/', '/sushipasswallet-drewski4k-34.html']) {
  eq(`valid t: ${t}`, isValidHopPath(t), true);
}
for (const t of ['//evil.com/x.html', '/a//b.html', 'https://evil.com/x.html', '/../x.html', '/GP/../admin/go/',
  '/api/x.html', '/click.html', '/c/x/go/', '/r/x.html', '/u/abc/go/', '/pre/x.html', '/admin/index.html',
  '/portal/index.html', '/js/x.html', '/images/x.html', '/postback/go/', '/gravypassusa-pre.html', '/mgfc-pre2.html',
  '/GP/GP1', '/GP/GP1/', '/x.htm', '/x.html?a=1', '/x.html#a', '/x y.html', '', '/', null, 7,
  '/' + 'a'.repeat(200) + '.html', '\\evil.com/x.html', '/\\evil.com/x.html',
  // A '.' segment: the browser folds '/./c/x.html' into the click door after every check passed.
  '/./c/evil.html', '/./u/abc/go/', '/./pre/x.html', '/./admin/index.html', '/./postback/go/', '/./GP/GP22/index.html',
  '/GP/./GP22/go/', '/.well-known/x.html',
  // The ROOT /go/ is the orphaned redirector, never a lander.
  '/go/', '/go.html', '/GO/x/go/']) {
  eq(`invalid t: ${JSON.stringify(t).slice(0, 40)}`, isValidHopPath(t), false);
}
eq('a page row keeps only t', sanitizeHopRow(X, { t: '/gravypassusa2.html', extra: 'x', mode: 'evil' }), { t: '/gravypassusa2.html' });
eq('an offer row keeps t and y', sanitizeHopRow(X, { t: '/GP/GP22/go/', y: Y }), { t: '/GP/GP22/go/', y: Y });
eq('y equal to the key is refused', sanitizeHopRow(X, { t: '/GP/GP22/go/', y: X }), null);
eq('a -N y is refused', sanitizeHopRow(X, { t: '/GP/GP22/go/', y: `${Y}-2` }), null);
eq('a lowercase y is refused', sanitizeHopRow(X, { t: '/GP/GP22/go/', y: Y.toLowerCase() }), null);
eq('a -N key is refused', sanitizeHopRow(`${X}-2`, { t: '/GP/GP22/go/' }), null);
eq('a lowercase key is refused', sanitizeHopRow(X.toLowerCase(), { t: '/GP/GP22/go/' }), null);
eq('y without t is refused', sanitizeHopRow(X, { y: Y }), null);
eq('a non-object row is refused', sanitizeHopRow(X, '/GP/GP22/go/'), null);

// ── the ladder ────────────────────────────────────────────────────────────────────────────────
console.log('\n── the read ladder ──\n');
fresh(); DB.clear();
eq('absent document: no switch, and that is a fresh answer', await lookupHop(X), { hop: null, state: 'fresh' });

fresh();
put(doc({ [X]: { t: '/GP/GP22/go/', y: Y }, [P]: { t: '/gravypassusa2.html' } }));
eq('an offer switch is served with t and y', await lookupHop(X), { hop: { t: '/GP/GP22/go/', y: Y }, state: 'fresh' });
eq('a page switch is served with t alone', await getHop(P), { t: '/gravypassusa2.html' });
eq('an unknown code: no switch', await getHop('SPK-9999-9999'), null);
eq('a -N child of a switched code is looked up as itself: no switch', await getHop(`${X}-2`), null);
eq('a lowercase code is not a key (the endpoint uppercases first)', await getHop(X.toLowerCase()), null);
for (const junk of [null, undefined, 7, {}, [], 'SPK', `${X}; DROP`, '../../x']) {
  eq(`junk code ${JSON.stringify(junk)} -> null, no throw`, await getHop(junk), null);
}

// Cache: within 30 s the store is not read again.
let before = reads;
await getHop(X); await getHop(P);
eq('within the 30 s window the store is not re-read', reads - before, 0);

// Expiry, judged at LOOKUP.
fresh();
put(doc({ [X]: { t: '/GP/GP22/go/', y: Y } }, { gen: Date.now() - 7 * 3600e3, exp: Date.now() - 1 }));
eq('a table past its exp means no switches', await lookupHop(X), { hop: null, state: 'fresh' });
fresh();
put(doc({ [X]: { t: '/GP/GP22/go/', y: Y } }, { exp: Date.now() + 5000 }));
eq('a table inside its exp switches', await getHop(X), { t: '/GP/GP22/go/', y: Y });
skew += 6000;   // still inside the 30 s cache, but past exp
eq('…and stops switching the moment exp passes, even from cache', await getHop(X), null);
skew = 0;

// Bad rows are dropped, good siblings survive.
fresh();
put(doc({
  [X]: { t: '/GP/GP22/go/', y: Y },
  [P]: { t: '//evil.com/x.html' },
  'SPK-2222-3333': { t: '/gravypassusa2.html', y: 'SPK-2222-3333' },
  'spk-4444-5555': { t: '/gravypassusa2.html' },
  'SPK-6666-7777-2': { t: '/gravypassusa2.html' },
  'SPK-8888-9999': { y: Y },
  'SPK-AAAA-BBBB': '/gravypassusa2.html',
  'SPK-CCCC-DDDD': { t: '/gravypassusa-pre.html' },
}));
eq('the good row in a document with bad rows still switches', await getHop(X), { t: '/GP/GP22/go/', y: Y });
for (const k of [P, 'SPK-2222-3333', 'SPK-4444-5555', 'SPK-6666-7777-2', 'SPK-8888-9999', 'SPK-AAAA-BBBB', 'SPK-CCCC-DDDD']) {
  eq(`…and the bad row for ${k} was dropped`, await getHop(k), null);
}

// The row cap.
fresh();
{
  const rows = {};
  for (let i = 0; i < MAX_ROWS + 1; i++) rows[`SPK-${(0x1000 + Math.floor(i / 4096)).toString(16).toUpperCase().slice(-4)}-${i.toString(16).toUpperCase().padStart(4, '0')}`] = { t: '/gravypassusa2.html' };
  const keys = Object.keys(rows);
  put(doc(rows));
  eq(`row ${MAX_ROWS} (the last inside the cap) switches`, await getHop(keys[MAX_ROWS - 1]), { t: '/gravypassusa2.html' });
  eq(`row ${MAX_ROWS + 1} is past the cap and does not`, await getHop(keys[MAX_ROWS]), null);
}

// Corrupt envelopes with nothing held: unavailable, i.e. no switch.
for (const [label, bad] of [
  ['unparseable JSON', '{"v":1,"gen":'],
  ['an unknown version', JSON.stringify(doc({ [X]: { t: '/GP/GP22/go/' } }, { v: 2 }))],
  ['no gen', JSON.stringify({ v: 1, exp: Date.now() + 1e6, rows: {} })],
  ['rows as an array', JSON.stringify({ v: 1, gen: Date.now(), exp: Date.now() + 1e6, rows: [] })],
  ['a bare string', JSON.stringify('hello')],
]) {
  fresh(); put(bad);
  eq(`corrupt (${label}) with no last good copy: unavailable, no switch`, await lookupHop(X), { hop: null, state: 'unavailable' });
}

// Outages after a good read: the last good copy is served, with back-off.
for (const outage of ['slow', 'error', 'http500', 'garbage', 'corrupt']) {
  fresh();
  put(doc({ [X]: { t: '/GP/GP22/go/', y: Y } }));
  await getHop(X);                       // a good read is now held
  skew += 31_000;                         // past the 30 s cache
  if (outage === 'corrupt') put('{"v":1,"gen":'); else mode = outage;
  const t0 = realNow();
  const got = await lookupHop(X);
  const took = realNow() - t0;
  eq(`${outage}: the last good copy is served`, got, { hop: { t: '/GP/GP22/go/', y: Y }, state: 'last-good' });
  if (outage === 'slow') eq('slow: the read gave up near its 250 ms budget, not the 600 ms the store took', took < 550, true);
  before = reads;
  await getHop(X); await getHop(X);
  eq(`${outage}: backing off — no further store reads inside 10 s`, reads - before, 0);
  skew += 11_000;
  mode = 'ok';
  put(doc({ [X]: { t: '/gravypassusa2.html' } }));
  eq(`${outage}: after the back-off a healthy store is read again`, await lookupHop(X), { hop: { t: '/gravypassusa2.html' }, state: 'fresh' });
  skew = 0;
}

// The last good copy also expires.
fresh();
put(doc({ [X]: { t: '/GP/GP22/go/', y: Y } }, { exp: Date.now() + 60_000 }));
await getHop(X);
skew += 61_000; mode = 'error';
eq('a last good copy past its exp means no switch', await lookupHop(X), { hop: null, state: 'last-good' });
skew = 0; mode = 'ok';

// Absence retires a previously held table (a cleared key must not resurrect old switches).
fresh();
put(doc({ [X]: { t: '/GP/GP22/go/', y: Y } }));
await getHop(X);
skew += 31_000; DB.delete(HOP_KEY);
eq('a cleared key retires the held table', await lookupHop(X), { hop: null, state: 'fresh' });
skew = 0;

// ── the endpoint ──────────────────────────────────────────────────────────────────────────────
console.log('\n── /api/hop ──\n');
fresh();
put(doc({ [X]: { t: '/GP/GP22/go/', y: Y }, [P]: { t: '/gravypassusa2.html' } }));
let r = await hop({ c: X });
eq('an offer switch answers 200 {t, y}', [r.code, r.body], [200, { t: '/GP/GP22/go/', y: Y }]);
eq('…browser no-store', r.headers['cache-control'], 'no-store');
eq('…edge may hold it 15 s', r.headers['vercel-cdn-cache-control'], 's-maxage=15');
eq('…JSON', /^application\/json/.test(r.headers['content-type']), true);
r = await hop({ c: P });
eq('a page switch answers 200 {t}', [r.code, r.body], [200, { t: '/gravypassusa2.html' }]);
r = await hop({ c: X.toLowerCase() });
eq('the code is uppercased before lookup', r.body, { t: '/GP/GP22/go/', y: Y });
r = await hop({ c: ` ${X} ` });
eq('…and trimmed', r.body, { t: '/GP/GP22/go/', y: Y });
r = await hop({ c: [X, 'SPK-9999-9999'] });
eq('a repeated c uses the first', r.body, { t: '/GP/GP22/go/', y: Y });
r = await hop({ c: 'SPK-9999-9999' });
eq('no switch answers 200 {}', [r.code, r.body], [200, {}]);
eq('…and that is cacheable too (it was read from the table)', r.headers['vercel-cdn-cache-control'], 's-maxage=15');
r = await hop({ c: `${X}-2` });
eq('a -N code answers {}', r.body, {});
for (const q of [{}, { c: '' }, { c: 'nope' }, { c: 'SPK-A1B2' }, { c: `${X}x` }, { c: '<script>' }, { code: X }]) {
  r = await hop(q);
  eq(`junk query ${JSON.stringify(q)} -> 200 {} and nothing cached at the edge`,
    [r.code, r.body, r.headers['vercel-cdn-cache-control']], [200, {}, 'no-store']);
}
r = await hop({ c: X }, 'POST');
eq('POST is 405 (not a 5xx), with an empty body', [r.code, r.body, r.headers.allow], [405, {}, 'GET']);

// Store down and nothing held: still 200 {}, never cached.
fresh(); mode = 'error';
r = await hop({ c: X });
eq('store down, nothing held: 200 {}', [r.code, r.body], [200, {}]);
eq('…and the edge must not hold that answer', r.headers['vercel-cdn-cache-control'], 'no-store');
mode = 'ok';

// Store down with a last good copy: the copy, cacheable.
fresh();
put(doc({ [X]: { t: '/GP/GP22/go/', y: Y } }));
await hop({ c: X });
skew += 31_000; mode = 'slow';
r = await hop({ c: X });
eq('store slow, last good held: the switch is still served', [r.code, r.body], [200, { t: '/GP/GP22/go/', y: Y }]);
eq('…and may be held at the edge', r.headers['vercel-cdn-cache-control'], 's-maxage=15');
skew = 0; mode = 'ok';

// Never a 5xx, whatever it is handed.
for (const [label, req] of [['a null request', null], ['no query object', { method: 'GET' }], ['a query getter that throws', { method: 'GET', get query() { throw new Error('x'); } }]]) {
  const res = mockRes();
  let threw = null;
  try { await hopFn(req, res); } catch (e) { threw = e.message; }
  eq(`${label} -> 200 {}, nothing thrown`, [res.code, res.body, threw], [200, {}, null]);
}

// Nothing in any answer names us or our network.
{
  fresh();
  put(doc({ [X]: { t: '/GP/GP22/go/', y: Y } }));
  const all = [];
  for (const q of [{ c: X }, { c: 'SPK-9999-9999' }, {}]) {
    const res = await hop(q);
    all.push(JSON.stringify(res.body), JSON.stringify(res.headers));
  }
  eq('no response body or header names the company or the network',
    /sprk(?!-)|sprknetwork|monetise|everflow|\bcake\b|tokrwd/i.test(all.join(' ').replace(/SPK-[0-9A-F-]+/g, '')), false);
}

// KV not configured at all (env binds at module load, so this needs its own process).
{
  const script = `
    const hopFn = (await import(${JSON.stringify(`${ROOT}api/hop.js`)})).default;
    const r = { code: 200, headers: {}, body: undefined };
    r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    await hopFn({ method: 'GET', query: { c: 'SPK-A1B2-C3D4' }, headers: {} }, r);
    console.log(JSON.stringify([r.code, r.body, r.headers['vercel-cdn-cache-control']]));`;
  const env = { ...process.env };
  delete env.KV_REST_API_URL; delete env.KV_REST_API_TOKEN; delete env.KV_REST_API_READ_ONLY_TOKEN;
  delete env.UPSTASH_REDIS_REST_URL; delete env.UPSTASH_REDIS_REST_TOKEN;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8' }).trim();
  eq('no datastore on this deploy: 200 {}, not cached', JSON.parse(out), [200, {}, 'no-store']);
}

Date.now = realNow;
kv.close();
console.log(`\n${pass} passed, ${fail} failed  (store reads: ${reads})`);
process.exit(fail ? 1 : 0);
