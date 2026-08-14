#!/usr/bin/env node
/**
 * RAVITEJ KATHURIA'S Playful Rewards lander — an OPERATOR-SUPPLIED design, wired onto our door,
 * built for all four ENGLISH geos.
 *
 *   node _lp-generator/ravi-playful.js --clones 30
 *
 * His file is saved BYTE-FOR-BYTE as `ravi-playful-source.html`; this generator applies only
 * ASSERTED patches on top, so his design survives intact and re-running is deterministic.
 * See .claude/skills/sprk-custom-landers and sprk-lander-mobile-fanout.
 *
 * ── ONE DESIGN, FOUR GEOS — AND THEY ARE ALL ONE OFFER ──────────────────────────────────────
 * Migi 2026-08-10: "build it out for all the english geos which are us,ca,uk,au".
 *
 * ⚠️ READ THIS BEFORE WRITING ANY ASSIGNMENT SQL. Unlike notkerman's Shein fan-out (seven
 * SEPARATE offers), all four Playful Rewards geos are ONE offer row —
 * `eaf3fdda-1474-4c9a-adb6-516247e3fca8` — whose `destination_by_geo` carries US/GB/CA/AU. The
 * geo is chosen by WHICH `landing_pages` ROW the click walks, not by the offer.
 *
 * `resolveAffiliateOfferLinks` (SPRKNetworkAds api/_lib/affiliate-links.js:238-251) does
 * `by_offer[lp.offer_id] = link` in a loop with NO `.order()`, and it never even SELECTS
 * `lp.geo`. So FOUR active assignments on this one offer collapse to a single map key and the
 * app serves whichever row PostgREST happens to return last — a coin flip that can change after
 * any write to any of the four (the monthly rotation cron writes all of them). That map is the
 * server-side source of truth for launch Destination URLs, so it is a MONEY path, not a display
 * one. The same-geo clash guard does NOT catch this (four distinct geos = no clash), and
 * `autoAssignLanders` already refuses this offer outright (`skipped: 'ambiguous-geo'`).
 *
 *   ➜ ALL FOUR PAGES AND ALL FOUR `landing_pages` ROWS ARE BUILT. Exactly ONE assignment may be
 *     `status='active'` at a time. The SQL in `2026-08-10_ravi_playful_landing_pages.sql` ships
 *     US active and the other three ready-but-unassigned; switching geo is a one-line UPDATE.
 *     Prod today has ZERO affiliates holding two active landers on any offer — do not make this
 *     the first.
 *
 * ── DEFECT 1: NO OUTBOUND PATH AT ALL — the funnel is a literal CYCLE ───────────────────────
 * The grep that has to run before anything else:
 *
 *   grep -nE "location\\.href|location\\.replace|window\\.open|sprktrax|api/link|<form" file.html
 *
 * returned ZERO matches. All 16 anchors are in-page fragments and there is no JS navigation of
 * any kind. The money path is a closed loop: hero/header -> #quiz -> (device, genre, a 1.7s
 * spinner) -> #resultState -> #final-cta -> back to #quiz -> #final-cta -> ... forever. There is
 * no terminal state and no exit. He would have paid for every click and earned nothing, and
 * every dashboard would have read normally — clicks in, zero conversions, no error.
 *
 * That is now SIX supplied landers in a row with the same defect. It is not carelessness — these
 * pages are built as design comps, and the destination is the one thing a comp cannot know.
 *
 * ── DEFECT 2: TWO CDN SCRIPTS, AND ONE OF THEM SILENTLY KILLS THE FUNNEL ────────────────────
 * No other lander in this repo loads either host (verified: 0 occurrences of both).
 *
 *   · `cdn.tailwindcss.com` (Tailwind PLAY CDN) compiled EVERY utility class in the browser.
 *     Tailwind documents it as development-only. If it is slow or blocked the page is not merely
 *     ugly — `hidden` is itself a Tailwind class, so ALL THREE quiz steps render at once and
 *     `#resultState` is exposed from first paint. It is also render-blocking on every view.
 *   · `unpkg.com/lucide@latest` is UNPINNED and sits ON the conversion path. `lucide.createIcons()`
 *     runs at source line 507, BEFORE `checkTimer` is assigned on line 508. If lucide is
 *     undefined that call throws, the assignment never happens, the "Checking available
 *     offers..." spinner spins forever and `#resultState` — which holds the only converting
 *     button — is NEVER revealed. One unpkg hiccup or one breaking `@latest` major dead-ends
 *     every visitor, silently.
 *
 * Both are removed and replaced with self-contained equivalents (patches 1 and 2). The page then
 * reaches only fonts.googleapis.com / fonts.gstatic.com, which 431 landers here already use and
 * which sit on no money path.
 *
 *   ➜ REBUILDING `ravi-playful.css` (only needed if he sends a v2 that changes the palette —
 *     patch 1 asserts his `tailwind.config` block is unchanged and FAILS if it is not):
 *
 *       npm i -D tailwindcss@3
 *       # tailwind.config.js: content:['./page.html'] + the theme.extend block transcribed
 *       # verbatim from the source's inline config
 *       npx tailwindcss -i input.css -o ravi-playful.css --minify
 *
 *     Fidelity was verified, not assumed: the CDN build and this compiled build were rendered
 *     side by side and compared across all 450 elements on 30 computed properties plus every
 *     bounding box — ZERO differences. Tailwind's extractor scans the file as raw text, so the
 *     classes that exist only inside JS template strings (`bg-grape-500`, `bg-cyan-500`,
 *     `border-neon-500`, `bg-neon-500/10`, `shadow-neon-sm`, `rotate-180`) are all present.
 *
 * ── DEFECT 3: /image.png was never supplied ─────────────────────────────────────────────────
 * Referenced 3x (header mark, footer mark, a 20%-opacity decorative blob) as a ROOT-absolute
 * path, so it 404s from every clone depth. We already own the real mark:
 * `images/playful-rewards-logo.png` is the genuine Playful Rewards app icon, extracted from the
 * base64 that the orphaned `Playful/index.html` had inlined, and it is what the house lander and
 * the offer tile both use. All three references are repointed at it — strictly better than
 * dropping them, and nothing is invented.
 *
 * ── DEFECT 4: bolt.new OG image, and no favicon ─────────────────────────────────────────────
 * `og:image` and `twitter:image` both pointed at `https://bolt.new/static/og_default.png`, so
 * every social/Slack/Discord preview of a tokrwd.co URL rendered StackBlitz's default card — a
 * third party's branding on our domain, and a public fingerprint of the tool the page was built
 * in. Repointed at our own mark, which also becomes the favicon and apple-touch-icon (the page
 * shipped with none, so it took a 404 on /favicon.ico).
 *
 * ── DEFECT 5: legal links present but DEAD ──────────────────────────────────────────────────
 * Terms / Privacy / Support were all `href="#"`. Several ad networks fetch these before
 * approving. Pointed at the real pages, extension-less (vercel.json sets cleanUrls:true, so the
 * .html form 308s and spends a redirect on a link a reviewer fetches).
 *
 * ── The funnel shape is PRESERVED, deliberately ─────────────────────────────────────────────
 * His design qualifies the visitor through the quiz before asking for the click, so only the two
 * buttons that come AFTER that qualification are wired to the door:
 *
 *     source 255  "Get my $5 bonus"          (#resultState, after the quiz)  -> DOOR
 *     source 356  "Claim your $5 bonus now"  (#final-cta section)            -> DOOR
 *
 * The header CTA (156), the hero CTA (182) and the FAQ link (342) stay as scroll anchors into
 * that funnel — that is his structure, not an accident. `WIRE_ALL_CTAS` below flips the hero and
 * header to fire the door directly if Migi wants the shorter path; it is a one-word change and
 * the assertions follow it.
 *
 * ── COPY IS IDENTICAL ON ALL FOUR GEOS, AND THAT IS A DELIBERATE CHOICE ─────────────────────
 * His page quotes USD throughout ($5 sign-up bonus, $50.00/$24.75/$100.00 cashouts, $2.4M paid,
 * $20-$100 per month). CA and AU also write their currency as "$", so only GB is a visible
 * mismatch. It is left unchanged anyway, because every way of "fixing" it invents something we
 * cannot substantiate: "£5" fabricates a UK bonus figure we have no source for, and converting
 * at a rate fabricates both a rate and an earnings number. Changing the amount is a claim, not a
 * translation. `currency` is a VARIANTS field so a confirmed figure is a one-line edit — see the
 * per-geo print at the foot of every run.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SOURCE = fs.readFileSync(path.join(__dirname, 'ravi-playful-source.html'), 'utf8');

/**
 * ravi-playful.css was compiled from EXACTLY this source file, and Tailwind emits only the
 * utility classes it finds in it. So if the source changes, the stylesheet may be stale — and a
 * class he adds in a v2 would simply have no CSS behind it, which is invisible in a diff and
 * looks like a broken layout on a live page. Pinning the source hash makes that a build failure
 * and forces a deliberate re-pin. Rebuild command is in the header.
 */
// v2, 2026-08-10 — Ravi removed every "$5 sign-up bonus" claim (see the CONCERNS entry on
// 'No sign-up required'). Re-pinned only after recompiling BOTH inputs and diffing them:
// ravi-playful.css came back byte-identical (the v2 is pure copy, no new utility classes) and
// the icon table came back with the same 19 keys and the same path data.
//
// ⚠️ THE ICON TABLE CANNOT BE REBUILT BY SCANNING THE MARKUP ALONE. The hamburger sets
// data-lucide="${menuIcon}" and swaps that value between 'menu' and 'x' on every tap, so 'x'
// appears nowhere a regex over the HTML can find it. A naive regeneration drops it, the shim
// then falls through its `if (!inner) continue`, and the close button renders as an invisible
// <i> — on the only control in the header on a phone. Always union in ['menu','x'].
const SOURCE_MD5 = '4fcd5b1d6906616f2cb4f435d34392a7';
{
  const got = crypto.createHash('md5').update(SOURCE).digest('hex');
  if (got !== SOURCE_MD5) {
    throw new Error(
      `ravi-playful-source.html changed (md5 ${got}, expected ${SOURCE_MD5}).\n`
      + '      ravi-playful.css and ravi-playful-icons.json are compiled FROM that file, so they are\n'
      + '      now potentially stale — a newly added utility class would ship with no CSS behind it.\n'
      + '      Recompile both (see the header), re-verify, then update SOURCE_MD5.');
  }
}
const TW_CSS = fs.readFileSync(path.join(__dirname, 'ravi-playful.css'), 'utf8');
const ICONS = JSON.parse(fs.readFileSync(path.join(__dirname, 'ravi-playful-icons.json'), 'utf8'));

// The two icons whose NAME is computed at runtime, so no scan of the markup can discover them.
// See the note on SOURCE_MD5. Asserted here so a naive rebuild of the table fails the build
// instead of shipping a mobile menu whose close button is an empty <i>.
for (const n of ['menu', 'x']) {
  if (!ICONS[n]) {
    throw new Error(`ravi-playful-icons.json is missing "${n}" — the hamburger swaps `
      + 'data-lucide between menu and x at runtime, so both must be in the table even though '
      + 'only one of them appears in the HTML. Union them in when regenerating.');
  }
}

const CANON_DIR = 'RAVI';

/** The real Playful Rewards app icon, already in this repo and used by the house lander. */
const LOGO = '/images/playful-rewards-logo.png';

/**
 * Flip to true to make the HEADER and HERO buttons fire the door directly instead of scrolling
 * into his quiz. Leaves the quiz in place for anyone who scrolls to it. This is a funnel
 * decision (fewer taps to the offer vs. his qualification step), so it is Migi's call, not a
 * default. Every assertion below follows this switch.
 */
const WIRE_ALL_CTAS = false;

/**
 * All four ENGLISH geos of the ONE Playful Rewards offer. See the ⚠️ in the header before
 * writing assignment SQL — these are four `landing_pages` rows on a SINGLE `offer_id`.
 *
 *   key      subfolder under RAVI/ — the reference copy, and the clone folder prefix.
 *   geo      UPPERCASE here (it names the clone folders, RV51/GB1). LOWERCASE in landing_pages.geo.
 *   family   the numbered clone slice. Must be unique; `capacity` in SQL must be <= --clones.
 *   vanity   optional unnamed shared copy. Only the flagship gets one — it carries no slot
 *            number, so it is ONE shared URL with none of the numbered fan-out's anti-flag
 *            property, and the app never serves it anyway (resolveAffiliateOfferLinks Mode B).
 *   slug     MUST equal landing_pages.slug, or every click 404s at the door — silently.
 *   currency presentation only, and currently identical everywhere on purpose. See the header.
 */
const VARIANTS = [
  { key: 'US', geo: 'US', flat: 'playfulusa-ravi', vanity: 'ravurl', currency: '$', slug: 'playful-us-ravi' },
  { key: 'GB', geo: 'GB', family: 'RV51', vanity: null,     currency: '$', slug: 'playful-gb-ravi' },
  { key: 'CA', geo: 'CA', family: 'RV52', vanity: null,     currency: '$', slug: 'playful-ca-ravi' },
  { key: 'AU', geo: 'AU', family: 'RV53', vanity: null,     currency: '$', slug: 'playful-au-ravi' },
];

/** One offer row behind all four. Verified against prod 2026-08-10: status=active, cap_mode=fcfs,
 *  payout NULL, destination_by_geo has all of AU/CA/DE/FR/GB/US. */
const OFFER_ID = 'eaf3fdda-1474-4c9a-adb6-516247e3fca8';
const OFFER_NAME = 'Playful Rewards';

const doorFor = (slug) => `https://sprktrax.org/api/link/${slug}`;

/**
 * Claims in his copy worth a second look. Printed on every run, guarded by an includes() test so
 * editing one out of the SOURCE drops it off this list — the print is the receipt, not
 * decoration. NOT edited here: it is the operator's copy and Migi's call. Everything is on
 * www.tokrwd.co, so a penalty earned by this page attaches to the DOMAIN and to every other
 * lander on it.
 */
const CONCERNS = [
  ['Updated every few seconds',
   'HIGHEST-RISK ITEM ON THE PAGE, because it is falsifiable from the page source in seconds. '
   + 'The "Recent cashouts" panel is a frozen five-element JS array with no timer and no fetch: '
   + 'it is byte-identical on every load, forever, and the five relative timestamps are string '
   + 'literals, so a visitor sitting there for an hour still reads "2 min ago". The LIVE pill, '
   + 'the two pulsing "Live activity" dots and the five named people (Sarah M., Marcus T., '
   + 'Jamie R., Alex K., Taylor B.) all frame that same static array as real-time evidence.'],
  ['12,840 players online',
   'hardcoded, next to an animate-pulse dot that reads as a live counter. It never changes.'],
  ['4.8/5 rating',
   'no source, no review platform, no review count — and it is rendered beside FIVE fully filled '
   + 'stars, so the picture says 5.0 while the text says 4.8.'],
  ['Active players commonly earn $20',
   'a specific monthly earnings range with no substantiation and no "results not typical" '
   + 'disclaimer anywhere on the page. Earnings claims are the single most actioned category on '
   + 'both TikTok and Meta.'],
  ['$2.4M',
   'a lifetime payout total presented as fact, unsourced.'],
  ['Checking available offers...',
   'a spinner with NO network request behind it, a hardcoded 1700ms delay, and an outcome that '
   + 'is predetermined: every visitor is told "You are a great match" and "We found offers '
   + 'waiting for you", including one who picked nothing meaningful. The per-answer subtext '
   + '("Finding the best puzzle games for iOS") is personalisation theatre over a fixed result.'],
  ['No sign-up required',
   'CONTRADICTS THE FAQ ON THE SAME PAGE, which says offers are "waiting after sign-up", and the '
   + 'two CTAs that now read "Sign up and start playing". Narrowed 2026-08-10: the sharper half of '
   + 'this — a specific "$5 sign-up bonus" promised three times — was REMOVED BY RAVI in his v2, '
   + 'along with "Claim your $5 bonus now", "Get my $5 bonus" and "Your first $5 is on us". A '
   + 'named monetary sign-up bonus is a substantiable promise; "flexible rewards when you complete '
   + 'game offers" is not. The remaining wording clash is his to resolve if he wants to.'],
  ['Instant payouts',
   'stated flatly here and as "Cash out instantly" / "Cash out anytime", but the FAQ qualifies it '
   + 'with "once you reach the minimum cash-out amount" — a threshold the page never discloses.'],
  ['Cash out via PayPal, Amazon, Visa, Apple &amp; Google',
   'six third-party brands named as payout partners. This is the strongest IMPLIED ENDORSEMENT '
   + 'exposure in the file, and the page names no operator entity.'],
  ['100% free',
   'absolute claim, alongside "$0 fees" and "No credit card required".'],
  ['© 2024 Playful Rewards',
   'stale by two years, and it asserts a copyright over a brand name whose ownership is not '
   + 'established here. A one-word fix if Migi wants it — left alone only because this generator '
   + 'does not edit his words.'],
];

function sub(html, from, to, count = 1) {
  const parts = html.split(from);
  if (parts.length - 1 !== count) {
    throw new Error(`ravi-playful-source.html: expected ${count} occurrence(s) of ${JSON.stringify(String(from).slice(0, 90))}, found ${parts.length - 1}`);
  }
  return parts.join(to);
}
function must(html, needle, count = 1) {
  const n = html.split(needle).length - 1;
  if (n !== count) throw new Error(`emitted page: expected ${count} x ${JSON.stringify(needle.slice(0, 60))}, found ${n}`);
}
function never(html, needle, why) {
  if (html.includes(needle)) {
    const i = html.indexOf(needle);
    throw new Error(`emitted page must not contain ${JSON.stringify(needle)} — ${why}\n      context: ${JSON.stringify(html.slice(Math.max(0, i - 60), i + 60))}`);
  }
}

/* ── The exact head fragments we replace. Kept as constants so a source edit that touches any of
      them fails LOUDLY in sub() rather than silently skipping the patch. ──────────────────── */
const CDN_SCRIPT = '    <script src="https://cdn.tailwindcss.com"></script>\n';
const CONFIG_OPEN = '    <script>\n      tailwind.config = {';
const CONFIG_CLOSE = '      };\n    </script>\n';
const LUCIDE_SCRIPT = '    <script src="https://unpkg.com/lucide@latest"></script>\n';
/** Tailwind's minified output banner. Stripped at inline time — see patch 1. */
const TW_BANNER = '/*! tailwindcss v3.4.19 | MIT License | https://tailwindcss.com*/';

/** The offline lucide replacement. Reproduces the real library's output element-for-element:
 *  same root attributes, same `lucide lucide-<name>` class prefix, the source element's own
 *  attributes (fill, stroke-width, style, class) copied on top, and the <i> replaced in place.
 *  Exposed as window.lucide.createIcons, so ALL SEVEN of his existing call sites keep working
 *  unchanged — including the ones that run after he injects new markup. */
function lucideShim() {
  return `    <script>
      /* Offline lucide. It replaces the icon library that was loaded from a public CDN at an
         unpinned version and sat directly on the conversion path: createIcons() runs immediately
         before the setTimeout that reveals the result screen, so if it threw, the spinner spun
         forever and the only converting button was never shown. Same rendered output, no
         network, no third party. */
      (function () {
        var I = ${JSON.stringify(ICONS)};
        function createIcons() {
          var els = document.querySelectorAll('i[data-lucide]');
          for (var k = 0; k < els.length; k++) {
            var el = els[k], n = el.getAttribute('data-lucide'), inner = I[n];
            if (!inner) continue;
            var a = { xmlns: 'http://www.w3.org/2000/svg', width: '24', height: '24',
              viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
              'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
            for (var i = 0; i < el.attributes.length; i++) a[el.attributes[i].name] = el.attributes[i].value;
            a['aria-hidden'] = 'true';
            a['class'] = ('lucide lucide-' + n + ' ' + (el.getAttribute('class') || '')).trim();
            var s = '<svg';
            for (var key in a) s += ' ' + key + '="' + String(a[key]).replace(/"/g, '&quot;') + '"';
            s += '>' + inner + '</svg>';
            var d = document.createElement('div');
            d.innerHTML = s;
            var svg = d.firstElementChild;
            if (svg) el.parentNode.replaceChild(svg, el);
          }
        }
        window.lucide = { createIcons: createIcons };
      })();
    </script>
`;
}

function page(v) {
  const DOOR = doorFor(v.slug);
  let h = SOURCE;

  // ── 1. Tailwind: compiled stylesheet in, Play CDN out ───────────────────────────────────────
  // His inline config is asserted UNCHANGED first: ravi-playful.css was compiled from exactly
  // this block, so a v2 that edits the palette must not silently ship stale CSS.
  const cfgStart = h.indexOf(CONFIG_OPEN);
  const cfgEnd = h.indexOf(CONFIG_CLOSE, cfgStart);
  if (cfgStart < 0 || cfgEnd < 0) throw new Error('the inline tailwind.config block moved or changed shape — recompile ravi-playful.css and re-transcribe tailwind.config.js');
  const cfgBlock = h.slice(cfgStart, cfgEnd + CONFIG_CLOSE.length);
  for (const token of ['#070912', '#00e676', '#8b5cf6', '#22d3ee', 'neon-lg', 'grape-md', 'spin-slow', 'pulse-dot']) {
    if (!cfgBlock.includes(token)) throw new Error(`tailwind.config no longer defines ${token} — recompile ravi-playful.css`);
  }
  h = h.slice(0, cfgStart) + h.slice(cfgEnd + CONFIG_CLOSE.length);

  // Tailwind's own banner carries a bare URL, which the stray-host scan below cannot tell apart
  // from a real request. Attribution is preserved as an HTML comment instead — same credit, no
  // string that reads as a third-party host. The banner stays intact in the committed
  // ravi-playful.css, which is not deployed (_lp-generator is in .vercelignore).
  const css = TW_CSS.replace(TW_BANNER, '');
  if (css.length === TW_CSS.length) throw new Error('the Tailwind banner comment moved — check TW_BANNER after recompiling');
  h = sub(h, CDN_SCRIPT,
    '    <!-- Tailwind CSS v3.4.19 (MIT). Compiled ahead of time from the config this page shipped\n'
    + '         with, replacing the runtime Play CDN build. See _lp-generator/ravi-playful.js. -->\n'
    + `    <style>${css}</style>\n`);

  // ── 2. lucide: embedded icon set in, unpinned unpkg out ─────────────────────────────────────
  h = sub(h, LUCIDE_SCRIPT, lucideShim());

  // ── 3. The money buttons: REAL anchors at the door, not fragments ───────────────────────────
  // Static href = the bare door; the script below upgrades it to carry the query string. In that
  // order a visitor with JS broken still reaches the door (which 404s an untagged click by
  // design) instead of tapping a button that scrolls the page forever.
  //
  // Only the post-qualification buttons are wired — see the funnel note in the header.
  h = sub(h, '<a href="#final-cta" class="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-neon-500 px-5 py-3.5 text-sm font-bold text-ink-950 shadow-neon-sm transition hover:bg-neon-400">',
             `<a id="doorQuiz" href="${DOOR}" class="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-neon-500 px-5 py-3.5 text-sm font-bold text-ink-950 shadow-neon-sm transition hover:bg-neon-400">`);
  h = sub(h, '<a href="#quiz" class="group mt-8 inline-flex items-center gap-3 rounded-xl bg-neon-500 px-7 py-4 text-sm font-bold text-ink-950 shadow-neon-md transition hover:-translate-y-1 hover:bg-neon-400 hover:shadow-neon-lg">',
             `<a id="doorFinal" href="${DOOR}" class="group mt-8 inline-flex items-center gap-3 rounded-xl bg-neon-500 px-7 py-4 text-sm font-bold text-ink-950 shadow-neon-md transition hover:-translate-y-1 hover:bg-neon-400 hover:shadow-neon-lg">`);

  if (WIRE_ALL_CTAS) {
    h = sub(h, '<a href="#quiz" class="group flex items-center justify-center gap-3 rounded-xl bg-neon-500 px-6 py-4 text-sm font-bold text-ink-950 shadow-neon-md transition duration-300 hover:-translate-y-1 hover:bg-neon-400 hover:shadow-neon-lg">',
               `<a id="doorHero" href="${DOOR}" class="group flex items-center justify-center gap-3 rounded-xl bg-neon-500 px-6 py-4 text-sm font-bold text-ink-950 shadow-neon-md transition duration-300 hover:-translate-y-1 hover:bg-neon-400 hover:shadow-neon-lg">`);
    h = sub(h, '<a href="#quiz" class="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15">',
               `<a id="doorHead" href="${DOOR}" class="rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15">`);
  }

  const doorIds = ['doorQuiz', 'doorFinal'].concat(WIRE_ALL_CTAS ? ['doorHero', 'doorHead'] : []);

  // ── 4. The door wiring itself, appended as its own script at the end of <body> ──────────────
  // His script block is left completely untouched: it owns the quiz, the FAQ, the marquee and
  // the mobile menu, and none of that is ours to edit.
  const wiring = `    <script>
      // ---- Outbound: the SPRK tracking DOOR ----
      // The supplied page had NO outbound path at all — every CTA was an in-page fragment and the
      // funnel looped back on itself. The door mints the click_id, freezes the owner at click
      // time, stamps the outbound subid wire and 302s to the real Playful Rewards URL, which
      // lives in the offer row and never appears in this page's source.
      var DOOR = ${JSON.stringify(DOOR)};

      // Carry EVERY incoming param through (s1=<SPK> per-creative, s2 publisher, s3 ad account, ttclid).
      var q = new URLSearchParams(location.search);

      // campid is the Carrd/Spartis name for the same value — promote it when s1 is absent.
      if (!q.get('s1') && q.get('campid')) q.set('s1', q.get('campid'));

      // mc_attr fallback (e=<spark> .. c=<code>). If neither exists s1 stays EMPTY — never
      // fabricated; the door 404s an untagged click by design, and that is the real attribution gate.
      if (!q.get('s1')) {
        var mc = q.get('mc_attr') || '', f = {};
        mc.split('..').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) f[kv.slice(0, i)] = kv.slice(i + 1); });
        var d = f.e || f.c; if (d) q.set('s1', d);
      }

      function offerUrl() {
        // s1 LAST — ad automations append to the tail. campid is a lander-side alias and lg routes
        // the lander; neither belongs in what the network sees.
        var out = new URLSearchParams(q.toString());
        out.delete('s1'); out.delete('campid'); out.delete('lg');
        var qs = out.toString(), s1 = q.get('s1') || '';
        var url = DOOR + (qs ? '?' + qs : '');
        if (s1) url += (qs ? '&' : '?') + 's1=' + encodeURIComponent(s1);
        return url;
      }

      // Upgrade the static hrefs in place. Left as plain anchors on purpose: the browser handles
      // the navigation, so long-press / open-in-new-tab / middle-click all behave, and there is no
      // click handler that could swallow the tap.
      ${JSON.stringify(doorIds)}.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.setAttribute('href', offerUrl());
      });
    </script>
`;
  h = sub(h, '  </body>', wiring + '  </body>');

  // ── 5. Legal links — all three shipped as dead href="#" ─────────────────────────────────────
  // Extension-less on purpose: vercel.json sets cleanUrls:true, so /Rewards/terms.html 308s, and
  // spending a redirect on a link a reviewer fetches is avoidable.
  h = sub(h, '<a href="#" class="hover:text-gray-300">Terms</a><a href="#" class="hover:text-gray-300">Privacy</a><a href="#" class="hover:text-gray-300">Support</a>',
             '<a href="/Rewards/terms" class="hover:text-gray-300">Terms</a>'
             + '<a href="/Rewards/privacy" class="hover:text-gray-300">Privacy</a>'
             + '<a href="/Rewards/contact" class="hover:text-gray-300">Support</a>');

  // ── 6. The brand mark — /image.png was never supplied ───────────────────────────────────────
  h = sub(h, '/image.png', LOGO, 3);

  // ── 7. Social preview + favicon ────────────────────────────────────────────────────────────
  h = sub(h, '<meta property="og:image" content="https://bolt.new/static/og_default.png">',
             `<meta property="og:image" content="${LOGO}">`);
  h = sub(h, '<meta name="twitter:image" content="https://bolt.new/static/og_default.png">',
             `<meta name="twitter:image" content="${LOGO}">`
             + `\n    <link rel="icon" href="${LOGO}">`
             + `\n    <link rel="apple-touch-icon" href="${LOGO}">`);

  // ── 8. Our own style layer, appended AFTER his so it wins on cascade order ──────────────────
  // No !important anywhere, and not one of his rules is edited. Everything that changes layout is
  // inside a phone media query, so the desktop design he built is byte-for-byte untouched.
  //
  // Measured on the emitted page at 320/360/375/390/412/430 before and after. His layout is
  // genuinely responsive — the only in-container collision check that matters here came back
  // clean (the 240px of document overflow is his deliberate decorative bleed: an 800px radial
  // glow and two blur blobs, all clipped by the wrapper's own overflow-hidden, which is why the
  // document reports no overflow and no scrollbar appears). What was actually wrong was tap
  // targets, and one animation that never ran.
  const styleLayer = `    <style>
      /* ── Added by _lp-generator/ravi-playful.js, not by the operator ─────────────────────── */

      /* HIS OWN ANIMATION, RESTORED. His config declares a shimmer keyframe and .shimmer-text
         asks for it by name, but the animate-shimmer utility is never used as a class — so
         Tailwind never emitted the keyframe and the headline gradient has never moved, on the
         CDN build either. Verified in-browser against the unmodified source before adding this.
         Declaring the keyframe is what he already asked for; nothing else changes. */
      @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

      /* iOS Safari inflates body text in landscape without this. */
      html { -webkit-text-size-adjust: 100%; }

      @media (max-width: 720px) {
        /* Tap targets. Apple HIG and Material both publish 44px; the footer legal links were
           16px tall and they are exactly the links an ad reviewer taps. */
        footer a { display: inline-block; padding: 14px 6px; }
        /* The FAQ section's closing link was 20px tall. */
        #faq a[href="#final-cta"] { display: inline-flex; padding: 12px 0; }
        /* The hamburger was 38x38 — under the bar on both platforms, and it is the only control
           in the header on a phone. */
        #menuBtn { padding: 11px; }
      }

      /* His *{animation:none} reduced-motion rule does not exist, so state it here: the page runs
         six infinite animations (marquee, float, pulse, pulse-dot, spin-slow) and a visitor who
         has asked the OS for less motion should not get them. Pseudo-elements included, which is
         the part the usual one-liner misses. */
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
      }
    </style>
</head>`;
  h = sub(h, '</head>', styleLayer);

  // ── 9. Shared ttclid backfill, canonical on every lander in this repo ───────────────────────
  h = sub(h, '</body>',
    '<!-- Shared ttclid backfill: fills an empty ttclid from the _ttclid cookie and tags tracker\n'
    + '     anchors. sprktrax.org is in its allowlist, so the door forwards it into the postback. -->\n'
    + '<script src="/js/ttclid.js" async></script>\n</body>');

  // ── Invariants ──────────────────────────────────────────────────────────────────────────────
  // Ordering matters: every never() runs AFTER the wiring is injected, so it also polices what
  // THIS GENERATOR adds — a guard that only inspects the input is half a guard.
  must(h, DOOR, doorIds.length + 1);        // one static href each + the JS constant
  must(h, 'offerUrl()', doorIds.length ? 2 : 0);
  doorIds.forEach((id) => must(h, `id="${id}"`, 1));
  must(h, '/Rewards/terms', 1);
  must(h, '/Rewards/privacy', 1);
  must(h, '/Rewards/contact', 1);
  must(h, '/js/ttclid.js', 1);
  must(h, LOGO, 7);                         // 3 img + og + twitter + icon + apple-touch-icon
  must(h, 'window.lucide', 1);
  must(h, 'lucide.createIcons()', 7);       // all seven of HIS call sites still present
  must(h, 'IntersectionObserver', 0);       // he uses none — pinned so a v2 addition is noticed
  must(h, '@keyframes shimmer', 1);
  must(h, 'Added by _lp-generator/ravi-playful.js', 1);
  must(h, '</style>', 3);                   // compiled tailwind + his + ours, never merged

  // His funnel: the scroll anchors that remain must still exist, or the page has dead buttons.
  must(h, 'href="#quiz"', WIRE_ALL_CTAS ? 0 : 2);
  must(h, 'href="#faq"', 3);
  must(h, 'href="#top"', 1);

  // The no-outbound-path defect, in every disguise it has worn across six supplied landers.
  never(h, 'href="#"', 'a bare fragment is the no-outbound-path defect');
  never(h, 'example.com', 'placeholder destinations must never ship');
  never(h, 'preventDefault', 'nothing may swallow the converting click');
  never(h, 'Connect your claim flow', 'a demo stub must never ship');

  // The CDNs are gone, and stay gone.
  never(h, 'cdn.tailwindcss.com', 'the Play CDN compiles every class at runtime and is render-blocking');
  never(h, 'unpkg.com', 'an unpinned icon CDN sat on the conversion path');
  never(h, 'tailwind.config', 'the runtime config goes with the runtime compiler');
  never(h, 'bolt.new', 'a third party OG card on our own domain');
  never(h, 'src="/image.png"', 'an asset that was never supplied');

  // No cloaking, same bar as every other page here (see the NO-CLOAKING rule in tokrwd-landers).
  for (const [pat, why] of [
    ['x-safari', 'scheme-jump breakout belongs only in pre/index.html + js/breakout.js'],
    ['intent://', 'Android breakout belongs only in the prelander'],
    ['__SUBID_OK', 'the blank-page SubID gate'],
    ['document.write', 'the blank-page cloak gate'],
    ['display:none!important', 'the blank-page cloak signature'],
    ['display: none !important', 'the blank-page cloak signature, spaced form'],
    ['musical_ly', 'in-app UA sniffing'],
    ['navigator.userAgent', 'no page here may branch on the user agent'],
  ]) never(h, pat, why);

  // Nothing third-party may ride along beyond the webfonts his design already used. Google Fonts
  // is established on this domain (431 existing landers load it) and sits on no money path.
  const hosts = [...new Set([...h.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)].map((m) => m[1]))];
  const allowed = new Set([
    'sprktrax.org', 'www.w3.org', 'www.tokrwd.co',
    'fonts.googleapis.com', 'fonts.gstatic.com',
  ]);
  const strays = hosts.filter((x) => !allowed.has(x));
  if (strays.length) throw new Error(`emitted page reaches third-party hosts: ${strays.join(', ')}`);

  // ── The emitted scripts must actually PARSE ────────────────────────────────────────────────
  // Every assertion above is a STRING test, and no string test can tell that the JavaScript
  // stopped parsing. Parse them here instead of finding out live.
  const blocks = [...h.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  if (blocks.length !== 3) throw new Error(`expected 3 inline scripts (lucide shim, his, door wiring), found ${blocks.length}`);
  blocks.forEach((b, i) => {
    try { new Function(b[1]); }
    catch (e) { throw new Error(`emitted inline script #${i + 1} does not parse: ${e.message}`); }
  });

  return h;
}

const argv = process.argv.slice(2);
const ci = argv.indexOf('--clones');
const CLONES = ci > -1 ? parseInt(argv[ci + 1], 10) : 30;   // matches the house PR50 slice size
if (!Number.isFinite(CLONES) || CLONES < 1) { console.error('--clones must be a positive integer'); process.exit(1); }

const repoRoot = path.join(__dirname, '..');

// Two variants must never share a folder or a slug — a collision would silently overwrite one
// page with another, and the only symptom would be a geo serving another country's offer.
for (const f of ['key', 'slug']) {
  const seen = VARIANTS.map((v) => v[f]);
  const dupes = seen.filter((x, i) => seen.indexOf(x) !== i);
  if (dupes.length) throw new Error(`VARIANTS: duplicate ${f}: ${[...new Set(dupes)].join(', ')}`);
}

// Every local asset the emitted page references must EXIST on disk. A must() on the path string
// passes happily while the file is missing or renamed case-only — and macOS is case-insensitive,
// so that bug is invisible here and 404s on Vercel.
for (const rel of [LOGO, '/js/ttclid.js', '/Rewards/terms.html', '/Rewards/privacy.html', '/Rewards/contact.html']) {
  const p = path.join(repoRoot, rel.replace(/^\//, ''));
  if (!fs.existsSync(p)) throw new Error(`referenced asset does not exist: ${rel}`);
  const dir = path.dirname(p), base = path.basename(p);
  if (!fs.readdirSync(dir).includes(base)) throw new Error(`case mismatch on ${rel} — real name is different on disk`);
}

let totalFiles = 0;
const built = [];

console.log(`\n  ${OFFER_NAME}  ·  offer ${OFFER_ID}\n`);

for (const v of VARIANTS) {
  const html = page(v);

  fs.mkdirSync(path.join(repoRoot, CANON_DIR, v.key), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, CANON_DIR, v.key, 'index.html'), html);
  let n = 1;

  // Vanity path — a plain COPY, never a redirect: a redirect adds a hop and bounces the query
  // string through a rewrite where s1 can be lost. Only the flagship gets one.
  if (v.vanity) {
    fs.mkdirSync(path.join(repoRoot, v.vanity), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, v.vanity, 'index.html'), html);
    n++;
  }

  // MIXED SHAPE, deliberately. Commit 9763a57 flattened only the LIVE groups, so the RV50 slice is
  // now a single .html file while its siblings are still real folders that still serve 200.
  // Emitting the wrong one is silently destructive in BOTH directions: a resurrected folder
  // SHADOWS the vercel.json redirect that replaced it, and a flat file written for a still-
  // foldered geo is an orphan nothing routes to. So each variant declares its own shape.
  if (v.flat) {
    fs.writeFileSync(path.join(repoRoot, v.flat + '.html'), html);
    n++;
  } else {
    for (let i = 1; i <= CLONES; i++) {
      const d = path.join(repoRoot, v.family, v.geo + i);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'index.html'), html);
      n++;
    }

    // Prune, so the tree is a pure function of --clones rather than the union of every past run.
    // Scoped to this family's own <GEO><n> shape, so it can never reach another offer's folders.
    const famRoot = path.join(repoRoot, v.family);
    for (const name of fs.readdirSync(famRoot)) {
      const m = /^([A-Z]{2})([0-9]+)$/.exec(name);
      if (m && (m[1] !== v.geo || Number(m[2]) > CLONES || Number(m[2]) < 1)) {
        fs.rmSync(path.join(famRoot, name), { recursive: true, force: true });
      }
    }
  }

  totalFiles += n;
  built.push({ v, html, n });
  console.log(
    `  ${v.geo}  ${(CANON_DIR + '/' + v.key).padEnd(9)}`
    + ` + ${(v.flat ? v.flat + '.html' : v.family + '/' + v.geo + '1..' + v.geo + CLONES).padEnd(22)}`
    + (v.vanity ? ' + /' + v.vanity : '').padEnd(10)
    + `  ->  ${v.slug}`
  );
}
console.log(`\n  ${VARIANTS.length} geos · ${totalFiles} files · ${CLONES} clones each\n`);

console.log('  ROOTS (must be in PRELANDER_ALLOWED_ROOTS *and* ALLOWED_ROOTS):');
console.log('    ' + [CANON_DIR, ...VARIANTS.map((v) => v.flat ? v.flat + '.html' : v.family), ...VARIANTS.filter((v) => v.vanity).map((v) => v.vanity)]
  .map((r) => r.toLowerCase()).join(', ') + '\n');

console.log('  ⚠️  ONE OFFER, FOUR GEOS — only ONE assignment may be active at a time.');
console.log('      resolveAffiliateOfferLinks keys by_offer[offer_id] with no ordering and never');
console.log('      reads lp.geo, so two active rows on this offer serve a coin flip. See the SQL.\n');

const html = built[0].html;
console.log('  ⚠️  LEFT AS SUPPLIED — his copy, Migi\'s call, not edited here:\n');
for (const [needle, why] of CONCERNS) {
  if (html.includes(needle) || SOURCE.includes(needle)) console.log(`   · ${needle}\n       ${why}\n`);
}

console.log('  ℹ️  PER-GEO COPY: identical on all four, deliberately. His page quotes USD');
console.log('      throughout; CA and AU also write "$", so only GB visibly mismatches. Every way');
console.log('      of "fixing" it invents a figure we cannot substantiate, so it is left alone.');
VARIANTS.forEach((v) => console.log(`      ${v.geo}  currency ${v.currency}  ${v.slug}`));
console.log('      Set `currency` in VARIANTS once a real per-geo figure is confirmed.\n');

console.log(`  ℹ️  CTA WIRING: WIRE_ALL_CTAS = ${WIRE_ALL_CTAS}.`);
console.log('      ' + (WIRE_ALL_CTAS
  ? 'Header + hero fire the door directly; the quiz remains for anyone who scrolls to it.'
  : 'Header + hero scroll into his quiz; the two post-quiz buttons fire the door. Flip the'));
if (!WIRE_ALL_CTAS) console.log('      constant to true for the shorter path.');
console.log();
