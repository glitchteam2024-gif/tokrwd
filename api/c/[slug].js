/**
 * /api/c/[slug] — Offer Cloak Redirect
 * 
 * This is the second cloak layer. It does NOT filter bots — that's /r's job.
 * Its three jobs:
 *   1. Hide the real offer URL (never exposed in landing page source)
 *   2. Carry the campid through as the offer's sub-ID parameter
 *   3. Let you swap offers without editing/re-uploading landers
 * 
 * Example:
 *   /api/c/testerup-us-off?campid=TRAE_spark128_US_7659271051523686407_54f8fe
 *   → 302 to https://www.phef6trk.com/ZKTQ1K/2JSKXKP/?sub1=TRAE_spark128_US_...
 * 
 * The slug maps to a stored destination + forward_param in the Links Manager.
 */

import { getOfferLink } from '../_lib/store.js';

export default function handler(req, res) {
  const { slug } = req.query;

  if (!slug) {
    return res.status(404).send('Not found');
  }

  // Look up the offer link by slug
  const link = getOfferLink(slug);

  if (!link || !link.destination) {
    return res.status(404).send('Not found');
  }

  // Get the campid from query params (try multiple common param names)
  const campid = req.query.campid || req.query.cid || req.query.c || req.query.s1 || req.query.sub1 || '';

  // Build the final destination URL
  let dest = link.destination;
  
  // Append the campid using the configured forward param
  if (campid && link.forward_param) {
    // Check if destination already has query params
    const separator = dest.includes('?') ? '&' : '?';
    dest = dest + separator + encodeURIComponent(link.forward_param) + '=' + encodeURIComponent(campid);
  }

  // Also forward s3 (ad account) if present
  const s3 = req.query.s3 || '';
  if (s3) {
    const sep2 = dest.includes('?') ? '&' : '?';
    dest = dest + sep2 + 's3=' + encodeURIComponent(s3);
  }

  // Never cache, never leak referrer
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  return res.redirect(302, dest);
}
