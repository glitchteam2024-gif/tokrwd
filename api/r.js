/**
 * /api/r — Front Decision Endpoint
 * 
 * The Carrd page POSTs here with device type, campid, and carrd URL.
 * This endpoint decides: is this a real targeted human, or a bot/reviewer?
 * 
 * Pass → returns { url: "https://yourlander.com/page.html?s1=..." }
 * Fail → returns {} (empty object, Carrd shows decoy)
 * 
 * Decision logic:
 *   1. Must be a POST request
 *   2. Must have a campid (c param)
 *   3. Must be mobile device (d param = 'm' or 't')
 *   4. Must have a ttclid (TikTok click ID — only real ad clicks have this)
 *   5. UA must not match known bot patterns
 *   6. IP must not be from known datacenter ranges
 */

import { getStore } from './_lib/store.js';
import {
  LANDERS,
  PASSTHROUGH_PARAMS,
  SUBID_PARAM,
  extractSparkCode,
} from './_lib/links-config.js';

/**
 * Build the lander URL handed back to the Carrd page.
 *
 * Two things here are load-bearing:
 *
 * 1. The sub-ID goes out as `s1`, NOT `campid`. Every door-routed lander forwards
 *    its whole query string to sprktrax.org/api/link/<slug> and reads `s1` to do
 *    it. The door itself accepts only s1/sub1 and 404s without one.
 *
 * 2. Params on the Carrd URL are carried over. The Carrd page receives the full
 *    ad query string — ttclid (TikTok's click id, which drives CAPI match quality)
 *    and s3 (the ad account) must survive this hop to reach the network.
 */
function buildLanderUrl(landerUrl, campid, carrdUrl) {
  // Guard against malformed lander URLs (no scheme, typos, etc.)
  let url;
  try {
    url = new URL(landerUrl);
  } catch {
    // If the lander URL is invalid, try prepending https://
    try {
      url = new URL('https://' + landerUrl);
    } catch {
      return ''; // Completely broken URL — caller will reject
    }
  }

  url.searchParams.set(SUBID_PARAM, extractSparkCode(campid));

  let incoming;
  try {
    incoming = new URL(carrdUrl).searchParams;
  } catch {
    incoming = null; // Carrd href absent or malformed — the sub-ID alone still works
  }

  if (incoming) {
    for (const name of PASSTHROUGH_PARAMS) {
      const v = (incoming.get(name) || '').trim();
      if (v) url.searchParams.set(name, v);
    }
    // Also carry ttclid from the Carrd URL params
    const ttclid = (incoming.get('ttclid') || '').trim();
    if (ttclid) url.searchParams.set('ttclid', ttclid);
  }

  return url.toString();
}

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

/**
 * Determine which lander to use. Each lander is tied to a specific offer
 * (FC = FreeCash, TU = Testerup, CB = Copper). We use the FIRST configured
 * lander deterministically rather than randomizing across different offers —
 * randomizing would send a FreeCash click to a Testerup lander.
 * 
 * In the future, the campaign (campid) should map to a specific lander/offer.
 * For now, default to the first lander (FreeCash).
 */
function pickLander(campid, store) {
  // Check if there's a campaign-specific lander configured
  const campaign = store.campaigns[campid];
  if (campaign && campaign.lander_url) {
    return campaign.lander_url;
  }

  // Use the first configured lander (deterministic, not random)
  // This avoids sending traffic to the wrong offer
  if (LANDERS.length > 0) {
    return LANDERS[0].url;
  }

  return '';
}

export default function handler(req, res) {
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

  // 2. Desktop → reject (reviewers use desktop)
  if (device === 'd' || device === 'desktop') {
    return res.status(200).json({});
  }

  // 3. ttclid check — only real TikTok ad clicks have this parameter
  //    Extract from the Carrd URL (the full ad URL with all params)
  let hasTtclid = false;
  try {
    const carrdParams = new URL(carrdUrl).searchParams;
    hasTtclid = !!(carrdParams.get('ttclid') || '').trim();
  } catch {
    // If we can't parse the Carrd URL, check if ttclid is in the campid string
    // (some setups embed it differently)
    hasTtclid = false;
  }

  if (!hasTtclid) {
    // No TikTok click ID = not a real ad click → show decoy
    return res.status(200).json({});
  }

  // 4. Bot user-agent → reject
  if (isBot(userAgent)) {
    return res.status(200).json({});
  }

  // 5. Datacenter IP → reject
  if (isDatacenterIP(clientIP)) {
    return res.status(200).json({});
  }

  // === PASSED ALL CHECKS — Route to lander ===

  const store = getStore();
  const landerUrl = pickLander(campid, store);

  if (!landerUrl) {
    // No landers configured → reject
    return res.status(200).json({});
  }

  // Build the lander URL with s1 and passthrough params
  const redirectUrl = buildLanderUrl(landerUrl, campid, carrdUrl);

  if (!redirectUrl) {
    // buildLanderUrl failed (bad lander URL) → reject
    return res.status(200).json({});
  }

  // Track the Carrd page usage
  const carrdPage = store.carrd_pages.find(p => carrdUrl.includes(p.subdomain));
  if (carrdPage) carrdPage.uses++;

  return res.status(200).json({ url: redirectUrl });
}
