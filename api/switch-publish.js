/**
 * /api/switch-publish — the door the switch owner writes the running-ad page-switch table
 * through. Server-to-server only; /api/hop is its only reader (via _lib/hop-store.js).
 *
 *   POST /api/switch-publish
 *   x-switch-key: <LANDING_SWITCH_KEY>
 *   Content-Type: application/json
 *
 *   { "v": 1, "gen": <ms epoch>, "exp": <gen + 6h ms>,
 *     "rows": { "SPK-AAAA-BBBB": { "t": "/gravypassusa2.html" },
 *               "SPK-CCCC-DDDD": { "t": "/GP/GP22/go/", "y": "SPK-EEEE-FFFF" } } }
 *
 *   200 { ok:true, gen, count, rejected:[codes] }   stored; `rejected` rows were dropped
 *       (+ unchanged:true, stored_gen)              the same table is already stored with
 *                                                   > 5 h to live — nothing written (KV budget)
 *   401                                             no key configured here, or the wrong key
 *   403                                             carried an Origin header (a browser)
 *   409 { ok:false, error:'stale_gen' }             the stored table is newer — not written
 *   413                                             body over the cap
 *   422 { ok:false, error:<reason> }                the envelope is wrong — nothing written
 *   503                                             no datastore, or it could not be read
 *
 *   { "action": "status" }  ->  { ok:true, gen, exp, count, sha, published_at }  (same auth)
 *
 * THE WHOLE TABLE, EVERY TIME. The writer publishes after every approve/end and again every
 * minute from a cron, so a lost or rejected publish heals on the next tick and the store
 * never has to be patched row by row. `gen` is what keeps a slow, retried or reordered
 * request from putting an older table back on top of a newer one: the write is a
 * compare-and-swap (kv.js:118-152) and a gen older than the stored one is a 409.
 *
 * ROWS ARE JUDGED ONE AT A TIME. A row that fails validation goes into `rejected` and the
 * rest are stored — one bad path must not hold every other affiliate's switch hostage. The
 * envelope (v, gen, exp, rows) is all-or-nothing: if it is wrong, nothing is written.
 *
 * ⚠️ NOT A BROWSER ENDPOINT. No CORS headers, no OPTIONS, and any request carrying an Origin
 * header is refused — a server-to-server fetch never sets one, a browser always does on a
 * cross-origin POST. Same posture, same reasons as api/lander-publish.js.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { kvEnabled, kvGetRaw, kvCompareAndSet } from './_lib/kv.js';
import { HOP_KEY, MAX_ROWS, CANON_CODE_RE, sanitizeHopRow } from './_lib/hop-store.js';

/**
 * ITS OWN SECRET, NO FALLBACK. Not ADMIN_WRITE_KEY, not LANDER_PUBLISH_KEY: one leaked key
 * must not do two jobs. Unset means every write is refused, never that writes are open —
 * this endpoint decides where paid visitors land, so it has no safe open state.
 */
const SWITCH_KEY = process.env.LANDING_SWITCH_KEY || '';

/** Bound on the request body. 5000 rows of real size is well under half of this. */
export const MAX_BODY_BYTES = 2_000_000;

/** How far `exp` may sit past `gen`. The contract is 6 h; this only stops a runaway value. */
const MAX_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * How far `gen` may sit in the future of this server's clock. A gen from the far future
 * would be stored and then make EVERY later, honest publish a 409 until somebody cleared
 * the key by hand — every switch frozen. Refusing it up front costs nothing.
 */
const MAX_GEN_SKEW_MS = 10 * 60 * 1000;

/** Compare-and-swap retries when another publish lands between our read and our write. */
const CAS_ATTEMPTS = 3;

/**
 * NO WRITE WHEN NOTHING CHANGED. The writer publishes every minute, and most minutes the
 * table is identical. The KV database is shared with the partner store and the /u/ pages on
 * a command-capped plan, so an identical table is not written again while the stored copy
 * still has at least this long to live: one write an hour instead of sixty. The stored `exp`
 * (gen + 6 h) therefore still lapses within 6 h of the writer going quiet, as before.
 *
 * The cost, accepted on purpose: a skipped publish does not raise the stored gen, so a
 * slower publish carrying an OLDER gen than the skipped one (but newer than the stored one)
 * can still land. That needs two overlapping publishes whose tables differ, and the very next
 * minute's publish (a newer gen, a different sha) replaces it — about a minute of an older
 * table, the same order of staleness as the 30 s reader cache plus the 15 s edge window.
 */
export const SKIP_WHILE_FRESH_MS = 5 * 60 * 60 * 1000;

/** The stored table is byte-for-byte the one being published, and has long enough to live. */
export function unchangedAndFresh(stored, sha, now = Date.now()) {
  try {
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return false;
    if (stored.v !== 1 || !Number.isFinite(stored.exp) || stored.sha !== sha) return false;
    if (!stored.rows || typeof stored.rows !== 'object' || Array.isArray(stored.rows)) return false;
    // Recomputed, not trusted: the sha field is bookkeeping; the rows are what readers serve.
    if (rowsSha(stored.rows) !== sha) return false;
    return stored.exp - now >= SKIP_WHILE_FRESH_MS;
  } catch {
    return false;
  }
}

/** Constant-time compare. Lengths first, so it never throws. Same as lander-publish.js. */
function secretEq(a, b) {
  const A = Buffer.from(String(a == null ? '' : a), 'utf8');
  const B = Buffer.from(String(b == null ? '' : b), 'utf8');
  if (A.length === 0 || A.length !== B.length) return false;
  return timingSafeEqual(A, B);
}

function deny(res, code, error, extra) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(code).json(Object.assign({ ok: false, error }, extra || {}));
}

/** Vercel parses application/json for us; anything else arrives as a string or a Buffer. */
function readBody(req) {
  const b = req.body;
  if (b == null || b === '') return { body: {}, bytes: 0 };
  if (typeof b === 'string') return { body: JSON.parse(b), bytes: Buffer.byteLength(b, 'utf8') };
  if (Buffer.isBuffer(b)) return { body: JSON.parse(b.toString('utf8')), bytes: b.length };
  if (typeof b === 'object' && !Array.isArray(b)) {
    return { body: b, bytes: Buffer.byteLength(JSON.stringify(b), 'utf8') };
  }
  throw new Error('body is not an object');
}

/** A rejected key, echoed back bounded — it came from the request. */
function echoKey(k) {
  return String(k).slice(0, 64);
}

/** Stable hash of the stored rows, so the writer can tell "did my table land" cheaply. */
export function rowsSha(rows) {
  const keys = Object.keys(rows).sort();
  const canon = keys.map((k) => [k, rows[k].t, rows[k].y || '']);
  return createHash('sha256').update(JSON.stringify(canon)).digest('hex');
}

/**
 * Validate the envelope and every row. Returns { error } for an envelope problem (422),
 * else { gen, exp, rows, rejected }.
 */
export function validatePublish(body, now = Date.now()) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'body must be an object' };
  if (body.v !== 1) return { error: 'v must be 1' };
  const { gen, exp } = body;
  if (!Number.isSafeInteger(gen) || gen <= 0) return { error: 'gen must be a positive integer (ms epoch)' };
  if (!Number.isSafeInteger(exp)) return { error: 'exp must be an integer (ms epoch)' };
  if (!(exp > gen)) return { error: 'exp must be after gen' };
  if (exp - gen > MAX_TTL_MS) return { error: 'exp is too far after gen' };
  if (gen > now + MAX_GEN_SKEW_MS) return { error: 'gen is in the future' };
  if (!(exp > now)) return { error: 'exp has already passed' };
  const rowsIn = body.rows;
  if (!rowsIn || typeof rowsIn !== 'object' || Array.isArray(rowsIn)) return { error: 'rows must be an object' };
  const keys = Object.keys(rowsIn);
  if (keys.length > MAX_ROWS) return { error: `too many rows (max ${MAX_ROWS})` };

  const rows = {};
  const rejected = [];
  for (const k of keys) {
    // Exact canonical keys only — the hop looks a code up as itself, so a lowercase or
    // `-N` key could never be found and is a bug on the writer's side worth surfacing.
    const row = CANON_CODE_RE.test(k) ? sanitizeHopRow(k, rowsIn[k]) : null;
    if (row) rows[k] = row; else rejected.push(echoKey(k));
  }
  return { gen, exp, rows, rejected };
}

/** The stored document, plus the exact bytes it was read as (for the compare-and-swap). */
async function readCurrent() {
  const raw = await kvGetRaw(HOP_KEY, { timeoutMs: 3000 });
  if (raw == null) return { raw: null, doc: null, corrupt: false };
  try {
    const doc = JSON.parse(raw);
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { raw, doc: null, corrupt: true };
    return { raw, doc, corrupt: false };
  } catch {
    return { raw, doc: null, corrupt: true };
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return deny(res, 405, 'Method not allowed');
  }

  // See the header: a real caller here never sets Origin.
  if (req.headers.origin) return deny(res, 403, 'Not a browser endpoint');

  if (!SWITCH_KEY) {
    console.error('[switch-publish] LANDING_SWITCH_KEY is unset — refusing every write.');
    return deny(res, 401, 'Unauthorized');
  }
  // Header only. A credential in a query string lands in every request log.
  if (!secretEq(req.headers['x-switch-key'] || '', SWITCH_KEY)) {
    return deny(res, 401, 'Unauthorized');
  }

  const declared = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return deny(res, 413, 'Body too large', { max_body_bytes: MAX_BODY_BYTES });
  }

  let body, bytes;
  try {
    ({ body, bytes } = readBody(req));
  } catch (err) {
    return deny(res, 422, 'Body must be a JSON object');
  }
  if (bytes > MAX_BODY_BYTES) return deny(res, 413, 'Body too large', { max_body_bytes: MAX_BODY_BYTES });

  if (!kvEnabled()) {
    /* Say so rather than answering 200 to a write that went nowhere. Env vars bind at BUILD
     * time (kv.js:20-21), so this survives until somebody redeploys. */
    console.error('[switch-publish] KV is not configured on this deploy — nothing can be published.');
    return deny(res, 503, 'No datastore connected');
  }

  if (body && body.action === 'status') {
    let cur;
    try { cur = await readCurrent(); } catch (err) {
      return deny(res, 503, 'Could not read the current document');
    }
    const d = cur.doc || {};
    return res.status(200).json({
      ok: true,
      exists: cur.raw != null,
      corrupt: cur.corrupt,
      gen: Number.isFinite(d.gen) ? d.gen : null,
      exp: Number.isFinite(d.exp) ? d.exp : null,
      count: Number.isFinite(d.count) ? d.count : null,
      sha: typeof d.sha === 'string' ? d.sha : '',
      published_at: typeof d.published_at === 'string' ? d.published_at : '',
    });
  }
  if (body && body.action !== undefined && body.action !== 'publish') return deny(res, 422, 'unknown action');

  const v = validatePublish(body);
  if (v.error) return deny(res, 422, v.error);

  const count = Object.keys(v.rows).length;
  const sha = rowsSha(v.rows);
  const doc = {
    v: 1,
    gen: v.gen,
    exp: v.exp,
    rows: v.rows,
    count,
    sha,
    published_at: new Date().toISOString(),
  };

  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
    let cur;
    try {
      cur = await readCurrent();
    } catch (err) {
      /* Unreachable. Refuse rather than write blind: without the current gen there is no way
       * to know this table is not older than the one already being served. */
      console.error('[switch-publish] cannot read the current table:', err && err.message);
      return deny(res, 503, 'Could not read the current document');
    }

    if (cur.corrupt) {
      // Readers are already falling back on a corrupt document; an authenticated, valid table
      // replacing it (still by compare-and-swap on its exact bytes) is the repair.
      console.error('[switch-publish] stored table is corrupt — replacing it with gen', v.gen);
    } else if (cur.doc && Number.isFinite(cur.doc.gen) && cur.doc.gen >= v.gen) {
      // Same gen twice is a retry of the same publish: fine if it is the same table.
      if (cur.doc.gen === v.gen && cur.doc.sha === sha) {
        return res.status(200).json({ ok: true, gen: v.gen, count, rejected: v.rejected, already: true });
      }
      return deny(res, 409, 'stale_gen', { stored_gen: cur.doc.gen });
    } else if (unchangedAndFresh(cur.doc, sha)) {
      // Newer gen, same table, plenty of life left: nothing for any reader to learn. See
      // SKIP_WHILE_FRESH_MS for why the stored gen is allowed to stay where it is.
      return res.status(200).json({ ok: true, gen: v.gen, count, rejected: v.rejected, unchanged: true, stored_gen: cur.doc.gen });
    }

    let ok;
    try {
      ok = await kvCompareAndSet(HOP_KEY, cur.raw, doc, { timeoutMs: 5000 });
    } catch (err) {
      console.error('[switch-publish] write failed:', err && err.message);
      return deny(res, 503, 'Could not write the document');
    }
    if (ok) return res.status(200).json({ ok: true, gen: v.gen, count, rejected: v.rejected });
    // Someone else wrote between our read and our write. Re-read and judge the gen again.
  }
  return deny(res, 409, 'The document kept changing while this publish was being written — retry');
}
