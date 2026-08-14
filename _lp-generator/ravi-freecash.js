#!/usr/bin/env node
/**
 * RAVITEJ KATHURIA'S Freecash lander — an OPERATOR-SUPPLIED design, wired onto our door,
 * built for US / CA / GB and locked to him alone.
 *
 *   node _lp-generator/ravi-freecash.js --clones 30
 *
 * His file is saved BYTE-FOR-BYTE as `ravi-freecash-source.html`; this generator applies only
 * ASSERTED patches on top, so his design survives intact and re-running is deterministic.
 * See .claude/skills/sprk-custom-landers and sprk-lander-mobile-fanout.
 *
 * This is his THIRD bespoke page (Playful Rewards, then Shein x7, now Freecash). They do not
 * interact: different offer, different door slug, different rows, different assignment.
 *
 * ── ⚠️ ONE OFFER, THREE GEOS — SAME SHAPE AS HIS PLAYFUL BUILD ──────────────────────────────
 * Read this before writing any assignment SQL. All three geos are `landing_pages` rows on a
 * SINGLE `offer_id` — `6d298639-835d-450e-9442-6f4515bc2ce8` — whose `destination_by_geo`
 * carries AT/CA/DE/GB/JP/NL/US. The geo is chosen by WHICH ROW the click walks, not by the offer.
 *
 * `resolveAffiliateOfferLinks` (SPRKNetworkAds api/_lib/affiliate-links.js) does
 * `by_offer[lp.offer_id] = link` in a loop with NO `.order()`, and it never even SELECTS
 * `lp.geo`. So two active assignments on this one offer collapse to a single map key and the app
 * serves whichever row PostgREST returns last — a coin flip that can change after any write to
 * either (the monthly rotation cron writes them all). That map is the server-side source of truth
 * for launch Destination URLs, so it is a MONEY path. The same-geo clash guard does NOT catch it
 * (three distinct geos = no clash) and `choose_landing_page` will not clean it up either
 * (`heldLandersFor` is scoped to (offer, geo) on purpose).
 *
 *   ➜ ALL THREE PAGES AND ALL THREE ROWS ARE BUILT. Exactly ONE assignment may be
 *     `status='active'` at a time. The SQL in `2026-08-11_ravi_freecash_landing_pages.sql`
 *     ships US active and CA/GB ready-but-unassigned; switching geo is a one-line UPDATE.
 *
 * ⚠️ He is ALREADY ACTIVE on the HOUSE Freecash design (slug `freecash`, 50FC/FC15, slot 15,
 *    chosen_by='admin'). That is the release-before-you-claim trap — the SQL archives it in the
 *    same transaction. Four builds in a row where this mattered; assume it, always.
 *
 * ── DEFECT 1: NO OUTBOUND PATH AT ALL — a fake-success button ────────────────────────────────
 * The grep that has to run before anything else:
 *
 *   grep -nE "location\\.href|location\\.replace|window\\.open|sprktrax|api/link|<form" file.html
 *
 * returned ZERO matches. Every one of the five CTAs is `href="#calculator"`, and the single
 * converting control — "Claim Your Starting Chest" — is a <button> whose only handler REWRITES
 * ITS OWN LABEL to "Chest Claimed — Check your email!" and stops. No navigation, and no email is
 * ever sent, so the page states something false and then dead-ends.
 *
 * That is now SEVEN supplied landers in a row with the same defect, and this is the fourth
 * distinct disguise (after example.com, href="#", and the "connect your claim flow" stub). It is
 * the most convincing one yet: the button visibly succeeds. Assume it on every supplied file.
 *
 * ── DEFECT 2: TWO CDN SCRIPTS — the same pair his Playful page shipped ───────────────────────
 *   · `cdn.tailwindcss.com` (Tailwind PLAY CDN) compiles every utility class in the browser.
 *     Tailwind documents it as development-only, and it is render-blocking on every view. If it
 *     is slow or blocked the page is not merely unstyled — `hidden` is itself a Tailwind class,
 *     so the six `hidden`/`sm:inline`/`md:flex` responsive elements all render at once, the
 *     desktop-only nav appears on phones and the layout is WRONG, not just plain.
 *   · `unpkg.com/lucide@latest` is UNPINNED. `refreshIcons()` calls `lucide.createIcons()`, and
 *     if lucide is undefined that throws at the foot of his script.
 *
 * Both are removed and replaced with self-contained equivalents (patches 1 and 2). The page then
 * reaches only fonts.googleapis.com / fonts.gstatic.com, which 431 landers here already use and
 * which sit on no money path.
 *
 *   ➜ REBUILDING `ravi-freecash.css` (only needed if he sends a v2 that changes the palette —
 *     patch 1 asserts his `tailwind.config` block is unchanged and FAILS if it is not):
 *
 *       npm i -D tailwindcss@3
 *       # tailwind.config.js: content:['./page.html'] + the theme.extend block transcribed
 *       # verbatim from the source's inline config
 *       npx tailwindcss -i input.css -o ravi-freecash.css --minify
 *
 *     Verified: every class that exists ONLY inside a JS string is present in the output —
 *     the whole colorMap (ring-/bg-/text-/border- x blue,orange,indigo,green,slate), the four
 *     feature accents, `ring-2` and `scale-[1.03]`. Tailwind's extractor scans the file as raw
 *     TEXT, which is why. Do NOT try to extract the CSS by scraping the rendered <style> from a
 *     CDN load — the Play CDN's candidate source is the DOM, so every one of those would be
 *     missing and it would only show up when a user clicked a payout method.
 *
 * ── DEFECT 3: legal links DEAD ──────────────────────────────────────────────────────────────
 * About / Support / Terms / Privacy were all `href="#"`. Several ad networks fetch these before
 * approving. Pointed at the real pages, extension-less (vercel.json sets cleanUrls:true, so the
 * .html form 308s and spends a redirect on a link a reviewer fetches).
 *
 * ── DEFECT 4: AN ANIMATION HE DECLARED THAT HAS NEVER RUN ────────────────────────────────────
 * His config declares a `rise` keyframe and both hero columns ask for it by name via an inline
 * `style="animation:rise .5s ease-out"`. But `animate-rise` is never used as a CLASS, so Tailwind
 * never emits the keyframe — not in this compiled build and not on the Play CDN either. Both hero
 * blocks have therefore never animated in, on any load, ever. Restored in patch 8: declaring a
 * keyframe he already asked for is not editing his design; inventing one would be. Verified
 * in-browser against the unmodified source first. Second instance of this exact finding (the
 * first was `shimmer` on his Playful page) — check the keyframe list on every supplied page.
 *
 * ── The funnel shape is PRESERVED, deliberately ─────────────────────────────────────────────
 * His calculator IS the qualification step: pick a payout method, set hours/week, see an
 * estimate, then claim. So only the button that comes AFTER that qualification fires the door:
 *
 *     "Claim Your Starting Chest"  (#calculator, after the estimate)   -> DOOR
 *
 * The five `#calculator` scroll anchors (nav "Earn", nav "Sign Up Free", the hero CTA, the final
 * CTA and the sticky mobile bar) stay as anchors into that funnel — that is his structure, not an
 * accident. `WIRE_ALL_CTAS` below flips the four BUTTONS to fire the door directly if Migi wants
 * the shorter path; the nav "Earn" text link stays an anchor either way, and the assertions
 * follow the switch.
 *
 * ── COPY IS IDENTICAL ON ALL THREE GEOS, AND THAT IS A DELIBERATE CHOICE ─────────────────────
 * Migi chose US + CA + GB on 2026-08-11 after being shown that the page quotes USD in twelve
 * places ($250 chest x4, $100+/month, $0 fees, $0.50 and $5.00 minimums, the $48,200 counter, the
 * +$5.00/+$12.50 chips, the ten ticker amounts and the calculator's own output). CA also writes
 * its currency as "$", so only GB visibly mismatches. It is left unchanged anyway, because every
 * way of "fixing" it invents something we cannot substantiate: "£250" fabricates a UK figure we
 * have no source for, and converting fabricates both a rate and an earnings number. Changing an
 * amount is a claim, not a translation. `currency` is a VARIANTS field so a confirmed figure is a
 * one-line edit — see the per-geo print at the foot of every run.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SOURCE = fs.readFileSync(path.join(__dirname, 'ravi-freecash-source.html'), 'utf8');

/**
 * ravi-freecash.css was compiled from EXACTLY this source file, and Tailwind emits only the
 * utility classes it finds in it. So if the source changes, the stylesheet may be stale — and a
 * class he adds in a v2 would simply have no CSS behind it, which is invisible in a diff and
 * looks like a broken layout on a live page. Pinning the source hash makes that a build failure
 * and forces a deliberate re-pin. Rebuild command is in the header.
 *
 * ⚠️ PROVENANCE: this file was transcribed from the HTML Migi pasted into chat on 2026-08-11 —
 * the original .html never reached disk. If he later supplies the real file, diff it against this
 * one, recompile BOTH inputs, and re-pin. Everything downstream is deterministic from this hash.
 */
const SOURCE_MD5 = '79fd385ee307cea1c3d2ee93ab2876d5';
{
  const got = crypto.createHash('md5').update(SOURCE).digest('hex');
  if (got !== SOURCE_MD5) {
    throw new Error(
      `ravi-freecash-source.html changed (md5 ${got}, expected ${SOURCE_MD5}).\n`
      + '      ravi-freecash.css and ravi-freecash-icons.json are compiled FROM that file, so they\n'
      + '      are now potentially stale — a newly added utility class would ship with no CSS behind\n'
      + '      it. Recompile both (see the header), re-verify, then update SOURCE_MD5.');
  }
}
const TW_CSS = fs.readFileSync(path.join(__dirname, 'ravi-freecash.css'), 'utf8');
const ICONS = JSON.parse(fs.readFileSync(path.join(__dirname, 'ravi-freecash-icons.json'), 'utf8'));

/**
 * Every icon name that appears in the emitted page. `check` is here for a different reason than
 * the rest: it was only ever reachable through `claimIcon.setAttribute('data-lucide','check')`
 * inside the fake-success handler that patch 4 deletes, so it is no longer referenced by any
 * markup a scan could find. Kept anyway — it costs 60 bytes and it means a future edit that
 * reinstates a runtime icon swap does not silently render an empty <i>. Same lesson as the
 * hamburger's menu/x pair on his Playful page.
 */
const ICON_NAMES = ['arrow-right', 'badge-dollar-sign', 'check', 'check-circle-2', 'chevron-down',
  'clock', 'gift', 'headset', 'help-circle', 'shield-check', 'star', 'trending-up', 'trophy',
  'wallet', 'zap'];
for (const n of ICON_NAMES) {
  if (!ICONS[n]) throw new Error(`ravi-freecash-icons.json is missing "${n}"`);
}

const CANON_DIR = 'RAVFC';

/**
 * The real Freecash mark, already in this repo. Used for the favicon and apple-touch-icon only.
 * His page shipped with NEITHER, so it took a 404 on /favicon.ico on every cold load. No og:image
 * or twitter:image is added — he did not ship those tags and inventing a social card is a design
 * decision, not a defect fix. (Contrast his Playful page, which HAD them, pointed at bolt.new's
 * default; repointing those was a fix.)
 */
const LOGO = '/images/freecash-logo.webp';

/**
 * Flip to true to make the four CTA BUTTONS (nav "Sign Up Free", hero, final, sticky mobile) fire
 * the door directly instead of scrolling into his calculator. The nav "Earn" text link stays an
 * anchor either way — it is navigation, not a CTA. This is a funnel decision (fewer taps to the
 * offer vs. his qualification step), so it is Migi's call, not a default. Every assertion below
 * follows this switch.
 */
const WIRE_ALL_CTAS = false;

/**
 * US / CA / GB of the ONE Freecash offer. See the ⚠️ in the header before writing assignment SQL.
 *
 *   key      subfolder under RAVFC/ — the reference copy, and the clone folder prefix.
 *   geo      UPPERCASE here (it names the clone folders, RV62/CA1). LOWERCASE in landing_pages.geo.
 *   family   the numbered clone slice. Must be unique; `capacity` in SQL must be <= --clones.
 *            rv50..rv60 are already taken by his Playful (50-53) and Shein (54-60) builds.
 *   vanity   optional unnamed shared copy. Only the flagship gets one — it carries no slot
 *            number, so it is ONE shared URL with none of the numbered fan-out's anti-flag
 *            property, and the app never serves it anyway (resolveAffiliateOfferLinks Mode B).
 *   slug     MUST equal landing_pages.slug, or every click 404s at the door — silently.
 *   currency presentation only, and currently identical everywhere on purpose. See the header.
 */
const VARIANTS = [
  { key: 'US', geo: 'US', flat: 'frcusa-ravi', vanity: 'ravfcurl', currency: '$', slug: 'freecash-us-ravi' },
  { key: 'CA', geo: 'CA', family: 'RV62', vanity: null,       currency: '$', slug: 'freecash-ca-ravi' },
  { key: 'GB', geo: 'GB', family: 'RV63', vanity: null,       currency: '$', slug: 'freecash-gb-ravi' },
];

/** One offer row behind all three. Verified against prod 2026-08-11: status=active,
 *  cap_mode=fcfs, clickid_slot=s5, enforce_assignment=false, destination_by_geo has all of
 *  AT/CA/DE/GB/JP/NL/US. */
const OFFER_ID = '6d298639-835d-450e-9442-6f4515bc2ce8';
const OFFER_NAME = 'Freecash';

const doorFor = (slug) => `https://sprktrax.org/api/link/${slug}`;

/**
 * Claims in his copy worth a second look. Printed on every run, guarded by an includes() test so
 * editing one out of the SOURCE drops it off this list — the print is the receipt, not
 * decoration. NOT edited here: it is the operator's copy and Migi's call. Everything is on
 * www.tokrwd.co, so a penalty earned by this page attaches to the DOMAIN and to every other
 * lander on it.
 */
const CONCERNS = [
  ['id="payoutAmount"',
   'HIGHEST-RISK ITEM ON THE PAGE. "$48,200+ paid out to users today" is not a stale hardcode — '
   + 'it is an ACTIVELY FABRICATED live figure: a setInterval adds a random 1-7 every 2.2 seconds, '
   + 'forever, from a fixed 48200 start. It sits under a pulsing "LIVE" pill, so the page is '
   + 'manufacturing the appearance of a real-time payout feed. It also resets to $48,200 on every '
   + 'reload, which makes it falsifiable from two browser tabs in about five seconds. A static '
   + 'number would be an unsourced claim; a counter that invents motion is a stronger one.'],
  ['data-ago=',
   'SECOND-HIGHEST. The "Live Cashouts" ticker is a frozen ten-element array of invented users '
   + '(sarah_m, david_k, lily_22, mike_t, emma_w, alex99, ryan_b, nora_x, leo_77, kira_p) with '
   + 'invented amounts, and a second setInterval rotates their timestamps every 3 seconds so one '
   + 'of them always reads "just now". Section heading: "Real people, real payouts". Every card '
   + 'carries a green check-circle. Same manufactured-liveness problem as the counter, with names '
   + 'attached.'],
  ['10 Million users',
   'a user-count claim, repeated as "Join 10 million earners" in the final CTA. Freecash publishes '
   + 'a figure of this order publicly, so this one is plausibly substantiable — but the page cites '
   + 'no source and we hold no evidence, and it is OUR domain that carries it.'],
  ['4.6</span> Trustpilot (80k+ reviews)',
   'a named third-party review platform, a specific score and a specific review count — and it is '
   + 'rendered beside a single FILLED star. Trustpilot actively polices unauthorised use of its '
   + 'name and stars. Repeated (as "4.6 Trustpilot") in the final CTA.'],
  ['earning up to $100+ per month',
   'an earnings claim with no substantiation and no "results not typical" disclaimer anywhere on '
   + 'the page. Earnings claims are the single most actioned category on both TikTok and Meta.'],
  ['id="monthlyAmount"',
   'the calculator turns that earnings claim into a PERSONALISED projection: 4.5 x rate x 4.3 x '
   + 'hours, presented as "Est. monthly earnings" and reaching $774 at 40h/week — $813 if the '
   + 'visitor picks Amazon. Measured in-browser, not read off the formula. The per-method '
   + 'multipliers (PayPal 1.00, Amazon 1.05, Visa 0.98, Google 1.02, Apple 1.03) imply a payout '
   + 'differential by cashout method that nothing substantiates. A number a visitor watched '
   + 'themselves produce reads as a promise, not an illustration.'],
  ['Free Welcome Chest worth up to $250',
   'the central offer of the page, stated five times and echoed by a mock wallet showing a '
   + '$250.00 balance "Ready to withdraw instantly". The FAQ walks it back — the reward is '
   + '"up to" $250 and is only cashable "once you reach the minimum withdrawal threshold" — but '
   + 'the hero, the sticky mobile bar ("Your $250 Chest is Ready!") and the mock balance all read '
   + 'as a $250 credit already sitting in an account.'],
  ['Average cashout time: ',
   '"17 minutes", stated three times as fact, unsourced. Paired with "Instant Cashouts" and '
   + '"processed instantly", which the FAQ then qualifies.'],
  ['$500+ daily bonuses',
   'a specific leaderboard prize pool, unsourced.'],
  ['The highest offer payouts in the industry',
   'a superlative competitive claim with no comparison or source.'],
  ['24/7 Live Support',
   '"Real humans", "any time of day", "instant responses" — an operational guarantee about a '
   + 'support desk that is not ours and that we cannot verify.'],
  ['Chest Claimed',
   'REMOVED BY THIS GENERATOR, not by him — listed so the removal is on the record. His button '
   + 'said "Chest Claimed — Check your email!" and no email was ever sent, because nothing '
   + 'submitted anything anywhere. It is now a real link to the door. Flagged in case he asks '
   + 'where the confirmation state went.'],
  ['&#169; 2025 Freecash',
   'asserts a copyright in the Freecash name. The page carries the Freecash wordmark throughout '
   + 'and names no operator entity, so it presents as first-party rather than as an affiliate '
   + 'promotion. Consistent with the house 50FC lander already live on this offer, so it is not a '
   + 'new exposure — but it is the one an advertiser complaint would land on.'],
];

function sub(html, from, to, count = 1) {
  const parts = html.split(from);
  if (parts.length - 1 !== count) {
    throw new Error(`ravi-freecash-source.html: expected ${count} occurrence(s) of ${JSON.stringify(String(from).slice(0, 90))}, found ${parts.length - 1}`);
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
const CDN_SCRIPT = '  <script src="https://cdn.tailwindcss.com"></script>\n';
const CONFIG_OPEN = '  <script>\n    tailwind.config = {';
const CONFIG_CLOSE = '    };\n  </script>\n';
const LUCIDE_SCRIPT = '  <script src="https://unpkg.com/lucide@latest"></script>\n';
/** Tailwind's minified output banner. Stripped at inline time — see patch 1. */
const TW_BANNER = '/*! tailwindcss v3.4.19 | MIT License | https://tailwindcss.com*/';

/** The offline lucide replacement. Reproduces the real library's output element-for-element:
 *  same root attributes, same `lucide lucide-<name>` class prefix, the source element's own
 *  attributes (fill, stroke-width, style, class) copied on top, and the <i> replaced in place.
 *  Exposed as window.lucide.createIcons, so BOTH of his call sites keep working unchanged —
 *  including the one that runs after he injects the feature/ticker/FAQ markup. */
function lucideShim() {
  return `  <script>
    /* Offline lucide. It replaces the icon library that was loaded from a public CDN at an
       unpinned version — @latest, so a breaking major would have landed on this page with no
       deploy. Same rendered output, no network, no third party. */
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

/* The single converting control, verbatim from his source. Kept whole so a v2 that restyles the
   button fails here instead of silently shipping a <button> that goes nowhere. */
const CLAIM_BUTTON_OPEN = '            <button id="claimBtn" class="group mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-neon-400 px-6 py-4 text-base font-bold text-ink-950 shadow-neon-md transition-all hover:bg-neon-300 hover:shadow-neon-lg active:scale-[0.98]">';
const CLAIM_BUTTON_CLOSE = '            </button>\n';

/* His fake-success handler. See DEFECT 1. */
const CLAIM_STUB = `    var claimBtn = document.getElementById('claimBtn');
    var claimText = document.getElementById('claimText');
    var claimIcon = document.getElementById('claimIcon');
    claimBtn.addEventListener('click', function () {
      claimed = true;
      claimBtn.className = 'group mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-ink-700 px-6 py-4 text-base font-bold text-neon-300 transition-all active:scale-[0.98]';
      claimText.textContent = 'Chest Claimed \\u2014 Check your email!';
      claimIcon.setAttribute('data-lucide', 'check');
      refreshIcons();
    });
`;

function page(v) {
  const DOOR = doorFor(v.slug);
  let h = SOURCE;

  // ── 1. Tailwind: compiled stylesheet in, Play CDN out ───────────────────────────────────────
  // His inline config is asserted UNCHANGED first: ravi-freecash.css was compiled from exactly
  // this block, so a v2 that edits the palette must not silently ship stale CSS.
  const cfgStart = h.indexOf(CONFIG_OPEN);
  const cfgEnd = h.indexOf(CONFIG_CLOSE, cfgStart);
  if (cfgStart < 0 || cfgEnd < 0) throw new Error('the inline tailwind.config block moved or changed shape — recompile ravi-freecash.css and re-transcribe tailwind.config.js');
  const cfgBlock = h.slice(cfgStart, cfgEnd + CONFIG_CLOSE.length);
  for (const token of ['#070A0F', '#00E676', '#3DFA94', '#0F1622', 'neon-lg', 'ticker-scroll', 'float-slow', 'tickerScroll', 'floatSlow', 'rise']) {
    if (!cfgBlock.includes(token)) throw new Error(`tailwind.config no longer defines ${token} — recompile ravi-freecash.css`);
  }
  h = h.slice(0, cfgStart) + h.slice(cfgEnd + CONFIG_CLOSE.length);

  // Tailwind's own banner carries a bare URL, which the stray-host scan below cannot tell apart
  // from a real request. Attribution is preserved as an HTML comment instead — same credit, no
  // string that reads as a third-party host. The banner stays intact in the committed
  // ravi-freecash.css, which is not deployed (_lp-generator is in .vercelignore).
  const css = TW_CSS.replace(TW_BANNER, '');
  if (css.length === TW_CSS.length) throw new Error('the Tailwind banner comment moved — check TW_BANNER after recompiling');
  h = sub(h, CDN_SCRIPT,
    '  <!-- Tailwind CSS v3.4.19 (MIT). Compiled ahead of time from the config this page shipped\n'
    + '       with, replacing the runtime Play CDN build. See _lp-generator/ravi-freecash.js. -->\n'
    + `  <style>${css}</style>\n`);

  // ── 2. lucide: embedded icon set in, unpinned unpkg out ─────────────────────────────────────
  h = sub(h, LUCIDE_SCRIPT, lucideShim());

  // ── 3. The money button: a REAL anchor at the door, not a <button> that fakes success ────────
  // Static href = the bare door; the script below upgrades it to carry the query string. In that
  // order a visitor with JS broken still reaches the door (which 404s an untagged click by
  // design) instead of tapping a button that does nothing at all.
  //
  // <a> rather than a scripted <button>: the browser handles the navigation, so long-press /
  // open-in-new-tab / middle-click all behave, and there is no click handler that could swallow
  // the tap. His classes are carried across UNCHANGED — this is the same pixels, a real link.
  h = sub(h, CLAIM_BUTTON_OPEN,
    `            <a id="claimBtn" href="${DOOR}" class="group mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-neon-400 px-6 py-4 text-base font-bold text-ink-950 shadow-neon-md transition-all hover:bg-neon-300 hover:shadow-neon-lg active:scale-[0.98]">`);
  h = sub(h, CLAIM_BUTTON_CLOSE, '            </a>\n');

  // ── 4. Delete the fake-success handler ──────────────────────────────────────────────────────
  // It is the whole of DEFECT 1. Left in place alongside a real href it would still be wrong: the
  // label would flash "Chest Claimed — Check your email!" — a statement that is not true and never
  // was — in the instant before the browser navigates. `claimed` was set by this handler and read
  // by nothing, so it goes with it. Nothing else in his script references claimText/claimIcon.
  h = sub(h, CLAIM_STUB,
    '    /* His "Claim Your Starting Chest" handler was removed by _lp-generator/ravi-freecash.js.\n'
    + '       It set the label to a claimed-and-emailed state and navigated nowhere — the page had no\n'
    + '       outbound path of any kind. The button is now a real anchor at the SPRK tracking door;\n'
    + '       see the wiring script at the foot of <body>. Nothing else read claimText/claimIcon. */\n');
  h = sub(h, '    var claimed = false;\n', '');

  const doorIds = ['claimBtn'];

  if (WIRE_ALL_CTAS) {
    // The four CTA BUTTONS. The nav "Earn" text link is deliberately not in this set.
    h = sub(h, '<a href="#calculator" class="hidden rounded-xl bg-neon-400 px-4 py-2 text-sm font-bold text-ink-950 transition-colors hover:bg-neon-300 sm:inline-block">',
      `<a id="doorNav" href="${DOOR}" class="hidden rounded-xl bg-neon-400 px-4 py-2 text-sm font-bold text-ink-950 transition-colors hover:bg-neon-300 sm:inline-block">`);
    h = sub(h, '<a href="#calculator" class="shine group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-neon-400 px-7 py-4 text-base font-bold text-ink-950 shadow-neon-md transition-all hover:bg-neon-300 hover:shadow-neon-lg active:scale-[0.98] sm:w-auto">',
      `<a id="doorHero" href="${DOOR}" class="shine group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-neon-400 px-7 py-4 text-base font-bold text-ink-950 shadow-neon-md transition-all hover:bg-neon-300 hover:shadow-neon-lg active:scale-[0.98] sm:w-auto">`);
    h = sub(h, '<a href="#calculator" class="group mt-8 inline-flex items-center justify-center gap-2 rounded-2xl bg-neon-400 px-8 py-4 text-base font-bold text-ink-950 shadow-neon-md transition-all hover:bg-neon-300 hover:shadow-neon-lg active:scale-[0.98]">',
      `<a id="doorFinal" href="${DOOR}" class="group mt-8 inline-flex items-center justify-center gap-2 rounded-2xl bg-neon-400 px-8 py-4 text-base font-bold text-ink-950 shadow-neon-md transition-all hover:bg-neon-300 hover:shadow-neon-lg active:scale-[0.98]">`);
    h = sub(h, '<a href="#calculator" class="group inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-neon-400 px-4 py-3 text-sm font-bold text-ink-950 shadow-neon-sm transition-all hover:bg-neon-300 active:scale-95">',
      `<a id="doorSticky" href="${DOOR}" class="group inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-neon-400 px-4 py-3 text-sm font-bold text-ink-950 shadow-neon-sm transition-all hover:bg-neon-300 active:scale-95">`);
    doorIds.push('doorNav', 'doorHero', 'doorFinal', 'doorSticky');
  }

  // ── 5. The door wiring itself, appended as its own script at the end of <body> ──────────────
  // His script block is otherwise left alone: it owns the calculator, the ticker, the FAQ and the
  // counter, and none of that is ours to edit.
  const wiring = `  <script>
    // ---- Outbound: the SPRK tracking DOOR ----
    // The supplied page had NO outbound path at all — every CTA was an in-page fragment and the
    // one converting control was a button that rewrote its own label and stopped. The door mints
    // the click_id, freezes the owner at click time, stamps the outbound subid wire and 302s to
    // the real Freecash URL, which lives in the offer row and never appears in this page's source.
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
  h = sub(h, '</body>', wiring + '</body>');

  // ── 6. Legal links — all four shipped as dead href="#" ──────────────────────────────────────
  // Extension-less on purpose: vercel.json sets cleanUrls:true, so /Rewards/terms.html 308s, and
  // spending a redirect on a link a reviewer fetches is avoidable. FAQ already points at #faq and
  // is left alone.
  h = sub(h, '<a href="#" class="hover:text-white">About</a><a href="#" class="hover:text-white">Support</a><a href="#faq" class="hover:text-white">FAQ</a><a href="#" class="hover:text-white">Terms</a><a href="#" class="hover:text-white">Privacy</a>',
    '<a href="/Rewards" class="hover:text-white">About</a>'
    + '<a href="/Rewards/contact" class="hover:text-white">Support</a>'
    + '<a href="#faq" class="hover:text-white">FAQ</a>'
    + '<a href="/Rewards/terms" class="hover:text-white">Terms</a>'
    + '<a href="/Rewards/privacy" class="hover:text-white">Privacy</a>');

  // ── 7. Favicon — his page shipped with none, so every cold load took a /favicon.ico 404 ─────
  h = sub(h, '  <meta name="theme-color" content="#00E676" />\n',
    '  <meta name="theme-color" content="#00E676" />\n'
    + `  <link rel="icon" href="${LOGO}" />\n`
    + `  <link rel="apple-touch-icon" href="${LOGO}" />\n`);

  // ── 8. Our own style layer, appended AFTER his so it wins on cascade order ──────────────────
  // No !important that is ours (his reduced-motion block already uses it), and not one of his
  // rules is edited. Everything that changes layout is inside a phone media query, so the desktop
  // design he built is byte-for-byte untouched.
  const styleLayer = `  <style>
    /* ── Added by _lp-generator/ravi-freecash.js, not by the operator ────────────────────── */

    /* HIS OWN ANIMATION, RESTORED. His inline Tailwind theme declares a "rise" keyframe and BOTH
       hero columns ask for it by name via style="animation:rise .5s ease-out" — but animate-rise
       is never used as a CLASS, so Tailwind never emitted the keyframe, on this compiled build or
       on the Play CDN. Both hero blocks have therefore never animated in, on any load. Verified
       in-browser against the unmodified source before adding this. Declaring the keyframe is what
       he already asked for; inventing one would be.
       (NOTE: do not name the runtime config object in this comment — the never() guard below
        scans the EMITTED page and will fail the build on it. That is the guard working.) */
    @keyframes rise { 0% { opacity: 0; transform: translateY(20px); } 100% { opacity: 1; transform: translateY(0); } }

    /* Restores the ONE difference that promoting his money control to an anchor caused: the UA
       stylesheet centres text in a BUTTON element, and an anchor instead inherits text-align:
       start. His flex centering hides that on a single line, so it surfaces only when "Claim
       Your Starting Chest" WRAPS — i.e. on a narrow phone, on the converting control. Caught by
       diffing computed styles against his original CDN build across all 553 elements. Do not
       drop it, and note the guard below scans the emitted page for that element name, so this
       comment must not spell it as a tag. */
    #claimBtn { text-align: center; }

    /* iOS Safari inflates body text in landscape without this. */
    html { -webkit-text-size-adjust: 100%; }

    @media (max-width: 720px) {
      /* Tap targets. Apple HIG and Material both publish 44px. MEASURED on the emitted page at
         320/360/375/390/412/430 — these are the only two controls that came back under the bar,
         so they are the only two touched. Everything else (the hero CTA, the claim anchor, the
         sticky bar, the payout chips, the FAQ rows) already cleared 44px on his own layout.

         His header nav and "Sign Up Free" are display:none below md/sm, so they are NOT styled here:
         a rule for them would never match and would only read as though something was wrong. */

      /* Footer legal links shipped ~16px tall. These are exactly the links an ad reviewer taps,
         and they are now real destinations rather than dead fragments. 15px/10px lands them at 46x43+. */
      footer nav a { display: inline-block; padding: 15px 10px; }

      /* ── THE HOURS SLIDER IS DELIBERATELY NOT TOUCHED. Read this before "fixing" it. ──────
         It measures 8px tall, so tap-the-track-to-jump has an 8px target. Its thumb is 28px and
         drags fine, so the control works; only the track tap is small.

         The standard fix — box-sizing:content-box plus vertical padding to grow the hit box to
         44px, with background-clip:content-box to keep the painted track at 8px — CANNOT WORK ON
         THIS PAGE, and it fails in a way that passes every check except a screenshot:

           updateCalculator() assigns slider.style.background = "linear-gradient(...)" on load and
           on EVERY input event. That is the SHORTHAND, so it resets background-clip to its
           initial border-box and wipes the rule. Measured: computed background-clip comes back
           border-box no matter what the stylesheet says.

         The consequence is not a missing fix, it is a visible defect. The gradient then paints
         across the whole 44px padding box, so his slim 8px track becomes a fat 44px green bar;
         and pulling it back up with a negative margin to keep the layout tight lands that bar ON
         TOP of the "Hours per week" label. Built, measured (element box 44px, overlapsLabel
         true), caught in a phone screenshot and reverted on 2026-08-11. The computed-style diff
         did NOT catch it, because the rule lives in a max-width:720px media query.

         Beating it would need background-clip: content-box !important, to override his own
         inline style on his own control, on every input event. Not worth it for a secondary
         control that already drags. The honest fix is in HIS source: have updateCalculator write
         style.backgroundImage instead of the shorthand. Left for him. */

      /* "Sign Up Free" is display:none below sm, so this only bites between 640px and 720px —
         i.e. most phones held in LANDSCAPE, where it measured 118x36. It is a CTA, so it gets
         the 44px. Scoped as a direct child of the header row so it cannot also catch the "Earn"
         nav link inside <nav>. */

      header > div > a[href="#calculator"] { padding-top: 12px; padding-bottom: 12px; }
    }

    /* His reduced-motion block covers animation and transition but not scrolling, and <html>
       carries class="scroll-smooth" — so a visitor who asked the OS for less motion still gets
       smooth-scroll on all five in-page CTAs. */
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto !important; }
    }
  </style>
</head>`;
  h = sub(h, '</head>', styleLayer);

  // ── 9. Shared ttclid backfill, canonical on every lander in this repo ───────────────────────
  h = sub(h, '</body>',
    '  <!-- Shared ttclid backfill: fills an empty ttclid from the _ttclid cookie and tags tracker\n'
    + '       anchors. sprktrax.org is in its allowlist, so the door forwards it into the postback. -->\n'
    + '  <script src="/js/ttclid.js" async></script>\n</body>');

  // ── Invariants ──────────────────────────────────────────────────────────────────────────────
  // Ordering matters: every never() runs AFTER the wiring is injected, so it also polices what
  // THIS GENERATOR adds — a guard that only inspects the input is half a guard.
  must(h, DOOR, doorIds.length + 1);        // one static href each + the JS constant
  must(h, 'offerUrl()', 2);
  doorIds.forEach((id) => must(h, `id="${id}"`, 1));
  must(h, '<a id="claimBtn"', 1);           // it is an ANCHOR now, not a button
  must(h, '/Rewards/terms', 1);
  must(h, '/Rewards/privacy', 1);
  must(h, '/Rewards/contact', 1);
  must(h, '/js/ttclid.js', 1);
  must(h, LOGO, 2);                         // icon + apple-touch-icon
  must(h, 'window.lucide', 1);
  must(h, 'lucide.createIcons()', 1);       // his one call site, still present
  must(h, 'refreshIcons()', 2);             // the definition + his init call; the stub's is gone
  must(h, 'IntersectionObserver', 0);       // he uses none — pinned so a v2 addition is noticed
  must(h, '@keyframes rise', 1);
  must(h, 'Added by _lp-generator/ravi-freecash.js', 1);
  must(h, '</style>', 3);                   // compiled tailwind + his + ours, never merged

  // His funnel: the scroll anchors that remain must still exist, or the page has dead buttons.
  //   ⚠️ Tag-qualified on purpose. A bare 'href="#calculator"' also matches the CSS SELECTOR in
  //   our own style layer, which broke this build once — the count came back 6. Counting the
  //   opening anchor tag measures the markup, which is what this assertion is actually about.
  must(h, '<a href="#calculator"', WIRE_ALL_CTAS ? 1 : 5);
  must(h, '<a href="#faq"', 2);
  must(h, '<a href="#features"', 1);

  // NO <button> ELEMENT SURVIVES IN THE STATIC MARKUP. His only one was the money button, and it
  // is an <a> now. The calculator's method chips are built with createElement('button') and the
  // FAQ rows from an innerHTML template, so exactly one literal `<button` remains — inside a JS
  // string, where it is markup his script writes at runtime, not markup we ship.
  //   ⚠️ This assertion caught the first build: `must(h,'<button',0)` failed on that FAQ template.
  //   The guard was right and the comment was wrong. Pin BOTH halves instead of loosening either.
  must(h, '<button id=', 0);                    // nothing static
  must(h, '\'<button class="faq-btn', 1);       // his runtime FAQ row, untouched
  must(h, 'createElement(\'button\')', 1);      // his runtime method chips, untouched
  must(h, '<button', 1);                        // and that is ALL of them

  // The no-outbound-path defect, in every disguise it has worn across seven supplied landers.
  never(h, 'href="#"', 'a bare fragment is the no-outbound-path defect');
  never(h, 'example.com', 'placeholder destinations must never ship');
  never(h, 'preventDefault', 'nothing may swallow the converting click');
  never(h, 'Connect your claim flow', 'a demo stub must never ship');
  never(h, 'Chest Claimed', 'the fake-success label stated something untrue and navigated nowhere');
  never(h, 'claimed = true', 'the fake-success handler must be gone, not merely bypassed');

  // The CDNs are gone, and stay gone.
  never(h, 'cdn.tailwindcss.com', 'the Play CDN compiles every class at runtime and is render-blocking');
  never(h, 'unpkg.com', 'an unpinned icon CDN, loaded at @latest');
  never(h, 'tailwind.config', 'the runtime config goes with the runtime compiler');
  never(h, 'bolt.new', 'a third party OG card on our own domain');

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
  // stopped parsing — which is exactly the risk when patch 4 cuts a block out of the middle of
  // his script. Parse them here instead of finding out live.
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
const CLONES = ci > -1 ? parseInt(argv[ci + 1], 10) : 30;   // matches his Playful/Shein slices
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
for (const rel of [LOGO, '/js/ttclid.js', '/Rewards/index.html', '/Rewards/terms.html', '/Rewards/privacy.html', '/Rewards/contact.html']) {
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

  // MIXED SHAPE, deliberately. Commit 9763a57 flattened only the LIVE groups, so the RV61 slice is
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
    `  ${v.geo}  ${(CANON_DIR + '/' + v.key).padEnd(10)}`
    + ` + ${(v.flat ? v.flat + '.html' : v.family + '/' + v.geo + '1..' + v.geo + CLONES).padEnd(22)}`
    + (v.vanity ? ' + /' + v.vanity : '').padEnd(12)
    + `  ->  ${v.slug}`
  );
}
console.log(`\n  ${VARIANTS.length} geos · ${totalFiles} files · ${CLONES} clones each\n`);

console.log('  ROOTS (must be in PRELANDER_ALLOWED_ROOTS *and* ALLOWED_ROOTS):');
console.log('    ' + [CANON_DIR, ...VARIANTS.map((v) => v.flat ? v.flat + '.html' : v.family), ...VARIANTS.filter((v) => v.vanity).map((v) => v.vanity)]
  .map((r) => r.toLowerCase()).join(', ') + '\n');

console.log('  ⚠️  ONE OFFER, THREE GEOS — only ONE assignment may be active at a time.');
console.log('      resolveAffiliateOfferLinks keys by_offer[offer_id] with no ordering and never');
console.log('      reads lp.geo, so two active rows on this offer serve a coin flip. See the SQL.');
console.log('  ⚠️  He is ALREADY ACTIVE on the house design (slug `freecash`, slot 15). The SQL');
console.log('      archives it in the same transaction — release BEFORE you claim.\n');

const html = built[0].html;
console.log('  ⚠️  LEFT AS SUPPLIED — his copy, Migi\'s call, not edited here:\n');
for (const [needle, why] of CONCERNS) {
  if (html.includes(needle) || SOURCE.includes(needle)) console.log(`   · ${needle}\n       ${why}\n`);
}

console.log('  ℹ️  PER-GEO COPY: identical on all three, deliberately. His page quotes USD in a');
console.log('      dozen places; CA also writes "$", so only GB visibly mismatches. Every way of');
console.log('      "fixing" it invents a figure we cannot substantiate, so it is left alone.');
VARIANTS.forEach((v) => console.log(`      ${v.geo}  currency ${v.currency}  ${v.slug}`));
console.log('      Set `currency` in VARIANTS once a real per-geo figure is confirmed.\n');

console.log(`  ℹ️  CTA WIRING: WIRE_ALL_CTAS = ${WIRE_ALL_CTAS}.`);
console.log('      ' + (WIRE_ALL_CTAS
  ? 'The four CTA buttons fire the door directly; the calculator remains for anyone who scrolls.'
  : 'The four CTA buttons scroll into his calculator; "Claim Your Starting Chest" fires the'));
if (!WIRE_ALL_CTAS) console.log('      door. Flip the constant to true for the shorter path.');
console.log();
