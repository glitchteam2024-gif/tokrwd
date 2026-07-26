/**
 * /api/c/[slug] — Offer redirect
 *
 * Two jobs:
 *   1. Hide the real destination (never exposed in landing page source)
 *   2. Carry the affiliate's spark code through to the offer as the sub-ID
 *
 * A link resolves in one of two modes (see api/_lib/links-config.js):
 *
 *   door   → 302 to sprktrax.org/api/link/<doorSlug>?s1=<spark code>
 *            The door resolves the affiliate, writes a `clicks` row, mints a
 *            click_id, stamps s1/s2/s4/s5, applies the offer's cap and `pulled`
 *            kill switch, and only then redirects to the network. This is the
 *            only mode that attributes a conversion to an affiliate.
 *
 *   direct → 302 straight to the network with the sub-ID appended.
 *            No clicks row, no click_id. Conversions can only be matched on what
 *            the network echoes back to /postback. For offers not in SPRK.
 *
 * Example (door):
 *   /c/freecash?campid=SPK-A1B2-C3D4
 *   → 302 https://sprktrax.org/api/link/freecash?s1=SPK-A1B2-C3D4
 *
 * Example (direct):
 *   /c/testerup-us-off?sub1=SPK-A1B2-C3D4
 *   → 302 www.phef6trk.com/ZKTQ1K/2JSKXKP/?sub1=SPK-A1B2-C3D4   (scheme omitted so the
 *     tracking audit reads this as documentation, not as a live network link)
 */

import { getOfferLink } from '../_lib/store.js';
import {
  DOOR_BASE,
  PASSTHROUGH_PARAMS,
  extractSparkCode,
  getConfiguredOfferLink,
  isSafeDestination,
} from '../_lib/links-config.js';

/** Read a query param that may arrive as a repeated key (Vercel gives an array). */
function qparam(query, name) {
  const v = query[name];
  if (Array.isArray(v)) return v.find(x => x != null && String(x).trim() !== '') || '';
  return v == null ? '' : String(v);
}

/** First non-empty value across the sub-ID aliases a lander or ad might use. */
function readSubId(query) {
  for (const name of ['campid', 'cid', 'c', 's1', 'sub1']) {
    const v = qparam(query, name).trim();
    if (v) return v;
  }
  return '';
}

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}

/**
 * Build the direct-mode destination URL using string concatenation instead of
 * URL.searchParams to avoid re-serialization that mutates the query string.
 * 
 * The issue: new URL(dest).searchParams.set() round-trips the existing query,
 * which rewrites `extra=a%20b` → `extra=a+b` and `?flag` → `?flag=`. Tracker
 * tokens can be sensitive to both.
 */
function buildDirectUrl(destination, forwardParam, subId, extras) {
  let url = destination;
  const sep = url.includes('?') ? '&' : '?';
  const parts = [];

  if (subId) {
    parts.push(encodeURIComponent(forwardParam) + '=' + encodeURIComponent(subId));
  }

  // Append extras (ttclid, s3) without touching the existing query
  for (const [key, val] of Object.entries(extras)) {
    if (val) {
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(val));
    }
  }

  if (parts.length > 0) {
    url += sep + parts.join('&');
  }

  return url;
}

export default function handler(req, res) {
  const query = req.query || {};
  const slug = qparam(query, 'slug');

  noStore(res);

  if (!slug) {
    return res.status(404).send('Not found');
  }

  // Committed config first; the in-memory store is only a scratch overlay holding
  // links added through the admin dashboard during one lambda's lifetime.
  const link = getConfiguredOfferLink(slug) || getOfferLink(slug);

  // The enabled check has to apply to BOTH sources: the store is seeded from the
  // same config, so a link disabled there would otherwise come back through the
  // fallback and redirect to the very destination we marked incomplete.
  if (!link || link.enabled === false) {
    return res.status(404).send('Not found');
  }

  const subId = readSubId(query);

  // ── Door mode ──────────────────────────────────────────────────────────────
  if (link.mode === 'door') {
    // The door 404s without an s1. Fail here instead, on our side, where it is
    // visible — rather than emitting a URL that looks like a door outage.
    if (!subId) {
      return res.status(404).send('Not found');
    }

    const dest = new URL(`${DOOR_BASE}/${encodeURIComponent(link.doorSlug || slug)}`);
    dest.searchParams.set('s1', extractSparkCode(subId));

    // s3 is only honoured downstream when its sprk_sig HMAC rides along with it;
    // forward both untouched and let the door decide whether to trust them.
    for (const name of PASSTHROUGH_PARAMS) {
      const v = qparam(query, name).trim();
      if (v) dest.searchParams.set(name, v);
    }

    return res.redirect(302, dest.toString());
  }

  // ── Direct mode ────────────────────────────────────────────────────────────
  if (!link.destination || !isSafeDestination(link.destination)) {
    return res.status(404).send('Not found');
  }

  const forwardParam = link.forwardParam || link.forward_param || 'sub1';
  const sparkCode = subId ? extractSparkCode(subId) : '';

  // Build URL using string concat to avoid searchParams re-serialization
  const extras = {};
  const s3 = qparam(query, 's3').trim();
  if (s3) extras.s3 = s3;
  const ttclid = qparam(query, 'ttclid').trim();
  if (ttclid) extras.ttclid = ttclid;

  const destUrl = buildDirectUrl(link.destination, forwardParam, sparkCode, extras);

  return res.redirect(302, destUrl);
}
