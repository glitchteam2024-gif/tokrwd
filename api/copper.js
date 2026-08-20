export default function handler(req, res) {
  // ===================================================================
  // Cloaked redirect for the "Copper Play & Earn" offer.
  // Kept SERVER-SIDE so trendhavenn never appears in the page source.
  // The bridge page breaks the user out to /api/copper, which 302s here.
  // ===================================================================
  const OFFER_BASE = 'https://www.trendhavenn.com/copper-play-earn.html?campid=';

  // A repeated query param arrives as an array on Vercel (?s3=a&s3=a → ['a','a']); take the first.
  const first = (v) => (Array.isArray(v) ? v[0] : v);

  // Pull the tracking sub-id from the incoming click.
  const sub = (first(req.query.campid) || first(req.query.s1) || first(req.query.sub_id) || first(req.query.s2) || '').toString();

  /* SPRK-S1-ONLY v5 — one param out: the affiliate code, nothing else.
     s3 used to ride along here for a per-ad-account breakdown; it does not any more. An empty
     code appends NOTHING rather than shipping a blank sub-id the network would record as real. */
  const dest = sub ? OFFER_BASE + encodeURIComponent(sub) : OFFER_BASE.replace(/[?&][a-z0-9_]+=$/i, '');

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');

  return res.redirect(302, dest);
}
