/**
 * /api/admin/data — Admin CRUD API
 * 
 * Handles all data operations for the Links Manager dashboard.
 * Protected by a simple admin key (set ADMIN_KEY env var in Vercel).
 * 
 * GET  /api/admin/data              → returns all data
 * POST /api/admin/data?action=...   → performs CRUD operations
 */

import {
  getStore, getCarrdPages, addCarrdPage, removeCarrdPage, updateCarrdStatus,
  getOfferLinks, addOfferLink, updateOfferLink, removeOfferLink,
  getLanders, addLander, removeLander,
  getSettings, updateSettings, getPostbackLog, setCampaign
} from '../_lib/store.js';
import {
  OFFER_KEYS,
  OVERRIDE_PARAM,
  SUBID_PARAM,
  TEST_LANDERS,
  buildLanderUrl,
  extractSparkCode,
  isCanonicalSpk,
  isOwnLanderHost,
  resolveLander,
  resolveOverrideLander,
} from '../_lib/links-config.js';

/**
 * Does the lander actually exist on the live site?
 *
 * The failure this catches is the expensive one: an `lp=` value pointing at a
 * folder that was never deployed (or was renamed) resolves fine, /r hands it
 * back, and the visitor lands on a 404 — the campaign spends and converts
 * nothing, with no error anywhere in the stack. Checking it here costs one
 * request at link-build time.
 *
 * Best-effort by design: a network hiccup returns null ("unknown"), never a
 * failure verdict, so a flaky check can't talk the operator out of a good link.
 *
 * Only fetches hosts we own. resolveLander does NOT guarantee that: its `campaign`
 * branch returns whatever set_campaign stored, which is operator-supplied and could
 * name any host — including link-local metadata endpoints reachable from the lambda
 * but not from the internet. So the allowlist is re-checked here rather than assumed.
 */
async function checkReachable(url) {
  if (!url || typeof fetch !== 'function') return null;
  if (!isOwnLanderHost(url)) return null;
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), 4000);
  try {
    // GET, not HEAD: static hosts routinely answer HEAD with 405 while the page
    // itself is fine, which would report a healthy lander as broken.
    // `redirect: 'manual'` keeps a redirect on a lander from walking this request
    // off the allowlisted host; a 3xx still counts as reachable.
    const r = await fetch(url, { method: 'GET', redirect: 'manual', signal: control.signal });
    return { ok: r.status >= 200 && r.status < 400, status: r.status };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Simple auth check — in production, use a proper auth system
function isAuthorized(req) {
  const key = req.query.admin_key || req.headers['x-admin-key'] || '';
  const envKey = process.env.ADMIN_KEY || 'sprk2026';
  return key === envKey;
}

export default async function handler(req, res) {
  // CORS for dashboard
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // GET — return all data
  if (req.method === 'GET') {
    const host = req.headers.host || 'yourdomain.com';
    const settings = getSettings();
    if (!settings.domain) settings.domain = host;

    return res.status(200).json({
      carrd_pages: getCarrdPages(),
      offer_links: getOfferLinks(),
      landers: getLanders(),
      settings: settings,
      postback_log: getPostbackLog().slice(-50),
      postback_url: `https://${settings.domain || host}/api/postback?campid={campid}&payout={payout}&key=${settings.postback_key}`,
      // Routing vocabulary, so the Test Lander tab offers the keys that actually
      // exist instead of asking the operator to remember them.
      routing: {
        override_param: OVERRIDE_PARAM,
        subid_param: SUBID_PARAM,
        offer_keys: OFFER_KEYS,
        test_landers: TEST_LANDERS,
      },
    });
  }

  // POST — CRUD operations
  if (req.method === 'POST') {
    const body = req.body || {};
    const action = body.action || req.query.action;

    switch (action) {
      // === CARRD PAGES ===
      case 'add_carrd': {
        const url = body.url;
        if (!url) return res.status(400).json({ error: 'URL required' });
        // Extract subdomain from URL (e.g., https://sagecliff3.carrd.co → sagecliff3)
        const match = url.match(/https?:\/\/([^.]+)\.carrd\.co/i);
        const subdomain = match ? match[1] : url.replace(/https?:\/\//, '').split('.')[0];
        const page = addCarrdPage(subdomain, url);
        return res.status(200).json({ success: true, page });
      }
      case 'remove_carrd': {
        removeCarrdPage(body.url);
        return res.status(200).json({ success: true });
      }
      case 'update_carrd_status': {
        const page = updateCarrdStatus(body.url, body.status);
        return res.status(200).json({ success: true, page });
      }

      // === OFFER LINKS ===
      case 'add_offer_link': {
        if (!body.slug || !body.destination) {
          return res.status(400).json({ error: 'slug and destination required' });
        }
        const link = addOfferLink(body.slug, body.destination, body.forward_param || 'campid');
        return res.status(200).json({ success: true, link });
      }
      case 'update_offer_link': {
        const link = updateOfferLink(body.slug, body.destination, body.forward_param);
        return res.status(200).json({ success: true, link });
      }
      case 'remove_offer_link': {
        removeOfferLink(body.slug);
        return res.status(200).json({ success: true });
      }

      // === LANDERS ===
      case 'add_lander': {
        if (!body.url) return res.status(400).json({ error: 'URL required' });
        const lander = addLander(body.name || '', body.url);
        return res.status(200).json({ success: true, lander });
      }
      case 'remove_lander': {
        removeLander(body.url);
        return res.status(200).json({ success: true });
      }

      // === CAMPAIGNS ===
      case 'set_campaign': {
        if (!body.campid) return res.status(400).json({ error: 'campid required' });
        setCampaign(body.campid, {
          status: body.status || 'active',
          lander_url: body.lander_url || ''
        });
        return res.status(200).json({ success: true });
      }

      // === TEST LANDER ===
      // Dry-run a built ad link: "if a real click came in on this URL, where
      // would it land?" Runs the SAME resolveLander/buildLanderUrl the live /r
      // endpoint runs, so it cannot answer differently from production.
      //
      // Deliberately answers for the ROUTING half only. The bot/device/ttclid
      // gate in /r is not re-run here: it judges the request that is asking, and
      // the request that is asking is a desktop browser in the dashboard, which
      // would always fail. The warnings below cover the same ground for a link.
      case 'resolve_lander': {
        const carrdUrl = String(body.carrd_url || '').trim();
        if (!carrdUrl) return res.status(400).json({ error: 'carrd_url required' });

        let parsed;
        try {
          parsed = new URL(carrdUrl);
        } catch {
          return res.status(400).json({ error: 'carrd_url is not a valid URL — include https://' });
        }

        const campid = (parsed.searchParams.get('campid') || parsed.searchParams.get('c') || '').trim();
        const overrideRaw = (parsed.searchParams.get(OVERRIDE_PARAM) || '').trim();
        const store = getStore();

        const { url: lander, source } = resolveLander({
          carrdUrl,
          campid,
          campaigns: store.campaigns,
        });
        const destination = lander ? buildLanderUrl(lander, campid, carrdUrl) : '';

        // Everything that makes a test link look healthy while producing nothing.
        const warnings = [];
        if (overrideRaw && source !== 'override') {
          warnings.push(
            `lp=${overrideRaw} did not resolve, so this link is routing by ${source} instead. ` +
            'Check the path, or that the host is one of ours — an unresolvable override falls ' +
            'through silently and the test would run against the wrong page.'
          );
        }
        if (!campid) {
          warnings.push('No campid on the link. /r drops a click with no campid — this would show the decoy.');
        } else if (!isCanonicalSpk(extractSparkCode(campid))) {
          warnings.push(
            `campid "${campid}" is not a canonical SPK-XXXX-XXXX spark code. The door does not reject ` +
            'it — it forwards the string to the network raw, so the link looks healthy while every ' +
            'conversion lands unmatched.'
          );
        }
        if (!(parsed.searchParams.get('ttclid') || '').trim()) {
          warnings.push(
            'No ttclid on the link. That is normal for the ad link itself — TikTok appends it on a ' +
            'real click — but it means opening this URL yourself will show the decoy, not the lander.'
          );
        }

        const reach = await checkReachable(lander);

        return res.status(200).json({
          success: true,
          lander,
          source,
          destination,
          override_input: overrideRaw,
          override_resolves_to: overrideRaw ? resolveOverrideLander(overrideRaw) : '',
          campid,
          reachable: reach ? reach.ok : null,
          reachable_status: reach ? reach.status : null,
          warnings,
        });
      }

      // === SETTINGS ===
      case 'update_settings': {
        const settings = updateSettings(body.settings || {});
        return res.status(200).json({ success: true, settings });
      }

      default:
        return res.status(400).json({ error: 'Unknown action: ' + action });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
