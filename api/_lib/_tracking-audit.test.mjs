// Tracking audit — every outbound hop in this repo must run through OUR tracking.
//
//   node "api/_lib/_tracking-audit.test.mjs"
//
// THE RULE (Migi, 2026-07-26): "make sure everything in our repo connects to our ways
// of tracking… make sure everything is tracked with our bot."
//
// A hop we do not run is a hop we cannot cap, kill, or reconcile against CAKE — and it
// diverges from this repo's config silently, while looking perfectly healthy. That is
// not hypothetical: trt/index.html pointed at buenohoodies.com/c/testerup-us-mon-off,
// a separate deploy where the SAME slug resolved to a different tracker than ours, so
// no edit to OFFER_LINKS could ever reach it.
//
// This scans the deployed HTML/JS for offer destinations and fails on anything that is
// not ours. NETWORK_HOST_RE lists the network hosts that may only ever appear inside
// OFFER_LINKS; EXCEPTIONS lists the offenders we have consciously deferred, and they are
// printed on every run so a carve-out cannot quietly become permanent.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { OFFER_LINKS, DOOR_BASE } from './links-config.js';

let pass = 0, fail = 0;

/**
 * Report a set of offending "file: detail" strings, splitting them into the ones we
 * have already decided to live with and the ones that are new. Only new ones fail.
 */
const report = (name, offenders) => {
  const known = [], fresh = [];
  for (const o of offenders) {
    const file = o.split(':')[0].trim();
    (Object.prototype.hasOwnProperty.call(EXCEPTIONS, file) ? known : fresh).push(o);
  }
  console.log(`${fresh.length ? 'FAIL' : 'PASS'}  ${name}`);
  if (fresh.length) { fresh.forEach(o => console.log(`   NEW: ${o}`)); fail++; } else pass++;
  // Deduped: EOZ.html alone hits 15 times, and 15 identical lines read as 15 problems.
  [...new Set(known.map(o => o.split(':')[0].trim()))].forEach(f =>
    console.log(`   known: ${f} — ${EXCEPTIONS[f]}`));
};

const REPO = new URL('../../', import.meta.url);

/** Hosts that ARE our tracking. Everything else is a third party. */
const OUR_TRACKING_HOSTS = new Set([
  'sprktrax.org',        // the door + /aff_c — full attribution, "our bot"
  'appflowconnect.com',  // our cloaker domain, runs this repo's /c/:slug
  'www.tokrwd.co',       // the lander site, also runs /c/:slug
  'tokrwd.co',
]);

/**
 * Network / tracker hosts. These are fine INSIDE OFFER_LINKS — that is the one table
 * that is allowed to name a network — but a lander that links to one directly has
 * jumped the rails.
 */
// Matched against a parsed HOSTNAME, not against raw text: `https://www.trendhavenn.com`
// slipped past an earlier text-anchored version of this check because of the `www.`,
// which is precisely the kind of miss that makes an audit worse than no audit.
const NETWORK_HOST_RE = /^(?:.*\.)?(?:monetisetrk\d*|montrk\d*|phef6trk|affrkr|trendhavenn|buenohoodies)\.(?:co\.uk|com)$/i;

// Files that legitimately contain network hosts or archived cloaking, and never deploy.
//
// `_lp-generator` is build tooling — it is in .vercelignore, so nothing in it is ever served, and a
// generator has to NAME the cloaking patterns it refuses in order to refuse them (playful.js asserts
// on 'intent://', '__SUBID_OK', 'musical_ly'…). Skipping the directory costs no coverage: every file
// a generator WRITES lands in the tree (PLAY/, PR50/, 50FC/, 50TU/…) and is scanned below, which is
// the artifact that actually deploys. A stale template that was never re-run cannot reach a visitor.
const SKIP_DIRS = new Set(['.git', 'node_modules', 'justincase', 'SIGNAT~1', 'images', '.claude', '.vercel', '_lp-generator']);
// The audit's own fixtures, the config table, and the cloaking-detector QA tooling.
const SKIP_FILES = new Set([
  'api/_lib/links-config.js',      // the one place a network host belongs
  'api/_lib/_tracking-audit.test.mjs',
  'api/_lib/_links-config.test.mjs',
  'api/_lib/_prelander-page.test.mjs',  // ditto — it asserts ON the breakout patterns
  'api/_lib/_partner-links.test.mjs',   // its fixtures are partner destinations, i.e. network URLs
  'api/_lib/_partner-store.test.mjs',   // ditto — it drives the real handlers with them
  'api/_lib/_partner-portal.test.mjs',  // ditto — the partner-facing half
  'api/detector.js', 'api/harness.js', 'api/signatures.js', // cloaking QA tooling
  'admin/index.html', 'admin/carrd-script.js',              // dashboard + paste-in snippet
]);

/**
 * Known offenders that still need a BUSINESS decision, not a code change — each one
 * would change which offer gets credited, so it is Migi's call, not a refactor.
 *
 * These are printed loudly on every run rather than silently skipped: an exception
 * list that reads as "clean" is how a temporary carve-out becomes permanent. The audit
 * fails on anything NOT listed here, so nothing new can slip in.
 */
const EXCEPTIONS = {
  'api/affrkr.js': 'Playful → affrkr.com. Opaque token (es4v=…), no campaign id we can map to an OFFER_LINKS slug. Page is live but orphaned (nothing in the repo links to it). DECIDE: which offer should this credit, or retire the page?',
  'api/copper.js': 'ApplePay → trendhavenn.com/copper-play-earn.html, an external LANDER. We run the Copper offer ourselves (door slug `copper`, our own CB lander). Page is live but orphaned. DECIDE: re-point at /c/copper (our door, full attribution), or is trendhavenn part of the deal?',
  'mgfrcsh/index.html': 'Links straight to montrk5 (Monetise) from OUTSIDE the numbered clone structure, so the per-geo check below cannot judge it. PRE-EXISTING — it is an owner-mode page (see migrations/2026-08-10_mgfrcsh_owner_mode.sql in SPRKNetworkAds), not part of the 2026-08-11 direct-offer rollout. DECIDE: fold it into a numbered slice so its geo is checkable, or confirm one hardcoded geo is correct for it forever.',
  'EOZ.html': 'Third-party tracker script vmry7.ttrk.io/track.js (×15 campaign ids). Its OFFER hop is already ours (/api/redirect → sprktrax /aff_c); it is the tracking SCRIPT that is not. Page is live but orphaned. DECIDE: drop the script, or keep it as a client-facing report?',
};

function walk(dir, out = []) {
  for (const name of readdirSync(new URL(dir, REPO))) {
    if (SKIP_DIRS.has(name)) continue;
    const rel = dir === './' ? name : `${dir}${name}`;
    let st;
    try { st = statSync(new URL(rel, REPO)); } catch { continue; }
    if (st.isDirectory()) walk(`${rel}/`, out);
    else if (/\.(html|js|mjs)$/.test(name) && !SKIP_FILES.has(rel)) out.push(rel);
  }
  return out;
}

const files = walk('./');
console.log(`scanning ${files.length} deployed file(s)\n`);

// ── 1. A lander's network link must be the RIGHT one for its slice and geo ────
//
// ⚠️ THIS CHECK CHANGED MEANING ON 2026-08-11, BY OWNER DECISION. It used to be "no deployed file
// may link straight to a network tracker at all" — because every lander routed through the SPRK
// door, and a direct link was by definition a bypass. Migi removed the door from the funnel: the
// lander now links to the network itself, carrying s1=<SPK>, s2=<affiliate id>, s3=<ad account>
// and a unique s5. So "links to a tracker" is no longer the defect.
//
// WHAT REPLACED IT IS A REAL RISK, AND IT IS WHY THIS CHECK WAS NARROWED RATHER THAN DELETED.
// The door used to resolve the per-geo destination per click (offers.destination_by_geo). Hardcoding
// it into the page moves that lookup into 1,410 static files, and Freecash alone is SEVEN campaign
// ids — /50FC/GB1 must reach c=55503, not the US c=55504. A wrong-geo link does not error: it pays
// out against another country's campaign, on a page quoting the wrong currency, and nothing in the
// funnel notices. So the invariant is now "the link matches this clone's own slice and geo", and a
// copy-paste or a stale campaign id fails the build.
//
// KEEP THIS TABLE IN STEP WITH SPRKNetworkAds landers/prelander/direct-offer.py OFFERS, which is
// what writes the links, and with offers.destination_by_geo, which is what the network actually
// honours. Three copies is two too many — but the other two live in another repo and a database,
// and a build cannot read either.
const OFFER_LINKS_BY_SLICE = {
  '50FC': { FC: 'c=55504', US: 'c=55504', CA: 'c=55506', GB: 'c=55503',
            NL: 'c=55508', JP: 'c=55510', AT: 'c=55513', DE: 'c=55520' },
  CR50: { CR: 'c=55412' },
  GP:   { GP: 'c=56278' },
  PG50: { US: 'c=56213', GB: 'c=56213' },
  PG51: { US: 'c=56213', GB: 'c=56213' },
  PG52: { US: 'c=56213', GB: 'c=56213' },
  RC50: { US: 'c=56065' }, RC51: { US: 'c=56065' }, RC52: { US: 'c=56065' },
  // Everflow: a path, no campaign query. Matched on the offer path segment instead.
  PR50: { US: 'GS3NQC1D', CA: 'GS3NQC1D', GB: 'GS3NQC1D', AU: 'GS3NQC1D' },
  PC50: { US: 'H1N8TBG5' },
};
const CLONE_PATH = /^([A-Za-z0-9]+)\/([A-Za-z]+)(\d+)\/go\/index\.html$/;

const offenders = [];
for (const rel of files) {
  const src = readFileSync(new URL(rel, REPO), 'utf8');
  const hits = [...src.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].filter((m) => NETWORK_HOST_RE.test(m[1]));
  if (!hits.length) continue;

  const cm = CLONE_PATH.exec(rel);
  // A SLICE ROOT (e.g. GP/index.html) is a real deployed lander too — it is the page the fan-out
  // was cloned FROM and it still answers at /GP/. It has no geo in its path, so it is checked
  // against any link configured for its slice rather than exempted: exempting it is how the one
  // page nobody re-checks ends up pointing at a retired campaign id.
  const rm = cm ? null : /^([A-Za-z0-9]+)\/index\.html$/.exec(rel);
  if (!cm && !rm) {
    // A network link outside any lander at all is the original defect, unchanged.
    offenders.push(`${rel}: ${hits[0][0]} (network link outside a lander)`);
    continue;
  }
  const slice = cm ? cm[1] : rm[1];
  const geo = cm ? cm[2] : null;
  const map = OFFER_LINKS_BY_SLICE[slice] || {};
  const want = geo ? map[geo.toUpperCase()]
                   : (Object.values(map).length === 1 ? Object.values(map)[0] : null);
  if (!want) { offenders.push(`${rel}: no configured offer link for ${slice}/${geo}`); continue; }
  if (!src.includes(want)) offenders.push(`${rel}: expected ${want} for ${slice}/${geo}, not found`);
}
report('every lander links to the offer link for its own slice and geo', offenders);

// ── 2. Every /c/ offer link on a lander is on one of OUR hosts ────────────────
const badOfferHosts = [];
for (const rel of files) {
  const src = readFileSync(new URL(rel, REPO), 'utf8');
  for (const m of src.matchAll(/https:\/\/([a-z0-9.-]+)\/c\/([a-z0-9-]+)/gi)) {
    if (!OUR_TRACKING_HOSTS.has(m[1].toLowerCase())) badOfferHosts.push(`${rel}: ${m[0]}`);
  }
}
report('every /c/ offer link is on a host we run', badOfferHosts);

// ── 3. Every /c/ slug a lander references actually exists and is enabled ──────
// A typo'd or disabled slug 404s the click at the last hop, after the ad is paid for.
const badSlugs = [];
for (const rel of files) {
  const src = readFileSync(new URL(rel, REPO), 'utf8');
  for (const m of src.matchAll(/https:\/\/[a-z0-9.-]+\/c\/([a-z0-9-]+)/gi)) {
    const slug = m[1].toLowerCase();
    if (!OFFER_LINKS.some(l => l.slug === slug && l.enabled !== false)) {
      badSlugs.push(`${rel}: /c/${slug} is not an enabled OFFER_LINKS slug`);
    }
  }
}
report('every /c/ slug referenced by a lander is enabled in OFFER_LINKS', badSlugs);

// ── 4. Every door URL points at the real door ────────────────────────────────
const badDoors = [];
for (const rel of files) {
  const src = readFileSync(new URL(rel, REPO), 'utf8');
  for (const m of src.matchAll(/https:\/\/([a-z0-9.-]+)\/api\/link\/([a-z0-9-]+)/gi)) {
    if (`https://${m[1]}/api/link` !== DOOR_BASE) badDoors.push(`${rel}: ${m[0]}`);
  }
}
report('every door URL uses DOOR_BASE', badDoors);

// ── 5. No third-party tracking script on a deployed page ─────────────────────
// A tracker we do not run sees our traffic and cannot be reconciled with our numbers.
const thirdPartyTrackers = [];
for (const rel of files) {
  const src = readFileSync(new URL(rel, REPO), 'utf8');
  for (const m of src.matchAll(/https:\/\/([a-z0-9.-]*\.(?:ttrk\.io|voluum\.com|redtrack\.io|binom\.org))/gi)) {
    thirdPartyTrackers.push(`${rel}: ${m[1]}`);
  }
}
report('no third-party tracking script on a deployed page', thirdPartyTrackers);

// ── 6. The in-app-browser escape lives in ONE place, and nowhere else ─────────
//
// /pre (pre/index.html + js/breakout.js) hands the visitor to their real browser
// before the offer page, because TikTok's in-app webview has been failing on real
// devices. That mechanism is deliberate and contained to those two files.
//
// Everywhere ELSE it is the thing that got this domain's landers flagged in the first
// place, and it was stripped out of all ~1000 of them on 2026-07-23. This check is the
// grep that used to live in the skill doc, promoted to a build failure: a lander that
// re-grows a scheme jump, a UA sniff or a blank-page gate fails here instead of being
// noticed months later.
//
// Note what is NOT excused by the carve-out: the blank-page cloak patterns below are
// listed too, and pre/index.html and js/breakout.js are checked against them like any
// other file. The escape is sanctioned; serving different content to a reviewer is not.
// ── The per-clone prelander (2026-08-11) ─────────────────────────────────────
//
// The breakout is no longer confined to /pre. Every clone of every slice now serves a prelander at
// its root with the lander behind it at go/ — 1,410 pages across Freecash, Prograd, Copper, Reco,
// Playful and Gravypass. That is the design (SPRKNetworkAds landers/prelander/), and a hardcoded
// two-file allowlist cannot express it.
//
// WIDENING THE LIST TO "ANY index.html" WOULD GUT THIS CHECK — it would re-permit exactly the
// per-lander breakout code that got this domain flagged and was stripped from ~1000 pages on
// 2026-07-23. So the exemption is not granted by PATH, it is granted by IDENTITY:
//
//   1. the file must declare itself with <meta name="sprk-prelander">, and
//   2. every file that declares it must be BYTE-IDENTICAL to every other one.
//
// (2) is what makes (1) safe. The marker alone would be a sticker anyone could paste onto an edited
// lander; requiring one single hash across the whole set means there is exactly ONE prelander in
// the repo to review, and a page that drifts by a single byte — a hand-edit, a re-grown UA sniff,
// a second destination — breaks the set and fails the build. Reviewing one file still reviews all
// 1,410 of them, which is the property the original two-file list was really protecting.
//
// The non-escapable patterns below (blank-page gates, document.write) still apply to these files
// exactly as they do to every other. The escape is sanctioned; cloaking is not.
const PRELANDER_MARK = /<meta\s+name=["']sprk-prelander["']/i;
const prelanderFiles = files.filter((rel) => PRELANDER_MARK.test(readFileSync(new URL(rel, REPO), 'utf8')));
// WHAT IS PINNED IS THE BEHAVIOUR, NOT THE PIXELS (2026-08-11).
//
// This compared the WHOLE FILE, which made the prelander un-themeable: every offer has its own
// palette (Freecash green, Prograd violet, Reco magenta, Copper mint...) and a handoff from a green
// prelander into a violet lander reads as two different sites — exactly the seam a prelander exists
// to smooth over. Byte-equality forbade fixing that.
//
// The invariant that actually matters is that the BREAKOUT LOGIC is one reviewed implementation.
// A palette cannot smuggle in a second destination, a UA sniff or a blank-page gate; a <script> can.
// So the hash is taken over the concatenated <script> bodies, with the <style> and the theme
// attribute free to vary. One script to review still reviews all 1,410 pages, and drift in the only
// part that can cloak still breaks the build.
//
// Everything else still applies to these files unchanged: the marker is still required, and the
// non-escapable CLOAK_PATTERNS below are still enforced on them.
const scriptsOf = (html) => (html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || []).join('\n');
const prelanderHashes = new Set(
  prelanderFiles.map((rel) => createHash('sha256')
    .update(scriptsOf(readFileSync(new URL(rel, REPO), 'utf8')))
    .digest('hex')),
);
report(
  'every sanctioned prelander runs byte-identical SCRIPTS (one reviewed behaviour, not 1,410 editable ones)',
  prelanderHashes.size > 1
    ? [`${prelanderFiles.length} marked files have ${prelanderHashes.size} distinct script hashes — at least one has had its breakout logic edited away from the canonical prelander`]
    : [],
);

const BREAKOUT_OK = new Set(['pre/index.html', 'js/breakout.js', ...prelanderFiles]);
const CLOAK_PATTERNS = [
  { re: /x-safari-http/i,                    what: 'iOS scheme breakout',      escapable: true },
  { re: /intent:\/\//i,                      what: 'Android intent breakout',  escapable: true },
  { re: /googlechrome(?:s)?:\/\//i,          what: 'Chrome scheme breakout',   escapable: true },
  { re: /\b(?:musical_ly|bytedance|FB_IAB)\b/i, what: 'in-app UA sniff',       escapable: true },
  { re: /__SUBID_OK/,                        what: 'blank-page SubID gate',    escapable: false },
  { re: /display\s*:\s*none\s*!important/i,  what: 'blank-page cloak gate',    escapable: false },
  { re: /document\.write\s*\(/i,             what: 'document.write cloak gate', escapable: false },
];
/**
 * Comments are documentation, not behaviour — js/safe.js explaining that it avoids
 * document.write() must not read as using it.
 *
 * Block and HTML comments only, plus `//` lines that START a line. A blanket `//`
 * strip would be actively harmful here: it would eat `intent://…` mid-statement and
 * turn the single most important pattern in this check into a false negative.
 */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/^[ \t]*\/\/.*$/gm, ' ');

const cloaking = [];
for (const rel of files) {
  const src = stripComments(readFileSync(new URL(rel, REPO), 'utf8'));
  for (const p of CLOAK_PATTERNS) {
    if (p.escapable && BREAKOUT_OK.has(rel)) continue;
    if (p.re.test(src)) cloaking.push(`${rel}: ${p.what}`);
  }
}
report('cloaking/breakout code appears only in the sanctioned prelander files', cloaking);

// ── 7. The front must not decide who is real, and the decoy must stay dead ────
//
// Removed 2026-08-17. /r used to answer {} for a visitor it disliked — desktop, no
// ttclid, a bot-ish user-agent, or a client-hint contradiction — and the Carrd embed
// then rendered js/decoy.js, a FABRICATED E-COMMERCE STORE, in place of the funnel.
// An ad reviewer saw a different website from the buyer. That is cloaking in the
// plainest sense, and it is what gets a domain flagged by TikTok ad review and by
// Safari/Chrome deceptive-site protection — a domain-level flag, so it takes every
// campaign down at once.
//
// This check exists because the gates are cheap to re-add and each one looks locally
// reasonable ("just block the obvious bots"). The invariant is not "block less". It
// is that /r returns the SAME KIND OF ANSWER to everyone, so nothing downstream can
// serve a reviewer a different page. Attribution does not need a gate here: the door
// 404s any click whose s1 is not a valid spark code, which fails closed at the hop
// where money is actually involved.
//
// If a genuine anti-fraud need appears, it belongs AFTER the click is attributed —
// in the door or in postback scoring — never in front of the page render.
const frontGate = [];
const decoyRefs = [];
for (const rel of files) {
  const raw = readFileSync(new URL(rel, REPO), 'utf8');
  const src = stripComments(raw);
  // The decoy must not come back, under any name, on any deployed page.
  if (/\bdecoy\.js\b/.test(src)) decoyRefs.push(`${rel}: references decoy.js`);
  if (rel !== 'api/r.js') continue;
  if (/user-?agent/i.test(src) && /\breturn\b[^;]*\{\s*\}/.test(src)) {
    frontGate.push(`${rel}: appears to reject a visitor on user-agent`);
  }
  for (const [re, what] of [
    [/BOT_UA_PATTERNS|\bisBot\s*\(/, 'a bot user-agent gate'],
    [/traffic-filter|evaluateRequest/, 'the UA/client-hint contradiction gate'],
    [/hasTtclid|!\s*hasTtclid/, 'a ttclid requirement'],
    [/device\s*===\s*['"](d|t|desktop|tablet)['"]/, 'a device-class gate'],
  ]) if (re.test(src)) frontGate.push(`${rel}: ${what} is back`);
}
report('js/decoy.js is gone and nothing references it', decoyRefs);
report('/r does not gate the visitor on user-agent, device or ttclid', frontGate);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
