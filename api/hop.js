/**
 * /api/hop — which landing page a prelander should open for one affiliate code.
 *
 *   GET /api/hop?c=SPK-AAAA-BBBB
 *   200 {}                                  no switch (the overwhelming majority)
 *   200 {"t":"/gravypassusa2.html"}         same offer, another landing page
 *   200 {"t":"/GP/GP22/go/","y":"SPK-…"}    another offer: open t, and carry y instead
 *
 * Called by the prelander's own script, same-origin, once per view that carries a code.
 * The table behind it is published by /api/switch-publish and read through
 * _lib/hop-store.js, which owns the validation.
 *
 * ⚠️ NEVER A 5xx, AND NEVER AN ERROR BODY. Every failure is `200 {}`, which the page reads
 * as "no switch" — the exact behaviour every prelander had before this endpoint existed. A
 * visitor must never be worse off because this lookup could not be made.
 *
 * ⚠️ THE ANSWER IS THE SAME FOR EVERY VISITOR HOLDING THE CODE. Nothing here reads the user
 * agent, the address or the country. The prelander's destination must never depend on who
 * is looking; that is the no-cloaking rule and it applies to this hop like any other.
 *
 * CACHING
 *   Browser:  Cache-Control: no-store, always — a switch that ends must take effect on the
 *             next view, not after some phone's private copy expires.
 *   Edge:     Vercel-CDN-Cache-Control: s-maxage=15 when the answer came from a document
 *             (fresh or last good), so a burst of paid views on one code costs one lambda
 *             call per 15 s per region. When no document could be read at all, no-store:
 *             caching "no switch" through a KV blip would hold a live switch off for the
 *             whole window for no reason (api/u/[slug].js:59-72, the same rule).
 *   vercel.json's catch-all pins Cache-Control on every response; Vercel-CDN-Cache-Control
 *   is matched by no rule there, which is why it carries the edge window (api/u/[slug].js
 *   explains the precedence).
 */

import { HOP_QUERY_RE, lookupHop } from './_lib/hop-store.js';

/** Edge window for an answer read from a document. */
const EDGE_MAX_AGE = 15;

function baseHeaders(res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}

function edgeCache(res) {
  res.setHeader('Vercel-CDN-Cache-Control', `s-maxage=${EDGE_MAX_AGE}`);
}

function edgeNoStore(res) {
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
}

/** The code from ?c=, uppercased; '' when absent or not a code. */
function codeOf(req) {
  const q = (req && req.query) || {};
  const raw = Array.isArray(q.c) ? q.c[0] : q.c;
  const code = String(raw == null ? '' : raw).trim().toUpperCase();
  return HOP_QUERY_RE.test(code) ? code : '';
}

export default async function handler(req, res) {
  try {
    baseHeaders(res);

    if (req.method !== 'GET') {
      edgeNoStore(res);
      res.setHeader('Allow', 'GET');
      return res.status(405).json({});
    }

    const code = codeOf(req);
    if (!code) {
      edgeNoStore(res);
      return res.status(200).json({});
    }

    const { hop, state } = await lookupHop(code);
    if (state === 'fresh' || state === 'last-good') edgeCache(res); else edgeNoStore(res);

    // Whitelisted again on the way out: nothing but t and y can reach the page.
    const body = hop && typeof hop.t === 'string'
      ? (typeof hop.y === 'string' && hop.y ? { t: hop.t, y: hop.y } : { t: hop.t })
      : {};
    return res.status(200).json(body);
  } catch (e) {
    // Last line of defence for the "never 5xx" rule. Headers may already be partly set.
    try {
      res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({});
    } catch (e2) {
      return undefined;
    }
  }
}
