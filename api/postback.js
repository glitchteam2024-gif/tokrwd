/**
 * /api/postback — S2S Postback Handler
 * 
 * Receives conversion notifications from affiliate networks.
 * URL format: /api/postback?campid={campid}&payout={payout}&key=YOUR_KEY
 * 
 * The affiliate network fires this URL on conversion, carrying the campid
 * (which was the sub-ID all along) back to us. This closes the attribution loop.
 * 
 * You give the network this URL:
 *   https://yourdomain.com/api/postback?campid={sub1}&payout={payout}&key=YOUR_KEY
 * 
 * Replace {sub1} and {payout} with the network's macros.
 */

import { getSettings, logPostback } from './_lib/store.js';

export default function handler(req, res) {
  // Accept both GET and POST (networks vary)
  const params = { ...req.query, ...(req.body || {}) };

  const campid = params.campid || params.cid || params.sub1 || params.click_id || '';
  const payout = params.payout || params.amount || params.revenue || '0';
  const key = params.key || '';
  const offer = params.offer || params.offer_id || '';
  const status = params.status || 'approved';

  // Validate the postback key
  const settings = getSettings();
  if (key !== settings.postback_key) {
    // Silent fail — don't reveal that the key is wrong
    return res.status(200).send('ok');
  }

  // Log the conversion
  logPostback({
    campid,
    payout: parseFloat(payout) || 0,
    offer,
    status,
    ip: req.headers['x-real-ip'] || req.headers['x-forwarded-for']?.split(',')[0] || '',
  });

  // Always return 200 OK (networks retry on non-200)
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send('ok');
}
