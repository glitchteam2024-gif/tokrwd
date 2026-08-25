export default function handler(req, res) {
  // ===================================================================
  // Affiliate destination — kept SERVER-SIDE so it never appears in the
  // landing page source. The landing page only ever links to /api/affrkr.
  // The base URL already ends with "&s1=" so the sub-id is appended to it.
  // ===================================================================
  const OFFER_BASE = 'https://affrkr.com/?es4v=eht2M8VP7gzs04HBvLdwvNC%2fsOXuQ0JEvQJDRoz7h5U%3d&s1=';

  // A repeated query param arrives as an array on Vercel (?s3=a&s3=a → ['a','a']); take the first.
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
