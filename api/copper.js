export default function handler(req, res) {
  // ===================================================================
  // Cloaked redirect for the "Copper Play & Earn" offer.
  // Kept SERVER-SIDE so trendhavenn never appears in the page source.
  // The bridge page breaks the user out to /api/copper, which 302s here.
  // ===================================================================
  const OFFER_BASE = 'https://www.trendhavenn.com/copper-play-earn.html?campid=';

  // Pull the tracking sub-id from the incoming click.
  const sub = (req.query.campid || req.query.s1 || req.query.sub_id || req.query.s2 || '').toString();

  const dest = OFFER_BASE + encodeURIComponent(sub);

  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');

  return res.redirect(302, dest);
}
