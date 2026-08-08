#!/usr/bin/env node
/**
 * ASHLYN'S Apple Pay $750 lander — an OPERATOR-SUPPLIED design, wired onto our door.
 *
 *   node _lp-generator/ashlyn-apay.js --clones 100
 *
 * Her file is saved BYTE-FOR-BYTE as `ashlyn-apay-source.html`; this generator applies only
 * ASSERTED patches on top, so her design survives intact and re-running is deterministic.
 * See .claude/skills/sprk-custom-landers and .claude/skills/sprk-lander-lead-capture.
 *
 * Same folders, same door slug, every time she swaps the design — so nothing in the database moves:
 *   ASHL/US + /ashurl + AH50/US1..US100  ->  applepay750-us-ashlyn
 *
 * ── 2026-08-07: THIRD DESIGN. RewardZone USA, static. ────────────────────────────────────────
 * Her previous two were survey funnels. This one is a single static page: brand line, gift-card
 * SVG, headline, one CTA, three steps, footer. It is the cleanest of the three by a distance and
 * needs the least done to it.
 *
 *   NO scripts at all in the supplied file — the only JS on the page is the door wiring below.
 *   NO external hosts (the only http:// is the SVG xmlns, which is an identifier, not a request).
 *   NO CDN, NO Tailwind, NO bolt.new scaffold, NO `display:none !important` cloak canary.
 *   NO data collection, so nothing to capture and no Supabase on this page at all.
 *
 * `ashlyn-tailwind.css` was DELETED with this change — the previous design pulled the Tailwind Play
 * CDN and needed an ahead-of-time compile; this one ships its own CSS. If a future design brings
 * Tailwind back, the harvest recipe is in git history at 7953f57.
 *
 * ── THE ONE THING TO FIX, AND IT IS THE SAME ONE AS BOTH PREVIOUS PAGES ──────────────────────
 * The CTA was `onclick="window.location.href='#'"`. A '#' href reloads the page. So for the THIRD
 * time in a row the supplied design never reached the offer — the visitor taps "Start My 2-Minute
 * Survey", the page jumps to the top, and that is the entire funnel.
 *
 * This is now the single most reliable defect in operator-supplied landers. GREP FOR IT FIRST:
 *   grep -nE "location\\.href|location\\.replace|window\\.open|sprktrax|api/link|href=" file.html
 * and treat '#', 'javascript:void(0)' and example.com as the same finding: no outbound path.
 */
const fs = require('fs');
const path = require('path');

const SOURCE = fs.readFileSync(path.join(__dirname, 'ashlyn-apay-source.html'), 'utf8');

const CANON_DIR = 'ASHL';
const FAMILY    = 'AH50';
const GEO       = 'US';
const VANITY    = 'ashurl';

/** Must equal the slug on her landing_pages row, or the click dies at the door — silently. */
const DOOR_SLUG = 'applepay750-us-ashlyn';
const DOOR = `https://sprktrax.org/api/link/${DOOR_SLUG}`;

/** Claims in her copy worth a second look. Printed on every run. */
const CONCERNS = [
  ['no purchase necessary',
   'CONTRADICTS HER OWN FOOTER, which says receipt is "subject to ... any required actions or '
   + 'purchases from third-party partners." Both sentences are on the same page. One of them has '
   + 'to go — and the footer is the accurate one.'],
  ['Limited spots available for your area today',
   'invented scarcity. Nothing limits daily volume by area, and it is the one manufactured-urgency '
   + 'line on an otherwise clean page.'],
  ['Check your eligibility instantly',
   'the offer decides eligibility across its own flow, not instantly on tap.'],
  ['gift card',
   'the page sells a generic "$750 gift card" while the offer behind the door is Apple Pay $750 '
   + '(reward=applepay750us at uplevelrewards). RewardZone USA and UpLevel are both Fluent brands '
   + 'so the hand-off is coherent, but the visitor is told one thing and shown another on arrival. '
   + 'Confirm this is the intended angle.'],
];

function sub(html, from, to, count = 1) {
  const parts = html.split(from);
  if (parts.length - 1 !== count) {
    throw new Error(`ashlyn-apay-source.html: expected ${count} occurrence(s) of ${JSON.stringify(from.slice(0, 90))}, found ${parts.length - 1}`);
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

  // ── The CTA: our door, carrying every param ────────────────────────────────────────────────
  h = sub(h, `<button class="cta" onclick="window.location.href='#'">`,
             `<button class="cta" onclick="goToOffer()">`);
  // The supplied file has no <script> of its own, so this is the only JS on the page. It goes at the
  // END of body: nothing above it depends on JS, so the page renders and is readable even if this
  // block never executes — the CTA simply does nothing rather than the layout breaking.
  const wiring = `
<script>
(function () {
  // ---- Outbound: the SPRK tracking DOOR ----
  // Her CTA shipped pointing at a bare fragment, which just reloads the page. The door mints
  // the click_id, freezes the owner at click time, stamps the outbound subid wire and 302s to the
  // real URL — which lives in the offer row and never appears in this page's source.
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

  // Global because the CTA calls it from an inline onclick in her markup.
  var handedOff = false;
  window.goToOffer = function () {
    if (handedOff) return;          // a double-tap must not fire two clicks at the door
    handedOff = true;
    window.location.href = offerUrl();
  };
})();
</script>
<!-- Shared ttclid backfill: fills an empty ttclid from the _ttclid cookie and tags tracker anchors.
     sprktrax.org is in its allowlist, so the door forwards it into the postback. -->
<script src="/js/ttclid.js" async></script>
</body>`;
  h = sub(h, '</body>', wiring);

  // ── Invariants ─────────────────────────────────────────────────────────────────────────────
  // NOTE the ordering: every never() below runs AFTER the wiring is injected, so it also polices
  // what THIS GENERATOR adds. Running the placeholder check before the injection let a comment
  // quoting the placeholder ship unnoticed — a guard that only inspects the input is half a guard.
  never(h, "location.href='#'", 'the placeholder CTA reloads the page instead of converting');
  must(h, DOOR, 1);
  must(h, 'window.goToOffer = function', 1);
  must(h, 'onclick="goToOffer()"', 1);
  must(h, 'window.location.href = offerUrl();', 1);
  must(h, '/js/ttclid.js', 1);
  must(h, 'Start My 2-Minute Survey', 1);        // her CTA copy survived the swap

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

  // Nothing third-party may ride along. The SVG xmlns is an identifier, not a request, so it is
  // allowed by name rather than by pattern.
  const hosts = [...new Set([...h.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)].map((m) => m[1]))];
  const allowed = new Set(['sprktrax.org', 'www.w3.org', 'www.tokrwd.co']);
  const strays = hosts.filter((x) => !allowed.has(x));
  if (strays.length) throw new Error(`emitted page reaches third-party hosts: ${strays.join(', ')}`);

  // ── The emitted script must actually PARSE ─────────────────────────────────────────────────
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
const CLONES = ci > -1 ? parseInt(argv[ci + 1], 10) : 100;
if (!Number.isFinite(CLONES) || CLONES < 1) { console.error('--clones must be a positive integer'); process.exit(1); }

const repoRoot = path.join(__dirname, '..');
const html = page();

fs.mkdirSync(path.join(repoRoot, CANON_DIR, GEO), { recursive: true });
fs.writeFileSync(path.join(repoRoot, CANON_DIR, GEO, 'index.html'), html);

// Vanity path — a plain COPY, never a redirect: a redirect adds a hop and bounces the query string
// through a rewrite where s1 can be lost. It carries no slot number, so it is ONE shared URL and the
// numbered fan-out's anti-flag property does not apply. Fine for one affiliate on her own link.
fs.mkdirSync(path.join(repoRoot, VANITY), { recursive: true });
fs.writeFileSync(path.join(repoRoot, VANITY, 'index.html'), html);

for (let n = 1; n <= CLONES; n++) {
  const d = path.join(repoRoot, FAMILY, GEO + n);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'index.html'), html);
}
const famRoot = path.join(repoRoot, FAMILY);
for (const name of fs.readdirSync(famRoot)) {
  const m = /^([A-Z]{2})([0-9]+)$/.exec(name);
  if (m && (m[1] !== GEO || Number(m[2]) > CLONES || Number(m[2]) < 1)) {
    fs.rmSync(path.join(famRoot, name), { recursive: true, force: true });
  }
}

console.log(`${CANON_DIR}/${GEO} + /${VANITY} + ${FAMILY}/${GEO}1..${GEO}${CLONES}   door=${DOOR_SLUG}   (${CLONES + 2} files)`);
console.log(`\n  ⚠️  LEFT AS SUPPLIED — her copy, Migi's call, not edited here:\n`);
for (const [needle, why] of CONCERNS) {
  if (html.includes(needle)) console.log(`      • ${needle}\n          ${why}`);
}
console.log('');
