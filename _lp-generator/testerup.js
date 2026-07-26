#!/usr/bin/env node
/**
 * Testerup lander generator — the /trt design on the SPRK door.
 *
 *   node _lp-generator/testerup.js --clones 50
 *
 * WHY
 * Migi wants the /trt page ("Choose Your Game" — video picker -> claim screen) to be THE Testerup
 * lander every affiliate runs. /trt's DESIGN is what he wants; /trt's WIRING is not:
 *
 *   /trt today   ->  https://appflowconnect.com/c/testerup-us-mon-off?campid=<...>
 *   50TU today   ->  https://sprktrax.org/api/link/testerup?<every param, s1 last>
 *
 * The /trt hop emits ?campid= and NEVER ?s1=. It is on our own cloaker domain so it is not a
 * third-party leak, but it skips the door: no click_id minted, no clicks row, no owner frozen at
 * click time, and per-geo routing cannot apply. Running affiliate traffic through it would drop
 * Testerup back to the weaker subid-only attribution the door exists to replace.
 *
 * So this generator takes /trt as a literal template and swaps ONLY the outbound wiring for the
 * door builder that 50TU already uses. Layout, copy, the game picker, the video sound toggle and
 * the claim screen are byte-identical to /trt.
 *
 * ONE PAGE, NO GEO FAN-OUT — on purpose. Testerup sells US/GB/CA behind a SINGLE Monetise link
 * (c=56132; the network splits the geo its side), so there is no per-geo link to route to and
 * landing_pages.geo is NULL for it. Splitting the lander per geo would add three slugs that all
 * resolve to the same destination while stamping a guessed geo onto every clicks row.
 *
 * /trt ITSELF IS LEFT ALONE. It is registered in OVERRIDE_LANDERS (owner: Trae / TenX) and pinned
 * by _links-config.test.mjs to fire offer 'testerup-mon' through that /c/ hop. Changing it would
 * break that binding; this generator only writes 50TU/.
 *
 * Every replacement is ASSERTED — if /trt is edited so a source string stops matching, this throws
 * rather than silently shipping a lander whose CTA still bypasses the door.
 */
const fs = require('fs');
const path = require('path');

const TEMPLATE = fs.readFileSync(path.join(__dirname, 'testerup-template.html'), 'utf8');
const FAMILY = '50TU';
const PREFIX = 'TU';
const DOOR_SLUG = 'testerup';

function sub(html, from, to, count = 1) {
  const parts = html.split(from);
  if (parts.length - 1 !== count) {
    throw new Error(`testerup template: expected ${count} occurrence(s) of ${JSON.stringify(from.slice(0, 70))}, found ${parts.length - 1}`);
  }
  return parts.join(to);
}

function page() {
  let h = TEMPLATE;

  // ── Outbound: the SPRK door, not the /c/ campid hop ────────────────────────────────────────
  const oldWiring = `  // ---- SubID (campid) extraction — Spartis bot flow ----
  function getCampid(){
    var p = new URLSearchParams(window.location.search);
    return p.get('campid') || p.get('s1') || p.get('s2') || '';
  }
  function offerUrl(){
    var campid = getCampid();
    // OUR offer link, on OUR cloaker domain. Emits ?campid= (never ?s1=); the slug is
    // resolved by api/_lib/links-config.js OFFER_LINKS, which forwards the sub-id as s1.
    // Was buenohoodies.com/c/… — a SEPARATE deploy we do not run, so it never picked up
    // this repo's config (same slug resolved to monetisetrk8 there vs montrk here) and
    // nothing we changed in OFFER_LINKS could reach it.
    return 'https://appflowconnect.com/c/testerup-us-mon-off?campid=' + (campid ? encodeURIComponent(campid) : '');
  }`;

  const newWiring = `  // ---- Outbound: the SPRK tracking DOOR ----
  // The door mints the click_id, freezes the owner at click time, stamps the outbound subid wire
  // and 302s to the real Testerup URL — which lives in the offer row and never appears here.
  // This REPLACED /trt's appflowconnect /c/?campid= hop: that one emits campid and never s1, so it
  // skips the door entirely and Testerup loses click_id attribution.
  var DOOR = 'https://sprktrax.org/api/link/${DOOR_SLUG}';

  // Carry EVERY incoming param through (s1=<SPK> per-creative, s2 publisher, s3 ad account, ttclid).
  var q = new URLSearchParams(location.search);

  // campid is the Carrd/Spartis name for the same value — promote it to s1 when s1 is absent, so a
  // Carrd-sourced click still resolves an owner instead of arriving anonymous.
  if (!q.get('s1') && q.get('campid')) q.set('s1', q.get('campid'));

  // mc_attr fallback (e=<spark> .. c=<code>). If neither exists s1 stays EMPTY — never fabricated;
  // the door 404s an untagged click by design.
  if (!q.get('s1')) {
    var mc = q.get('mc_attr') || '', f = {};
    mc.split('..').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) f[kv.slice(0, i)] = kv.slice(i + 1); });
    var d = f.e || f.c; if (d) q.set('s1', d);
  }

  function offerUrl(){
    // s1 LAST — ad automations append to the tail. campid is a lander-side alias, not a network param.
    var out = new URLSearchParams(q.toString());
    out.delete('s1'); out.delete('campid');
    var qs = out.toString(), s1 = q.get('s1') || '';
    var url = DOOR + (qs ? '?' + qs : '');
    if (s1) url += (qs ? '&' : '?') + 's1=' + encodeURIComponent(s1);
    return url;
  }`;
  h = sub(h, oldWiring, newWiring);

  // ── Shared ttclid backfill, canonical on every lander in this repo ─────────────────────────
  h = sub(h, '</body>',
    '<!-- Shared ttclid backfill: fills an empty ttclid from the _ttclid cookie and tags tracker\n'
    + '     anchors. sprktrax.org is in its allowlist, so the door forwards it into the postback. -->\n'
    + '<script src="/js/ttclid.js" async></script>\n</body>');

  return h;
}

const argv = process.argv.slice(2);
const ci = argv.indexOf('--clones');
const CLONES = ci > -1 ? parseInt(argv[ci + 1], 10) : 50;
if (!Number.isFinite(CLONES) || CLONES < 1) { console.error('--clones must be a positive integer'); process.exit(1); }

const repoRoot = path.join(__dirname, '..');
const html = page();
for (let n = 1; n <= CLONES; n++) {
  const d = path.join(repoRoot, FAMILY, PREFIX + n);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'index.html'), html);   // same buffer -> one md5 across the family
}
console.log(`${FAMILY}/${PREFIX}1..${PREFIX}${CLONES}  door=${DOOR_SLUG}  (${CLONES} files, /trt design on the SPRK door)`);
