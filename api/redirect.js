export default function handler(req, res) {
  // ===================================================================
  // Affiliate destination — kept SERVER-SIDE so it never appears in the
  // landing page source. The landing page only ever links to /api/redirect.
  //
  // We route through the SPRK PERMANENT universal /aff_c link (sprktrax.org).
  // It is a stable token that NEVER expires (resolved by SPRK as long as its
  // row exists — like the scaler links), so this can't silently 404 a live ad.
  // The door fills the sub-id into the hidden offer URL (montrk3 Freecash) and
  // mints a click id, then 302s. The base ends with "&s1=" so the sub-id is
  // appended; it carries lander -> /api/redirect -> /aff_c -> offer, so the
  // affiliate's SubID still tracks. SPRK cloaks the real network downstream.
  // ===================================================================
  const OFFER_BASE = 'https://sprktrax.org/aff_c?t=GnVgg3ZCi82A52juG7Clydbm&s1=';

  // A repeated query param arrives as an array on Vercel (?s3=a&s3=a → ['a','a']); take the first
  // value so a coerced 'a,a' can never corrupt a forwarded slot.
  const first = (v) => (Array.isArray(v) ? v[0] : v);

  // Pull the tracking sub-id from the incoming click (any of these keys).
  const sub = (first(req.query.s1) || first(req.query.campid) || first(req.query.s2) || first(req.query.sub_id) || '').toString();

  /* SPRK-S1-ONLY v5 — one param out: the affiliate code, nothing else.
     s3 used to ride along here for a per-ad-account breakdown; it does not any more. An empty
     code appends NOTHING rather than shipping a blank sub-id the network would record as real. */
  const dest = sub ? OFFER_BASE + encodeURIComponent(sub) : OFFER_BASE.replace(/[?&][a-z0-9_]+=$/i, '');

  // Never cache a redirect, and don't leak the referrer onward.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');

  return res.redirect(302, dest);
}
