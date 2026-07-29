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
  PARTNER_LINKS,
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
  offerKeyProblems,
  overrideLanderProblems,
  partnerFor,
  partnerKey,
  partnerLinkProblems,
  partnerSlugFor,
  resolveLander,
  resolveOverrideLander,
  resolveRouteLander,
  routableLanders,
  carrdHostsForLander,
  traceOfferChain,
  wrapPrelander,
} from '../_lib/links-config.js';
import { kvEnabled } from '../_lib/kv.js';
import { clearPartnerHosts, getPartnerRows, readStoredRows, writeStoredRows } from '../_lib/partner-store.js';
import { accessSummary, issueAccessCode, revokeAccessCode } from '../_lib/partner-access.js';
import { timingSafeEqual } from 'node:crypto';

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

/** Constant-time compare. Lengths are compared first, so it never throws. */
function secretEq(a, b) {
  const A = Buffer.from(String(a == null ? '' : a), 'utf8');
  const B = Buffer.from(String(b == null ? '' : b), 'utf8');
  if (A.length === 0 || A.length !== B.length) return false;
  return timingSafeEqual(A, B);
}

// Simple auth check — in production, use a proper auth system.
// Left exactly as it was, INCLUDING the legacy default: tightening the read path
// would lock the operator out of their own dashboard on the next deploy if
// ADMIN_KEY was never set. The write path below is where the fail-closed rule goes.
function isAuthorized(req) {
  const key = req.query.admin_key || req.headers['x-admin-key'] || '';
  const envKey = process.env.ADMIN_KEY || 'sprk2026';
  return key === envKey;
}

/**
 * The secret a MUTATION must present.
 *
 * A dedicated ADMIN_WRITE_KEY when there is one, otherwise ADMIN_KEY — but only
 * when it is genuinely set in the environment. `'sprk2026'` is a committed,
 * public string; it was tolerable while writes landed in a throwaway in-memory
 * object, and it stops being tolerable the moment a write decides where paid
 * traffic goes. Unset means writes are refused, never that they are open.
 *
 * BE HONEST ABOUT WHAT THE FALLBACK BUYS. With only ADMIN_KEY set — the documented
 * minimum — the read key IS the write key, and that key sits in localStorage on the
 * same origin as ~1000 lander pages. Setting ADMIN_WRITE_KEY as well is what
 * actually separates them: the panel holds that one in memory only, so a stolen
 * ADMIN_KEY can read the dashboard but cannot re-point paid traffic. The fallback
 * exists so the feature works on day one, not because the two are equivalent.
 */
function writeSecret() {
  return process.env.ADMIN_WRITE_KEY || process.env.ADMIN_KEY || '';
}

/** Header only — a credential in a query string lands in every request log. */
function isWriteAuthorized(req) {
  const want = writeSecret();
  if (!want) return false;
  const given = req.headers['x-admin-write-key'] || req.headers['x-admin-key'] || '';
  return secretEq(given, want);
}

/**
 * Where a write may be submitted from. The panel is served from the same deploy,
 * so a same-origin fetch (which usually omits Origin) is the normal case; anything
 * that names a foreign origin is a cross-site request, not the operator.
 */
const ALLOWED_ORIGINS = new Set([
  'https://www.tokrwd.co',
  'https://tokrwd.co',
  'https://appflowconnect.com',
  'https://www.appflowconnect.com',
]);

function originOk(req) {
  const o = req.headers.origin;
  if (!o) return true;

  let host;
  try { host = new URL(o).host.toLowerCase(); } catch { return false; }

  // SAME-ORIGIN IS ALWAYS FINE, whatever domain this deploy is being served on.
  // Comparing against a fixed list alone was wrong in a way that only shows up
  // later: browsers attach Origin to every non-GET request, including the panel's
  // own, so a preview deployment, a renamed project URL or a local run would all
  // have 403'd every save with a message about cross-site requests.
  const self = String(req.headers.host || '').trim().toLowerCase();
  if (self && host === self) return true;

  return ALLOWED_ORIGINS.has(String(o).trim().toLowerCase());
}

/**
 * Actions that CHANGE something. Deny-by-default: an action absent from this set
 * is treated as read-only, so a new mutating action has to be added here
 * deliberately rather than inheriting write access by being forgotten.
 */
const WRITE_ACTIONS = new Set([
  'add_carrd', 'remove_carrd', 'update_carrd_status',
  'add_offer_link', 'update_offer_link', 'remove_offer_link',
  'add_lander', 'remove_lander', 'set_campaign', 'update_settings',
  'save_partner', 'delete_partner', 'issue_access', 'revoke_access',
]);

/** Rows that live in source control and therefore cannot be edited from here. */
const PARTNER_LINKS_KEYS = new Set(PARTNER_LINKS.map(p => p.key));

/**
 * The PARTNER_LINKS row for a proposed assignment, ready to paste.
 *
 * This is the fallback when no datastore is connected, and it is also the honest
 * answer for anyone who would rather keep assignments in source control: the panel
 * and the committed table take the exact same shape.
 */
function buildPartnerConfigLine(row) {
  const q = (v) => `'${String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return [
    '  {',
    `    key: ${q(row.key)},`,
    `    owner: ${q(row.owner)},`,
    `    carrd: ${q(row.carrd)},`,
    `    lander: ${q(row.lander)},`,
    `    code: ${q(row.code)},`,
    `    destination: ${q(row.destination)},`,
    `    forwardParam: ${q(row.forwardParam || 'sub1')},`,
    '  },',
  ].join('\n');
}

export default async function handler(req, res) {
  // CORS for dashboard.
  //
  // Echo an allowlisted origin instead of `*`. This response now carries every
  // partner's private affiliate URL alongside the rest of the routing table, and
  // with `*` any web page could read it as a simple cross-origin request the moment
  // it had the key. Same-origin requests (the panel itself) send no Origin and are
  // unaffected.
  const reqOrigin = String(req.headers.origin || '').trim().toLowerCase();
  if (ALLOWED_ORIGINS.has(reqOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, X-Admin-Write-Key');
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

    // Committed rows merged with whatever the datastore holds — the SAME list a
    // click is routed by, so the table on screen cannot disagree with the router.
    const partners = await getPartnerRows();
    // WHO has a portal login, never the codes themselves — those exist only as
    // hashes and were shown once at mint time.
    let access = {};
    try { access = await accessSummary(); } catch { access = {}; }

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
        // Both of these are exported and validated by the test suite but were
        // reaching NOTHING at runtime, so a broken alias or a half-added geo was
        // invisible in the panel until someone happened to run the tests.
        override_lander_problems: overrideLanderProblems(),
        offer_key_problems: offerKeyProblems(),
        // The prelander that fronts every landing page. Exposed so the panel can say
        // whether it is on rather than assuming, and stops showing the hop the moment
        // PRELANDER_ENABLED is flipped off.
        prelander_enabled: PRELANDER_ENABLED,
        prelander_path: PRELANDER_PATH,
      },
      // ── Partner links ────────────────────────────────────────────────────────
      partners: partners.map((p) => ({
        key: p.key,
        owner: p.owner || '',
        carrd: String(p.carrd || '').toLowerCase(),
        lander: p.lander,
        lander_url: resolveRouteLander(p.lander),
        code: partnerKey(p.code),
        destination: p.destination,
        forward_param: p.forwardParam || 'sub1',
        slug: partnerSlugFor(p.lander),
        // 'committed' rows live in links-config.js and go live on deploy; 'store'
        // rows were saved through this panel and are live already. The panel labels
        // them differently because only one of the two can be edited here.
        origin: p.origin || 'committed',
        updated: p.updated || '',
        // Extra Carrd pages this partner registered through their own portal.
        hosts: Array.isArray(p.hosts) ? p.hosts : [],
        // Whether the live offer link is the one YOU set or one they changed in
        // their portal, and what yours was. A partner-set link is the only thing
        // here that can send traffic somewhere you did not choose.
        offer_origin: p.offer_origin || 'operator',
        offer_updated: p.offer_updated || '',
        operator_destination: p.operator_destination || p.destination,
        // Whether they can log in, and when the code was made. Not the code.
        has_access: !!access[p.key],
        access_created: (access[p.key] && access[p.key].created) || '',
      })),
      partner_problems: partnerLinkProblems(partners),
      // Whether Save can actually persist. The panel refuses to pretend otherwise:
      // a button that looks like it worked and did not is the exact failure this
      // whole feature exists to remove.
      storage: {
        enabled: kvEnabled(),
        writable: !!writeSecret(),
        admin_key_from_env: !!process.env.ADMIN_KEY,
      },
    });
  }

  // POST — CRUD operations
  if (req.method === 'POST') {
    const body = req.body || {};
    const action = body.action || req.query.action;

    // Every mutation, gated once, here — rather than per-case where the next new
    // action would quietly ship without one.
    if (WRITE_ACTIONS.has(action)) {
      if (!originOk(req)) {
        return res.status(403).json({ error: 'This write came from an origin we do not serve the panel on.' });
      }
      if (!isWriteAuthorized(req)) {
        return res.status(401).json({
          error: writeSecret()
            ? 'Wrong write key.'
            : 'Writing is switched off because no ADMIN_KEY is set in Vercel. Set ADMIN_KEY (or ' +
              'ADMIN_WRITE_KEY) in the project\'s Environment Variables, redeploy, then try again — ' +
              'the built-in default is a public string and is deliberately not accepted for writes.',
        });
      }
      // An assignment that sends paid traffic somewhere new is worth a line in the
      // function log, so a change is answerable after the fact.
      console.log('[admin] write', JSON.stringify({
        action,
        at: new Date().toISOString(),
        ip: req.headers['x-forwarded-for'] || '',
        target: body.key || body.slug || body.url || body.carrd || '',
      }));
    }

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
        const partnerRows = await getPartnerRows();
        const chain = traceOfferChain(lander, code, {
          ttclid: body.ttclid || '',
          s3: body.s3 || '',
          // The panel must resolve the partner the SAME way /c/:slug will, or it
          // shows the house destination to someone whose clicks go elsewhere.
          partners: partnerRows,
        });
        // Who this code belongs to, resolved through the live resolver rather than
        // matched by hand here.
        const owner = partnerFor(partnerSlugFor(landerRaw), code, partnerRows);

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

        // SCOPED to whoever owns this code. Unscoped, a lander shared by two people
        // returns both their Carrd pages, and the "ad link to send them" below would
        // be built on the wrong person's page — a link that, under per-code routing,
        // works, so nobody would notice until the invoices disagreed.
        const hosts = carrdHostsForLander(lander, owner ? owner.key : '', partnerRows);
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
          // Named when this code belongs to somebody, so the screen can say whose
          // affiliate link the last hop actually is.
          partner: owner ? { key: owner.key, owner: owner.owner || '' } : null,
          chain,
          warnings,
        });
      }

      /**
       * Create or update ONE partner assignment: their Carrd page, the landing page
       * they run, and their own affiliate link.
       *
       * Validated against the LIVE table (committed rows included) before anything is
       * written, so a duplicate code — the failure that silently pays one person for
       * another's traffic — is refused rather than saved and reported afterwards.
       */
      case 'save_partner': {
        const row = {
          key: String(body.key || '').trim().toLowerCase(),
          owner: String(body.owner || '').trim(),
          carrd: String(body.carrd || '').trim().toLowerCase()
            .replace(/^https?:\/\//, '').split('/')[0].split('?')[0].replace(/^www\./, ''),
          lander: String(body.lander || '').trim(),
          code: partnerKey(body.code || ''),
          destination: String(body.destination || '').trim(),
          forwardParam: String(body.forward_param || 'sub1').trim(),
        };
        if (row.carrd && !row.carrd.includes('.')) row.carrd = `${row.carrd}.carrd.co`;

        // VALIDATE FIRST, and validate in the merged world the router will actually
        // see — a code is only a duplicate relative to everything else that is live.
        // Doing this before the storage check matters: otherwise a broken row with no
        // datastore connected comes back as a ready-to-paste config line.
        const problems = partnerLinkProblems([
          ...(await getPartnerRows()).filter(r => r.key !== row.key),
          row,
        ]);
        if (problems.length) {
          return res.status(400).json({ error: problems.join(' · ') });
        }

        if (!kvEnabled()) {
          return res.status(503).json({
            error:
              'No datastore is connected, so this cannot be saved live. In Vercel: Storage → ' +
              'Create Database → Redis (Upstash) → Free → connect it to this project, then ' +
              'redeploy. The assignment itself is valid — paste the row below into ' +
              'PARTNER_LINKS in api/_lib/links-config.js and deploy to run it today.',
            config_line: buildPartnerConfigLine(row),
          });
        }

        // The datastore can be CONFIGURED and still unreachable — wrong token,
        // rotated credentials, an outage. Unhandled, that rejection escapes the
        // handler, Vercel answers with an HTML 500, and the panel's res.json()
        // throws inside a click handler: no toast, no error, nothing on screen.
        // A save that silently does nothing is the exact failure this tab exists
        // to remove, so it is caught and reported like the not-configured case.
        let saved;
        try {
          const existing = await readStoredRows();
          const others = existing.filter(r => r.key !== row.key);
          saved = await writeStoredRows([...others, { ...row, updated: new Date().toISOString() }]);
        } catch (e) {
          console.error('[admin] save_partner store failure:', e && e.message);
          return res.status(503).json({
            error: `The datastore did not accept the write (${(e && e.message) || 'unknown error'}). ` +
                   'Nothing was saved. Check KV_REST_API_URL / KV_REST_API_TOKEN in Vercel, or paste ' +
                   'the row below into PARTNER_LINKS and deploy.',
            config_line: buildPartnerConfigLine(row),
          });
        }
        return res.status(200).json({
          success: true,
          rows: saved.length,
          // Handed back on success too: an operator who would rather keep assignments
          // in source control can commit the identical row.
          config_line: buildPartnerConfigLine(row),
        });
      }

      /**
       * Mint a portal login for one partner. The plaintext is returned ONCE and is
       * not stored — only its hash is — so it cannot be looked up later. That is the
       * point: a datastore dump hands over no working logins, and "I lost it" has
       * exactly one answer, which is to mint another.
       *
       * Minting REPLACES any previous code, so this doubles as the fix for a code
       * that reached the wrong person.
       */
      case 'issue_access': {
        const key = String(body.key || '').trim().toLowerCase();
        const rows = await getPartnerRows();
        if (!rows.some(r => r.key === key)) {
          return res.status(400).json({ error: `No partner called "${key}".` });
        }
        try {
          const code = await issueAccessCode(key);
          return res.status(200).json({
            success: true,
            key,
            access_code: code,
            note: 'Shown once. Send it to them now — it cannot be retrieved again, only replaced.',
          });
        } catch (e) {
          return res.status(503).json({
            error: `Could not issue a code (${(e && e.message) || 'unknown error'}). ` +
                   'Portal logins need the datastore connected.',
          });
        }
      }

      case 'revoke_access': {
        const key = String(body.key || '').trim().toLowerCase();
        try {
          const removed = await revokeAccessCode(key);
          return res.status(200).json({ success: true, removed });
        } catch (e) {
          return res.status(503).json({ error: (e && e.message) || 'Could not revoke.' });
        }
      }

      case 'delete_partner': {
        const key = String(body.key || '').trim().toLowerCase();
        if (!key) return res.status(400).json({ error: 'key required' });
        // A committed row is in source control; deleting it here would look like it
        // worked and be undone by the next deploy.
        if (PARTNER_LINKS_KEYS.has(key)) {
          return res.status(400).json({
            error: `"${key}" is committed in api/_lib/links-config.js, so it cannot be removed from ` +
                   'here — delete its row in PARTNER_LINKS and deploy.',
          });
        }
        try {
          const existing = await readStoredRows();
          const saved = await writeStoredRows(existing.filter(r => r.key !== key));
          // Deleting the row is not enough. Their access code survives, and if the
          // same key slug is ever reused for a DIFFERENT person the old holder gets
          // that person's portal — their affiliate link, their code, and the power to
          // de-register their pages. Their registered pages must go too, or the host
          // stays claimed by a partner who no longer exists and nobody can take it.
          await revokeAccessCode(key).catch(() => {});
          await clearPartnerHosts(key).catch(() => {});
          return res.status(200).json({ success: true, rows: saved.length });
        } catch (e) {
          console.error('[admin] delete_partner store failure:', e && e.message);
          return res.status(503).json({
            error: `The datastore did not accept the change (${(e && e.message) || 'unknown error'}). ` +
                   'Nothing was removed — this row is still live.',
          });
        }
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
          // Partner assignments saved through the panel route real traffic, so this
          // "where does this link actually go?" check has to see them too — otherwise
          // it reports the default offer for a page that is in fact assigned.
          partners: await getPartnerRows(),
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
