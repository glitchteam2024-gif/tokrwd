#!/usr/bin/env node
/**
 * NOTKERMAN'S Apple Pay $750 lander — an OPERATOR-SUPPLIED design, wired onto our door.
 *
 *   node _lp-generator/kerman-apay.js --clones 100
 *
 * His file is saved BYTE-FOR-BYTE as `kerman-apay-source.html`; this generator applies only
 * ASSERTED patches on top, so his design survives intact and re-running is deterministic.
 * See .claude/skills/sprk-custom-landers.
 *
 * Same folders, same door slug, every time he swaps the design — so nothing in the database moves:
 *   KERM/US + /saskrurl + KM50/US1..US100  ->  applepay750-us-kerman
 *
 * ── What the supplied file is ───────────────────────────────────────────────────────────────
 * A single static page: topbar, hero with a reward card, three steps, an FAQ, a final CTA, a
 * sticky mobile bar. Pure CSS — no images, no SVG, no external hosts, no CDN, no Tailwind, no
 * `display:none !important` cloak canary, and NO data collection (zero <form>/<input>), so
 * `sprk-lander-lead-capture` does not apply to it. It is the cleanest supplied file we have had.
 *
 * ── THE ONE THING TO FIX, AND IT IS THE SAME ONE AS EVERY SUPPLIED PAGE BEFORE IT ───────────
 * The page had NO OUTBOUND PATH AT ALL. Not a wrong link — no link. The grep:
 *
 *   grep -nE "location\\.href|location\\.replace|window\\.open|sprktrax|api/link|href=" file.html
 *
 * returned five hits and every one was an in-page anchor: #how-it-works, #claim x3, and
 * `href="#"` on the money button, whose only script was a DEMO STUB that preventDefault()s and
 * rewrites its own label to "Connect your claim flow here". So the whole funnel ended on the
 * page it started on. He would have paid for every click and earned nothing, and every dashboard
 * would have read normally: clicks in, zero conversions, no error anywhere.
 *
 * This is now four supplied landers in a row with the same defect. GREP FOR IT FIRST, and treat
 * '#', 'javascript:void(0)' and example.com as the same finding: no outbound path.
 *
 * ── The funnel shape is PRESERVED, deliberately ─────────────────────────────────────────────
 * Hero CTA and sticky CTA scroll to #claim; the "Claim my $750" button in that section is the one
 * outbound. That two-step is his design, not an accident — the #claim section exists purely to
 * hold the converting button — so only the button is wired. If Migi wants every CTA to fire the
 * door instead, that is a copy/structure decision and belongs in the source file, not here.
 */
const fs = require('fs');
const path = require('path');

const SOURCE = fs.readFileSync(path.join(__dirname, 'kerman-apay-source.html'), 'utf8');

const CANON_DIR = 'KERM';
const FAMILY    = 'KM50';
const GEO       = 'US';
const VANITY    = 'saskrurl';

/** Must equal the slug on his landing_pages row, or the click dies at the door — silently. */
const DOOR_SLUG = 'applepay750-us-kerman';
const DOOR = `https://sprktrax.org/api/link/${DOOR_SLUG}`;

/**
 * Claims in his copy worth a second look. Printed on every run, guarded by an includes() test so
 * editing one out of the SOURCE drops it off this list — the print is the receipt, not decoration.
 * NOT edited here: it is the operator's copy and Migi's call. Everything is on www.tokrwd.co, so a
 * penalty earned by this page attaches to the DOMAIN and to every other lander on it.
 */
const CONCERNS = [
  ['<span>Apple Pay</span>',
   'HIGHEST RISK ON THE PAGE. The topbar presents the SITE as "Apple Pay" — brand position, next '
   + 'to a logo mark — and the <title> is "Summer Drop — $750 Apple Pay Reward". The footer does '
   + 'disclaim affiliation, but a reviewer reads the header first, and trademark use in a brand '
   + 'slot is what gets actioned. Ashlyn/Sammy name the reward, not the site.'],
  ['No credit card needed to start',
   'CONTRADICTS STEP 02 ON THE SAME PAGE, which says "finish the required free trials and offers". '
   + 'Free trials generally do take a card. "to start" is doing all the work in that sentence, and '
   + 'it is the sentence a complaint would quote.'],
  ['Limited spots remaining',
   'invented scarcity, three times on the page (hero, final CTA, sticky bar) with an animated '
   + 'pulse dot. Nothing limits spots — the offer is fcfs with no per-day cap.'],
  ['Yes, this is actually real',
   'an unverifiable assurance sitting directly above an unverifiable claim. Reads as pre-empting '
   + 'the objection rather than answering it.'],
  ['Complete 3–5 offers',
   'the number of required completions is set by the offer wall, not by us, and routinely exceeds '
   + 'five. Stated as a fixed range in a numbered step, it reads as a commitment.'],
  ['sent to your Apple Pay wallet',
   'the payout mechanism belongs to the network (uplevelrewards), not to us. Promising the rail '
   + 'AND the amount is two claims we cannot honour if the network changes either.'],
];

function sub(html, from, to, count = 1) {
  const parts = html.split(from);
  if (parts.length - 1 !== count) {
    throw new Error(`kerman-apay-source.html: expected ${count} occurrence(s) of ${JSON.stringify(from.slice(0, 90))}, found ${parts.length - 1}`);
  }
  return parts.join(to);
}
function must(html, needle, count = 1) {
  const n = html.split(needle).length - 1;
  if (n !== count) throw new Error(`emitted page: expected ${count} x ${JSON.stringify(needle.slice(0, 60))}, found ${n}`);
}
function never(html, needle, why) {
  if (html.includes(needle)) throw new Error(`emitted page must not contain ${JSON.stringify(needle)} — ${why}`);
}

function page() {
  let h = SOURCE;

  // ── 1. The money button: a REAL anchor at the door, not a fragment ──────────────────────────
  // Static href = the bare door. The script below upgrades it to carry the query string. Doing it
  // in this order means a visitor with JS broken still reaches the door (which 404s an untagged
  // click by design) instead of tapping a button that reloads the page forever.
  h = sub(h, '<a class="cta" href="#" id="claim-button">',
             `<a class="cta" href="${DOOR}" id="claim-button">`);

  // ── 2. Replace the DEMO stub with the door wiring ───────────────────────────────────────────
  const oldScript = `  <script>
    document.getElementById('claim-button').addEventListener('click', function (event) {
      event.preventDefault();
      this.textContent = 'Connect your claim flow here';
      this.setAttribute('aria-label', 'Demo button: connect your real claim flow here');
    });
  </script>`;

  const newScript = `  <script>
  (function () {
    // ---- Outbound: the SPRK tracking DOOR ----
    // Replaced the supplied demo handler, which cancelled the only converting click on the page.
    // The door mints the click_id, freezes the owner at click time, stamps the outbound subid wire
    // and 302s to the real Apple Pay URL — which lives in the offer row and never appears in this
    // page's source.
    var DOOR = ${JSON.stringify(DOOR)};

    // Carry EVERY incoming param through (s1=<SPK> per-creative, s2 publisher, s3 ad account, ttclid).
    var q = new URLSearchParams(location.search);

    // campid is the Carrd/Spartis name for the same value — promote it when s1 is absent.
    if (!q.get('s1') && q.get('campid')) q.set('s1', q.get('campid'));

    // mc_attr fallback (e=<spark> .. c=<code>). If neither exists s1 stays EMPTY — never fabricated;
    // the door 404s an untagged click by design, and that is the real attribution gate.
    if (!q.get('s1')) {
      var mc = q.get('mc_attr') || '', f = {};
      mc.split('..').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) f[kv.slice(0, i)] = kv.slice(i + 1); });
      var d = f.e || f.c; if (d) q.set('s1', d);
    }

    function offerUrl() {
      // s1 LAST — ad automations append to the tail. campid is a lander-side alias, lg routes the
      // lander; neither belongs in what the network sees.
      var out = new URLSearchParams(q.toString());
      out.delete('s1'); out.delete('campid'); out.delete('lg');
      var qs = out.toString(), s1 = q.get('s1') || '';
      var url = DOOR + (qs ? '?' + qs : '');
      if (s1) url += (qs ? '&' : '?') + 's1=' + encodeURIComponent(s1);
      return url;
    }

    // Upgrade the static href in place. Left as a plain anchor on purpose: the browser handles the
    // navigation, so long-press / open-in-new-tab / middle-click all behave, and there is no click
    // handler that could swallow the tap. This script sits at the end of <body>, so the element
    // exists; nothing above it depends on JS, so the page still renders if this never runs.
    var btn = document.getElementById('claim-button');
    if (btn) btn.setAttribute('href', offerUrl());
  })();
  </script>`;
  h = sub(h, oldScript, newScript);

  // ── 3. Legal links: the supplied footer had NONE at all ─────────────────────────────────────
  // Several ad networks fetch these before approving. Extension-less on purpose: vercel.json sets
  // cleanUrls:true, so /Rewards/terms.html 308s to /Rewards/terms — linking the .html form works
  // but spends a redirect on a link a reviewer fetches.
  h = sub(h, '    <p>Summer Drop / 2026</p>',
             '    <p>Summer Drop / 2026 · <a href="/Rewards/terms">Terms &amp; Conditions</a>'
             + ' · <a href="/Rewards/privacy">Privacy Policy</a></p>');

  // ── 4. Shared ttclid backfill, canonical on every lander in this repo ───────────────────────
  h = sub(h, '</body>',
    '<!-- Shared ttclid backfill: fills an empty ttclid from the _ttclid cookie and tags tracker\n'
    + '     anchors. sprktrax.org is in its allowlist, so the door forwards it into the postback. -->\n'
    + '<script src="/js/ttclid.js" async></script>\n</body>');

  // ── Invariants ──────────────────────────────────────────────────────────────────────────────
  // NOTE the ordering: every never() below runs AFTER the wiring is injected, so it also polices
  // what THIS GENERATOR adds — a guard that only inspects the input is half a guard.
  must(h, DOOR, 2);                        // the static href + the JS constant
  must(h, 'id="claim-button"', 1);
  must(h, 'offerUrl()', 2);                // defined + called
  must(h, 'href="#claim"', 3);             // hero CTA, "Ready to begin", sticky bar — the scroll funnel
  must(h, '/Rewards/terms', 1);
  must(h, '/Rewards/privacy', 1);
  must(h, '/js/ttclid.js', 1);
  must(h, 'Claim my $750', 1);             // his CTA copy survived the swap

  never(h, 'href="#"', 'a fragment on the money button is the no-outbound-path defect');
  never(h, 'Connect your claim flow here', 'the demo stub must never ship');
  never(h, 'Demo button', 'ditto — the demo aria-label');
  never(h, 'preventDefault', 'nothing may swallow the converting click');
  never(h, 'example.com', 'placeholder destinations must never ship');

  // No cloaking, same bar as every other page here (see the skill's NO-CLOAKING rule).
  for (const [pat, why] of [
    ['x-safari', 'scheme-jump breakout belongs only in pre/index.html + js/breakout.js'],
    ['intent://', 'Android breakout belongs only in the prelander'],
    ['__SUBID_OK', 'the blank-page SubID gate'],
    ['document.write', 'the blank-page cloak gate'],
    ['display:none!important', 'the blank-page cloak signature'],
    ['display: none !important', 'the blank-page cloak signature, spaced form'],
    ['musical_ly', 'in-app UA sniffing'],
  ]) never(h, pat, why);

  // Nothing third-party may ride along. His file reaches ZERO hosts as supplied, so after wiring
  // the only host on the page must be our door.
  const hosts = [...new Set([...h.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)].map((m) => m[1]))];
  const allowed = new Set(['sprktrax.org', 'www.w3.org', 'www.tokrwd.co']);
  const strays = hosts.filter((x) => !allowed.has(x));
  if (strays.length) throw new Error(`emitted page reaches third-party hosts: ${strays.join(', ')}`);

  // ── The emitted script must actually PARSE ──────────────────────────────────────────────────
  // Every assertion above is a STRING test, and no string test can tell that the JavaScript stopped
  // parsing. A mangled escape once shipped `//0$/` — a SyntaxError that killed a whole module on a
  // page that looked perfect until clicked. Parse it here instead of finding out live.
  const blocks = [...h.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  if (!blocks.length) throw new Error('emitted page has no inline <script> block');
  blocks.forEach((b, i) => {
    try { new Function(b[1]); }
    catch (e) { throw new Error(`emitted inline script #${i + 1} does not parse: ${e.message}`); }
  });

  return h;
}

const argv = process.argv.slice(2);
const ci = argv.indexOf('--clones');
const CLONES = ci > -1 ? parseInt(argv[ci + 1], 10) : 100;   // matches AP50/AP51/AP52 and AH50
if (!Number.isFinite(CLONES) || CLONES < 1) { console.error('--clones must be a positive integer'); process.exit(1); }

const repoRoot = path.join(__dirname, '..');
const html = page();

fs.mkdirSync(path.join(repoRoot, CANON_DIR, GEO), { recursive: true });
fs.writeFileSync(path.join(repoRoot, CANON_DIR, GEO, 'index.html'), html);

// Vanity path — a plain COPY, never a redirect: a redirect adds a hop and bounces the query string
// through a rewrite where s1 can be lost. It carries no slot number, so it is ONE shared URL and the
// numbered fan-out's anti-flag property does not apply. Fine for one affiliate on his own link;
// never hand the same vanity path to a second person.
fs.mkdirSync(path.join(repoRoot, VANITY), { recursive: true });
fs.writeFileSync(path.join(repoRoot, VANITY, 'index.html'), html);

for (let n = 1; n <= CLONES; n++) {
  const d = path.join(repoRoot, FAMILY, GEO + n);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'index.html'), html);
}
// Prune, so the tree is a pure function of --clones rather than the union of every past run.
const famRoot = path.join(repoRoot, FAMILY);
for (const name of fs.readdirSync(famRoot)) {
  const m = /^([A-Z]{2})([0-9]+)$/.exec(name);
  if (m && (m[1] !== GEO || Number(m[2]) > CLONES || Number(m[2]) < 1)) {
    fs.rmSync(path.join(famRoot, name), { recursive: true, force: true });
  }
}

console.log(`${CANON_DIR}/${GEO} + /${VANITY} + ${FAMILY}/${GEO}1..${GEO}${CLONES}   door=${DOOR_SLUG}   (${CLONES + 2} files)`);
console.log(`\n  ⚠️  LEFT AS SUPPLIED — his copy, Migi's call, not edited here:\n`);
for (const [needle, why] of CONCERNS) {
  if (html.includes(needle)) console.log(`      • ${needle}\n          ${why}`);
}
console.log('');
