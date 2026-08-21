/**
 * /api/reco — Reco Social offer redirect.
 *
 * The destination lives in OFFER_LINKS (`reco-social-off`), not here. It used to be a
 * hardcoded network URL, which meant a live offer sat outside the one table that can
 * cap it, kill it (`enabled:false`), or be audited — and the tracking audit could not
 * see it at all. Kept as its own route because RS/index.html links to /api/reco.
 */
import { getConfiguredOfferLink, isSafeDestination } from './_lib/links-config.js';
import { gateLogRow, sendGateLog } from './_lib/gate-log.js';

export default async function handler(req, res) {
  const link = getConfiguredOfferLink('reco-social-off');
  // A disabled or missing slug must not fall back to a stale hardcoded URL — that is
  // exactly the kill switch failing open. 404 instead.
  if (!link || !link.destination || !isSafeDestination(link.destination)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).send('Not found');
  }
  const OFFER_BASE = link.destination + (link.destination.includes('?') ? '&' : '?') + 's1=';

  // A repeated query param arrives as an array on Vercel (?s3=a&s3=a → ['a','a']); take the first.
  const first = (v) => (Array.isArray(v) ? v[0] : v);

  const sub = (first(req.query.s1) || first(req.query.campid) || first(req.query.s2) || first(req.query.sub_id) || '').toString();

  /* SPRK-S1-ONLY v5 — one param out: the affiliate code, nothing else.
     s3 used to ride along here for a per-ad-account breakdown; it does not any more. An empty
     code appends NOTHING rather than shipping a blank sub-id the network would record as real. */
  const dest = sub ? OFFER_BASE + encodeURIComponent(sub) : OFFER_BASE.replace(/[?&][a-z0-9_]+=$/i, '');

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');

  // Log the click, THEN redirect — same contract as /api/click and /c/ (an await after
  // res.end() is not guaranteed to run on Vercel; capped + fail-open, cannot cost the click).
  let lp = '';
  try { lp = new URL(req.headers.referer || '').pathname; } catch { /* no referer */ }
  await sendGateLog(gateLogRow(req, {
    key: 'reco',
    lp,
    s1: sub,
    dest,
    ttclid: (first(req.query.ttclid) || '').toString(),
    via: 'direct',
  }));

  return res.redirect(302, dest);
}
