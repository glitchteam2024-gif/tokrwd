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
/**
 * Named landers, so a route is one short line and a typo is a missing key rather than a
 * silently wrong URL. Add a lander here once, reference it from as many routes as you like.
 */
export const LANDER_URLS = {
  FC:   'https://www.tokrwd.co/CLFC',    // Freecash — door, full attribution
  TU:   'https://www.tokrwd.co/CLTU',    // Testerup — door, full attribution
  FCUK: 'https://www.tokrwd.co/CLFCUK',  // Freecash UK — /c/frrcsh-uk-off
  FCCA: 'https://www.tokrwd.co/CLFCCA',  // Freecash CA — /c/frrcsh-ca-off
};

/**
 * Carrd page → lander. One row per Carrd page; scales to as many as you like.
 *
 *   { host: 'thegoodhoodie.carrd.co', lander: LANDER_URLS.FCCA }
 *
 * `host` is matched against the URL's HOSTNAME exactly (case-insensitive). It is deliberately
 * NOT a substring test: with a pool of similarly-named pages, 'hoodie.carrd.co' would match
 * 'thegoodhoodie.carrd.co' and silently steal its traffic. A bare subdomain is accepted as
 * shorthand — 'thegoodhoodie' expands to 'thegoodhoodie.carrd.co'.
 *
 * An unlisted page falls through to LANDERS[0]. Deliberate: an unmapped page still converts on
 * the default offer, where dropping the click would lose paid traffic outright. Run
 * `node api/_lib/_links-config.test.mjs` after editing — it fails on duplicate hosts and on a
 * lander that is not in LANDER_URLS.
 */
/**
 * A row's `lander` is either a LANDER_URLS value or an OVERRIDE_LANDERS alias
 * (a bare string like 'esgp'). See resolveRouteLander for why both are allowed.
 */
export const CARRD_ROUTES = [
  // { host: 'thegoodhoodie.carrd.co', lander: LANDER_URLS.FCCA },
  // { host: 'anotherpage',            lander: LANDER_URLS.TU   },

  // Edwin's page → his own Gravy Pass lander. Bound by HOST, so every click off
  // this Carrd page lands on /ESGP with no `lp=` needed on the ad link.
  { host: 'laboedomegan.carrd.co', lander: 'esgp' },
];

/**
 * Offer keys for the `o=` param on an ad link.
 *
 * This is the way to run many Carrd pages without a deploy per page. Put the offer on the ad
 * link itself and any Carrd page — new, duplicated, rotated after a burn — routes correctly the
 * moment it exists:
 *
 *     https://anypage.carrd.co/?campid=SPK-A1B2-C3D4&o=fcca&ttclid=…
 *
 * Freecash is geo-split (three landers, three offer URLs); Testerup is universal, so `tu` covers
 * US/CA/UK on one page. `fc` and `fcus` are the same lander — `fc` reads naturally when you are
 * not thinking about geo.
 *
 * Unknown or absent `o` falls through to CARRD_ROUTES, then to LANDERS[0]. An unrecognised key is
 * never an error: dropping a paid click is worse than serving the default offer.
 *
 * ADDING A GEO — four edits, and `_links-config.test.mjs` fails if you miss one:
 *   1. cp FC/index.html CLFC<XX>/index.html, and change its `var DOOR = '…'` to the new /c/ slug
 *   2. OFFER_LINKS  += { slug:'frrcsh-<xx>-off', mode:'direct', destination:'<network url>',
 *                        forwardParam:'s1', enabled:true }
 *   3. LANDER_URLS  += FC<XX>: 'https://www.tokrwd.co/CLFC<XX>'
 *   4. OFFER_KEYS   += fc<xx>: LANDER_URLS.FC<XX>
 * Then `node api/_lib/_links-config.test.mjs` and push. No other file changes.
 */
export const OFFER_KEYS = {
  fc:   LANDER_URLS.FC,
  fcus: LANDER_URLS.FC,
  fcca: LANDER_URLS.FCCA,
  fcuk: LANDER_URLS.FCUK,
  tu:   LANDER_URLS.TU,
};

/**
 * Cross-check the three tables that must agree for a geo to actually work end to end:
 * OFFER_KEYS -> LANDER_URLS -> (for direct landers) an enabled OFFER_LINKS slug.
 *
 * The failure this catches is a HALF-ADDED geo — a new key pointing at a lander that does not
 * exist, or a lander whose /c/ slug was never enabled. Both send live traffic to a 404 with no
 * error anywhere; /r happily returns the URL and the click just dies at the lander.
 */
export function offerKeyProblems() {
  const problems = [];
  const landerValues = new Set(Object.values(LANDER_URLS));

  for (const [key, lander] of Object.entries(OFFER_KEYS)) {
    if (!landerValues.has(lander)) {
      problems.push(`OFFER_KEYS.${key} -> "${lander}" is not in LANDER_URLS`);
    }
    if (!/^[a-z0-9]+$/.test(key)) {
      problems.push(`OFFER_KEYS.${key}: keys must be lowercase alphanumeric (the o= param is lowercased)`);
    }
  }

  // Every lander must be reachable by at least one o= key, or it can only be hit via CARRD_ROUTES.
  for (const [name, url] of Object.entries(LANDER_URLS)) {
    if (!Object.values(OFFER_KEYS).includes(url)) {
      problems.push(`LANDER_URLS.${name} has no o= key — it is unreachable except via CARRD_ROUTES`);
    }
  }

  return problems;
}

// Built once at module load. A Map, not the OFFER_KEYS object: a plain-object lookup resolves
// INHERITED keys, so ?o=constructor returned Object and ?o=__proto__ returned Object.prototype —
// a non-string leaking into pickLander. It degraded to the decoy rather than crashing, but only
// by accident.
const OFFER_KEY_MAP = new Map(Object.entries(OFFER_KEYS));

/** Resolve the `o=` offer key from the Carrd page URL. '' when absent or unknown. */
export function landerForOfferKey(carrdUrl) {
  const raw = String(carrdUrl == null ? '' : carrdUrl).trim();
  if (!raw) return '';
  let key;
  try {
    key = (new URL(raw).searchParams.get('o') || '').trim().toLowerCase();
  } catch {
    return '';
  }
  if (!key) return '';
  const lander = OFFER_KEY_MAP.get(key);
  return typeof lander === 'string' ? lander : '';
}

/* ══════════════════════════════════════════════════════════════════════════════
 * LANDER OVERRIDE — test a landing page through the Carrd redirect, no deploy
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `lp=` on the ad link forces ONE specific lander for that link, beating every
 * other routing signal:
 *
 *     https://anypage.carrd.co/?campid=SPK-A1B2-C3D4&lp=trt&ttclid=…
 *
 * That is the whole feature. To split-test lander A against lander B you run two
 * ad links with two `lp` values — no config change, no deploy, and the two arms
 * stay separable in reporting because each arm carries its own spark code.
 *
 * WHY THIS RIDES THE LINK AND NOT THE ADMIN DATABASE
 * There is no database. Every file under api/ is its own Vercel lambda with its
 * own module instance, so an override saved through /api/admin/data lands in the
 * admin lambda's heap and is structurally invisible to /api/r — see the note at
 * the top of this file and in _lib/store.js. A param on the ad link is readable
 * by the lambda that actually makes the decision, which is the only place it
 * can work. The admin dashboard's Test Lander tab BUILDS these links; it does
 * not store them.
 *
 * WHY IT IS SAFE TO LET A PUBLIC URL PICK THE LANDER
 * `lp` arrives from a client-controlled URL, so it is treated as untrusted input
 * and resolved against a HOST ALLOWLIST: it can only ever name a page on a
 * domain we own. A crafted `lp` cannot turn /r into an open redirect and cannot
 * point our paid traffic at someone else's page — the worst it can do is serve
 * one of our own landers, which is what the param is for.
 */

/** The query param that overrides the lander. On the ad link, alongside `campid`. */
export const OVERRIDE_PARAM = 'lp';

/** Where a bare `lp=SOMEPATH` resolves to. The static lander site. */
export const DEFAULT_LANDER_ORIGIN = 'https://www.tokrwd.co';

/**
 * Extra hosts an `lp=` override may point at, beyond DEFAULT_LANDER_ORIGIN and
 * whatever LANDER_URLS already uses. Add a host here ONLY if we own it — this
 * list is the only thing standing between a public query param and an open
 * redirect. Registrable-domain granularity is deliberate: subdomain wildcards
 * would re-open the hole the moment a subdomain is delegated to a third party.
 */
export const EXTRA_LANDER_HOSTS = [];

/** www-insensitive comparison key for a hostname. */
function hostKey(host) {
  return String(host == null ? '' : host).trim().toLowerCase().replace(/^www\./, '');
}

// Every host an override may name: the default origin, every host already in
// LANDER_URLS (so a geo lander stays addressable), and the manual extras.
const LANDER_HOST_SET = (() => {
  const set = new Set();
  const add = (url) => { try { set.add(hostKey(new URL(url).hostname)); } catch { /* skip */ } };
  add(DEFAULT_LANDER_ORIGIN);
  Object.values(LANDER_URLS).forEach(add);
  EXTRA_LANDER_HOSTS.forEach(h => { const k = hostKey(h); if (k) set.add(k); });
  return set;
})();

/**
 * The offers a lander can fire, and the string that PROVES it fires them.
 *
 * `match` is the door substring that must appear in the lander's own HTML. It is
 * the only honest way to know a lander's offer: the door is hardcoded in each
 * page (`var DOOR = …`, or the offer-URL builder in the Spartis landers), so the
 * page itself is the source of truth and this table is the claim being checked.
 * _links-config.test.mjs reads the HTML off disk and fails the build when a claim
 * and a page disagree.
 */
export const OFFERS = {
  freecash:       { label: 'Freecash',             match: 'sprktrax.org/api/link/freecash' },
  testerup:       { label: 'Testerup',             match: 'sprktrax.org/api/link/testerup' },
  copper:         { label: 'Copper',               match: 'sprktrax.org/api/link/copper' },
  gravypass:      { label: 'Gravypass',            match: 'sprktrax.org/api/link/gravypass' },
  'freecash-uk':  { label: 'Freecash UK',          match: '/c/frrcsh-uk-off' },
  'freecash-ca':  { label: 'Freecash CA',          match: '/c/frrcsh-ca-off' },
  'testerup-mon': { label: 'Testerup (Monetise)',  match: '/c/testerup-us-mon-off' },
  'gravypass-esgp': { label: 'Gravy Pass (Edwin)', match: '/c/esgp-off' },
};

/**
 * Landers reachable by `lp=`, each BOUND TO ITS OFFER.
 *
 * The binding is the point. `lp=` picks a page, but every lander hardcodes its own
 * door — so pointing an ad at the wrong page does not fail loudly, it credits the
 * wrong offer and the campaign looks like it is simply converting badly. Declaring
 * the offer here lets three things catch that: the build test (against the real
 * HTML), the admin preview (which names the offer before you spend), and /r (which
 * logs when the ad's `o=` disagrees with the page it was overridden to).
 *
 *   path   — path on the lander site, or a full https URL on an allowlisted host
 *   offer  — key in OFFERS; what this page is expected to fire
 *   owner  — who runs it. SCALERS are self-managed (custom non-SPK campids, settle
 *            by invoice), so their pages live outside the CL* set and this registry
 *            is the only place their lander↔offer pairing is written down.
 *
 * ADDING A SCALER: one line here, then `node api/_lib/_links-config.test.mjs`. The
 * test fails if the path does not resolve, the offer key is unknown, or the page's
 * real door contradicts the declared offer.
 */
export const OVERRIDE_LANDERS = {
  trt: {
    path: '/trt',
    offer: 'testerup-mon',
    owner: 'Trae / TenX — scaler (aff #2)',
  },
  esgp: {
    path: '/ESGP',
    offer: 'gravypass-esgp',
    owner: 'Edwin — scaler (own affiliate link, settles by invoice)',
  },
};

const OVERRIDE_LANDER_MAP = new Map(
  Object.entries(OVERRIDE_LANDERS).map(([k, v]) => [k.trim().toLowerCase(), v])
);

/**
 * Which offer a resolved lander URL fires.
 *
 * Covers the override registry AND the standing CL* landers, so the admin preview
 * can name the offer whichever routing rule won — an `o=fcca` click and an
 * `lp=trt` click are answerable the same way.
 */
const LANDER_OFFERS = new Map([
  [LANDER_URLS.FC,   'freecash'],
  [LANDER_URLS.TU,   'testerup'],
  [LANDER_URLS.FCUK, 'freecash-uk'],
  [LANDER_URLS.FCCA, 'freecash-ca'],
]);

/** Offer key for a resolved lander URL, or '' when the lander is not registered. */
export function offerForLander(landerUrl) {
  const url = String(landerUrl == null ? '' : landerUrl).trim().replace(/\/+$/, '');
  if (!url) return '';
  const direct = LANDER_OFFERS.get(url);
  if (direct) return direct;
  for (const entry of OVERRIDE_LANDER_MAP.values()) {
    if (resolveOverrideLander(entry.path).replace(/\/+$/, '') === url) return entry.offer;
  }
  return '';
}

/** Offer key an ad link's `o=` implies, via the lander it selects. '' when absent. */
export function offerForOfferKey(carrdUrl) {
  return offerForLander(landerForOfferKey(carrdUrl));
}

/**
 * First path segments that are never a landing page — our own routes and asset
 * directories. A lander path resolving to one of these is always a mistake or an
 * attack, in either direction:
 *
 *   lp=admin  put paid traffic on the dashboard
 *   lp=pre    put it on a prelander with nothing to forward to (a dead click)
 *   lp=c/…    fired our own redirector with a client-chosen sub-ID and no ad spend
 *
 * All three resolved cleanly before this list existed — `lp=` accepted any path on
 * our origin, and nothing downstream re-checked it.
 */
const RESERVED_LANDER_ROOTS = new Set(['api', 'c', 'r', 'pre', 'admin', 'js', 'images', 'postback']);

/**
 * Normalise the path half of an override. Returns '' for anything suspicious.
 *
 * Rejects, rather than sanitises, because a rejected override falls through to
 * normal routing (the click still converts) while a half-cleaned one would send
 * paid traffic somewhere nobody chose.
 */
function cleanLanderPath(input) {
  // Query and hash are dropped, not forwarded: /r builds the outbound query
  // itself, and an `lp` that smuggled its own params could set s4 — which
  // SUPPRESSES the door's authoritative offer label (see PASSTHROUGH_PARAMS).
  const path = String(input == null ? '' : input).split(/[?#]/)[0].trim();
  if (!path || path.length > 200) return '';
  const withSlash = path.startsWith('/') ? path : `/${path}`;
  // Letters, digits, dot, dash, underscore, slash. No encoded bytes, no
  // backslashes, no whitespace — the lander folders are all plain ASCII names.
  if (!/^\/[A-Za-z0-9._/-]*$/.test(withSlash)) return '';
  if (withSlash.split('/').some(seg => seg === '..')) return '';
  // Collapse `//` so `lp=//evil.com` cannot survive as a protocol-relative URL.
  const collapsed = withSlash.replace(/\/{2,}/g, '/');
  // Reject our own routes AFTER collapsing, or `lp=//admin` walks straight past this.
  if (RESERVED_LANDER_ROOTS.has(collapsed.split('/')[1].toLowerCase())) return '';
  return collapsed;
}

/**
 * Resolve a literal target (a path, or a full URL) to an absolute lander URL.
 * Aliases are NOT expanded here — see resolveOverrideLander.
 */
function resolveLanderTarget(raw) {
  // An absolute URL. Must be https and on an allowlisted host.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    let u;
    try { u = new URL(raw); } catch { return ''; }
    if (u.protocol !== 'https:') return '';
    if (!LANDER_HOST_SET.has(hostKey(u.hostname))) return '';
    const path = cleanLanderPath(u.pathname);
    if (!path) return '';
    return `https://${u.hostname.toLowerCase()}${path === '/' ? '' : path}`;
  }

  // Anything else is a path on the lander site. `//evil.com` is caught here:
  // cleanLanderPath collapses the double slash, so it degrades to the harmless
  // path /evil.com on our own origin rather than a foreign origin.
  const path = cleanLanderPath(raw);
  if (!path || path === '/') return '';
  return `${DEFAULT_LANDER_ORIGIN}${path}`;
}

/**
 * Resolve one raw override value (an alias, a path, or a full URL) to an
 * absolute lander URL. Returns '' when the value is absent, malformed, or names
 * a host we do not own — the caller then falls through to normal routing.
 */
export function resolveOverrideLander(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';

  // A registered alias is expanded EXACTLY ONCE, then validated on the same path
  // as any other target. One hop, not recursion: an alias table that happened to
  // point two keys at each other would otherwise recurse until the stack blew,
  // and that stack overflow would land inside /r on live traffic.
  const entry = OVERRIDE_LANDER_MAP.get(raw.toLowerCase());
  return resolveLanderTarget(entry ? String(entry.path || '').trim() : raw);
}

/** True when `url` is an https page on a host we own. Gate any server-side fetch on this. */
export function isOwnLanderHost(url) {
  try {
    const u = new URL(String(url == null ? '' : url));
    return u.protocol === 'https:' && LANDER_HOST_SET.has(hostKey(u.hostname));
  } catch {
    return false;
  }
}

/** Read `lp=` off the Carrd page URL and resolve it. '' when absent or invalid. */
export function landerForOverride(carrdUrl) {
  const raw = String(carrdUrl == null ? '' : carrdUrl).trim();
  if (!raw) return '';
  let value;
  try {
    value = new URL(raw).searchParams.get(OVERRIDE_PARAM) || '';
  } catch {
    return '';
  }
  return resolveOverrideLander(value);
}

/**
 * Validate OVERRIDE_LANDERS. Every failure here is silent at runtime, which is why
 * it is a build check: an alias that does not resolve makes `lp=<alias>` fall
 * through to the DEFAULT offer, so the campaign runs, spends, and reports numbers
 * that belong to a different offer than the one being tested.
 *
 * The door-matches-declared-offer check needs the lander HTML and therefore lives
 * in _links-config.test.mjs — this module must not import fs, it runs in a lambda.
 */
export function overrideLanderProblems() {
  const problems = [];
  for (const [key, entry] of Object.entries(OVERRIDE_LANDERS)) {
    if (!/^[a-z0-9-]+$/.test(key)) {
      problems.push(`OVERRIDE_LANDERS.${key}: keys must be lowercase alphanumeric or dashes (lp= is lowercased)`);
    }
    if (!entry || typeof entry !== 'object') {
      problems.push(`OVERRIDE_LANDERS.${key}: must be an object { path, offer, owner }`);
      continue;
    }
    if (!resolveOverrideLander(entry.path)) {
      problems.push(`OVERRIDE_LANDERS.${key} -> "${entry.path}" does not resolve (bad path, or a host outside the allowlist)`);
    }
    if (!entry.offer) {
      problems.push(`OVERRIDE_LANDERS.${key}: missing offer — an unbound lander can credit the wrong offer with nothing to catch it`);
    } else if (!Object.prototype.hasOwnProperty.call(OFFERS, entry.offer)) {
      problems.push(`OVERRIDE_LANDERS.${key}: offer "${entry.offer}" is not in OFFERS`);
    }
    if (!entry.owner) {
      problems.push(`OVERRIDE_LANDERS.${key}: missing owner — say whose page this is (scaler name, or "house")`);
    }
  }
  return problems;
}

/** Normalise a route's `host` field: accepts a bare subdomain or a full hostname. */
function normHost(host) {
  const h = String(host == null ? '' : host).trim().toLowerCase().replace(/^www\./, '');
  if (!h) return '';
  return h.includes('.') ? h : `${h}.carrd.co`;
}

// Built once at module load — 50+ routes resolve by hash lookup instead of a linear scan.
const CARRD_HOST_MAP = (() => {
  const map = new Map();
  for (const route of CARRD_ROUTES) {
    const h = normHost(route.host);
    if (h && route.lander && !map.has(h)) map.set(h, route.lander);
  }
  return map;
})();

/**
 * Resolve a CARRD_ROUTES `lander` field to an absolute lander URL.
 *
 * Accepts two forms:
 *   - a LANDER_URLS value        — the standing, `o=`-addressable landers
 *   - an OVERRIDE_LANDERS alias  — a bare key like 'esgp'
 *
 * The alias form exists because a scaler lander is deliberately absent from
 * LANDER_URLS: that is what stops any `o=` key on a public ad link from routing
 * traffic onto somebody's private affiliate deal. Binding ONE named Carrd page to
 * it is a different decision — made by an operator, here in committed config,
 * not by whatever a client puts on the URL — so it is allowed.
 *
 * Anything else resolves to '' and is reported by carrdRouteProblems(). Returning
 * '' rather than the raw string is the load-bearing part: a typo'd URL would
 * otherwise be handed to the Carrd script and 404 every click on that page.
 *
 * Resolved lazily, at call time, NOT at module load: CARRD_ROUTES is declared
 * above OVERRIDE_LANDERS in this file, so expanding an alias inside the array
 * literal would hit the temporal dead zone on OVERRIDE_LANDER_MAP.
 */
export function resolveRouteLander(target) {
  const raw = String(target == null ? '' : target).trim();
  if (!raw) return '';
  if (OVERRIDE_LANDER_MAP.has(raw.toLowerCase())) return resolveOverrideLander(raw);
  return Object.values(LANDER_URLS).includes(raw) ? raw : '';
}

/**
 * Every lander a CARRD_ROUTES row may point at, for the admin assignment UI.
 * One source of truth, so the dropdown cannot offer something the validator
 * would then reject.
 */
export function routableLanders() {
  const rows = Object.entries(LANDER_URLS).map(([name, url]) => ({
    key: url, name, url, offer: offerForLander(url), kind: 'standing', owner: '',
  }));
  for (const [alias, entry] of Object.entries(OVERRIDE_LANDERS)) {
    const url = resolveOverrideLander(entry.path);
    if (url) {
      rows.push({
        key: alias, name: alias, url, offer: entry.offer, kind: 'override',
        owner: entry.owner || '',
      });
    }
  }
  return rows;
}

/**
 * Resolve the Carrd page URL the script sent as `h` to a lander.
 * Returns '' when nothing matches, so the caller applies its own default.
 */
export function landerForCarrd(carrdUrl) {
  const raw = String(carrdUrl == null ? '' : carrdUrl).trim();
  if (!raw) return '';
  let host;
  try {
    host = new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return ''; // not a URL — fall back to the default lander rather than guessing
  }
  return resolveRouteLander(CARRD_HOST_MAP.get(host) || '');
}

/**
 * Validate the route table. Returns an array of problems (empty = fine).
 * Exported so the test suite fails the build-equivalent rather than shipping a silent misroute.
 */
export function carrdRouteProblems() {
  const problems = [];
  const seen = new Map();

  CARRD_ROUTES.forEach((route, i) => {
    const h = normHost(route.host);
    if (!h) { problems.push(`route ${i}: missing or empty host`); return; }
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(h)) problems.push(`route ${i}: "${route.host}" is not a valid hostname`);
    if (seen.has(h)) problems.push(`duplicate host "${h}" (routes ${seen.get(h)} and ${i}) — the first wins, the second is dead`);
    else seen.set(h, i);
    if (!route.lander) problems.push(`route ${i} (${h}): missing lander`);
    else if (!resolveRouteLander(route.lander)) {
      problems.push(
        `route ${i} (${h}): lander "${route.lander}" is neither a LANDER_URLS value nor an OVERRIDE_LANDERS alias`
      );
    }
  });

  return problems;
}

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
 *
 * Lives beside resolveLander so the admin preview builds the byte-identical URL
 * that live traffic gets, `lp=` override included.
 */
export function buildLanderUrl(landerUrl, campid, carrdUrl) {
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

/* ══════════════════════════════════════════════════════════════════════════════
 * THE PRELANDER — /pre, in front of every landing page
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * TikTok's in-app webview has been failing on real devices, so a click is handed
 * to the visitor's real browser before it reaches the offer page:
 *
 *     ad -> Carrd -> /r -> /pre?…&to=/CLFC -> lander -> door -> offer
 *
 * WHY THE WRAP HAPPENS HERE AND NOT IN THE LANDERS
 * /r is the single choke point every routing rule already passes through — `lp=`,
 * campaign, `o=`, CARRD_ROUTES and the default all funnel into resolveLander().
 * Wrapping its answer gives every one of them a prelander while leaving all ~1000
 * lander files untouched, and keeps the escape mechanism in exactly one page
 * (pre/index.html + js/breakout.js) instead of smeared across the tree. That
 * containment is what _tracking-audit.test.mjs now enforces.
 *
 * WHY IT IS NOT DONE INSIDE buildLanderUrl()
 * buildLanderUrl answers "what is the lander URL for this click?", and the admin
 * panel, the tests and traceOfferChain all rely on that answer being the lander.
 * The prelander is a separate, switchable hop in front of it.
 *
 * The wrap FAILS OPEN: anything it cannot safely wrap is returned unchanged, so a
 * lander outside PRELANDER_ALLOWED_ROOTS loses its prelander rather than its click.
 */

/** Where the prelander lives. Served from pre/index.html by cleanUrls. */
export const PRELANDER_PATH = '/pre';

/** The param carrying the lander PATH the prelander forwards to. */
export const PRELANDER_PARAM = 'to';

/**
 * The kill switch. Flip to false and deploy to take the prelander back out of every
 * funnel at once — /r goes straight to the lander again and the admin panel stops
 * showing the hop. Nothing else has to change.
 */
export const PRELANDER_ENABLED = true;

/**
 * First path segment of every page /pre may forward to, lowercased.
 *
 * MUST STAY IN SYNC with ALLOWED_ROOTS in js/breakout.js — _links-config.test.mjs
 * reads that file off disk and fails the build when the two disagree, because the
 * drift is silent in both directions: /r would emit a `to` the page then refuses,
 * and the visitor would sit on a prelander that goes nowhere.
 *
 * An allowlist, not a denylist, because `to` is read from a public URL on a static
 * page. Left free-form it would let anyone fire /c/<slug> with an arbitrary sub-ID
 * and no ad spend, reach /api/*, or point /pre at itself and loop forever.
 *
 * Deliberately absent: `go`, `Playful`, `ApplePay`, `EOZ.html`. They are orphaned
 * redirector pages, not landers; nothing routes to them, and if something ever does
 * the fail-open behaviour just means no prelander.
 */
export const PRELANDER_ALLOWED_ROOTS = [
  '50fc', '50fcii', '50tu', 'ak50', 'ap50', 'apay1k', 'apay750', 'cash', 'cb',
  'cb50', 'cbak', 'clfc', 'clfcca', 'clfcuk', 'cltu', 'cr50', 'cs50', 'esgp',
  'fc', 'fcash', 'fctt.html', 'gp', 'pg50', 'pgrd', 'rs', 'rs50', 'rewards',
  'seph', 'sh50', 'shein', 'sp50', 'tsup', 'tu', 'uber', 'ue50', 'trt',
];

const PRELANDER_ROOT_SET = new Set(PRELANDER_ALLOWED_ROOTS);

/**
 * True when /pre is allowed to forward to this path.
 *
 * cleanLanderPath already rejects RESERVED_LANDER_ROOTS, traversal and anything
 * protocol-relative; this adds the positive allowlist on top, so a page has to be a
 * known lander rather than merely not-obviously-hostile.
 */
export function prelanderCanForward(path) {
  const clean = cleanLanderPath(path);
  if (!clean || clean === '/') return false;
  return PRELANDER_ROOT_SET.has(clean.split('/')[1].toLowerCase());
}

/**
 * Put the prelander in front of a resolved lander URL.
 *
 * Every param stays TOP-LEVEL on the /pre URL — s1 especially. Folding them into
 * the `to` value would hide the spark code from anything that inspects the link,
 * and js/breakout.js rebuilds the lander URL from the top-level query anyway.
 *
 * Returns the input unchanged when the prelander is off, the URL is unparseable, or
 * the path is not one /pre will forward to. Losing the prelander is recoverable;
 * losing the click is not.
 */
export function wrapPrelander(landerUrl) {
  if (!PRELANDER_ENABLED) return landerUrl;

  const raw = String(landerUrl == null ? '' : landerUrl).trim();
  if (!raw) return landerUrl;

  let u;
  try {
    u = new URL(raw);
  } catch {
    return landerUrl;
  }
  if (u.protocol !== 'https:') return landerUrl;

  // The prelander only exists on hosts we deploy. Without this the wrap would bolt
  // /pre onto whatever origin the lander was on — and resolveLander's `campaign`
  // branch returns a store-supplied lander_url gated ONLY by isSafeDestination
  // (https, any host). A campaign mapped to a third-party URL would have turned every
  // one of its clicks into a 404 on someone else's domain.
  if (!isOwnLanderHost(raw)) return landerUrl;

  const path = cleanLanderPath(u.pathname);
  if (!prelanderCanForward(path)) return landerUrl;

  const pre = new URL(`${u.origin}${PRELANDER_PATH}`);
  for (const [key, value] of u.searchParams) pre.searchParams.set(key, value);
  // Set last so `to` reads at the end of the link rather than buried mid-query.
  pre.searchParams.set(PRELANDER_PARAM, path);
  return pre.toString();
}

/** True when this URL is a /pre link rather than a lander. */
export function isPrelanderUrl(url) {
  try {
    return new URL(String(url == null ? '' : url)).pathname.replace(/\/+$/, '') === PRELANDER_PATH;
  } catch {
    return false;
  }
}

/**
 * THE routing decision: which lander does this click get?
 *
 * Lives here rather than in api/r.js so the admin dashboard's "where does this
 * link actually go?" preview runs the SAME code as live traffic. A preview that
 * re-implemented the precedence would drift, and it would drift silently — the
 * screen would say FreeCash while the click went to Testerup.
 *
 * Each lander is a DIFFERENT offer, so this is never arbitrary: a visitor who
 * clicked a FreeCash ad must land on the FreeCash lander or the wrong offer gets
 * credited. Deterministic at every step — an early version picked at random and
 * sent roughly two thirds of FreeCash traffic to Testerup or Copper.
 *
 * Precedence, highest first:
 *   1. `lp=` on the ad link — the operator's explicit override. It wins outright,
 *      including over a campaign mapping, because that is what makes it usable as
 *      a test: pointing one ad link at a new lander must not require unpicking
 *      whatever else already matches that Carrd page.
 *   2. a campaign explicitly mapped to a lander (admin store — per-lambda scratch,
 *      so in practice only ever set within one warm instance)
 *   3. `o=` offer key on the ad link (o=fcca, o=tu, …) — the durable way to run a
 *      new or rotated Carrd page with no config change and no deploy
 *   4. the Carrd page the click came from (CARRD_ROUTES)
 *   5. the first configured lander
 *
 * Returns { url, source, offer, offerConflict }. `source` is what the dashboard
 * shows and what makes a misroute diagnosable — "which of the five rules fired?"
 * is otherwise guesswork. `offer` is what the chosen lander actually fires, and
 * `offerConflict` is set when the ad link's own `o=` names a DIFFERENT offer than
 * the page it was overridden to: the click still goes through (dropping paid
 * traffic is worse) but the disagreement is surfaced instead of swallowed.
 * url is '' only when nothing is configured at all.
 */
export function resolveLander({ carrdUrl = '', campid = '', campaigns = {} } = {}) {
  // One shape from every branch: the admin panel and /r both read `offer`, and a
  // branch that quietly omitted it would read as "this lander fires no offer".
  const pick = (url, source) => {
    const offer = offerForLander(url);
    // The ad was bought against SOME offer; `o=` is the only place the link says
    // which. When an override sends the click to a page that fires a different
    // one, the conversion credits that other offer and the campaign merely looks
    // weak — so surface the disagreement rather than swallowing it.
    const adOffer = offerForOfferKey(carrdUrl);
    const conflict = source === 'override' && adOffer && offer && adOffer !== offer;
    return {
      url,
      source,
      offer,
      offerConflict: conflict ? { adOffer, landerOffer: offer } : null,
    };
  };

  const byOverride = landerForOverride(carrdUrl);
  if (byOverride) return pick(byOverride, 'override');

  // Own-property lookup only: campaigns is keyed by a client-supplied campid, so a
  // plain `campaigns[campid]` resolves INHERITED keys — ?campid=constructor would
  // hand back Object and put a function where a lander URL belongs.
  const campaign = campid && Object.prototype.hasOwnProperty.call(campaigns, campid)
    ? campaigns[campid]
    : null;
  // set_campaign stores lander_url with no validation, and whatever comes back here
  // is handed to the Carrd script, which runs `location.replace(url)` on it. Without
  // this check a stored `javascript:…` lander_url executes on the Carrd page. https
  // only, same rule /c/:slug applies to its own operator-supplied destinations.
  if (campaign && typeof campaign.lander_url === 'string' && isSafeDestination(campaign.lander_url)) {
    return pick(campaign.lander_url, 'campaign');
  }

  const byOffer = landerForOfferKey(carrdUrl);
  if (byOffer) return pick(byOffer, 'offer_key');

  const byCarrd = landerForCarrd(carrdUrl);
  if (byCarrd) return pick(byCarrd, 'carrd_route');

  // Unmapped Carrd page → default offer rather than dropping a paid click.
  if (LANDERS.length > 0) return pick(LANDERS[0].url, 'default');

  return { url: '', source: 'none', offer: '', offerConflict: null };
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
  // Reco Social — was hardcoded inside api/reco.js, which put a live network URL
  // outside this table: it could not be capped, killed with `enabled:false`, or even
  // found by the tracking audit. Same advertiser + campaign, now config-driven.
  {
    slug: 'reco-social-off',
    mode: 'direct',
    destination: 'https://montrk3.co.uk/?a=26648&c=56065',
    forwardParam: 's1',
    enabled: true,
  },
  // Gravy Pass — Edwin's OWN affiliate link, fired only by the /ESGP scaler lander.
  //
  // `direct` because the payout is Edwin's, not ours: the click must not walk the SPRK
  // door, which would resolve it to a SPRK affiliate and credit the conversion inside our
  // network. He settles by invoice off his own network numbers, so `sub1` carrying the
  // spark code is purely so we can reconcile his reported volume against our traffic —
  // there is no clicks row and no click_id on this path, by design.
  {
    slug: 'esgp-off',
    mode: 'direct',
    destination: 'https://www.phef6trk.com/213T8QJ/32BB7QT/',
    forwardParam: 'sub1',
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
 * Build a direct-mode destination by STRING CONCATENATION, not URL.searchParams.
 *
 * searchParams.set() round-trips the existing query, which rewrites
 * `extra=a%20b` → `extra=a+b` and `?flag` → `?flag=`. Tracker tokens can be
 * sensitive to both, so the operator-supplied destination is never re-serialised.
 *
 * Lives here rather than in api/c/[slug].js because the admin panel shows the
 * scaler the exact URL their network will receive. Two copies of this would drift,
 * and the drift would be invisible: the screen would promise one sub-ID param
 * while the redirect sent another, which is precisely the thing a scaler is
 * trusting the screen about.
 */
export function buildDirectUrl(destination, forwardParam, subId, extras = {}) {
  let url = String(destination || '');
  const sep = url.includes('?') ? '&' : '?';
  const parts = [];

  if (subId) {
    parts.push(encodeURIComponent(forwardParam) + '=' + encodeURIComponent(subId));
  }
  for (const [key, val] of Object.entries(extras)) {
    if (val) parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(val));
  }

  return parts.length ? url + sep + parts.join('&') : url;
}

/**
 * Every hop a click walks from a lander to the network, computed from config.
 *
 * This is the question a scaler actually asks: "what sub-ID will I see in my own
 * reports, and in which param?" Answering it from the same OFFER_LINKS row and the
 * same builder /c/:slug uses at runtime is the whole point — a re-implementation
 * would let the panel promise a sub-ID the redirect does not send.
 *
 * Returns { ok, offer, offer_label, mode, slug, hops[], tracks_as, reason }.
 * `ok:false` with a `reason` whenever the chain cannot complete, because every one
 * of those cases is silent in production: the visitor just meets a 404 or the
 * conversion lands unattributed.
 *
 * `hops[]` steps, in order: 'Prelander' (only when /pre fronts this lander),
 * 'Landing page', then either 'SPRK door' or 'Our redirector' + 'Their network'.
 * Read them by STEP NAME, never by index — the prelander hop shifts every position.
 */
export function traceOfferChain(landerUrl, subId, extras = {}) {
  const lander = String(landerUrl || '').trim();
  if (!lander) return { ok: false, reason: 'No landing page selected.' };

  const code = extractSparkCode(subId);
  const carry = {};
  if (extras.ttclid) carry.ttclid = String(extras.ttclid).trim();
  if (extras.s3) carry.s3 = String(extras.s3).trim();

  const hops = [];
  const landerWithSub = new URL(lander);
  if (code) landerWithSub.searchParams.set(SUBID_PARAM, code);
  for (const [k, v] of Object.entries(carry)) landerWithSub.searchParams.set(k, v);

  // The prelander is what /r actually hands the Carrd page, so it is the first hop
  // the click walks — built by the SAME wrapPrelander() live traffic gets, never
  // re-derived here. Absent when the prelander is switched off or the lander is not
  // one /pre will forward to, which is exactly when live traffic skips it too.
  const preUrl = wrapPrelander(landerWithSub.toString());
  if (preUrl !== landerWithSub.toString()) {
    hops.push({ step: 'Prelander', url: preUrl });
  }
  hops.push({ step: 'Landing page', url: landerWithSub.toString() });

  const offer = offerForLander(lander);
  if (!offer) {
    return {
      ok: false, offer: '', offer_label: '', hops,
      reason: 'This landing page is not bound to an offer, so the outbound hop cannot be derived. ' +
              'Add it to OVERRIDE_LANDERS (path + offer + owner).',
    };
  }
  const label = (OFFERS[offer] && OFFERS[offer].label) || offer;
  const match = String((OFFERS[offer] && OFFERS[offer].match) || '');

  // A door-routed offer: the door re-stamps subids itself, so what the affiliate
  // ends up seeing is decided there, not here. Say so instead of inventing it.
  const doorMatch = match.match(/^sprktrax\.org\/api\/link\/([a-z0-9-]+)$/i);
  if (doorMatch) {
    const doorUrl = new URL(`${DOOR_BASE}/${doorMatch[1]}`);
    doorUrl.searchParams.set('s1', code);
    for (const [k, v] of Object.entries(carry)) doorUrl.searchParams.set(k, v);
    hops.push({ step: 'SPRK door', url: doorUrl.toString() });
    return {
      ok: true, offer, offer_label: label, mode: 'door', slug: doorMatch[1], hops,
      tracks_as: 's1 → the door rewrites it: the affiliate number lands in s1, the spark code moves ' +
                 'to s2, and a click_id is minted into s5.',
    };
  }

  const slugMatch = match.match(/^\/c\/([a-z0-9-]+)$/i);
  if (!slugMatch) {
    return { ok: false, offer, offer_label: label, hops, reason: `Offer "${offer}" has an unrecognised match string.` };
  }
  const slug = slugMatch[1];
  const link = getConfiguredOfferLink(slug);
  if (!link) {
    return {
      ok: false, offer, offer_label: label, slug, hops,
      reason: `/c/${slug} is missing or disabled in OFFER_LINKS, so this hop 404s. ` +
              'Every click on this page would die there.',
    };
  }

  const hop = new URL(`${DEFAULT_LANDER_ORIGIN}/c/${slug}`);
  if (code) hop.searchParams.set('campid', code);
  for (const [k, v] of Object.entries(carry)) hop.searchParams.set(k, v);
  hops.push({ step: 'Our redirector', url: hop.toString() });

  if (link.mode === 'door') {
    const doorUrl = new URL(`${DOOR_BASE}/${link.doorSlug || slug}`);
    doorUrl.searchParams.set('s1', code);
    for (const [k, v] of Object.entries(carry)) doorUrl.searchParams.set(k, v);
    hops.push({ step: 'SPRK door', url: doorUrl.toString() });
    return {
      ok: true, offer, offer_label: label, mode: 'door', slug, hops,
      tracks_as: 's1 → the door rewrites it before the network sees it.',
    };
  }

  if (!link.destination || !isSafeDestination(link.destination)) {
    return {
      ok: false, offer, offer_label: label, slug, hops,
      reason: `/c/${slug} has no usable https destination, so it 404s.`,
    };
  }

  const forwardParam = link.forwardParam || link.forward_param || 'sub1';
  hops.push({
    step: 'Their network',
    url: buildDirectUrl(link.destination, forwardParam, code, carry),
  });

  return {
    ok: true, offer, offer_label: label, mode: 'direct', slug, hops,
    forward_param: forwardParam,
    tracks_as: code
      ? `${forwardParam}=${code} — this is the value they look for in their own reports.`
      : `${forwardParam} — empty, because no tracking code was given. The click still converts, ` +
        'but it lands unattributed in their reports.',
  };
}

/**
 * The URL of one named hop in a traced chain, or '' when that hop is absent.
 *
 * Every consumer must go through this rather than indexing `hops[]`: the prelander
 * hop shifts every later position, and the last time a consumer hard-coded an index
 * (`hops[2]` for the network) it kept returning a URL — just the wrong one.
 */
export function hopUrl(chain, step) {
  const hops = (chain && chain.hops) || [];
  const hit = hops.find(h => h && h.step === step);
  return hit ? hit.url : '';
}

/** Carrd pages bound to this lander by host, so the panel can show the real ad link. */
export function carrdHostsForLander(landerUrl) {
  const target = String(landerUrl || '').trim().replace(/\/+$/, '');
  if (!target) return [];
  const hosts = [];
  for (const [host, value] of CARRD_HOST_MAP.entries()) {
    if (resolveRouteLander(value).replace(/\/+$/, '') === target) hosts.push(host);
  }
  return hosts;
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
