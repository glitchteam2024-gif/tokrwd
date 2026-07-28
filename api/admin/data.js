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
  CARRD_ROUTES,
  LANDER_URLS,
  OFFERS,
  OFFER_KEYS,
  OVERRIDE_LANDERS,
  OVERRIDE_PARAM,
  PRELANDER_ENABLED,
  PRELANDER_PATH,
  SUBID_PARAM,
  buildLanderUrl,
  carrdRouteProblems,
  extractSparkCode,
  hopUrl,
  isCanonicalSpk,
  isOwnLanderHost,
  offerForLander,
  resolveLander,
  resolveOverrideLander,
  resolveRouteLander,
  routableLanders,
  carrdHostsForLander,
  traceOfferChain,
  wrapPrelander,
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
        offers: OFFERS,
        override_landers: OVERRIDE_LANDERS,
        lander_urls: LANDER_URLS,
        // Every lander an assignment may target, already paired with its offer, so
        // the UI dropdown cannot offer something carrdRouteProblems() would reject.
        routable_landers: routableLanders(),
        // The COMMITTED host → lander assignments — the ones live traffic actually
        // follows. Resolved and offer-labelled here so the dashboard shows the real
        // destination rather than re-deriving it and drifting.
        carrd_routes: CARRD_ROUTES.map((r) => {
          const url = resolveRouteLander(r.lander);
          // Same wrapPrelander() /r runs, so the table cannot claim a prelander the
          // redirect does not put in front. Empty means the click goes straight to
          // the lander — which is a legitimate state, not a fault.
          const prelander = url ? wrapPrelander(url) : '';
          return {
            host: String(r.host || '').trim().toLowerCase().replace(/^www\./, ''),
            lander: r.lander,
            url,
            offer: url ? offerForLander(url) : '',
            valid: !!url,
            prelander: prelander !== url ? prelander : '',
          };
        }),
        carrd_route_problems: carrdRouteProblems(),
        // The prelander that fronts every landing page. Exposed so the panel can say
        // whether it is on rather than assuming, and stops showing the hop the moment
        // PRELANDER_ENABLED is flipped off.
        prelander_enabled: PRELANDER_ENABLED,
        prelander_path: PRELANDER_PATH,
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
      /**
       * The full hop chain for a landing page + tracking code, for the panel's
       * "hand this to a scaler" section. Computed from the SAME config and the
       * SAME URL builder /c/:slug uses, so what the screen shows a scaler is
       * exactly what their network will receive.
       */
      case 'trace_chain': {
        const landerRaw = String(body.lander || '').trim();
        if (!landerRaw) return res.status(400).json({ error: 'lander required' });

        // Accept an override alias, a bare path, or a full URL — the same vocabulary
        // the rest of this tab speaks, resolved through the same allowlist.
        const lander = resolveRouteLander(landerRaw) || resolveOverrideLander(landerRaw);
        if (!lander) {
          return res.status(400).json({
            error: 'That landing page did not resolve. It must be a declared lander, an ' +
                   'OVERRIDE_LANDERS alias, or a path on a host we own.',
          });
        }

        const code = String(body.code || '').trim();
        const chain = traceOfferChain(lander, code, {
          ttclid: body.ttclid || '',
          s3: body.s3 || '',
        });

        const warnings = [];
        if (!code) {
          warnings.push(
            'No tracking code, so the sub-ID goes out EMPTY and their conversions land ' +
            'unattributed. Put the code you want to settle against on the link.'
          );
        } else if (!isCanonicalSpk(extractSparkCode(code)) && !body.allow_custom_campid) {
          warnings.push(
            `"${code}" is not a canonical SPK-XXXX-XXXX spark code. That is correct for a ` +
            'self-managed scaler, who names their own codes — tick Scaler on their row to ' +
            'silence this. For a network affiliate it means every conversion lands unmatched.'
          );
        }

        const hosts = carrdHostsForLander(lander);
        // The link actually handed over. A bound Carrd page is the real ad link; with
        // none bound the lander URL is direct-only and needs lp= to route through /r.
        const adLinks = hosts.map((h) => {
          const u = new URL(`https://${h}/`);
          if (code) u.searchParams.set('campid', code);
          return u.toString();
        });

        /**
         * The finished link for ONE named Carrd page — the thing that actually gets
         * sent to a person.
         *
         * The only interesting part is which params are REQUIRED, and that depends on
         * whether this page is already bound to this lander in CARRD_ROUTES:
         *   bound     → `?campid=` is enough; the host binding does the routing
         *   not bound → `&lp=` as well, or the click routes to the DEFAULT offer and
         *               silently credits the wrong one
         * Deciding it here, from the committed table, is the point: guessing wrong in
         * either direction produces a link that looks fine and earns nothing.
         */
        let handoff = null;
        const carrdRaw = String(body.carrd || '').trim();
        if (carrdRaw) {
          let host = carrdRaw.toLowerCase().replace(/^https?:\/\//, '').split('/')[0].split('?')[0].replace(/^www\./, '');
          if (host && !host.includes('.')) host = `${host}.carrd.co`;
          if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) {
            handoff = { error: `"${carrdRaw}" is not a valid hostname.` };
          } else {
            const bound = hosts.includes(host);
            const u = new URL(`https://${host}/`);
            if (code) u.searchParams.set('campid', code);
            if (!bound) u.searchParams.set(OVERRIDE_PARAM, landerRaw);
            handoff = {
              host,
              bound,
              needs_lp: !bound,
              url: u.toString(),
              note: bound
                ? 'This page is assigned to this landing page, so campid is all the link needs.'
                : `This page is NOT assigned to this landing page, so the link carries ` +
                  `${OVERRIDE_PARAM}=${landerRaw} to force it. That works, but it is per-link — ` +
                  `assign the page above and every ad link on it routes correctly without it.`,
            };
          }
        }

        const reach = await checkReachable(lander);

        return res.status(200).json({
          success: true,
          lander,
          code,
          carrd_hosts: hosts,
          ad_links: adLinks,
          handoff,
          // No Carrd page bound → the operator needs lp= to reach this page through /r.
          fallback_ad_link: adLinks.length ? '' : `?campid=${encodeURIComponent(code || 'CODE')}&${OVERRIDE_PARAM}=${encodeURIComponent(landerRaw)}`,
          // Both previews the panel shows, in the order the visitor meets them.
          //
          // Keyed by STEP NAME, not by index. This used to be `chain.hops[0].url`,
          // which silently became the PRELANDER the moment a hop was added in front —
          // the iframe would have changed meaning with no edit to the dashboard and a
          // caption still reading "the page as they will see it".
          prelander_preview_url: hopUrl(chain, 'Prelander'),
          preview_url: hopUrl(chain, 'Landing page') || lander,
          prelander_enabled: PRELANDER_ENABLED,
          reachable: reach ? reach.ok : null,
          reachable_status: reach ? reach.status : null,
          chain,
          warnings,
        });
      }

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

        const { url: lander, source, offer, offerConflict } = resolveLander({
          carrdUrl,
          campid,
          campaigns: store.campaigns,
        });
        const destination = lander ? buildLanderUrl(lander, campid, carrdUrl) : '';
        // What /r actually hands back for this ad link — the prelander when one fronts
        // this lander, the lander itself otherwise. Same wrapPrelander() live traffic
        // runs, so the panel cannot show a hop the redirect does not take.
        const returnedUrl = destination ? wrapPrelander(destination) : '';
        const prelanderUrl = returnedUrl !== destination ? returnedUrl : '';

        // Everything that makes a test link look healthy while producing nothing.
        const warnings = [];
        // The one that costs real money: the click lands on a page that fires a
        // different offer than the ad was bought against, and nothing downstream
        // says so — the campaign just reads as underperforming.
        if (offerConflict) {
          warnings.push(
            `OFFER MISMATCH — the link says o=${offerConflict.adOffer} but this page fires ` +
            `${OFFERS[offerConflict.landerOffer]?.label || offerConflict.landerOffer}. Every conversion ` +
            `will credit ${offerConflict.landerOffer}. Drop the o= or point lp= at the matching page.`
          );
        }
        if (lander && !offer) {
          warnings.push(
            'This page is not bound to an offer in OVERRIDE_LANDERS, so nothing can verify it fires ' +
            'the offer you expect. Add it there (path + offer + owner) before running spend through it.'
          );
        }
        if (overrideRaw && source !== 'override') {
          warnings.push(
            `lp=${overrideRaw} did not resolve, so this link is routing by ${source} instead. ` +
            'Check the path, or that the host is one of ours — an unresolvable override falls ' +
            'through silently and the test would run against the wrong page.'
          );
        }
        if (!campid) {
          warnings.push('No campid on the link. /r drops a click with no campid — this would show the decoy.');
        } else if (!isCanonicalSpk(extractSparkCode(campid)) && !body.allow_custom_campid) {
          warnings.push(
            `campid "${campid}" is not a canonical SPK-XXXX-XXXX spark code. The door does not reject ` +
            'it — it forwards the string to the network raw, so the link looks healthy while every ' +
            'conversion lands unmatched. If this is a scaler, tick Scaler on their row: they name ' +
            'their own codes by design and this check does not apply to them.'
          );
        } else if (!isCanonicalSpk(extractSparkCode(campid))) {
          // Scaler: a custom code is correct. But it still has to be REGISTERED in SPRK
          // (subid_owners), or the conversions land unmatched exactly as above — the
          // difference is where the fix lives, not whether the failure can happen.
          warnings.push(
            `Custom campid "${campid}" — expected for a scaler. Confirm it is registered to them in ` +
            'SPRK (admin → Assign SubID), otherwise conversions still land unmatched.'
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
          offer,
          offer_label: offer ? (OFFERS[offer] && OFFERS[offer].label) || offer : '',
          offer_conflict: offerConflict,
          destination,
          // `destination` stays the LANDING PAGE. These two say what /r hands the Carrd
          // page and which prelander fronts it — kept as separate fields so nothing that
          // already reads `destination` silently starts reading a different hop.
          returned_url: returnedUrl,
          prelander_url: prelanderUrl,
          prelander_enabled: PRELANDER_ENABLED,
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
