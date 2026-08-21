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
 *            Since 2026-08-21 the click IS logged (a `clicks` row via the gate
 *            ingest, entry='gate', key `c-<slug>`) — but no click_id rides the
 *            wire, so conversions are still matched only on what the network
 *            echoes back to /postback. For offers not in SPRK.
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
import { getPartnerRows } from '../_lib/partner-store.js';
import {
  DOOR_BASE,
  PASSTHROUGH_PARAMS,
  buildDirectUrl,
  extractSparkCode,
  getConfiguredOfferLink,
  isSafeDestination,
  offerLinkFor,
  partnerKey,
} from '../_lib/links-config.js';
import { gateLogRow, sendGateLog } from '../_lib/gate-log.js';

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

// buildDirectUrl moved to _lib/links-config.js — the admin panel shows scalers the
// exact URL their network receives, and a second copy here would drift silently:
// the screen would promise one sub-ID param while this redirect sent another.

export default async function handler(req, res) {
  const query = req.query || {};
  const slug = qparam(query, 'slug');

  noStore(res);

  if (!slug) {
    return res.status(404).send('Not found');
  }

  // Read UP HERE, before the lookup: the sub-ID now decides WHICH destination this
  // slug resolves to, not just what gets stamped on the way out.
  const subId = readSubId(query);

  // Committed config first; the in-memory store is only a scratch overlay holding
  // links added through the admin dashboard during one lambda's lifetime.
  const committed = getConfiguredOfferLink(slug);

  /**
   * Whose affiliate link does this click get?
   *
   * A PARTNER_LINKS row can swap the destination of a DIRECT-mode slug when the
   * inbound sub-ID is that partner's code — which is what lets two people run the
   * same landing page on two different affiliate accounts.
   *
   * Two things are deliberately narrow. Door-mode slugs are never consulted: those
   * attribute inside SPRK at the door, which owns the destination. And a code that
   * matches nothing falls through to the committed row SILENTLY — an observable
   * difference between "unknown code" and "known code" would turn this public URL
   * into an oracle for enumerating partner codes.
   *
   * The store read is skipped entirely for door-mode slugs and for a click with no
   * sub-ID. It is NOT free for house traffic on a direct slug — those carry a
   * sub-ID too — but the answer is cached per lambda for 30s and failures back off,
   * so the cost is one round trip per instance per half-minute, not per click.
   */
  let link = committed;
  if (committed && committed.mode === 'direct' && subId) {
    const rows = await getPartnerRows();     // fail-open: committed table on any error
    link = offerLinkFor(slug, subId, rows) || committed;
  }
  link = link || getOfferLink(slug);

  // The enabled check has to apply to BOTH sources: the store is seeded from the
  // same config, so a link disabled there would otherwise come back through the
  // fallback and redirect to the very destination we marked incomplete.
  if (!link || link.enabled === false) {
    return res.status(404).send('Not found');
  }

  // A partner destination is the one case where the URL a click leaves on is not
  // the one in this repo's committed config. Say so in the log rather than leaving
  // an invoice dispute with nothing to check against.
  if (link.partner) {
    console.log('[c] partner destination:', slug, '->', link.partner);
  }

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

  /**
   * The sub-ID sent onward MUST be the same string the routing decision was made
   * on, whenever a partner row won.
   *
   * They are computed differently by default: routing normalises with partnerKey()
   * (extractSparkCode + upper-case), the wire has always used extractSparkCode()
   * alone. So `?campid=edwin-01` routes as EDWIN-01 and then stamps `sub1=edwin-01`
   * — a value that reconciles against nothing in the partner's own reports. Worse,
   * toUpperCase() folds some non-ASCII onto ASCII, so a crafted campid could reach a
   * partner's row while carrying a code nobody can trace.
   *
   * Only the partner branch is changed: the house path keeps extractSparkCode so a
   * scaler already registered in SPRK on a lowercase custom code is unaffected.
   */
  const sparkCode = subId ? (link.partner ? partnerKey(subId) : extractSparkCode(subId)) : '';

  // Build URL using string concat to avoid searchParams re-serialization
  const extras = {};
  const s3 = qparam(query, 's3').trim();
  if (s3) extras.s3 = s3;
  const ttclid = qparam(query, 'ttclid').trim();
  if (ttclid) extras.ttclid = ttclid;

  const destUrl = buildDirectUrl(link.destination, forwardParam, sparkCode, extras);

  // Log the click, THEN redirect — same order and reason as /api/click: an await after
  // res.end() is not guaranteed to run on Vercel. Direct mode used to write NO row anywhere
  // ("conversions can only be matched on what the network echoes back"); this is the click-side
  // record it never had. Capped + fail-open, so it cannot cost the click.
  let lp = '';
  try { lp = new URL(req.headers.referer || '').pathname; } catch { /* no referer */ }
  await sendGateLog(gateLogRow(req, {
    key: `c-${slug}`,
    lp,
    s1: subId,
    dest: destUrl,
    ttclid,
    via: link.partner ? 'partner' : 'direct',
  }));

  return res.redirect(302, destUrl);
}
