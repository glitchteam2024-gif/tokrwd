#!/usr/bin/env node
/**
 * Playful Rewards lander generator — the /trt "Choose Your Game" design in brand purple.
 *
 *   node _lp-generator/playful.js --clones 50
 *
 * WHY THIS EXISTS
 * Migi asked for "the landing page I use for Testerup, made into Playful Rewards, purple, keep the
 * Block Blast logo". So `playful-template.html` started as a byte copy of `testerup-template.html`
 * (the /trt game-picker -> claim-screen design that 50TU runs) and changed exactly three things:
 *
 *   1. PALETTE      orange (#e8671a/#ff8a3d) -> Playful Rewards purple (#7c3aed/#9333ea/#a855f7,
 *                   #c084fc for accent text, #0a0014 page). Those are the brand's own values,
 *                   lifted from the app icon and from the original Playful/index.html.
 *   2. BRAND         Testerup's mark -> /images/playful-rewards-logo.png (extracted from the
 *                   base64 the old Playful/index.html had inlined — it is the real app icon, so
 *                   nothing here is a logo we invented) + a "Playful Rewards" wordmark.
 *   3. DOOR          slug testerup -> playful.
 *   4. BACKGROUND    Migi then asked to keep the look of the old Playful/index.html on top of it,
 *                   so its treatment is ported in: the 40-dot twinkling particle field
 *                   (.bg-canvas / .particle / the loop at the foot of the template), the gradient
 *                   hero text (#a855f7 -> #c084fc -> #e879f9 clipped to the title on both
 *                   screens), and the glowing app-icon ring on the brand mark. All decorative,
 *                   all identical for every visitor — none of it reads anything about the client,
 *                   so none of it is a cloaking surface.
 *
 * The game grid is UNCHANGED — Block Blast, Candy Crush, Subway Surfers, Roblox, same icons, same
 * lock badges, same 2-offers unlock mechanic. Block Blast stays because Migi asked for it by name.
 *
 * TWO COPY STRINGS DELIBERATELY DIVERGE from the Testerup page, and both are compliance, not taste:
 *   - "Verified by TikTok" -> "Free on iOS & Android". Stamping a platform endorsement on a page
 *     TikTok has not endorsed is a false third-party claim, and it is the kind that gets an ad
 *     account pulled. The badge itself (pill + check) is kept.
 *   - "Trusted by over 500,000 users earning real cash through Testerup" -> a line with no number.
 *     That figure is Testerup's; re-pointing it at Playful Rewards would be inventing a statistic
 *     (the No False Earning Claims restriction). Swap in a real figure if Migi has one.
 * Both are one-string changes if he decides otherwise.
 *
 * ONE PAGE, NO GEO FAN-OUT — same reasoning as Testerup. The offer sells US/GB/CA/AU/FR/DE, and
 * until we know there is a per-geo network link to route to, splitting the lander would add six
 * door slugs that all resolve to the same destination while stamping a guessed geo on every clicks
 * row. FR and DE also need translated copy before they get a page; this one is English.
 *
 * NEVER HAND-EDIT A CLONE. Every file below is written from ONE buffer, so the family is exactly
 * one md5 — that is how the RS50/RS1 and FC1 drift incidents are prevented. Change the template and
 * re-run. The assertions below fail the build rather than shipping a lander whose CTA skips the
 * door or whose page carries cloaking.
 */
const fs = require('fs');
const path = require('path');

const TEMPLATE = fs.readFileSync(path.join(__dirname, 'playful-template.html'), 'utf8');
const CANONICAL = 'PLAY';        // stable non-numbered URL: /PLAY — what lp=play and the admin preview hit
const FAMILY = 'PR50';           // the numbered pool assigned per affiliate in SPRK landing_pages
const PREFIX = 'PR';
const DOOR_SLUG = 'playful';
const DOOR = `https://sprktrax.org/api/link/${DOOR_SLUG}`;

/** Assert `needle` appears exactly `count` times, or throw naming what changed. */
function must(html, needle, count = 1) {
  const n = html.split(needle).length - 1;
  if (n !== count) {
    throw new Error(`playful-template.html: expected ${count} occurrence(s) of ${JSON.stringify(String(needle).slice(0, 70))}, found ${n}`);
  }
}

/** Assert `needle` appears NOWHERE. */
function never(html, needle, why) {
  if (html.includes(needle)) {
    throw new Error(`playful-template.html: must not contain ${JSON.stringify(needle)} — ${why}`);
  }
}

function page() {
  const h = TEMPLATE;

  // ── Wiring: the CTA must walk OUR door, once, on the right slug ─────────────────────────────
  must(h, `var DOOR = '${DOOR}';`);
  must(h, 'sprktrax.org/api/link/', 1);          // exactly one outbound hop, and it is the door
  must(h, 'id="claimBtn"', 1);
  must(h, 'claim.setAttribute(\'href\', offerUrl());', 1);
  must(h, "if (!q.get('s1') && q.get('campid'))", 1);   // Carrd campid -> s1 promotion
  must(h, 'f.e || f.c', 1);                              // mc_attr fallback, never fabricating s1
  must(h, '<script src="/js/ttclid.js" async></script>', 1);
  never(h, 'appflowconnect.com', 'this is a door lander; a /c/ hop here would skip click_id attribution');
  never(h, 'monetisetrk', 'the network URL must never appear in lander markup');

  // ── No cloaking. Audit check 6 confines these to pre/index.html + js/breakout.js ────────────
  for (const [pat, why] of [
    ['x-safari', 'scheme-jump breakout belongs only in /pre'],
    ['intent://', 'scheme-jump breakout belongs only in /pre'],
    ['googlechrome-x-callback', 'scheme-jump breakout belongs only in /pre'],
    ['__SUBID_OK', 'the blank-page SubID gate is the pattern that got the domain flagged'],
    ['document.write', 'used only by the blank-page gate'],
    ['display:none!important', 'signature of the blank-page gate'],
    ['musical_ly', 'in-app UA sniffing is the cloaking test we removed'],
  ]) never(h, pat, why);

  // ── Brand + the bits Migi asked for by name ────────────────────────────────────────────────
  must(h, '/images/playful-rewards-logo.png', 4);   // icon + apple-touch-icon + both screen headers
  must(h, '/images/block-blast.jpg', 1);
  must(h, '>Block Blast<', 1);

  // Every element id the wiring script touches. Without these, renaming one id silently aborts
  // the IIFE partway through: `getElementById('backBtn')` runs BEFORE the CTA href is set, so a
  // typo there ships 51 landers whose CTA is still href="#" while this generator prints success.
  for (const id of ['screen-games', 'screen-claim', 'backBtn', 'claimBtn', 'bgCanvas']) {
    must(h, `id="${id}"`, 1);
  }

  // ── The Playful/index.html background treatment, kept because Migi asked for it ─────────────
  // Asserted rather than assumed: these are the bits that make the page look like Playful's own,
  // and losing them to a stray edit is invisible in a diff of 51 generated files.
  must(h, '<div class="bg-canvas" id="bgCanvas"></div>', 1);
  must(h, "getElementById('bgCanvas')", 1);
  must(h, '@keyframes twinkle', 1);
  must(h, 'class="grad"', 2);                        // gradient hero on both screen titles
  must(h, 'brandmark', 3);                           // the glow rule + both logo imgs
  never(h, 'Testerup', 'copy left over from the template this was forked from');
  never(h, 'gravy-logo', 'Testerup\'s mark left in the brand header');
  never(h, '#e8671a', 'Testerup orange left in the palette');
  never(h, '#ff8a3d', 'Testerup orange left in the palette');
  never(h, '232,103,26', 'Testerup orange left in a glow/border rgba()');
  never(h, 'Verified by TikTok', 'false platform endorsement — see the header comment');
  never(h, '500,000', 'invented user count — see the header comment');

  // Every local asset must actually be on disk, with the right casing (see below).
  assertAssetsExist(h);

  return h;
}

/**
 * Every LOCAL asset the page references must actually exist on disk, with byte-identical casing.
 *
 * This is the check Migi asked for out loud ("make sure the playful logo is set and all the other
 * subway surfers roblox and the tiktok logo are set"), made permanent. Asserting the path STRING is
 * not enough — a substring assertion passes happily while the file is missing, misnamed, or renamed
 * case-only, and then 51 landers ship with broken images.
 *
 * The casing half is the subtle one: macOS is case-INSENSITIVE, so `fs.existsSync('/images/Roblox.jpg')`
 * returns true for `roblox.jpg` and the bug is invisible locally — while Vercel serves case-sensitively
 * and 404s it in production. So compare against the real directory entry, not just existence.
 *
 * This repo has already shipped a mislabeled asset (images/gravy-logo.png actually contains TESTERUP's
 * mark, fixed in f61d996), which is why the reference lander still renders the wrong logo. Existence
 * and casing are checkable here; whether the picture is the right BRAND is not, so that stays a
 * human check — see the skill doc.
 */
function assertAssetsExist(html) {
  const repoRoot = path.join(__dirname, '..');
  const refs = [...new Set(
    [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map(m => m[1])
  )].filter(r => !r.startsWith('//'));

  const missing = [];
  for (const ref of refs) {
    const rel = ref.replace(/^\//, '');
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs)) { missing.push(`${ref} — no such file`); continue; }
    // Exact-case check: the basename must appear verbatim in its parent directory listing.
    const entries = fs.readdirSync(path.dirname(abs));
    if (!entries.includes(path.basename(abs))) {
      const near = entries.find(e => e.toLowerCase() === path.basename(abs).toLowerCase());
      missing.push(`${ref} — case mismatch, on disk it is "${near}" (Vercel is case-sensitive)`);
    }
  }
  if (missing.length) {
    throw new Error('playful-template.html references assets that will 404 in production:\n  - ' + missing.join('\n  - '));
  }
  return refs;
}

const argv = process.argv.slice(2);
const ci = argv.indexOf('--clones');
const CLONES = ci > -1 ? parseInt(argv[ci + 1], 10) : 50;
if (!Number.isFinite(CLONES) || CLONES < 1) { console.error('--clones must be a positive integer'); process.exit(1); }

const repoRoot = path.join(__dirname, '..');
const html = page();

// Canonical first: /PLAY is what OVERRIDE_LANDERS.play resolves to, so _links-config.test.mjs reads
// THIS file off disk to check the declared offer against the page's real door.
fs.mkdirSync(path.join(repoRoot, CANONICAL), { recursive: true });
fs.writeFileSync(path.join(repoRoot, CANONICAL, 'index.html'), html);

for (let n = 1; n <= CLONES; n++) {
  const d = path.join(repoRoot, FAMILY, PREFIX + n);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'index.html'), html);   // same buffer -> one md5 across the family
}
console.log(`${CANONICAL}/index.html + ${FAMILY}/${PREFIX}1..${PREFIX}${CLONES}  door=${DOOR_SLUG}  (${CLONES + 1} files, /trt design in Playful Rewards purple)`);
