/**
 * Links config — the shared, committed source of truth for /r and /c/:slug.
 *
 * WHY THIS FILE EXISTS
 * Every file under api/ compiles to its OWN Vercel lambda with its own module
 * instance. api/_lib/store.js keeps its data in a module-level object, so a link
 * created through the admin dashboard lands in the admin lambda's heap and is
 * structurally invisible to the /c/:slug lambda — that slug 404s forever, not
 * just after a cold start. Same for landers (/r returns {}) and for the postback
 * key (minted per-lambda, so the key the dashboard prints never matches the one
 * /postback validates against).
 *
 * Config that has to be readable by every lambda therefore lives HERE, in code,
 * and is deployed with the bundle. The admin dashboard still works, but treat its
 * writes as a scratch overlay on top of this file — durable changes are made by
 * editing this file and deploying.
 *
 * THE ATTRIBUTION RULE
 * sprktrax.org/api/link/<slug> is the door. It reads exactly one param — s1 (or
 * its alias sub1) — and 404s when that is missing. It does NOT read `campid`.
 * The door only rewrites s1 into the affiliate number (and moves the spark code
 * to s2, minting a click_id into s5) when s1 resolves to a live spark_codes row.
 * An UNRECOGNISED s1 is not rejected: the door 302s and forwards the junk string
 * to the network verbatim, so the link looks healthy while every conversion lands
 * `unmatched`. That is why the value we put in s1 must be a real spark code.
 */

/** The query param the landers and the door both speak. Never `campid`. */
export const SUBID_PARAM = 's1';

/**
 * Params carried from the Carrd page through to the lander and the door.
 *
 * Deliberately just these two. The door owns the rest — stampAffiliateSubids() drops every
 * inbound s1/sub1/s2/sub2/s5/sub5 and then writes its own, so forwarding them is pointless
 * on the resolved path and actively harmful on the fail-open path, where a client-supplied
 * value would ride through to the network.
 *
 *   ttclid — TikTok's click id. Drives CAPI match quality and nothing else sets it.
 *   s3     — the ad account / campaign id. NOT in the door's drop list, so it survives.
 *
 * NOT forwarded, and why:
 *   s2            the door writes the spark code here. Ours would just be discarded.
 *   s4            an inbound s4 SUPPRESSES the door's own offer label (`if (name && !hasS4)`),
 *                 so forwarding one silently replaces the authoritative, cap-aware offer name.
 *   s5            the click_id slot. A constant value collapses per-lead dedup at the network.
 *   sprk_sig      the launch-context HMAC. It is only meaningful on the launcher→door leg, it
 *                 is not in the live door's drop set (so it would be forwarded on to the
 *                 network), and it arrives here from a client-controlled URL where it cannot
 *                 be trusted anyway.
 *   sprk_geo      same — server-owned, and stripped alongside sprk_sig by the door.
 */
export const PASSTHROUGH_PARAMS = ['ttclid', 's3'];

/**
 * Spark codes minted by SPRK's generateSPKCode() are `SPK-` + 4 hex + `-` + 4 hex,
 * and spark_test_mint() appends `-N` for relaunch children. Self-managed and
 * scaler affiliates may instead carry a CUSTOM code — the only rule SPRK enforces
 * is that a custom code must not start with `SPK-`. So: extract an SPK when the
 * campid embeds one, otherwise pass the campid through untouched.
 */
const SPK_RE = /^(SPK-[0-9A-F]{4}-[0-9A-F]{4}(?:-\d+)?)$/i;

/**
 * Pull the spark code out of a campid.
 *
 * Accepts a bare code (`SPK-A1B2-C3D4`) or one embedded in a longer campaign
 * string (`ACCT_SPK-A1B2-C3D4_US_001`). Falls back to the raw value so a custom
 * scaler code survives intact.
 *
 * NOTE: The regex now uses ^ and $ anchors to prevent substring extraction from
 * codes like TENXSPK-A1B2-C3D4X. If the full string is a canonical SPK, use it;
 * otherwise check for SPK- embedded with delimiters.
 */
export function extractSparkCode(campid) {
  const raw = String(campid == null ? '' : campid).trim();
  if (!raw) return '';
  
  // Exact match (bare SPK code)
  const exact = raw.match(SPK_RE);
  if (exact) return exact[1].toUpperCase();
  
  // Embedded SPK with delimiters (e.g., ACCT_SPK-A1B2-C3D4_US)
  const embedded = raw.match(/(?:^|[_\-\s])(SPK-[0-9A-F]{4}-[0-9A-F]{4}(?:-\d+)?)(?:[_\-\s]|$)/i);
  if (embedded) return embedded[1].toUpperCase();
  
  // No SPK found — return raw (custom scaler code or legacy format)
  return raw;
}

/** True when the value is a canonical SPRK-minted spark code. */
export function isCanonicalSpk(value) {
  return SPK_RE.test(String(value == null ? '' : value).trim());
}

/**
 * Landers that /r may hand a passing visitor.
 *
 * These are the existing door-routed landers: each one forwards its whole query
 * string to sprktrax.org/api/link/<slug> and reads s1 to do it (see FC/index.html
 * :287-294). Because they already walk the door, traffic sent here keeps full
 * attribution — clicks row, click_id, s1/s2/s4/s5 stamping, offer caps and the
 * `pulled` kill switch. Do not point these at /c/:slug; that would route around
 * the door and drop all of it.
 *
 * NOTE: /r now uses the FIRST lander deterministically (not random) to avoid
 * sending traffic to the wrong offer. If you need per-campaign routing, configure
 * campaigns in the store with a specific lander_url.
 */
/**
 * CLFC and CLTU are the dedicated landers for the Carrd-cloaked affiliate funnel — byte-identical
 * copies of the FC and TU canonicals, kept separate from the 50FC/50TU pools so this funnel can be
 * repointed without touching the 200+ numbered folders. Edit FC/index.html or TU/index.html and
 * re-copy; see .claude/skills/tokrwd-landers.
 *
 * LANDERS[0] is the fallback for a Carrd page that is not in CARRD_ROUTES.
 */
export const LANDERS = [
  { name: 'FreeCash', url: 'https://www.tokrwd.co/CLFC' },
  { name: 'Testerup', url: 'https://www.tokrwd.co/CLTU' },
];

/**
 * Which lander a given Carrd page hands off to.
 *
 * Each lander is a DIFFERENT offer — 50FC/FC1 walks the `freecash` door, 50TU/TU1 walks
 * `testerup`. So the choice cannot be arbitrary: a visitor who clicked a FreeCash ad has to
 * land on the FreeCash lander or the wrong offer gets credited.
 *
 * The Carrd script already POSTs its own page URL as `h`, so the Carrd page IS the offer
 * signal — one Carrd page per offer, mapped here. `match` is compared against the hostname
 * and the path, so either a whole subdomain or a specific page works.
 *
 * A Carrd page that is not listed falls through to LANDERS[0]. That is deliberate rather
 * than a 404: an unmapped page still converts, it just converts on the default offer — and
 * the alternative (dropping the click) loses paid traffic outright.
 */
export const CARRD_ROUTES = [
  // { match: 'freecashpage.carrd.co', lander: 'https://www.tokrwd.co/CLFC', name: 'FreeCash' },
  // { match: 'testeruppage.carrd.co', lander: 'https://www.tokrwd.co/CLTU', name: 'Testerup' },
];

/**
 * Resolve the Carrd page URL the script sent as `h` to a lander.
 * Returns '' when nothing matches, so the caller applies its own default.
 */
export function landerForCarrd(carrdUrl) {
  const raw = String(carrdUrl == null ? '' : carrdUrl).trim().toLowerCase();
  if (!raw) return '';
  for (const route of CARRD_ROUTES) {
    const needle = String(route.match || '').trim().toLowerCase();
    if (needle && raw.includes(needle)) return route.lander || '';
  }
  return '';
}

/**
 * Offer links resolved by /c/:slug.
 *
 * mode: 'door'   → 302 to sprktrax.org/api/link/<doorSlug>?s1=<spark code>.
 *                  Use this for anything that must attribute to a SPRK affiliate.
 * mode: 'direct' → 302 straight to the network, carrying the sub-id as
 *                  <forwardParam>. No clicks row and no click_id is minted, so
 *                  conversions can only be matched on whatever the network echoes
 *                  back to /postback. Use only for offers that are NOT in SPRK.
 *
 * enabled: false keeps a slug 404ing rather than redirecting somewhere broken.
 */
export const OFFER_LINKS = [
  // ── Door-routed (full SPRK attribution) ────────────────────────────────────
  { slug: 'freecash', mode: 'door', doorSlug: 'freecash', enabled: true },
  { slug: 'testerup', mode: 'door', doorSlug: 'testerup', enabled: true },
  { slug: 'copper', mode: 'door', doorSlug: 'copper', enabled: true },
  { slug: 'gravypass', mode: 'door', doorSlug: 'gravypass', enabled: true },

  // ── Direct-to-network offers ───────────────────────────────────────────────
  // Testerup US/CA/UK — direct tracking link
  {
    slug: 'testerup-us-off',
    mode: 'direct',
    destination: 'https://www.phef6trk.com/ZKTQ1K/2JSKXKP/',
    forwardParam: 'sub1',
    enabled: true,
  },
  // Testerup US/CA/UK — monetise tracker
  {
    slug: 'testerup-us-mon-off',
    mode: 'direct',
    destination: 'https://montrk.co.uk/?a=26648&c=56132',
    forwardParam: 's1',
    enabled: true,
  },
  // Freecash USA
  {
    slug: 'frrcsh-us-off',
    mode: 'direct',
    destination: 'https://monetisetrk2.co.uk/?a=26648&c=55504',
    forwardParam: 's1',
    enabled: true,
  },
  // Freecash USA (alias — keeping the old slug working)
  {
    slug: 'frrcsh-us-off2',
    mode: 'direct',
    destination: 'https://monetisetrk2.co.uk/?a=26648&c=55504',
    forwardParam: 's1',
    enabled: true,
  },
  // Freecash United Kingdom
  {
    slug: 'frrcsh-uk-off',
    mode: 'direct',
    destination: 'https://monetisetrk4.co.uk/?a=26648&c=55503',
    forwardParam: 's1',
    enabled: true,
  },
  // Freecash Canada
  {
    slug: 'frrcsh-ca-off',
    mode: 'direct',
    destination: 'https://montrk2.co.uk/?a=26648&c=55506',
    forwardParam: 's1',
    enabled: true,
  },
];

/** Base URL of the sprktrax affiliate door. */
export const DOOR_BASE = 'https://sprktrax.org/api/link';

/** Look up an offer link by slug. Disabled links resolve to undefined. */
export function getConfiguredOfferLink(slug) {
  const link = OFFER_LINKS.find(l => l.slug === slug);
  return link && link.enabled !== false ? link : undefined;
}

/**
 * Only ever redirect to https, and never to a host we did not intend. An offer
 * link's destination is operator-supplied, but /c/ is a public endpoint and an
 * unchecked destination is an open redirect one bad config line away.
 */
export function isSafeDestination(url) {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}
