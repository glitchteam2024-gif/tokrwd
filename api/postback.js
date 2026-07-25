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

  // Without POSTBACK_KEY in the environment the key is random per lambda, so
  // nothing a network sends can ever match and every conversion is dropped below.
  // The response stays 200 either way, so this log line is the only symptom —
  // without it the failure is completely invisible.
  if (!settings.postback_key_from_env) {
    console.error('[postback] POSTBACK_KEY is not set — every conversion will be rejected');
  }

  if (key !== settings.postback_key) {
    // Answer 200 regardless: a non-200 makes networks retry, and a distinguishable
    // response would let a caller probe for a valid key. Log so it is diagnosable.
    console.warn('[postback] rejected: key mismatch', { campid, offer, hasKey: !!key });
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
