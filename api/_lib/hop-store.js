/**
 * hop-store.js — the running-ad page switch: which landing page a prelander should
 * open for one affiliate code, read from ONE KV document.
 *
 * WHAT IT IS FOR. An affiliate's TikTok ad points at a prelander. Changing the ad would
 * reset its delivery, so instead the prelander asks /api/hop at page load whether the
 * code in its s1 has been moved to another landing page, and if so where (`t`) and, for
 * a move to another offer, which sibling code the visitor must carry instead (`y`).
 * The app that owns the switches publishes the whole table through
 * /api/switch-publish; this module is the only reader and the only validator both
 * endpoints share.
 *
 * THE DOCUMENT (key HOP_KEY, a constant — never built from request data, kv.js:11-14)
 *   {
 *     v: 1,
 *     gen: <ms epoch>,          // publish generation; the writer refuses to go backwards
 *     exp: <ms epoch>,          // after this the whole table means "no switches"
 *     rows: { "SPK-AAAA-BBBB": { t: "/gravypassusa2.html", y: "SPK-CCCC-DDDD" }, … },
 *     published_at, sha, count  // bookkeeping for the writer's status answer
 *   }
 *
 * THE READ LADDER is partner-store.js's, for the same reasons (a person is waiting on
 * the other end, and "no answer" is always safe here):
 *   OK           200, parses, validates          -> install it, serve it ('fresh')
 *   ABSENT       200 with result:null             -> a real, cacheable "no switches"
 *   UNAVAILABLE  timeout / abort / non-200 / junk -> last good copy ('last-good'), else
 *                                                   nothing ('unavailable'); back off 10 s
 *
 * EXPIRY IS CHECKED AT LOOKUP, NOT AT READ. The writer re-publishes every minute and each
 * publish pushes `exp` forward. If it stops (its cron died, its key was rotated, the store
 * went away) a warm lambda would otherwise keep serving its last good copy forever, and a
 * switch that has since been ended — the target pulled, the code paid out — would keep
 * sending visitors to it. Past `exp` the table is empty and every prelander does exactly
 * what it did before this feature existed.
 *
 * EVERY ROW IS VALIDATED ON EVERY READ. The writer validates too, but it runs in another
 * lambda; this is the only check standing between a stored document and a navigation.
 * One bad row is dropped; its siblings still switch.
 *
 * Never throws from lookupHop/getHop. The caller is on a paid view.
 */

import { kvEnabled, kvGetJson } from './kv.js';

/** ONE key, a constant. Same namespace convention as partner-store.js / lander-store.js. */
export const HOP_KEY = 'tokrwd:hop:v1';

/** Ceiling on rows, so a corrupted document cannot turn into unbounded work. */
export const MAX_ROWS = 5000;

/** Longest path accepted for `t`. Real lander paths are well under 80 characters. */
export const MAX_PATH_LEN = 200;

/** How long a lambda serves its cached copy before re-reading. */
const TTL_MS = 30_000;

/** How long to stop retrying after a failed read (see partner-store.js:71-74). */
const FAIL_BACKOFF_MS = 10_000;

/** KV read budget on the view path. The fallback ("no switch") is always correct. */
const READ_TIMEOUT_MS = 250;

/**
 * What the hop endpoint accepts in ?c=, after uppercasing: a code exactly as the lander
 * extracts it (the lander's own regex), INCLUDING a relaunch suffix. Accepting `-N` here
 * does not mean it can switch — rows are keyed by the exact canonical code only, so a
 * child code is looked up as itself and never matches its parent's row.
 */
export const HOP_QUERY_RE = /^SPK-[0-9A-F]{4}-[0-9A-F]{4}(?:-\d+)?$/;

/** A row key and a `y`: the exact canonical code. Never a `-N` child. */
export const CANON_CODE_RE = /^SPK-[0-9A-F]{4}-[0-9A-F]{4}$/;

/**
 * First path segments that are never a landing page: the API, our click and redirect
 * routes, the kicker prelander, the generated-page route, and the app/static roots. A
 * switch to any of them would at best 404 a paid visitor and at worst put them on the
 * dashboard (the same hole RESERVED_LANDER_ROOTS closed for lp=). Compared lowercased,
 * with a trailing ".html" removed, so /click.html and /Pre/x.html are refused too.
 * 'go' is the ROOT /go/ — the orphaned redirector (go/index.html), never a lander. A
 * clone's own /<folder>/go/ has another first segment and is unaffected.
 */
export const RESERVED_ROOTS = ['api', 'click', 'c', 'r', 'u', 'pre', 'admin', 'portal', 'js', 'images', 'postback', 'go'];

/**
 * Is `t` a path a prelander may navigate to? The contract, plus two refusals that only
 * make the chain shorter:
 *   - same-origin path, charset ^/[A-Za-z0-9._/-]+$, at most MAX_PATH_LEN
 *   - no '//' anywhere (a leading one is protocol-relative = another origin) and no '..'
 *   - no segment starting with '.': the browser folds '/./c/x.html' into '/c/x.html' AFTER
 *     every check here passed on the raw string — a reserved route (or the prelander
 *     itself) in disguise
 *   - first segment not in RESERVED_ROOTS
 *   - ends in '.html' (a flat lander) or '/go/' (a clone lander, as the prelander builds it)
 *   - not itself a flat prelander ('-pre.html', '-pre2.html'): a switch must land on the
 *     lander, never on a second "Open in Browser" page
 */
export function isValidHopPath(t) {
  if (typeof t !== 'string') return false;
  if (t.length < 2 || t.length > MAX_PATH_LEN) return false;
  if (!/^\/[A-Za-z0-9._/-]+$/.test(t)) return false;
  if (t.indexOf('//') !== -1 || t.indexOf('..') !== -1) return false;
  if (t.indexOf('/.') !== -1) return false;
  if (!/(?:\.html|\/go\/)$/.test(t)) return false;
  if (/-pre\d*\.html$/i.test(t)) return false;
  const root = t.split('/')[1].replace(/\.html$/i, '').toLowerCase();
  if (!root || RESERVED_ROOTS.indexOf(root) !== -1) return false;
  return true;
}

/**
 * One row, whitelisted. Returns { t } or { t, y } — never a spread of the input — or
 * null when anything about it is wrong. `y` equal to the key is refused: a move to
 * another offer that kept the old code would send that offer's page with the wrong
 * code, which is exactly the pairing that misattributes money.
 */
export function sanitizeHopRow(code, raw) {
  if (typeof code !== 'string' || !CANON_CODE_RE.test(code)) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!isValidHopPath(raw.t)) return null;
  if (raw.y === undefined || raw.y === null || raw.y === '') return { t: raw.t };
  if (typeof raw.y !== 'string' || !CANON_CODE_RE.test(raw.y) || raw.y === code) return null;
  return { t: raw.t, y: raw.y };
}

/**
 * The document's envelope. Returns { gen, exp, rows: Map, dropped } or THROWS when the
 * envelope itself is wrong — that is corruption, not absence, and it must take the
 * unavailable path (back off, keep the last good copy, log) rather than read as "no
 * switches" (kv.js:89-95 makes the same distinction for unparseable JSON).
 */
export function parseHopDoc(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('hop doc is not an object');
  if (doc.v !== 1) throw new Error('hop doc has an unknown version');
  if (!Number.isFinite(doc.gen) || !Number.isFinite(doc.exp)) throw new Error('hop doc has no gen/exp');
  const rowsIn = doc.rows;
  if (!rowsIn || typeof rowsIn !== 'object' || Array.isArray(rowsIn)) throw new Error('hop doc has no rows object');
  const rows = new Map();
  let dropped = 0;
  const keys = Object.keys(rowsIn);
  for (let i = 0; i < keys.length; i++) {
    if (i >= MAX_ROWS) { dropped += keys.length - MAX_ROWS; break; }
    const k = keys[i];
    const row = sanitizeHopRow(k, rowsIn[k]);
    if (row) rows.set(k, row); else dropped++;
  }
  return { gen: doc.gen, exp: doc.exp, rows, dropped };
}

const EMPTY = Object.freeze({ gen: 0, exp: Infinity, rows: new Map(), dropped: 0 });

let _doc = null;       // last known good parsed document (EMPTY when the key is absent)
let _at = 0;           // when _doc was read
let _inflight = null;  // request coalescing: a cold lambda taking 10 views reads once
let _warned = false;   // log an outage once per lambda, not once per view
let _failUntil = 0;
// Bumped by _resetHopCache. A read that started before a reset must not install what it
// read afterwards (partner-store.js:66-70 has the same guard for the same reason).
let _gen = 0;

/**
 * The document this request should answer from, and how it was obtained:
 *   'fresh'        read (or confirmed absent) within TTL_MS
 *   'last-good'    the latest read failed or is backing off; this is the previous good copy
 *   'unavailable'  no document could be read and none was ever held (or KV is not wired up)
 * Never throws.
 */
export async function readHopDoc() {
  const now = Date.now();
  if (_doc && now - _at < TTL_MS) return { doc: _doc, state: 'fresh' };
  if (!kvEnabled()) return { doc: null, state: 'unavailable' };
  if (now < _failUntil) return _doc ? { doc: _doc, state: 'last-good' } : { doc: null, state: 'unavailable' };

  if (!_inflight) {
    const gen = _gen;
    const p = kvGetJson(HOP_KEY, { timeoutMs: READ_TIMEOUT_MS })
      .then((raw) => {
        // ABSENT: nothing has been published yet, or the key was cleared. A real answer.
        const parsed = raw == null ? EMPTY : parseHopDoc(raw);
        if (parsed.dropped) console.warn('[hop-store] dropped', parsed.dropped, 'invalid row(s)');
        if (gen === _gen) {
          _doc = parsed;
          _at = Date.now();
          _warned = false;
        }
        return parsed;
      })
      .catch((e) => {
        if (!_warned) {
          console.warn('[hop-store] store unavailable, serving last good copy:', e && e.message);
          _warned = true;
        }
        if (gen === _gen) _failUntil = Date.now() + FAIL_BACKOFF_MS;
        return null;   // UNAVAILABLE — backed off, never cached as an answer
      });
    _inflight = p;
    // `p` never rejects (the catch above answers null). Clear only OUR read: after a reset a
    // newer read may already be in flight, and it must not be dropped by this one finishing.
    p.then(() => { if (_inflight === p) _inflight = null; });
  }

  let fresh = null;
  try { fresh = await _inflight; } catch { fresh = null; }
  if (fresh) return { doc: fresh, state: 'fresh' };
  return _doc ? { doc: _doc, state: 'last-good' } : { doc: null, state: 'unavailable' };
}

/**
 * The switch for one code: { hop: {t} | {t, y} | null, state }. `code` must already be
 * uppercased by the caller; anything that is not a code gets null without a read.
 * Never throws.
 */
export async function lookupHop(code) {
  try {
    if (typeof code !== 'string' || !HOP_QUERY_RE.test(code)) return { hop: null, state: 'invalid' };
    const { doc, state } = await readHopDoc();
    if (!doc) return { hop: null, state };
    // Past its expiry the whole table means "no switches" — see the header.
    if (!(doc.exp > Date.now())) return { hop: null, state };
    const row = doc.rows.get(code);
    return { hop: row ? (row.y ? { t: row.t, y: row.y } : { t: row.t }) : null, state };
  } catch (e) {
    return { hop: null, state: 'unavailable' };
  }
}

/** Just the answer. */
export async function getHop(code) {
  return (await lookupHop(code)).hop;
}

/** Test hook: forget everything this lambda knows. */
export function _resetHopCache() {
  _doc = null;
  _at = 0;
  _inflight = null;
  _warned = false;
  _failUntil = 0;
  _gen++;
}
