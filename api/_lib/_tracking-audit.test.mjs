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
const SKIP_DIRS = new Set(['.git', 'node_modules', 'justincase', 'SIGNAT~1', 'images', '.claude', '.vercel']);
// The audit's own fixtures, the config table, and the cloaking-detector QA tooling.
const SKIP_FILES = new Set([
  'api/_lib/links-config.js',      // the one place a network host belongs
  'api/_lib/_tracking-audit.test.mjs',
  'api/_lib/_links-config.test.mjs',
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

// ── 1. No deployed file may link straight to a network tracker ────────────────
const offenders = [];
for (const rel of files) {
  const src = readFileSync(new URL(rel, REPO), 'utf8');
  // Only real links count. A comment saying what we MOVED AWAY FROM is written without
  // a scheme precisely so it documents the history without tripping this.
  for (const m of src.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
    if (NETWORK_HOST_RE.test(m[1])) offenders.push(`${rel}: ${m[0]}`);
  }
}
report('no deployed lander links directly to a network tracker', offenders);

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
