/**
 * /api/partner — the partner's own portal API.
 *
 * A DIFFERENT AUDIENCE FROM /api/admin/data, and the difference is the whole design:
 * this is opened by Edwin or Osvaldo, not by the operator. So it is scoped to ONE
 * partner by their access code, and there is deliberately no way to ask it about
 * anybody else — no list action, no key parameter, no "all partners" shape. The
 * access code identifies you; it never selects who you are asking about.
 *
 * WHAT A PARTNER MAY CHANGE: the Carrd pages they run, and the affiliate link
 * their own clicks end on. Nothing else. Which landing page they run and the
 * tracking code they settle against stay the operator's — those two decide ROUTING
 * and ATTRIBUTION, so a partner changing them could collide with somebody else's
 * setup, and they are read-only here.
 *
 * The offer link is the one field that sends traffic OFF our domain, so it is
 * gated by isSafePartnerDestination on write and again on every read, and every
 * change is logged with the value it replaced.
 *
 * CORS is open by design. The portal is a static page meant to be deployed
 * separately (its own vercel.app), so it always arrives cross-origin; the access
 * code is what authorises the call, not the origin it came from. No cookies are
 * used, so there is nothing for a hostile origin to ride on.
 */

import {
  DEFAULT_LANDER_ORIGIN,
  OVERRIDE_PARAM,
  hopUrl,
  partnerSlugFor,
  resolveRouteLander,
  traceOfferChain,
} from './_lib/links-config.js';
import {
  MAX_HOSTS_PER_PARTNER, getPartnerRows, readStoredRows, setPartnerHost, setPartnerOffer, normaliseHost,
} from './_lib/partner-store.js';
import { partnerForAccessCode, touchAccessCode } from './_lib/partner-access.js';
import { kvEnabled } from './_lib/kv.js';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}

/**
 * Everything the portal shows, for ONE partner.
 *
 * Every URL comes from traceOfferChain — the same resolver and the same builder a
 * live click runs — so the portal cannot promise a partner a sub-ID or a
 * destination the redirect does not actually produce.
 */
async function viewFor(row) {
  const landerUrl = resolveRouteLander(row.lander);
  const chain = traceOfferChain(landerUrl, row.code, { partners: await getPartnerRows() });

  const pages = [];
  const seen = new Set();
  for (const host of [row.carrd, ...(row.hosts || [])]) {
    const h = normaliseHost(host);
    if (!h || seen.has(h)) continue;
    seen.add(h);
    const url = new URL(`https://${h}/`);
    url.searchParams.set('campid', row.code);
    pages.push({
      host: h,
      ad_link: url.toString(),
      // A primary page is the operator's; the partner may only remove their own.
      removable: h !== normaliseHost(row.carrd),
    });
  }

  return {
    owner: row.owner || '',
    code: row.code,
    landing_page: landerUrl,
    offer: chain.offer_label || '',
    // Their own affiliate URL, and whether they set it or the operator did.
    offer_link: row.destination,
    offer_origin: row.offer_origin || 'operator',
    offer_updated: row.offer_updated || '',
    tracks_as: chain.tracks_as || '',
    forward_param: chain.forward_param || row.forwardParam || 'sub1',
    prelander: hopUrl(chain, 'Prelander'),
    hops: (chain.hops || []).map(h => ({ step: h.step, url: h.url })),
    chain_ok: chain.ok !== false,
    chain_problem: chain.ok === false ? (chain.reason || '') : '',
    pages,
    max_pages: MAX_HOSTS_PER_PARTNER,
    // The override form, for a page they have not registered here yet.
    override_param: OVERRIDE_PARAM,
    override_value: row.lander,
    lander_origin: DEFAULT_LANDER_ORIGIN,
    slug: partnerSlugFor(row.lander),
  };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const action = String(body.action || '');
  const code = String(body.access || '');

  if (!kvEnabled()) {
    return res.status(503).json({
      error: 'This portal is not switched on yet. Ask for a new access link once it is.',
    });
  }

  // ONE lookup, up front. Everything below is scoped to whoever this resolves to;
  // no action takes a partner key from the request.
  let key;
  try {
    key = await partnerForAccessCode(code);
  } catch (e) {
    return res.status(503).json({ error: 'We could not check your code just now. Try again in a moment.' });
  }
  if (!key) {
    return res.status(401).json({ error: 'That access code was not recognised. Check it, or ask for a new one.' });
  }
  // Fire and forget — a login must never fail because a timestamp did not save.
  touchAccessCode(code).catch(() => {});

  /**
   * Identity is resolved through a read that DISTINGUISHES "unavailable" from
   * "absent". getPartnerRows() deliberately falls back to committed config on a
   * blip, which is right for a paid click and wrong here: it would turn a 250ms
   * hiccup into "this account is no longer set up", whose documented remedy is to
   * mint a new code — invalidating the working one they already have.
   */
  let row;
  try {
    row = (await readStoredRows()).find(r => r.key === key)
      || (await getPartnerRows()).find(r => r.key === key);
  } catch (e) {
    return res.status(503).json({ error: 'We could not load your setup just now. Try again in a moment.' });
  }
  if (!row) {
    return res.status(404).json({ error: 'This account is no longer set up. Ask for a new access code.' });
  }
  // Always view through the MERGED rows, so the pages list includes the hosts half.
  const merged = (await getPartnerRows()).find(r => r.key === key);
  if (merged) row = merged;

  try {
  switch (action) {
    case 'me':
      return res.status(200).json({ success: true, view: await viewFor(row) });

    case 'add_page':
    case 'remove_page': {
      const result = await setPartnerHost(key, body.host, { remove: action === 'remove_page' });
      if (!result.ok) return res.status(400).json({ error: result.error });
      console.log('[partner]', action, key, normaliseHost(body.host));
      // Re-read so the view reflects the write rather than predicting it.
      const fresh = (await getPartnerRows()).find(r => r.key === key) || row;
      return res.status(200).json({ success: true, view: await viewFor(fresh) });
    }

    /**
     * The partner sets the affiliate link their own clicks end on.
     *
     * Logged with the value it replaced, always. This is the only field a partner
     * can change that sends traffic off our domain, so "who changed it to what, and
     * when" has to be answerable afterwards from the function logs alone.
     */
    case 'set_offer': {
      const result = await setPartnerOffer(key, body.destination, body.forward_param);
      if (!result.ok) return res.status(400).json({ error: result.error });
      console.log('[partner] offer changed', JSON.stringify({
        partner: key,
        from: result.previous || '(operator-set)',
        to: result.destination,
        param: result.forwardParam,
        at: new Date().toISOString(),
      }));
      const after = (await getPartnerRows()).find(r => r.key === key) || row;
      return res.status(200).json({ success: true, view: await viewFor(after) });
    }

    default:
      return res.status(400).json({ error: 'Unknown action' });
  }
  } catch (e) {
    // Nothing here may escape as a platform 500: the portal would render an
    // unstyled error page, or hang. Answer in the shape the page can display.
    console.error('[partner] failed', action, key, e && e.message);
    return res.status(503).json({
      error: 'Something went wrong saving that. Nothing was changed — try again in a moment.',
    });
  }
}
