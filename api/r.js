/**
 * /api/r — Front Routing Endpoint
 *
 * The Carrd page POSTs here with campid and carrd URL. This endpoint answers ONE
 * question: which landing page does this click belong on?
 *
 *   Always → { url: "https://www.tokrwd.co/pre?s1=…&to=/CLFC" }
 *
 * That URL is the PRELANDER, not the lander: /pre hands the visitor to their real
 * browser before the offer page, because TikTok's in-app webview has been failing on
 * real devices. See the prelander section in _lib/links-config.js. When the prelander
 * is switched off (PRELANDER_ENABLED) the same call returns the lander directly.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS ENDPOINT DOES NOT DECIDE WHO IS REAL. That is deliberate (2026-08-17).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * It used to. It scored the visitor on user-agent, device class, ttclid presence and
 * a client-hint contradiction check, and returned {} for anything that failed — at
 * which point the Carrd embed loaded /js/decoy.js and rendered a FAKE STORE. That is
 * the textbook definition of cloaking: an ad reviewer on a desktop with no ttclid saw
 * a different site from the buyer on a phone. It is what gets a domain flagged by
 * TikTok ad review AND by Safari/Chrome deceptive-site protection, and flagging kills
 * every campaign on the domain at once.
 *
 * So there is now exactly one answer for every visitor. A crawler, a reviewer, a
 * desktop buyer and a phone buyer all get the same landing page. Removing the gates
 * does NOT weaken attribution, because attribution was never enforced here:
 *
 *   · the spark code still rides as s1 and is still the whole attribution chain;
 *   · the DOOR is the real gate — sprktrax.org/api/link/<slug> 404s any click whose
 *     s1 is not a valid spark code, so an untagged visit fails closed at the point
 *     where money is involved, not at the point where a page is rendered.
 *
 * An untagged visitor now reaches a real landing page instead of a fake store. If
 * they tap through, the door refuses them. That is the correct shape: identical
 * content for everyone, money gated at the money hop.
 *
 * DO NOT reintroduce a user-agent test, a device test, a ttclid requirement or a
 * decoy here. `node api/_lib/_tracking-audit.test.mjs` fails the build if the decoy
 * or a UA gate comes back.
 *
 * WHICH lander a visitor gets is decided by resolveLander() in _lib/links-config.js —
 * `lp=` override, then campaign, then `o=` offer key, then CARRD_ROUTES, then the
 * default. It lives there so the admin dashboard's preview and live traffic run the
 * same code.
 */

import { getStore } from './_lib/store.js';
import { getPartnerRows } from './_lib/partner-store.js';
import {
  buildLanderUrl,
  extractSparkCode,
  resolveLander,
  wrapPrelander,
} from './_lib/links-config.js';

export default async function handler(req, res) {
  // CORS headers for cross-origin Carrd requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only accept POST. This is a transport rule, not a visitor test — a GET carries
  // no body to route on, so there is nothing to answer.
  if (req.method !== 'POST') {
    return res.status(200).json({});
  }

  const body = req.body || {};
  const campid = body.c || '';
  const carrdUrl = body.h || '';

  // === ROUTE ===

  const store = getStore();
  let { url: landerUrl, source, offer, offerConflict, partner } = resolveLander({
    carrdUrl,
    campid,
    campaigns: store.campaigns,
  });

  // Only a Carrd page that matched NOTHING committed can be one the admin panel
  // assigned since the last deploy — every other outcome already won on a rule that
  // lives in this bundle. So the store is read only on that miss, and existing
  // traffic never pays for the lookup.
  //
  // `default` is not a failure: an unassigned page still converts on the default
  // offer. This just gives a freshly-assigned page a chance to be found first.
  if (source === 'default') {
    const partners = await getPartnerRows();   // fail-open: committed table on any error
    const retry = resolveLander({ carrdUrl, campid, campaigns: store.campaigns, partners });
    if (retry.source !== 'default') {
      ({ url: landerUrl, source, offer, offerConflict, partner } = retry);
    }
  }

  if (partner) {
    console.log('[r] partner route:', partner, '->', landerUrl);
  }

  if (!landerUrl) {
    // No landers configured at all — there is genuinely nothing to return.
    return res.status(200).json({});
  }

  // An `lp=` override is a deliberate, temporary test route — log it so a lander
  // left pinned on a live ad link shows up in the function logs instead of
  // quietly outliving the test it was created for.
  if (source === 'override') {
    console.log('[r] lander override active:', landerUrl, offer ? `(offer: ${offer})` : '(offer: unregistered)');
  }

  // The ad's `o=` and the overridden page disagree about which offer this is. The
  // click is NOT dropped — a paid click is worth more than a clean log line, and
  // the override is the operator's explicit instruction — but every conversion
  // from here credits `landerOffer`, not the offer the ad was bought against.
  if (offerConflict) {
    console.warn(
      `[r] OFFER MISMATCH: ad link says o=${offerConflict.adOffer} but ${landerUrl} fires ` +
      `${offerConflict.landerOffer}. Conversions will credit ${offerConflict.landerOffer}.`
    );
  }

  // A campid carrying no usable spark code still gets the landing page — the content
  // must not depend on who is asking. It is logged, because in PAID traffic it means
  // an ad link was built wrong and those clicks will be refused at the door.
  if (!extractSparkCode(campid)) {
    console.warn('[r] no spark code in campid:', JSON.stringify(campid).slice(0, 120),
      '— serving the lander; the door will refuse this click if it converts.');
  }

  const builtLanderUrl = buildLanderUrl(landerUrl, campid, carrdUrl);

  if (!builtLanderUrl) {
    // buildLanderUrl failed (bad lander URL) → nothing routable to return
    return res.status(200).json({});
  }

  // Put /pre in front of whichever lander won. Doing it HERE, on the one answer every
  // routing rule funnels into, is what gives `lp=`, campaign, `o=`, CARRD_ROUTES and
  // the default a prelander without touching a single lander file.
  //
  // wrapPrelander fails open — a lander it will not wrap comes back unchanged and the
  // click goes straight to the page, exactly as it did before. The prelander is worth
  // losing; the click is not.
  const redirectUrl = wrapPrelander(builtLanderUrl);

  // Track the Carrd page usage
  const carrdPage = store.carrd_pages.find(p => carrdUrl.includes(p.subdomain));
  if (carrdPage) carrdPage.uses++;

  return res.status(200).json({ url: redirectUrl });
}
