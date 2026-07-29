/**
 * kv.js — Upstash Redis over plain `fetch`. No npm package, no package.json.
 *
 * WHY THIS EXISTS
 * Every file under api/ compiles to its own Vercel lambda with its own module
 * instance, so api/_lib/store.js — a module-level object — is structurally
 * unreadable by the lambda that routes a click. That is the reason the admin
 * dashboard has never had a working Save button, and it is what this module fixes:
 * one small JSON document, in a store every lambda can reach.
 *
 * DELIBERATELY NOT A GENERAL KV WRAPPER. There is exactly one document (see
 * partner-store.js) and the key is a constant. Building a Redis key out of
 * request data — a campid, a slug — would hand a public URL a say in which key
 * gets read or written, and that class of bug is easier to avoid than to audit.
 *
 * SETUP (Vercel dashboard, ~2 minutes):
 *   Storage -> Create Database -> Redis (Upstash) -> Free -> region us-east-1
 *   -> connect to this project for Production, Preview and Development.
 * That injects KV_REST_API_URL / KV_REST_API_TOKEN / KV_REST_API_READ_ONLY_TOKEN.
 * Env vars bind at BUILD time, so redeploy afterwards or every function keeps
 * seeing `undefined` and silently serves committed config.
 *
 * Nothing here fails loudly on the click path — see partner-store.js for the
 * fail-open ladder. An outage means "use the committed table", never "drop the click".
 */

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const KV_RW = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
// Vercel injects a read-only token too. The hot paths use it so a compromised
// lambda log or a mis-scoped call cannot write.
const KV_RO = process.env.KV_REST_API_READ_ONLY_TOKEN || KV_RW;

/** True when a datastore is actually wired up. The panel shows this verbatim. */
export function kvEnabled() {
  return !!(KV_URL && KV_RW);
}

/**
 * One Redis command, as the REST command-array form POSTed to the root path.
 *
 * The array form is used for both read and write so there is a single code path:
 * the path form (`/set/<key>/<value>`) cannot carry a JSON document, which
 * contains slashes.
 */
async function cmd(args, token, timeoutMs) {
  if (typeof fetch !== 'function') throw new Error('fetch unavailable');
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), timeoutMs);
  try {
    const res = await fetch(KV_URL, {
      method: 'POST',
      headers: {
        // Bearer, never `?_token=` — a token in a query string lands in logs.
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: control.signal,
      cache: 'no-store',
    });
    // Upstash answers 200 with an {error} body for a Redis-level failure, so the
    // status alone is not the verdict.
    const body = await res.json();
    if (!res.ok || (body && body.error)) {
      throw new Error(String((body && body.error) || `kv ${res.status}`));
    }
    return body ? body.result : null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Read a JSON document. Returns null when the key is absent, unparseable, or the
 * store is not configured — the caller must treat all three the same way.
 *
 * `result` is the RAW STRING that was stored; Upstash never parses it for us.
 *
 * The default timeout is deliberately short. This runs on a paid click with a
 * person waiting, and the fallback (committed config) is correct rather than
 * degraded, so waiting longer buys nothing.
 */
export async function kvGetJson(key, { timeoutMs = 250 } = {}) {
  if (!kvEnabled()) return null;
  const raw = await cmd(['GET', key], KV_RO, timeoutMs);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    // THROW rather than return null. Absence and corruption are different facts and
    // the caller treats them differently: absence is a cacheable "no rows stored",
    // corruption must take the unavailable path so it backs off and gets logged.
    // Returning null for both made a truncated document look exactly like an empty
    // one — every partner silently unrouted, nothing in the logs.
    throw new Error(`kv: value at ${key} is not valid JSON`);
  }
}

/** Write a JSON document. Admin path only — longer timeout, read-write token. */
export async function kvSetJson(key, doc, { timeoutMs = 3000 } = {}) {
  if (!kvEnabled()) throw new Error('KV not configured');
  return cmd(['SET', key, JSON.stringify(doc)], KV_RW, timeoutMs);
}

/**
 * The EXACT stored string, for a compare-and-swap. null when the key is absent.
 *
 * Deliberately not parsed: the comparison has to be byte-for-byte against what is
 * in the store, and a parse-then-reserialise round trip does not reliably reproduce
 * the original bytes (key order, spacing, number formatting).
 */
export async function kvGetRaw(key, { timeoutMs = 3000 } = {}) {
  if (!kvEnabled()) return null;
  const raw = await cmd(['GET', key], KV_RO, timeoutMs);
  return raw == null ? null : String(raw);
}

/**
 * Set `key` to `doc` ONLY IF it still holds `expectedRaw`. Returns true when the
 * write landed, false when someone else got there first.
 *
 * WHY THIS HAS TO EXIST. Every writer here is a read-modify-write, and there are
 * now two independent kinds of writer — the operator in /admin and the partners in
 * their own portal — hitting one document. Without a check, two overlapping
 * requests silently discard one of the changes: a partner adding a Carrd page
 * writes back the rows it read seconds ago, reverting an affiliate link the
 * operator just corrected, while both screens report success. That is money to the
 * wrong account with nothing in any log.
 *
 * Implemented as a Lua script because Upstash's REST API has no native CAS. An
 * ABSENT key is expressed as an expected value of null, so "create if it does not
 * exist yet" is the same operation and cannot race either.
 */
const CAS_LUA = [
  "local cur = redis.call('GET', KEYS[1])",
  "if (cur == false and ARGV[1] == '__ABSENT__') or (cur ~= false and cur == ARGV[1]) then",
  "  redis.call('SET', KEYS[1], ARGV[2])",
  '  return 1',
  'end',
  'return 0',
].join('\n');

export async function kvCompareAndSet(key, expectedRaw, doc, { timeoutMs = 3000 } = {}) {
  if (!kvEnabled()) throw new Error('KV not configured');
  const expected = expectedRaw == null ? '__ABSENT__' : String(expectedRaw);
  const result = await cmd(
    ['EVAL', CAS_LUA, '1', key, expected, JSON.stringify(doc)],
    KV_RW,
    timeoutMs
  );
  return Number(result) === 1;
}
