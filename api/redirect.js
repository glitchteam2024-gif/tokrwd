export default function handler(req, res) {
  // ===================================================================
  // Affiliate destination — kept SERVER-SIDE so it never appears in the
  // landing page source. The landing page only ever links to /api/redirect.
  // The base URL already ends with "&s1=" so the sub-id is appended to it.
  // ===================================================================
  const OFFER_BASE = 'https://t.afftrackr.com/?f5c=eRFLNrC%2fv%2b3lvLezKZZDJuYeYtBuP3PfvQJDRoz7h5U%3d&s1=';

  // Pull the tracking sub-id from the incoming click (any of these keys).
  const sub = (req.query.s1 || req.query.campid || req.query.s2 || req.query.sub_id || '').toString();

  const dest = OFFER_BASE + encodeURIComponent(sub);

  // Never cache a redirect, and don't leak the referrer onward.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');

  return res.redirect(302, dest);
}
