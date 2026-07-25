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
 * Params worth carrying from the Carrd page through to the lander and the door.
 * ttclid is TikTok's click id (CAPI match quality); s3 is the ad account, and it
 * is only honoured downstream when its sprk_sig HMAC rides along with it.
 */
export const PASSTHROUGH_PARAMS = ['ttclid', 's2', 's3', 'sprk_sig', 'sprk_geo'];

/**
 * Spark codes minted by SPRK's generateSPKCode() are `SPK-` + 4 hex + `-` + 4 hex,
 * and spark_test_mint() appends `-N` for relaunch children. Self-managed and
 * scaler affiliates may instead carry a CUSTOM code — the only rule SPRK enforces
 * is that a custom code must not start with `SPK-`. So: extract an SPK when the
 * campid embeds one, otherwise pass the campid through untouched.
 */
const SPK_RE = /(SPK-[0-9A-F]{4}-[0-9A-F]{4}(?:-\d+)?)/i;

/**
 * Pull the spark code out of a campid.
 *
 * Accepts a bare code (`SPK-A1B2-C3D4`) or one embedded in a longer campaign
 * string (`ACCT_SPK-A1B2-C3D4_US_001`). Falls back to the raw value so a custom
 * scaler code survives intact.
 *
 * Returns '' for empty input — callers must treat that as "do not build a door
 * URL", because the door 404s without an s1 and we would rather fail visibly here.
 */
export function extractSparkCode(campid) {
  const raw = String(campid == null ? '' : campid).trim();
  if (!raw) return '';
  const m = raw.match(SPK_RE);
  return m ? m[1].toUpperCase() : raw;
}

/** True when the value is a canonical SPRK-minted spark code. */
export function isCanonicalSpk(value) {
  const m = String(value == null ? '' : value).match(SPK_RE);
  return !!m && m[1].length === String(value).trim().length;
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
 */
export const LANDERS = [
  { name: 'FreeCash', url: 'https://www.tokrwd.co/FC', weight: 1 },
  { name: 'Testerup', url: 'https://www.tokrwd.co/TU', weight: 1 },
  { name: 'Copper', url: 'https://www.tokrwd.co/CB', weight: 1 },
];

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

  // ── Direct-to-network (no door, no click_id) ───────────────────────────────
  {
    slug: 'testerup-us-off',
    mode: 'direct',
    destination: 'https://www.phef6trk.com/ZKTQ1K/2JSKXKP/',
    forwardParam: 'sub1',
    enabled: true,
  },
  {
    slug: 'frrcsh-us-off2',
    mode: 'direct',
    // INCOMPLETE — the destination was supplied truncated as
    // "https://monetisetrk4.co.uk/?a=26648&c=..." and appears in neither repo.
    // Fill in the real `c=` campaign id and flip enabled to true.
    destination: 'https://monetisetrk4.co.uk/?a=26648',
    forwardParam: 's1',
    enabled: false,
  },
  {
    slug: 'testerup-us-mon-off',
    mode: 'direct',
    // INCOMPLETE — same as above. Note two different campaign ids are already in
    // play on monetisetrk8 elsewhere in this repo (c=56132 is TSUP, c=55504 is
    // Rewards); do not guess which one belongs here.
    destination: 'https://monetisetrk8.co.uk/?a=26648',
    forwardParam: 's1',
    enabled: false,
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
