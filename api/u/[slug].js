/**
 * /api/u/[slug] — serve one generated lander (routed at /u/<slug>, vercel.json).
 *
 * These pages are not in git. SPRK generates them (api-src/cron/build-landers.ts), grades
 * them, and PUTs the approved bytes here through /api/lander-publish; this route is the
 * only thing that hands them to a visitor. tokrwd holds no Supabase key and never will
 * (plan §8), so KV is the whole truth on this side of the boundary.
 *
 * THE BYTES ARE THE SAME FOR EVERY VISITOR. The page reads its SubID out of its own
 * querystring at runtime and stamps lp= from location.pathname, so nothing about the
 * response varies per click — which is what makes it safe to put in a shared cache at all.
 * See the cache note below for the number and what it costs a takedown.
 *
 * A MISS AND A TAKEDOWN LOOK IDENTICAL: 404, plain text, exactly what click.js:110 answers
 * an off-allowlist `u`. Not an error page, not a redirect, no explanation. A page that has
 * been killed must look like it was never here — whoever is holding the link (an ad
 * network reviewer, the affiliate, a competitor) learns nothing about why it stopped.
 */

import { isValidSlug, readLanderDoc, servableHtml } from '../_lib/lander-store.js';

/* ── THE CACHE WINDOW ───────────────────────────────────────────────────────────────────
 * 60 seconds fresh, 60 seconds stale-while-revalidate. WORST CASE A KILLED PAGE KEEPS
 * SERVING IS ~120 SECONDS per edge region, and that is the honest number: there is no
 * purge on this path (see api/lander-publish.js — a disable writes a tombstone into KV,
 * it cannot reach into Vercel's cache). 60/60 is the trade: low enough that a takedown is
 * a two-minute wait rather than an hour, high enough that a burst of paid traffic is not
 * 1:1 KV reads.
 *
 * `Vercel-CDN-Cache-Control` is the load-bearing one, and it is not belt-and-braces.
 * vercel.json's catch-all `/(.*)` rule pins `Cache-Control: no-store` on every response
 * this project sends, and config headers are applied by the routing layer on top of what
 * the function set — so a plain `Cache-Control` here may never survive to the edge.
 * `Vercel-CDN-Cache-Control` is matched by no rule in that file, and takes precedence over
 * `Cache-Control` for Vercel's own cache. Setting all three means the edge caches whether
 * or not the catch-all wins, and the worst case if it does win is LESS caching (browsers
 * get no-store), never more — which is the safe direction for a takedown.
 *
 * `max-age=0` on the client half is deliberate: only the SHARED cache may hold this page.
 * A visitor holding it in their own browser is a copy no takedown can ever reach. */
const EDGE_MAX_AGE = 60;
const EDGE_SWR = 60;

/** Headers every response here carries, cached or not. Matches api/c/[slug].js:50-56. */
function baseHeaders(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}

function cacheablePage(res) {
  const shared = `public, s-maxage=${EDGE_MAX_AGE}, stale-while-revalidate=${EDGE_SWR}`;
  res.setHeader('Vercel-CDN-Cache-Control', shared);
  res.setHeader('CDN-Cache-Control', shared);
  res.setHeader('Cache-Control', `public, max-age=0, ${shared}`);
}

/**
 * ⚠️ NEVER CACHE A NON-PAGE. A cached 404 is a takedown that cannot be undone for the
 * length of the window, and a cached 503 turns a 200ms KV blip into a two-minute outage
 * on a page that is perfectly fine. Every non-200 leaves this function uncacheable at
 * every layer.
 */
function noStore(res) {
  const v = 'no-store, no-cache, must-revalidate, max-age=0';
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Cache-Control', v);
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

function notFound(res) {
  noStore(res);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(404).send('Not found');
}

export default async function handler(req, res) {
  baseHeaders(res);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    noStore(res);
    res.setHeader('Allow', 'GET, HEAD');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(405).send('Method not allowed');
  }

  const raw = (req.query || {}).slug;
  const slug = Array.isArray(raw) ? String(raw[0] || '') : String(raw == null ? '' : raw);

  /* Shape first, KV second. An unbounded slug is a key-injection surface against our own
   * namespace (lander-store.js header), and it is also free to answer: a string that the
   * minter could not have produced cannot name a page, so there is nothing to look up. */
  if (!isValidSlug(slug)) return notFound(res);

  let found;
  try {
    found = await readLanderDoc(slug);
  } catch (err) {
    /* Corrupt document, or the store did not answer. Neither is "no such page" — see
     * lander-store.js:readLanderDoc. 503 so a monitor can see it and so nothing caches it. */
    console.error('[u] store unreadable for slug=' + slug + ':', err && err.message);
    noStore(res);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(503).send('Temporarily unavailable');
  }

  if (found.status === 'unconfigured') {
    /* Nothing is wired up. Still 404 — we have no bytes and must not invent any — but this
     * is a deployment fault wearing a missing page's clothes, so it says so in the log
     * instead of being indistinguishable from a bad link. KV_REST_API_URL /
     * KV_REST_API_TOKEN bind at BUILD time (kv.js:20-21): setting them needs a redeploy. */
    console.error('[u] KV is not configured on this deploy — every /u/ page will 404.');
    return notFound(res);
  }

  const html = found.status === 'ok' ? servableHtml(found.doc) : null;
  if (html === null) return notFound(res);

  /* No explicit Content-Length. The platform compresses this response, and a length we
   * computed over the uncompressed string would then describe a body nobody is sending. */
  cacheablePage(res);
  return res.status(200).send(html);
}
