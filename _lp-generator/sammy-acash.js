#!/usr/bin/env node
/**
 * SAMMY'S Apple Cash $750 lander — an OPERATOR-SUPPLIED design, wired onto our tracking.
 *
 *   node _lp-generator/sammy-acash.js --clones 100
 *
 * WHAT THIS IS
 * Sammy sent Migi a finished HTML page and wants to run his own ads to it instead of our standard
 * ACASH lander. `sammy-acash-source.html` is his file, saved BYTE-FOR-BYTE. This generator applies
 * the smallest set of changes that make it safe to host and able to attribute, and asserts every
 * one of them, so his design survives intact and re-running is deterministic.
 *
 * ── THE THREE THINGS HIS FILE COULD NOT SHIP WITH ────────────────────────────────────────────
 *
 * 1. THE CTA WENT NOWHERE. It shipped `CTA_REDIRECT_URL = "https://example.com/your-offer-
 *    destination"` — a placeholder. Every click would have 404'd on example.com. Replaced with the
 *    SPRK door.
 *
 * 2. IT FORWARDED NO PARAMS. `window.location.href = CTA_REDIRECT_URL` drops the query string
 *    entirely, so `?s1=<SPK>` never reached the door and EVERY conversion would have been
 *    unattributed — Sammy would have run traffic and been paid for none of it. This is the
 *    expensive one, and it is invisible: the page looks perfect and the money silently vanishes.
 *    Replaced with the same builder every other lander in this repo uses (all params ride, s1 LAST,
 *    campid promoted, mc_attr fallback, s1 never fabricated).
 *
 * 3. TERMS + PRIVACY WERE `href="#"`. Dead links in the footer. Repointed at the real pages that
 *    already exist in this repo (/Rewards/terms.html, /Rewards/privacy.html). Several ad networks
 *    check these resolve.
 *
 * Everything else — layout, CSS, copy, the card, the FAQ, the countdown, the scroll reveal — is
 * his, untouched.
 *
 * ── WHAT I DID NOT CHANGE, AND WHY YOU ARE BEING TOLD ABOUT IT EVERY RUN ─────────────────────
 * The page makes several claims nothing substantiates. They are Sammy's copy and Migi's call, so
 * this generator does NOT edit them — but it PRINTS them on every run, the same way
 * _tracking-audit.test.mjs prints its EXCEPTIONS, so a deliberate carve-out cannot quietly become
 * a permanent one nobody remembers agreeing to.
 *
 * The reason this matters more than one affiliate's page: it is hosted on www.tokrwd.co, the same
 * domain as every other lander. Ad-network penalties attach to the DOMAIN. A flag earned here does
 * not stay here — see the NO-CLOAKING rule in .claude/skills/tokrwd-landers.
 *
 * To change any of them, edit sammy-acash-source.html and re-run. Nothing here needs touching.
 */
require('./_guard.js')('sammy-acash.js');
const fs = require('fs');
const path = require('path');

const SOURCE = fs.readFileSync(path.join(__dirname, 'sammy-acash-source.html'), 'utf8');

const CANON_DIR = 'ACSM';          // ACSM/US/index.html
const FAMILY    = 'AS50';          // AS50/US1..US100 — one clone per affiliate slot
/* FLAT OUTPUT. Commit 9763a57 flattened every live clone family to ONE .html file, so the AS50
   slice this used to emit no longer exists on disk — it survives only as a redirect in
   vercel.json. Re-emitting the folders would recreate ~100 dead files, and a real file SHADOWS a
   redirect, so the resurrected copies would start serving instead of the flat page. */
const FLAT_PAGE = 'acashusa-sammy';
const GEO       = 'US';
const VANITY    = 'sasurl';        // /sasurl — Sammy's memorable link, same bytes

/**
 * WHICH DOOR THIS PAGE FIRES.
 *
 * It must equal the `slug` on the landing_pages row Migi assigns to Sammy, or the click 404s. His
 * page is Apple Cash $750 US, so it defaults to the standing Apple Cash US door.
 *
 * Apple Cash already has THREE house designs, each its own landing_pages row with its own slug and
 * its own 100-clone slice: `applecash-us` (AC50), `-us-b` (AC51), `-us-c` (AC52). Sammy's page is a
 * FOURTH design in that same picker, so it gets its OWN slug rather than borrowing design A's.
 *
 * Reusing `applecash-us` would have worked on day one — that door is already live — but every one
 * of Sammy's clicks would have reported under design A, blended with everyone else running AC50,
 * and there would be no way to tell his page's performance from theirs. Since a landing_pages row
 * has to be created either way for the page to appear in his picker at all, the dedicated slug
 * costs nothing and keeps the numbers separable.
 *
 * ⚠️ This slug must MATCH the slug on the row Migi creates, or the click dies at the door. That
 * failure is silent from the page's side: the CTA looks perfect and nothing on the page shows it.
 */
const DOOR_SLUG = 'applecash-us-sammy';
const DOOR = `https://sprktrax.org/api/link/${DOOR_SLUG}`;

/** Claims on the page that nothing in our possession substantiates. Printed on every run. */
const UNVERIFIED_CLAIMS = [
  ['4.8/5 average rating',        'a rating with no source, no review count and no platform behind it'],
  ['Most people finish in under 5 minutes', 'a completion-time statistic we have no data for'],
  ['Daily availability is limited', 'manufactured scarcity — nothing actually limits daily volume'],
  ["Today's window closes in",    'the countdown resets at LOCAL MIDNIGHT every day, so the "window" never truly closes. This is the single highest-risk item on the page: a fake deadline is a textbook deceptive-urgency pattern and both TikTok and Meta action it'],
  ['Verified Reward Program',     'verified by whom? No issuing body is named'],
  ['Verified partner offer',      'same — "verified" with no verifier'],
  ['Verified Partner',            'same claim a third time, in the footer badges'],
  ['256-bit encrypted',           'a specific cryptographic claim about infrastructure we do not control'],
  ['24/7 Support',                'we do not staff 24/7 support for this funnel'],
  ['•••• •••• •••• 7750',         'a mock payment-card number. Combined with the Apple glyph it renders as a simulated Apple Cash card'],
];

function sub(html, from, to, count = 1) {
  const parts = html.split(from);
  if (parts.length - 1 !== count) {
    throw new Error(`sammy-acash-source.html: expected ${count} occurrence(s) of ${JSON.stringify(from.slice(0, 80))}, found ${parts.length - 1}`);
  }
  return parts.join(to);
}
function must(html, needle, count = 1) {
  const n = html.split(needle).length - 1;
  if (n !== count) throw new Error(`sammy-acash-source.html: expected ${count} x ${JSON.stringify(needle.slice(0, 60))}, found ${n}`);
}
function never(html, needle, why) {
  if (html.includes(needle)) throw new Error(`emitted page must not contain ${JSON.stringify(needle)} — ${why}`);
}

function page() {
  let h = SOURCE;

  // ── 1 + 2. The CTA: our door, carrying every param ─────────────────────────────────────────
  const oldWiring = `  // ---- CONFIG: set your destination affiliate/offer link here ----
  var CTA_REDIRECT_URL = "https://example.com/your-offer-destination";

  function handleClaim(){
    window.location.href = CTA_REDIRECT_URL;
  }`;

  const newWiring = `  // ---- Outbound: the SPRK tracking DOOR ----
  // Replaced the supplied placeholder destination. The door mints the click_id, freezes the owner
  // at click time, stamps the outbound subid wire and 302s to the real Apple Cash URL — which
  // lives in the offer row and never appears in this page's source.
  var DOOR = "${DOOR}";

  // Carry EVERY incoming param through. His original did window.location.href = URL with no query
  // at all, which dropped s1 and left every conversion unattributed.
  var q = new URLSearchParams(location.search);

  // campid is the Carrd/Spartis name for the same value — promote it when s1 is absent.
  if (!q.get("s1") && q.get("campid")) q.set("s1", q.get("campid"));

  // mc_attr fallback (e=<spark> .. c=<code>). If neither exists s1 stays EMPTY — never fabricated;
  // the door 404s an untagged click by design, and that is the real attribution gate.
  if (!q.get("s1")) {
    var mc = q.get("mc_attr") || "", f = {};
    mc.split("..").forEach(function (kv) { var i = kv.indexOf("="); if (i > 0) f[kv.slice(0, i)] = kv.slice(i + 1); });
    var d = f.e || f.c; if (d) q.set("s1", d);
  }

  function offerUrl(){
    // s1 LAST — ad automations append to the tail. campid is a lander-side alias, not a network param.
    var out = new URLSearchParams(q.toString());
    out.delete("s1"); out.delete("campid"); out.delete("lg");
    var qs = out.toString(), s1 = q.get("s1") || "";
    var url = DOOR + (qs ? "?" + qs : "");
    if (s1) url += (qs ? "&" : "?") + "s1=" + encodeURIComponent(s1);
    return url;
  }

  function handleClaim(){
    window.location.href = offerUrl();
  }`;
  h = sub(h, oldWiring, newWiring);

  // ── 3. Footer legal links: his were href="#" ───────────────────────────────────────────────
  h = sub(h,
    '<span class="links"><a href="#">Terms &amp; Conditions</a><a href="#">Privacy Policy</a></span>',
    // Extension-less on purpose: vercel.json sets cleanUrls:true, so /Rewards/terms.html 308s to
    // /Rewards/terms. Linking the .html form works but spends a redirect on a legal link that ad
    // reviewers fetch — link the destination directly.
    '<span class="links"><a href="/Rewards/terms">Terms &amp; Conditions</a><a href="/Rewards/privacy">Privacy Policy</a></span>');

  // ── Shared ttclid backfill, canonical on every lander in this repo ─────────────────────────
  h = sub(h, '</body>',
    '<!-- Shared ttclid backfill: fills an empty ttclid from the _ttclid cookie and tags tracker\n'
    + '     anchors. sprktrax.org is in its allowlist, so the door forwards it into the postback. -->\n'
    + '<script src="/js/ttclid.js" async></script>\n</body>');

  // ── Invariants ─────────────────────────────────────────────────────────────────────────────
  must(h, DOOR, 1);
  must(h, 'id="cta-hero"', 1);
  must(h, 'offerUrl()', 2);                    // defined + called
  never(h, 'example.com', 'the placeholder destination must never ship');
  never(h, 'href="#"', 'dead links in the footer');
  never(h, 'CTA_REDIRECT_URL', 'the old un-parameterised redirect must be gone');

  // No cloaking, same bar as every other page here (see the skill's NO-CLOAKING rule).
  for (const [pat, why] of [
    ['x-safari', 'scheme-jump breakout belongs only in pre/index.html + js/breakout.js'],
    ['intent://', 'Android breakout belongs only in the prelander'],
    ['__SUBID_OK', 'the blank-page SubID gate'],
    ['document.write', 'the blank-page cloak gate'],
    ['display:none!important', 'the blank-page cloak signature'],
    ['musical_ly', 'in-app UA sniffing'],
  ]) never(h, pat, why);

  return h;
}

const argv = process.argv.slice(2);
const ci = argv.indexOf('--clones');
const CLONES = ci > -1 ? parseInt(argv[ci + 1], 10) : 100;   // matches AC50/AC51/AC52
if (!Number.isFinite(CLONES) || CLONES < 1) { console.error('--clones must be a positive integer'); process.exit(1); }

const repoRoot = path.join(__dirname, '..');
const html = page();

fs.mkdirSync(path.join(repoRoot, CANON_DIR, GEO), { recursive: true });
fs.writeFileSync(path.join(repoRoot, CANON_DIR, GEO, 'index.html'), html);

/**
 * VANITY PATH — /sasurl. Migi's call: a memorable URL so it is obvious at a glance whose link it
 * is, without reading a clone number.
 *
 * Written from the SAME buffer as everything else, so it can never drift from the slice. It is a
 * PLAIN COPY, not a redirect: a redirect would add a hop before the lander and, more importantly,
 * bounce the query string through an extra rewrite where s1 can be lost.
 *
 * ⚠️ It carries no slot number, so it is ONE shared URL rather than a per-affiliate clone. That is
 * exactly what was asked for, but it means the anti-flag property of the numbered fan-out does not
 * apply here: a flag on /sasurl is a flag on the only copy of it. Fine for a single affiliate on
 * his own link; do not hand this same path to a second person.
 */
fs.mkdirSync(path.join(repoRoot, VANITY), { recursive: true });
fs.writeFileSync(path.join(repoRoot, VANITY, 'index.html'), html);

fs.writeFileSync(path.join(repoRoot, FLAT_PAGE + '.html'), html);

console.log(`${CANON_DIR}/${GEO} + /${VANITY} + ${FAMILY}/${GEO}1..${GEO}${CLONES}   door=${DOOR_SLUG}   (${CLONES + 2} files, Sammy's supplied design)`);
console.log(`\n  ⚠️  UNVERIFIED CLAIMS LEFT IN SAMMY'S COPY — his design, Migi's call, not edited here.`);
console.log(`      Hosted on www.tokrwd.co, so an ad-network penalty earned here attaches to the`);
console.log(`      DOMAIN and every other lander on it. Edit sammy-acash-source.html to change.\n`);
for (const [claim, why] of UNVERIFIED_CLAIMS) {
  if (html.includes(claim)) console.log(`      • "${claim}" — ${why}`);
}
console.log('');
