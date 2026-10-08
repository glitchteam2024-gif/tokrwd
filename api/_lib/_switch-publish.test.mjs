// Page switch, write half — /api/switch-publish, end to end into what /api/hop serves.
//
//   node "api/_lib/_switch-publish.test.mjs"
//
// Drives the REAL api/switch-publish.js and api/hop.js against an Upstash-REST-compatible stub
// with a working compare-and-swap. What is pinned:
//   - the door is shut unless LANDING_SWITCH_KEY is set and matched (no fallback, no Origin);
//   - the envelope is all-or-nothing (422, nothing written); rows are judged one at a time
//     (bad ones come back in `rejected`, good ones are stored);
//   - an older table can never overwrite a newer one (409 stale_gen), including when another
//     publish lands between our read and our write;
//   - what was stored is exactly what /api/hop then serves.
import http from 'node:http';
import { execFileSync } from 'node:child_process';

const KEY = 'test-switch-key-0123456789';

// ── the stub store ────────────────────────────────────────────────────────────────────────────
const DB = new Map();
let writes = 0, failReads = false, beforeEval = null;
const kv = http.createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  const args = JSON.parse(body);
  res.setHeader('Content-Type', 'application/json');
  if (args[0] === 'GET') {
    if (failReads) return res.end(JSON.stringify({ error: 'ERR down' }));
    return res.end(JSON.stringify({ result: DB.has(args[1]) ? DB.get(args[1]) : null }));
  }
  if (args[0] === 'EVAL') {
    // [EVAL, script, numKeys, key, expected, next] — reproduces the Lua in kv.js.
    const [, , , k, expected, next] = args;
    if (beforeEval) { const f = beforeEval; beforeEval = null; f(k); }
    const cur = DB.has(k) ? DB.get(k) : null;
    const match = cur === null ? expected === '__ABSENT__' : cur === expected;
    if (match) { writes++; DB.set(k, next); }
    return res.end(JSON.stringify({ result: match ? 1 : 0 }));
  }
  res.end(JSON.stringify({ error: 'unsupported' }));
});
await new Promise((r) => kv.listen(0, '127.0.0.1', r));
process.env.KV_REST_API_URL = `http://127.0.0.1:${kv.address().port}`;
process.env.KV_REST_API_TOKEN = 'stub-token';

// The secret is read at module load, exactly as on Vercel. Load once WITHOUT it (a distinct
// module instance via the query string), then once with it.
delete process.env.LANDING_SWITCH_KEY;
const noKeyFn = (await import(new URL('../switch-publish.js?nokey', import.meta.url).href)).default;
process.env.LANDING_SWITCH_KEY = KEY;
const pubMod = await import(new URL('../switch-publish.js?withkey', import.meta.url).href);
const pubFn = pubMod.default;
const hopFn = (await import(new URL('../hop.js', import.meta.url).href)).default;
const { HOP_KEY, _resetHopCache, MAX_ROWS } = await import(new URL('./hop-store.js', import.meta.url).href);

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
async function publish(body, { headers = { 'x-switch-key': KEY }, method = 'POST', fn = pubFn } = {}) {
  const res = mockRes();
  await fn({ method, headers, query: {}, body }, res);
  return res;
}
async function hop(c) {
  _resetHopCache();
  const res = mockRes();
  await hopFn({ method: 'GET', query: { c }, headers: {} }, res);
  return res.body;
}
const stored = () => (DB.has(HOP_KEY) ? JSON.parse(DB.get(HOP_KEY)) : null);

const X = 'SPK-A1B2-C3D4', Y = 'SPK-E5F6-A789', P = 'SPK-0000-1111';
let clock = Date.now();
const nextGen = () => (clock += 1000);
const table = (rows, gen = nextGen(), extra = {}) => ({ v: 1, gen, exp: gen + 6 * 3600e3, rows, ...extra });

// ── the door ──────────────────────────────────────────────────────────────────────────────────
console.log('── auth ──\n');
const GOOD = table({ [X]: { t: '/GP/GP22/go/', y: Y } });
let r = await publish(GOOD, { fn: noKeyFn });
eq('LANDING_SWITCH_KEY unset: even the "right" key is 401', r.code, 401);
r = await publish(GOOD, { fn: noKeyFn, headers: {} });
eq('LANDING_SWITCH_KEY unset: no key is 401 (never open)', r.code, 401);
r = await publish(GOOD, { headers: {} });
eq('no key header: 401', r.code, 401);
r = await publish(GOOD, { headers: { 'x-switch-key': KEY.replace(/.$/, 'X') } });
eq('wrong key, same length: 401', r.code, 401);
r = await publish(GOOD, { headers: { 'x-switch-key': KEY + 'extra' } });
eq('wrong key, other length: 401', r.code, 401);
r = await publish(GOOD, { headers: { 'x-lander-publish-key': KEY } });
eq('another endpoint\'s header name does not open this one', r.code, 401);
r = await publish(GOOD, { headers: { 'x-switch-key': KEY, origin: 'https://www.myrewardscorner.com' } });
eq('any Origin header, even our own, is 403 (not a browser endpoint)', r.code, 403);
r = await publish(GOOD, { method: 'GET' });
eq('GET is 405', [r.code, r.headers.allow], [405, 'POST']);
r = await publish(GOOD, { method: 'PUT' });
eq('PUT is 405', r.code, 405);
eq('nothing was written by any refused request', [writes, DB.has(HOP_KEY)], [0, false]);
eq('responses are never cached', r.headers['cache-control'], 'no-store');

// ── the envelope ──────────────────────────────────────────────────────────────────────────────
console.log('\n── the envelope ──\n');
r = await publish(GOOD, { headers: { 'x-switch-key': KEY, 'content-length': String(3_000_000) } });
eq('a declared body over the cap is 413', r.code, 413);
r = await publish('{"v":1,"pad":"' + 'a'.repeat(2_000_001) + '"}');
eq('an actual body over the cap is 413', r.code, 413);
r = await publish('{"v":1,');
eq('a body that is not JSON is 422', r.code, 422);
r = await publish('[1,2]');
eq('a JSON array body is 422', r.code, 422);
const now = Date.now();
for (const [label, body] of [
  ['v missing', { gen: now, exp: now + 1e6, rows: {} }],
  ['v 2', { v: 2, gen: now, exp: now + 1e6, rows: {} }],
  ['gen missing', { v: 1, exp: now + 1e6, rows: {} }],
  ['gen a string', { v: 1, gen: String(now), exp: now + 1e6, rows: {} }],
  ['gen a float', { v: 1, gen: now + 0.5, exp: now + 1e6, rows: {} }],
  ['gen zero', { v: 1, gen: 0, exp: now + 1e6, rows: {} }],
  ['exp missing', { v: 1, gen: now, rows: {} }],
  ['exp equal to gen', { v: 1, gen: now, exp: now, rows: {} }],
  ['exp before gen', { v: 1, gen: now, exp: now - 1, rows: {} }],
  ['exp more than 24 h after gen', { v: 1, gen: now, exp: now + 25 * 3600e3, rows: {} }],
  ['gen far in the future', { v: 1, gen: now + 3600e3, exp: now + 2 * 3600e3, rows: {} }],
  ['exp already passed', { v: 1, gen: now - 7 * 3600e3, exp: now - 3600e3, rows: {} }],
  ['rows missing', { v: 1, gen: now, exp: now + 1e6 }],
  ['rows an array', { v: 1, gen: now, exp: now + 1e6, rows: [] }],
  ['rows a string', { v: 1, gen: now, exp: now + 1e6, rows: 'x' }],
  ['an unknown action', { action: 'wipe', v: 1, gen: now, exp: now + 1e6, rows: {} }],
]) {
  r = await publish(body);
  eq(`${label}: 422, nothing written`, [r.code, r.body.ok, writes], [422, false, 0]);
}
{
  const rows = {};
  for (let i = 0; i <= MAX_ROWS; i++) rows[`SPK-1000-${i.toString(16).toUpperCase().padStart(4, '0')}`] = { t: '/gravypassusa2.html' };
  r = await publish(table(rows));
  eq(`more than ${MAX_ROWS} rows: 422 rather than a silent truncation`, [r.code, writes], [422, 0]);
}

// ── a good publish, and what /api/hop then serves ─────────────────────────────────────────────
console.log('\n── publish ──\n');
const T1 = table({ [X]: { t: '/GP/GP22/go/', y: Y }, [P]: { t: '/gravypassusa2.html' } });
r = await publish(T1);
eq('a valid table is stored: 200 {ok, gen, count, rejected}', r.body, { ok: true, gen: T1.gen, count: 2, rejected: [] });
let s = stored();
eq('…the stored document carries v/gen/exp and the rows', [s.v, s.gen, s.exp, s.rows], [1, T1.gen, T1.exp, T1.rows]);
eq('…plus a 64-hex sha and the count', [/^[0-9a-f]{64}$/.test(s.sha), s.count], [true, 2]);
eq('/api/hop serves the offer switch', await hop(X), { t: '/GP/GP22/go/', y: Y });
eq('/api/hop serves the page switch', await hop(P), { t: '/gravypassusa2.html' });
eq('/api/hop answers {} for anyone else', await hop('SPK-9999-9999'), {});

r = await publish({ action: 'status' });
eq('status reports what is stored', [r.code, r.body.gen, r.body.count, r.body.sha, r.body.exists], [200, T1.gen, 2, s.sha, true]);
r = await publish({ action: 'status' }, { headers: {} });
eq('status needs the key too', r.code, 401);

// The same publish again (a retried request) is fine; a different table at the same gen is not.
r = await publish(T1);
eq('the same table at the same gen is an idempotent 200', [r.code, r.body.already], [200, true]);
r = await publish({ ...T1, rows: { [X]: { t: '/gravypassusa2.html' } } });
eq('a DIFFERENT table at the same gen is 409', [r.code, r.body.error], [409, 'stale_gen']);
eq('…and the stored table is untouched', stored().rows, T1.rows);

// Older gen: refused.
r = await publish(table({ [X]: { t: '/gravypassusa3.html' } }, T1.gen - 5000));
eq('an older gen is 409 stale_gen', [r.code, r.body.ok, r.body.error, r.body.stored_gen], [409, false, 'stale_gen', T1.gen]);
eq('…and changed nothing', await hop(X), { t: '/GP/GP22/go/', y: Y });

// Newer gen with some bad rows: stored minus the bad ones.
const LONG = 'SPK-' + 'Z'.repeat(200);
const T2 = table({
  [X]: { t: '/GP/GP23/go/', y: Y },
  [P]: { t: '//evil.com/x.html' },
  'SPK-2222-3333': { t: '/gravypassusa2.html', y: 'SPK-2222-3333' },
  'spk-4444-5555': { t: '/gravypassusa2.html' },
  'SPK-6666-7777-2': { t: '/gravypassusa2.html' },
  'SPK-8888-9999': { y: Y },
  'SPK-AAAA-BBBB': { t: '/admin/index.html' },
  'SPK-CCCC-DDDD': { t: '/gravypassusa-pre.html' },
  'SPK-EEEE-FFFF': { t: '/gravypassusa2.html', y: 'SPK-1234-5678', extra: 'dropped' },
  [LONG]: { t: '/gravypassusa2.html' },
});
r = await publish(T2);
eq('a newer table with bad rows is stored: 200', [r.code, r.body.count], [200, 2]);
eq('…every bad row is named in rejected (keys bounded to 64 chars)', r.body.rejected,
  [P, 'SPK-2222-3333', 'spk-4444-5555', 'SPK-6666-7777-2', 'SPK-8888-9999', 'SPK-AAAA-BBBB', 'SPK-CCCC-DDDD', LONG.slice(0, 64)]);
eq('…the good rows are stored, whitelisted', stored().rows,
  { [X]: { t: '/GP/GP23/go/', y: Y }, 'SPK-EEEE-FFFF': { t: '/gravypassusa2.html', y: 'SPK-1234-5678' } });
eq('…and the page switch that was dropped is gone from /api/hop', await hop(P), {});
eq('…while the good one moved', await hop(X), { t: '/GP/GP23/go/', y: Y });

// An empty table is a valid publish: it ends every switch.
const T3 = table({});
r = await publish(T3);
eq('an empty table is stored', [r.code, r.body.count], [200, 0]);
eq('…and every switch is over', await hop(X), {});

// ── an unchanged table is not written again while it is fresh (the shared KV's command budget) ──
console.log('\n── unchanged tables ──\n');
{
  const T5 = table({ [X]: { t: '/GP/GP22/go/', y: Y } });
  r = await publish(T5);
  eq('a changed table is written', [r.code, r.body.unchanged, stored().gen], [200, undefined, T5.gen]);
  const w0 = writes;
  const T6 = table({ [X]: { t: '/GP/GP22/go/', y: Y } });   // newer gen, identical rows
  r = await publish(T6);
  eq('the same table at a newer gen, stored copy fresh: 200 unchanged, NOTHING written',
    [r.code, r.body.ok, r.body.unchanged, r.body.gen, r.body.stored_gen, writes - w0], [200, true, true, T6.gen, T5.gen, 0]);
  eq('…and the switch is still served', await hop(X), { t: '/GP/GP22/go/', y: Y });
  r = await publish(table({ [X]: { t: '/GP/GP22/go/', y: Y } }, T5.gen - 1));
  eq('an OLDER gen is still 409 stale_gen, unchanged or not', [r.code, r.body.error], [409, 'stale_gen']);

  // The stored copy is getting old (under 5 h to live): the same table IS written, pushing exp out.
  const doc = stored(); doc.exp = Date.now() + 4 * 3600e3; DB.set(HOP_KEY, JSON.stringify(doc));
  const T7 = table({ [X]: { t: '/GP/GP22/go/', y: Y } });
  r = await publish(T7);
  eq('same table, stored copy under 5 h from expiry: written, exp pushed out', [r.code, r.body.unchanged, stored().gen, stored().exp], [200, undefined, T7.gen, T7.exp]);

  // A stored sha that does not match its own rows is never trusted as "unchanged".
  const forged = stored(); forged.rows = { [X]: { t: '/gravypassusa3.html' } }; DB.set(HOP_KEY, JSON.stringify(forged));
  const T8 = table({ [X]: { t: '/GP/GP22/go/', y: Y } });
  r = await publish(T8);
  eq('a stored sha that disagrees with its rows: the table is written', [r.code, r.body.unchanged, stored().rows], [200, undefined, T8.rows]);
  eq('…and the right switch is served', await hop(X), { t: '/GP/GP22/go/', y: Y });
}

// ── races ─────────────────────────────────────────────────────────────────────────────────────
console.log('\n── races ──\n');
{
  // A NEWER publish lands between our read and our write: we must lose, not overwrite it.
  const ours = table({ [X]: { t: '/gravypassusa2.html' } });
  const theirs = table({ [X]: { t: '/gravypassusa3.html' } });   // newer gen
  beforeEval = (k) => DB.set(k, JSON.stringify({ v: 1, gen: theirs.gen, exp: theirs.exp, rows: theirs.rows, count: 1, sha: 'x' }));
  r = await publish(ours);
  eq('a newer table written mid-publish wins: we get 409 stale_gen', [r.code, r.body.error], [409, 'stale_gen']);
  eq('…and theirs is what is served', await hop(X), { t: '/gravypassusa3.html' });

  // An OLDER one sneaks in mid-publish (some other stale writer): we retry and win.
  const mine = table({ [X]: { t: '/GP/GP24/go/', y: Y } });
  beforeEval = (k) => DB.set(k, JSON.stringify({ v: 1, gen: mine.gen - 500, exp: mine.exp, rows: {}, count: 0, sha: 'y' }));
  r = await publish(mine);
  eq('an older table written mid-publish: we retry and land', [r.code, r.body.gen], [200, mine.gen]);
  eq('…and ours is served', await hop(X), { t: '/GP/GP24/go/', y: Y });
}

// ── a corrupt stored table is repaired by the next valid publish ──────────────────────────────
DB.set(HOP_KEY, '{"v":1,"gen":');
r = await publish({ action: 'status' });
eq('status says the stored table is corrupt', [r.code, r.body.corrupt], [200, true]);
const T4 = table({ [X]: { t: '/gravypassusa2.html' } });
r = await publish(T4);
eq('a valid publish replaces a corrupt table', [r.code, stored().gen], [200, T4.gen]);

// ── the store is unreadable: refuse rather than write blind ───────────────────────────────────
failReads = true;
const before = DB.get(HOP_KEY);
r = await publish(table({ [X]: { t: '/gravypassusa3.html' } }));
eq('an unreadable store is 503, and nothing is written', [r.code, DB.get(HOP_KEY) === before], [503, true]);
failReads = false;

// ── no datastore on this deploy (env binds at load: its own process) ──────────────────────────
{
  const script = `
    process.env.LANDING_SWITCH_KEY = ${JSON.stringify(KEY)};
    const fn = (await import(${JSON.stringify(new URL('../switch-publish.js', import.meta.url).href)})).default;
    const r = { code: 200, headers: {}, body: undefined };
    r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.body = b; return r; };
    const now = Date.now();
    await fn({ method: 'POST', headers: { 'x-switch-key': ${JSON.stringify(KEY)} }, query: {},
      body: { v: 1, gen: now, exp: now + 3600e3, rows: {} } }, r);
    console.log(JSON.stringify([r.code, r.body.ok]));`;
  const env = { ...process.env };
  delete env.KV_REST_API_URL; delete env.KV_REST_API_TOKEN; delete env.KV_REST_API_READ_ONLY_TOKEN;
  delete env.UPSTASH_REDIS_REST_URL; delete env.UPSTASH_REDIS_REST_TOKEN;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  eq('no datastore connected: 503, not a 200 that went nowhere', JSON.parse(out), [503, false]);
}

kv.close();
console.log(`\n${pass} passed, ${fail} failed  (store writes: ${writes})`);
process.exit(fail ? 1 : 0);
