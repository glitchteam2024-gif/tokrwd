/**
 * /api/r — Front Decision Endpoint
 * 
 * The Carrd page POSTs here with device type, campid, and carrd URL.
 * This endpoint decides: is this a real targeted human, or a bot/reviewer?
 * 
 * Pass → returns { url: "https://www.tokrwd.co/pre?s1=…&to=/CLFC" }
 * Fail → returns {} (empty object, Carrd shows decoy)
 *
 * That URL is the PRELANDER, not the lander: /pre hands the visitor to their real
 * browser before the offer page, because TikTok's in-app webview has been failing on
 * real devices. See the prelander section in _lib/links-config.js. When the prelander
 * is switched off (PRELANDER_ENABLED) the same call returns the lander directly.
 * 
 * Decision logic:
 *   1. Must be a POST request
 *   2. Must have a campid (c param)
 *   3. Must be a phone (d param = 'm'; 't' tablet and 'd' desktop are rejected)
 *   4. Must have a ttclid (TikTok click ID — only real ad clicks have this)
 *   5. UA must not match known bot patterns
 *   6. The client's device claim must not CONTRADICT the UA / Sec-CH-UA-* hints
 *   7. IP must not be from known datacenter ranges (currently disabled)
 *
 * WHICH lander a passing visitor gets is a separate question, and it is decided by
 * resolveLander() in _lib/links-config.js — `lp=` override, then campaign, then
 * `o=` offer key, then CARRD_ROUTES, then the default. It lives there so the admin
 * dashboard's preview and live traffic run the same code.
 */

import { getStore } from './_lib/store.js';
import { getPartnerRows } from './_lib/partner-store.js';
import { evaluateRequest } from './_lib/traffic-filter.js';
import {
  buildLanderUrl,
  extractSparkCode,
  resolveLander,
  wrapPrelander,
} from './_lib/links-config.js';

// Known bot/datacenter indicators in user-agent
const BOT_UA_PATTERNS = [
  /bot/i, /crawler/i, /spider/i, /scraper/i, /headless/i,
  /phantom/i, /selenium/i, /puppeteer/i, /playwright/i,
  /googlebot/i, /bingbot/i, /slurp/i, /duckduckbot/i,
  /facebookexternalhit/i, /twitterbot/i, /linkedinbot/i,
  /bytespider/i, /tiktokbot/i, /petalbot/i,
  /ahrefsbot/i, /semrushbot/i, /mj12bot/i,
  /python-requests/i, /curl/i, /wget/i, /httpie/i,
  /go-http-client/i, /java\//i, /okhttp/i
];

// Known datacenter/cloud IP prefixes
const DATACENTER_PREFIXES = [
  '34.', '35.',       // Google Cloud
  '52.', '54.', '18.', '3.', // AWS
  '40.', '20.', '13.',       // Azure
  '104.16', '104.17', '104.18', '104.19', '104.20',
  '104.21', '104.22', '104.23', '104.24', '104.25', // Cloudflare
  '172.67.', '141.101.', '162.158.', // Cloudflare
];

function isBot(userAgent) {
  if (!userAgent) return true;
  return BOT_UA_PATTERNS.some(p => p.test(userAgent));
}

function isDatacenterIP(ip) {
  if (!ip) return false;
  return DATACENTER_PREFIXES.some(prefix => ip.startsWith(prefix));
}

function getClientIP(req) {
  return req.headers['x-real-ip'] ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['cf-connecting-ip'] ||
    '';
}

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

  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(200).json({});
  }

  const body = req.body || {};
  const device = (body.d || '').toLowerCase();
  const campid = body.c || '';
  const carrdUrl = body.h || '';
  const userAgent = req.headers['user-agent'] || '';
  const clientIP = getClientIP(req);

  // === DECISION LOGIC ===

  // 1. No campid → reject (bot/direct visit)
  if (!campid) {
    return res.status(200).json({});
  }

  // 2. Desktop or tablet → reject. Reviewers work on desktops and iPads; a real TikTok user is
  //    on a phone. Enforced HERE rather than in the Carrd embed so it covers every page already
  //    duplicated out — the script keeps sending d=t and this decides.
  //
  //    Deliberately the only device rule. The device classes come straight from the embed's UA
  //    test, and 'm' stays permissive: anything matching Mobile/Android/iPhone/iPod/BlackBerry/
  //    Opera Mini passes. Note iPadOS 13+ Safari already reports as a desktop, so most iPads
  //    were landing in 'd' regardless.
  if (device === 'd' || device === 'desktop' || device === 't' || device === 'tablet') {
    return res.status(200).json({});
  }

  // 3. ttclid check — only real TikTok ad clicks have this parameter
  //    The Carrd script sends h=encodeURIComponent(location.href), so the full
  //    page URL (including ?campid=...&ttclid=...) arrives in body.h.
  //    However, if the body wasn't properly encoded, ttclid might also appear
  //    as a top-level body param (Vercel's parser splits on &).
  let hasTtclid = false;

  // Check 1: ttclid as a top-level body param (if Vercel parsed it that way)
  if ((body.ttclid || '').trim()) {
    hasTtclid = true;
  }

  // Check 2: ttclid inside the Carrd URL (body.h)
  if (!hasTtclid && carrdUrl) {
    try {
      const carrdParams = new URL(carrdUrl).searchParams;
      hasTtclid = !!(carrdParams.get('ttclid') || '').trim();
    } catch {
      // Fallback: simple string search for ttclid in the URL
      hasTtclid = /[?&]ttclid=[^&]/.test(carrdUrl);
    }
  }

  // Check 3: ttclid might be in the raw body string (if req.body is a string).
  // Anchored on a param boundary — a bare .includes('ttclid=') also matched `notttclid=1`,
  // letting a crafted URL through the gate.
  if (!hasTtclid && typeof req.body === 'string') {
    hasTtclid = /[?&=]ttclid=[^&\s]/.test(req.body);
  }

  if (!hasTtclid) {
    // No TikTok click ID = not a real ad click → show decoy
    return res.status(200).json({});
  }

  // 4. Bot user-agent → reject
  if (isBot(userAgent)) {
    return res.status(200).json({});
  }

  // 5. Self-consistency. The `d` above is CLIENT-ASSERTED — a desktop client that simply POSTs
  //    d=m was being served the real destination. This rejects only when the client's claim
  //    CONTRADICTS what the browser itself told us (the User-Agent, or a Sec-CH-UA-* hint that
  //    Chromium sends by default and that survives the cross-origin XHR).
  //
  //    Deliberately additive and contradiction-only: it cannot reject anything the four gates
  //    above would have passed unless that request is self-inconsistent. Missing client hints
  //    are NOT evidence — Safari, Safari iOS and Firefox never send them, so requiring them
  //    would drop every iPhone buyer while headless Chromium passed.
  const consistency = evaluateRequest({
    userAgent,
    clientDevice: device,
    headers: req.headers,
    ttclid: (body.ttclid || ''),
  });
  if (consistency.reject) {
    console.warn('[r] inconsistent request rejected:', consistency.reasons.join('; '));
    return res.status(200).json({});
  }

  // 5. Datacenter IP → reject (disabled — Cloudflare proxy may report its own IPs)
  // if (isDatacenterIP(clientIP)) {
  //   return res.status(200).json({});
  // }

  // === PASSED ALL CHECKS — Route to lander ===

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
    // No landers configured → reject
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

  // Build the lander URL with s1 and passthrough params
  // A campid that is non-empty but carries no usable code (whitespace, punctuation) would put
  // s1= EMPTY on the lander, and the door 404s a click with no s1 — the visitor lands on an
  // error page instead of the decoy. Fail to the decoy here instead.
  if (!extractSparkCode(campid)) {
    return res.status(200).json({});
  }

  const builtLanderUrl = buildLanderUrl(landerUrl, campid, carrdUrl);

  if (!builtLanderUrl) {
    // buildLanderUrl failed (bad lander URL) → reject
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
