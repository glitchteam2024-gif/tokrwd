/**
 * /api/lander-publish — the door SPRK's build cron writes generated landers through.
 *
 * SPRK generates a lander, assembles it, grades it, and — only then — PUTs the approved
 * bytes here (api-src/cron/build-landers.ts, the `★ PHASE 8 GOES HERE` marker). This is
 * the exact inverse of gate-log.js's ingest: tokrwd calls SPRK to log a click, SPRK calls
 * tokrwd to publish a page, and neither ever holds the other's database key. tokrwd has no
 * Supabase access and never will.
 *
 *   POST|PUT /api/lander-publish
 *   x-lander-publish-key: <LANDER_PUBLISH_KEY>
 *   Content-Type: application/json
 *
 *   { "action": "publish", "slug": "<10 chars>", "html": "<!doctype html>…",
 *     "sha256": "<64 hex>", "republish": false }
 *   { "action": "disable", "slug": "<10 chars>" }
 *   { "action": "status",  "slug": "<10 chars>" }
 *
 * ⚠️ THE SHA IS RECOMPUTED HERE, OVER THE BYTES THAT ARRIVED. The whole scheme upstream is
 * content-addressed — a reviewer approves a hash, api-src/custom-landers.ts:435 checks the
 * bytes it reads back against the hash it was given — and every one of those checks is
 * decoration if the last hop stores whatever it is handed under whatever hash it is told.
 * A claimed hash that does not match the body is a 422 and nothing is written. This is the
 * one rule in this file that cannot be relaxed for convenience.
 *
 * WHAT IS HASHED IS WHAT IS STORED. The sha covers the HTML DOCUMENT, not the JSON envelope
 * it travelled in — the same string that comes back out of /u/<slug>. Decoding a JSON string
 * is lossless for the text inside it, so `sha256Hex(body.html)` is a hash of the received
 * document, not of a reserialisation of it.
 *
 * ⚠️ THIS IS NOT A BROWSER ENDPOINT. No CORS headers, no OPTIONS handling, and a request
 * carrying an Origin header is refused outright: a server-to-server fetch never sets one,
 * and a browser always does on a cross-origin POST. That is the whole CSRF story here.
 */

import { timingSafeEqual } from 'node:crypto';
import { kvEnabled, kvCompareAndSet } from './_lib/kv.js';
import {
  MAX_HTML_BYTES,
  SHA256_RE,
  isValidSlug,
  landerKey,
  readLanderDoc,
  sha256Hex,
} from './_lib/lander-store.js';

/**
 * The secret. ITS OWN VARIABLE, not ADMIN_WRITE_KEY — build-landers.ts:634 spells out why:
 * one leaked key must not do two jobs. ADMIN_WRITE_KEY re-points paid traffic from the
 * links panel; this one publishes pages. They are separate blast radii.
 *
 * NO FALLBACK, unlike api/admin/data.js:118-121. That one falls back to ADMIN_KEY so the
 * dashboard works on day one, and pays for it with a committed default. There is no day-one
 * convenience to buy here: an unset secret means writes are REFUSED, never that they are
 * open. An endpoint that publishes arbitrary HTML on our domain has no safe open state.
 */
const PUBLISH_KEY = process.env.LANDER_PUBLISH_KEY || '';

/** Constant-time compare. Lengths first, so it never throws. Same as data.js:88-93. */
function secretEq(a, b) {
  const A = Buffer.from(String(a == null ? '' : a), 'utf8');
  const B = Buffer.from(String(b == null ? '' : b), 'utf8');
  if (A.length === 0 || A.length !== B.length) return false;
  return timingSafeEqual(A, B);
}

/**
 * An outer bound on the envelope, checked before anything is decoded, so a hostile body
 * cannot be paid for in memory before it is rejected. The real rule is MAX_HTML_BYTES on
 * the document itself; this is 2x that, which leaves room for JSON escaping and the other
 * fields while still being a bound.
 */
const MAX_BODY_BYTES = MAX_HTML_BYTES * 2;

function deny(res, code, error, extra) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(code).json(Object.assign({ ok: false, error }, extra || {}));
}

/** Vercel parses application/json for us; anything else arrives as a string or a Buffer. */
function readBody(req) {
  const b = req.body;
  if (b == null || b === '') return {};
  if (typeof b === 'string') return JSON.parse(b);
  if (Buffer.isBuffer(b)) return JSON.parse(b.toString('utf8'));
  if (typeof b === 'object' && !Array.isArray(b)) return b;
  throw new Error('body is not an object');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST' && req.method !== 'PUT') {
    res.setHeader('Allow', 'POST, PUT');
    return deny(res, 405, 'Method not allowed');
  }

  // See the header: a real caller here never sets Origin.
  if (req.headers.origin) return deny(res, 403, 'Not a browser endpoint');

  if (!PUBLISH_KEY) {
    console.error('[lander-publish] LANDER_PUBLISH_KEY is unset — refusing every write.');
    return deny(res, 401, 'Unauthorized');
  }
  // Header only. A credential in a query string lands in every request log (data.js:123).
  if (!secretEq(req.headers['x-lander-publish-key'] || '', PUBLISH_KEY)) {
    return deny(res, 401, 'Unauthorized');
  }

  const declared = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return deny(res, 413, 'Body too large', { max_body_bytes: MAX_BODY_BYTES });
  }

  let body;
  try {
    body = readBody(req);
  } catch (err) {
    return deny(res, 400, 'Body must be JSON');
  }

  const action = String(body.action || (req.query || {}).action || '').trim();
  const slug = String(body.slug == null ? '' : body.slug).trim();

  /* Shape before the key is built — the same gate /u/ applies, for the same reason. An
   * authenticated caller is still not allowed to name a KV key of its own choosing. */
  if (!isValidSlug(slug)) return deny(res, 400, 'slug must be 10 characters from the minter alphabet');

  if (!kvEnabled()) {
    /* Say so out loud rather than answering 200 to a write that went nowhere. Env vars bind
     * at BUILD time (kv.js:20-21), so this survives until somebody redeploys. */
    console.error('[lander-publish] KV is not configured on this deploy — nothing can be published.');
    return deny(res, 503, 'No datastore connected');
  }

  let current;
  try {
    current = await readLanderDoc(slug, { timeoutMs: 3000 });
  } catch (err) {
    /* Corrupt or unreachable. Refuse: a blind overwrite on top of a document we could not
     * read is exactly how a takedown gets silently undone. */
    console.error('[lander-publish] cannot read slug=' + slug + ':', err && err.message);
    return deny(res, 503, 'Could not read the current document');
  }

  const now = new Date().toISOString();

  if (action === 'status') {
    const d = current.doc;
    return res.status(200).json({
      ok: true,
      exists: current.status === 'ok',
      // Never the html. This answers "did my publish land", not "give me the page back".
      disabled: !!(d && d.disabled),
      sha256: (d && typeof d.sha256 === 'string') ? d.sha256 : '',
      bytes: (d && Number.isFinite(d.bytes)) ? d.bytes : null,
      published_at: (d && d.published_at) || '',
      disabled_at: (d && d.disabled_at) || '',
    });
  }

  if (action === 'disable') {
    /* ── THE TAKEDOWN ────────────────────────────────────────────────────────────────────
     * This is the ONLY thing on this side that can stop a page. tokrwd cannot read
     * custom_landers.status and has no Supabase key, so flipping a row in Postgres does
     * NOT reach the bytes being served here — SPRK has to make this call.
     *
     * A tombstone, not a DELETE, and the html is dropped so the bytes leave the store. See
     * lander-store.js's header for why deleting loses the race against a retried publish.
     * Writing a tombstone for a slug that was never here is deliberate and correct: it
     * pre-empts a publish that is still in flight. */
    if (current.status === 'ok' && current.doc.disabled) {
      return res.status(200).json({ ok: true, slug, disabled: true, already: true, disabled_at: current.doc.disabled_at || '' });
    }
    const prev = current.doc || {};
    const tomb = {
      v: 1,
      slug,
      sha256: typeof prev.sha256 === 'string' ? prev.sha256 : '',
      bytes: Number.isFinite(prev.bytes) ? prev.bytes : 0,
      disabled: true,
      published_at: prev.published_at || '',
      disabled_at: now,
    };
    const ok = await kvCompareAndSet(landerKey(slug), current.raw, tomb, { timeoutMs: 3000 });
    if (!ok) return deny(res, 409, 'The document changed while the takedown was being written — retry');
    return res.status(200).json({
      ok: true,
      slug,
      disabled: true,
      already: false,
      disabled_at: now,
      /* The honest part. The write landed; the edge has not caught up. /u/[slug].js caches
       * 60s fresh + 60s stale-while-revalidate and there is no purge, so a visitor can
       * still be served this page for up to ~120s per region. */
      stale_for_seconds: 120,
    });
  }

  if (action !== 'publish') return deny(res, 400, 'action must be publish, disable or status');

  const html = body.html;
  if (typeof html !== 'string' || html === '') return deny(res, 400, 'html must be a non-empty string');

  /* BYTE length, not string length — the hash is over utf8 (lander-store.js:sha256Hex) and
   * so is the cap the SPRK bucket enforces (api-src/custom-landers.ts:457 makes the same
   * point). A page of astral characters is bigger than its .length says. */
  const bytes = Buffer.byteLength(html, 'utf8');
  if (bytes > MAX_HTML_BYTES) {
    return deny(res, 413, 'html exceeds the size cap', { bytes, max_html_bytes: MAX_HTML_BYTES });
  }

  const claimed = String(body.sha256 == null ? '' : body.sha256).trim().toLowerCase();
  if (!SHA256_RE.test(claimed)) return deny(res, 400, 'sha256 must be 64 lowercase hex characters');

  // ⚠️ The rule from the header. Computed here, over what actually arrived.
  const actual = sha256Hex(html);
  if (actual !== claimed) {
    console.error('[lander-publish] sha mismatch for slug=' + slug + ' claimed=' + claimed + ' actual=' + actual);
    return deny(res, 422, 'sha256 does not match the bytes received', { expected: claimed, actual, bytes });
  }

  /* A killed slug stays killed unless somebody says otherwise in so many words. Without
   * this, a retried cron tick republishes a page that was taken down an hour ago and
   * nothing anywhere records that it came back. */
  if (current.status === 'ok' && current.doc.disabled && body.republish !== true) {
    return deny(res, 409, 'This slug was disabled. Send republish:true to bring it back.', {
      disabled_at: current.doc.disabled_at || '',
    });
  }

  const doc = {
    v: 1,
    slug,
    sha256: actual,
    bytes,
    html,
    disabled: false,
    published_at: now,
    disabled_at: '',
  };

  /* Compare-and-swap, not SET. The race that matters is a publish landing on top of a
   * takedown that arrived between our read and our write — kv.js:118-133 exists for the
   * same class of bug on the partner table. Losing the swap is a 409, not a retry loop:
   * the caller knows whether republishing is still the right thing to do, we do not. */
  const ok = await kvCompareAndSet(landerKey(slug), current.raw, doc, { timeoutMs: 5000 });
  if (!ok) return deny(res, 409, 'The document changed while this publish was being written — retry');

  return res.status(200).json({
    ok: true,
    slug,
    sha256: actual,
    bytes,
    published_at: now,
    path: '/u/' + slug,
    /* An existing page's old bytes can still be served from the edge for this long after a
     * republish. Anything that verifies the live URL right after publishing has to allow
     * for it — see /u/[slug].js's cache note. */
    stale_for_seconds: 120,
  });
}
