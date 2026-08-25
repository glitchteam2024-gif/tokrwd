#!/usr/bin/env node
/**
 * Ravi's OWN Shein landing page — every Shein offer we sell in an English geo.
 *
 *   node _lp-generator/ravi-shein.js --clones 30
 *
 * Affiliate: Raviteja Kathuria · ravitejkathuria011@gmail.com · AffID 25
 *            auth.users.id 9a619c72-035e-4fec-92d9-cc2a17034317
 *
 * He sent one HTML file (a $750 Shein "Flash Reward Event" page with a 3-question survey).
 * `ravi-shein-source.html` is that file BYTE-FOR-BYTE. This generator applies only asserted
 * substitutions on top, so "what did we change" is always answerable, a v2 from him re-applies
 * automatically, and any edit that breaks a patch FAILS THE BUILD instead of shipping a
 * placeholder. Sibling: `ravi-playful.js`, the same affiliate's Playful Rewards page.
 *
 * ── THERE IS NO CANADIAN SHEIN OFFER ─────────────────────────────────────────────────────────
 * Migi asked for "english, uk, au, ca". Measured against prod 2026-08-10: all seven Shein offers
 * are active and each sells EXACTLY ONE geo — US x4, GB x2, AU x1. `destination_by_geo` carries a
 * single key on every one of them. CA inventory exists on this network (Apple Pay, Doordash, Tim
 * Hortons, Fortnite, GTA VI, OnlyFans, Freecash, Playful) but NOT on Shein.
 *
 * So there is no `shein-ca-*` door to point a page at, and building one would mean either a page
 * quoting a reward no offer pays, or a CA lander whose door 404s every paid click. Neither ships.
 * The CA row is simply absent from VARIANTS. If a CA Shein offer is ever added, it is one line.
 *
 * ── WHAT WAS WRONG WITH THE SUPPLIED FILE ────────────────────────────────────────────────────
 *
 *   1. NO OUTBOUND PATH AT ALL — the sixth supplied lander in a row with this defect, and the
 *      most convincing disguise of it yet. All three money buttons call `scrollToQuiz()`; the
 *      quiz runs a 3-step loading sequence whose last frame reads "Card Reserved! Redirecting…";
 *      and then `startLoading()` RESETS the quiz to question 1 and scrolls back to it. It is a
 *      closed loop that announces a redirect and performs none. Grepped, not assumed:
 *      `location.href|location.replace|window.open|sprktrax|api/link` -> ZERO matches.
 *      Ravi would have paid for every click and earned nothing, and every dashboard would read
 *      normally: clicks in, zero conversions.
 *
 *   2. `cdn.tailwindcss.com` (Tailwind PLAY CDN) compiled every utility class in the browser.
 *      It is render-blocking and it is the ENTIRE stylesheet — one blocked or slow request and a
 *      paid visitor gets unstyled HTML. Tailwind's own docs say it is not for production.
 *      Compiled ahead of time instead; see patch 1.
 *
 *   3. `unpkg.com/lucide@latest` is UNPINNED and sits ON the conversion path. `lucide.createIcons()`
 *      runs inside `startLoading()` (source line 511) between the quiz finishing and the hand-off.
 *      A breaking `@latest` major, or one unpkg hiccup, throws there and the funnel dead-ends.
 *      Replaced with an embedded icon set; see patch 2.
 *
 *   4. `bolt.new/static/og_default.png` — the page builder's default OG card, on our domain.
 *
 *   5. NO legal links at all. Not the usual `href="#"` — the footer carries the disclaimer prose
 *      and links nothing, which reads fine to a human and fails the same ad-network fetch.
 *
 * ── HOW THE CSS AND ICONS WERE PRODUCED (re-run this if he sends a v2) ────────────────────────
 *
 *     npm i -D tailwindcss@3 lucide-static
 *     # tailwind.config.js: content:['./page.html'] + the theme.extend block transcribed
 *     # VERBATIM from his inline config (patch 1 asserts that block is unchanged and FAILS if not)
 *     npx tailwindcss -i input.css -o ravi-shein.css --minify
 *
 * Coverage was verified by diffing every class used in the HTML — including the ones composed
 * inside his JS strings — against every selector the compiled sheet defines. Zero missing.
 * `ravi-shein-icons.json` is the inner SVG of the 18 icons the page names, from lucide-static
 * 1.31.0. `_lp-generator/` is in `.vercelignore`, so none of these inputs is ever served.
 *
 * ── WHAT IS DELIBERATELY NOT CHANGED ─────────────────────────────────────────────────────────
 * His copy, his claims, his funnel shape and his design are the operator's. They are PRINTED on
 * every run (see CONCERNS) and never edited. The countdown is the highest-risk of them and is
 * called out by name in the print block.
 */

'use strict';
require('./_guard.js')('ravi-shein.js');

const fs = require('fs');
const path = require('path');

const SOURCE = fs.readFileSync(path.join(__dirname, 'ravi-shein-source.html'), 'utf8');
const TW_CSS = fs.readFileSync(path.join(__dirname, 'ravi-shein.css'), 'utf8');
const ICONS = JSON.parse(fs.readFileSync(path.join(__dirname, 'ravi-shein-icons.json'), 'utf8'));

const CANON_DIR = 'RAVSH';

/** The house Shein offer tile already in this repo — a real asset, nothing invented. */
const OG_IMAGE = '/images/offers/shein.webp';

/**
 * The reward figure as it appears in his source. Every one of the 14 sites is replaced with the
 * variant's own amount, and a stray-symbol guard then proves the wrong currency is gone entirely.
 * Measured: the source contains exactly 14 `$` characters and all 14 of them are this string, so
 * the guard is exact rather than approximate.
 */
const SOURCE_AMOUNT = '$750';

/**
 * ONE ROW PER OFFER. Amounts mirror `kerman-shein.js`, which runs this same seven-offer set — the
 * figures were reconciled against the offer names there and are re-asserted here.
 *
 * `key` is the subfolder under CANON_DIR and MUST be unique: four of the seven are geo US, so the
 * geo cannot be the key. `family` is its own numbered clone slice (RV50-53 are his Playful pages).
 * Only the flagship gets a vanity path — see the note at the write loop.
 *
 * Verified against prod 2026-08-10: all seven active, cap_mode fcfs, payout NULL,
 * destination_by_geo carrying exactly the one geo named here.
 */
const VARIANTS = [
  { key: 'USB2S', geo: 'US', flat: 'shein1kusa-ravi', vanity: 'ravshurl', amount: '$1,000',
    slug: 'shein-b2s-us-ravi',                    offerId: '7018d82b-f19d-4759-9910-de9e837774e5',
    offer: 'Rewards US - Shein $1000 Back to School' },
  { key: 'GBB2S', geo: 'GB', flat: 'shein1kuk-ravi', vanity: null,       amount: '£1,000',
    slug: 'shein-b2s-gb-ravi',                    offerId: '01a705a9-c479-4bec-aaed-bd0b038bc4d7',
    offer: 'Rewards UK - Shein £1000 Back to School' },
  { key: 'USFP',  geo: 'US', flat: 'sheinpollusa-ravi', vanity: null,       amount: '$750',
    slug: 'flash-poll-shein-2-us-ravi',           offerId: '4b430587-1cbc-4542-82d9-0ef0c5d61d7c',
    offer: 'Rewards US - Flash Poll - Shein $750' },
  { key: 'GBFP',  geo: 'GB', flat: 'sheinpolluk-ravi', vanity: null,       amount: '£750',
    slug: 'flash-poll-shein-gb-ravi',             offerId: 'b4efc3f5-491e-485e-aad8-f57145d6d4d9',
    offer: 'Rewards UK - Flash Poll - Shein £750' },
  { key: 'US2X',  geo: 'US', flat: 'shein2xusa-ravi', vanity: null,       amount: '$750',
    slug: '2x-rewards-shein-bonus-us-ravi',       offerId: 'f56469f1-12a1-4a6b-a8c2-81dfa9359075',
    offer: 'Rewards US - 2x Rewards - Shein $750 Bonus' },
  { key: 'USRT',  geo: 'US', flat: 'sheinrtlusa-ravi', vanity: null,       amount: '$750',
    slug: 'retail-style-shein-us-ravi',           offerId: '597d4dc9-a13f-4a0e-9acc-15dd4b6ca628',
    offer: 'Rewards US - Retail Style - Shein $750' },
  { key: 'AUPR',  geo: 'AU', flat: 'sheinrevau-ravi', vanity: null,       amount: '$750',
    slug: 'product-reviewer-shein-bonus-au-ravi', offerId: '209e39e1-02b5-4102-ad2c-600468ed4fc8',
    offer: 'Rewards AU - Product Reviewer Shein Bonus $750' },
];

/** Every currency mark any variant may legitimately carry. Anything else surviving substitution
 *  is a bug — see the stray-symbol guard, which prints surrounding context so a false positive
 *  from a comment is instantly recognisable rather than a hunt. */
const CURRENCY_MARKS = ['$', '£'];

const doorFor = (slug) => `https://sprktrax.org/api/link/${slug}`;

/**
 * LEFT AS SUPPLIED — his copy, Migi's call, not edited here. Printed on every run so a deliberate
 * carve-out cannot quietly become a permanent one nobody remembers agreeing to. The print is
 * guarded by an includes() check, so editing a claim out of the source and re-running drops it
 * off this list — that is the receipt. To change one, edit the SOURCE, never this array.
 */
const CONCERNS = [
  ['var TARGET = Date.now()',
   'THE HIGHEST-RISK ITEM ON THE PAGE. The countdown is seeded 4h23m from page LOAD, so it '
   + 'restarts for every visitor and on every refresh and the deadline never actually arrives. A '
   + 'fake deadline is textbook deceptive urgency; both TikTok and Meta action it, and a penalty '
   + 'earned here attaches to www.tokrwd.co and every other lander on it.'],
  ['cards left for',
   '"Only 14 cards left for <today>" — a hardcoded scarcity number beside a date that is '
   + 'generated client-side, so it reads as live inventory and is not.'],
  ['Over 45,000 Cards Claimed',
   'an unsourced volume claim, restated as "45,000+ shoppers" in the final CTA.'],
  ['Showing 5 of ',
   'the claims total is generated by `45200 + Math.random()*300` every 6 seconds, so the number '
   + 'visibly changes while the visitor watches. It is presented as a real count.'],
  ['Rated 4.9/5',
   'an unsourced rating, repeated as "4.9/5 Rating" in the final CTA.'],
  ['Verified Shein Offer',
   'a verification claim about a third party. The footer disclaimer correctly says the page is '
   + 'NOT affiliated with or endorsed by Shein, which sits awkwardly beside "Verified Shein Offer" '
   + 'and "Verified Offer" in the banner.'],
  ['var WINNERS',
   'the Recent Winners feed is fabricated — five seeded names plus six that are injected at random '
   + 'every 6 seconds with "just now" timestamps, each captioned as having claimed the reward.'],
  ['typically valid for 12 months',
   'a specific assertion about Shein\'s own gift-card terms that nothing we hold substantiates.'],
  ['encrypted and never sold',
   'a security claim on a page that collects nothing — there is no form here, so it describes a '
   + 'data flow that does not exist on this page.'],
  ['Flash Reward Events',
   'the footer asserts a copyright over an entity name; harmless, but it is his to own.'],
];

function sub(html, from, to, count = 1) {
  const parts = html.split(from);
  if (parts.length - 1 !== count) {
    throw new Error(`ravi-shein-source.html: expected ${count} occurrence(s) of ${JSON.stringify(String(from).slice(0, 90))}, found ${parts.length - 1}`);
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

/* ── Exact head fragments we replace. Constants so a source edit that touches any of them fails
      LOUDLY in sub() rather than silently skipping the patch. ────────────────────────────────── */
const CDN_SCRIPT = '    <script src="https://cdn.tailwindcss.com"></script>\n';
const CONFIG_OPEN = '    <script>\n      tailwind.config = {';
const CONFIG_CLOSE = '      };\n    </script>\n';
const LUCIDE_SCRIPT = '    <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>\n';
/** Tailwind's minified output banner. Stripped at inline time — see patch 1. */
const TW_BANNER = '/*! tailwindcss v3.4.19 | MIT License | https://tailwindcss.com*/';

/** The offline lucide replacement. Reproduces the real library's output element-for-element:
 *  same root attributes, same `lucide lucide-<name>` class prefix, the source element's own
 *  attributes (fill, stroke-width, style, class) copied on top, and the <i> replaced in place.
 *  Exposed as window.lucide.createIcons, so ALL FOUR of his call sites keep working unchanged —
 *  including the ones that run after he injects new markup (options, winners, the check icon). */
function lucideShim() {
  return `    <script>
      /* Offline lucide. It replaces the icon library that was loaded from a public CDN at an
         unpinned version and sat directly on the conversion path: createIcons() runs inside
         startLoading(), between the survey finishing and the hand-off to the offer. If it threw,
         the visitor stopped there. Same rendered output, no network, no third party. */
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

/** His closed loop, verbatim. This is the block that made the funnel a circle. */
const RESET_LOOP = `        setTimeout(function() {
          document.getElementById('quiz-content').style.display = 'block';
          document.getElementById('quiz-loading').style.display = 'none';
          quizStep = 0; answers = {};
          showStep(0);
          QUESTIONS.forEach(function(_, i) { renderOptions(i); });
          document.getElementById('quiz').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, elapsed + 400);`;

function page(v) {
  const DOOR = doorFor(v.slug);
  let h = SOURCE;

  // ── 1. Tailwind: compiled stylesheet in, Play CDN out ───────────────────────────────────────
  // His inline config is asserted UNCHANGED first: ravi-shein.css was compiled from exactly this
  // block, so a v2 that edits the palette must not silently ship stale CSS.
  const cfgStart = h.indexOf(CONFIG_OPEN);
  const cfgEnd = h.indexOf(CONFIG_CLOSE, cfgStart);
  if (cfgStart < 0 || cfgEnd < 0) throw new Error('the inline tailwind.config block moved or changed shape — recompile ravi-shein.css and re-transcribe tailwind.config.js');
  const cfgBlock = h.slice(cfgStart, cfgEnd + CONFIG_CLOSE.length);
  for (const token of ['#e0006e', '#f4188c', '#5a002c', '#1d1d22', 'pulse-ring', 'bounce-in', 'slide-in', 'fade-up']) {
    if (!cfgBlock.includes(token)) throw new Error(`tailwind.config no longer defines ${token} — recompile ravi-shein.css`);
  }
  h = h.slice(0, cfgStart) + h.slice(cfgEnd + CONFIG_CLOSE.length);

  // Tailwind's own banner carries a bare URL, which the stray-host scan below cannot tell apart
  // from a real request. Attribution is preserved as an HTML comment instead — same credit, no
  // string that reads as a third-party host. The banner stays intact in the committed
  // ravi-shein.css, which is not deployed (_lp-generator is in .vercelignore).
  const css = TW_CSS.replace(TW_BANNER, '');
  if (css.length === TW_CSS.length) throw new Error('the Tailwind banner comment moved — check TW_BANNER after recompiling');
  h = sub(h, CDN_SCRIPT,
    '    <!-- Tailwind CSS v3.4.19 (MIT). Compiled ahead of time from the config this page shipped\n'
    + '         with, replacing the runtime Play CDN build. See _lp-generator/ravi-shein.js. -->\n'
    + `    <style>${css}</style>\n`);

  // ── 2. lucide: embedded icon set in, unpinned unpkg out ─────────────────────────────────────
  h = sub(h, LUCIDE_SCRIPT, lucideShim());

  // ── 3. THE REWARD FIGURE — per offer, in every one of the 14 places he wrote it ─────────────
  // Four of the seven offers pay a different figure from the source, and three are non-USD.
  // Shipping his $750 unchanged onto a 1,000 offer, or a dollar sign onto a sterling offer, is a
  // materially false promise on a money path, in the affiliate's name.
  h = sub(h, SOURCE_AMOUNT, v.amount, 14);
  must(h, v.amount, 14);

  // ── 4. THE MONEY PATH — his funnel announced a redirect and performed none ──────────────────
  // A real anchor is revealed BEFORE the programmatic navigation, so the click survives a browser
  // that blocks the latter (in-app webviews do). His three hero/sticky/final buttons are left
  // exactly as they are: they scroll into the survey, which is HIS funnel, and it is not ours to
  // rewrite. The exit is wired at the point his own copy already promised one.
  h = sub(h,
    '<div class="mt-6 flex items-center justify-center gap-2" id="loading-dots"></div>',
    '<div class="mt-6 flex items-center justify-center gap-2" id="loading-dots"></div>\n'
    + `                <a id="doorClaim" href="${DOOR}" class="mt-6 hidden w-full items-center justify-center gap-2 rounded-2xl bg-shein-600 px-6 py-4 text-base font-bold text-white shadow-lg shadow-shein-500/30 transition-all hover:bg-shein-700 active:scale-[0.98]">Continue to your reward</a>`);

  h = sub(h, RESET_LOOP,
    `        setTimeout(function() {
          // Replaced by _lp-generator/ravi-shein.js. The supplied page reset the survey here and
          // scrolled back to question 1, so "Card Reserved! Redirecting..." redirected nowhere and
          // the funnel had no exit at all. Reveal the real anchor first, then hand off.
          var a = document.getElementById('doorClaim');
          if (a) { a.classList.remove('hidden'); a.classList.add('flex'); }
          if (window.SPRK_GO) window.SPRK_GO();
        }, elapsed + 400);`);

  // ── 5. The door wiring itself, appended as its own script at the end of <body> ──────────────
  // His script block is otherwise left untouched: it owns the countdown, the survey, the winners
  // feed, the steps and the FAQ, and none of that is ours to edit.
  const wiring = `    <script>
      // ---- Outbound: the SPRK tracking DOOR ----
      // The door mints the click_id, freezes the owner at click time, stamps the outbound subid
      // wire and 302s to the real offer URL, which lives in the offer row and never appears in
      // this page's source.
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

      // Upgrade the static href in place, so a visitor whose JS died after this point still has a
      // working anchor rather than a button that scrolls forever.
      var claim = document.getElementById('doorClaim');
      if (claim) claim.setAttribute('href', offerUrl());

      // Called by his survey once the "Card Reserved" frame has been shown.
      window.SPRK_GO = function () { location.href = offerUrl(); };
    </script>
`;
  h = sub(h, '  </body>', wiring + '  </body>');

  // ── 6. Legal links — the footer had the disclaimer prose and linked NOTHING ─────────────────
  // Extension-less on purpose: vercel.json sets cleanUrls:true, so /Rewards/terms.html 308s, and
  // spending a redirect on a link a reviewer fetches is avoidable.
  h = sub(h, '<p class="mt-3 text-xs font-medium text-ink-400">© <span id="year"></span> Flash Reward Events. All rights reserved.</p>',
    '<p class="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-medium text-ink-400">'
    + '<a href="/Rewards/terms" class="hover:text-ink-600">Terms</a>'
    + '<a href="/Rewards/privacy" class="hover:text-ink-600">Privacy</a>'
    + '<a href="/Rewards/contact" class="hover:text-ink-600">Support</a>'
    + '</p>\n            <p class="mt-3 text-xs font-medium text-ink-400">© <span id="year"></span> Flash Reward Events. All rights reserved.</p>');

  // ── 7. Social preview + favicon — the page builder's default card was still on it ───────────
  h = sub(h, '<meta property="og:image" content="https://bolt.new/static/og_default.png">',
             `<meta property="og:image" content="${OG_IMAGE}">`);
  h = sub(h, '<meta name="twitter:image" content="https://bolt.new/static/og_default.png">',
             `<meta name="twitter:image" content="${OG_IMAGE}">`
             + `\n    <link rel="icon" href="${OG_IMAGE}">`
             + `\n    <link rel="apple-touch-icon" href="${OG_IMAGE}">`);

  // ── 8. Our own style layer, appended AFTER his so it wins on cascade order ──────────────────
  // No !important on any layout rule, and not one of his rules is edited. Everything that changes
  // layout is inside a phone media query, so the desktop design he built is byte-for-byte his.
  //
  // Measured on the EMITTED page at 320/360/375/390/412/430, before and after, using an ink-width
  // check against each element's own content box (a document-level scrollWidth test does not find
  // a child colliding inside its own padding box). His layout is genuinely fluid — the hero uses
  // Tailwind's own sm: breakpoint rather than a clamp() with a floor, so the reward figure has no
  // shrink-rate defect. What was actually wrong was tap targets.
  const styleLayer = `    <style>
      /* ── Added by _lp-generator/ravi-shein.js, not by the operator ───────────────────────── */

      @media (max-width: 720px) {
        /* Tap targets. Apple HIG and Material both publish 44px. The footer legal links this
           generator adds are exactly the links an ad reviewer taps, so they are sized for it.
           14px, not 13: the 12px text renders a 16px line box, so 13 lands at 42 and misses. */
        footer a { display: inline-block; padding: 14px 4px; }
        /* The survey's Back control was 20px tall. */
        #quiz-back { padding: 12px 0; }
      }

      /* He ships no reduced-motion rule, so state it here: the page runs five infinite animations
         (the banner shimmer, the floating gift card, the pulse ring, the ping dot and the bouncing
         chevron) plus a 6-second interval that re-animates the winners feed. A visitor who has
         asked the OS for less motion should not get them. Pseudo-elements included, which is the
         part the usual one-liner misses. */
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
  must(h, DOOR, 2);                         // the static href + the JS constant
  must(h, 'offerUrl()', 3);                 // href upgrade + SPRK_GO + the definition's own call site
  must(h, 'id="doorClaim"', 1);
  must(h, 'window.SPRK_GO = function', 1);            // defined once, in our wiring block
  must(h, 'if (window.SPRK_GO) window.SPRK_GO();', 1); // called once, from inside his survey
  must(h, '/Rewards/terms', 1);
  must(h, '/Rewards/privacy', 1);
  must(h, '/Rewards/contact', 1);
  must(h, '/js/ttclid.js', 1);
  must(h, OG_IMAGE, 4);                     // og + twitter + icon + apple-touch-icon
  must(h, 'window.lucide', 1);
  must(h, 'lucide.createIcons()', 4);       // all four of HIS call sites still present
  must(h, 'IntersectionObserver', 0);       // he uses none — pinned so a v2 addition is noticed
  must(h, 'Added by _lp-generator/ravi-shein.js', 1);
  must(h, '</style>', 3);                   // compiled tailwind + his + ours, never merged

  // His funnel: the three scroll-to-survey buttons must survive, or the page has dead buttons.
  must(h, 'onclick="scrollToQuiz()"', 3);
  must(h, 'onclick="quizBack()"', 1);

  // The loop is gone and stays gone.
  never(h, 'quizStep = 0; answers = {};', 'the survey must not reset instead of handing off');

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

  // Wrong-currency guard. Any mark that is not this variant's own must be gone entirely — a
  // sterling offer advertising a dollar figure is a false promise, and it is invisible in a diff
  // of 700 generated files. The error prints context because a bare "1 stray $" is unactionable.
  for (const mark of CURRENCY_MARKS) {
    if (v.amount.startsWith(mark)) continue;
    const i = h.indexOf(mark);
    if (i > -1) {
      throw new Error(`${v.key}: a "${mark}" survived substitution but this variant pays ${v.amount}`
        + `\n      context: ${JSON.stringify(h.slice(Math.max(0, i - 80), i + 80))}`);
    }
  }

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

  // Nothing third-party may ride along beyond the webfont his design already used. Google Fonts is
  // established on this domain (431 existing landers load it) and sits on no money path.
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
const CLONES = ci > -1 ? parseInt(argv[ci + 1], 10) : 30;
if (!Number.isFinite(CLONES) || CLONES < 1) { console.error('--clones must be a positive integer'); process.exit(1); }

const repoRoot = path.join(__dirname, '..');

// Two variants must never share a folder, a key or a slug — a collision would silently overwrite
// one page with another, and the only symptom would be an offer serving another offer's figure.
for (const f of ['key', 'flat', 'slug', 'offerId']) {
  const seen = VARIANTS.map((v) => v[f]);
  const dupes = seen.filter((x, i) => seen.indexOf(x) !== i);
  if (dupes.length) throw new Error(`VARIANTS: duplicate ${f}: ${[...new Set(dupes)].join(', ')}`);
}

// Every local asset the emitted page references must EXIST on disk. A must() on the path string
// passes happily while the file is missing or renamed case-only — and macOS is case-insensitive,
// so that bug is invisible here and 404s on Vercel.
for (const rel of [OG_IMAGE, '/js/ttclid.js', '/Rewards/terms.html', '/Rewards/privacy.html', '/Rewards/contact.html']) {
  const p = path.join(repoRoot, rel.replace(/^\//, ''));
  if (!fs.existsSync(p)) throw new Error(`referenced asset does not exist: ${rel}`);
  const dir = path.dirname(p), base = path.basename(p);
  if (!fs.readdirSync(dir).includes(base)) throw new Error(`case mismatch on ${rel} — real name is different on disk`);
}

let totalFiles = 0;
const built = [];

console.log('\n  Ravi (AffID 25) · Shein · every English-geo Shein offer we sell\n');

for (const v of VARIANTS) {
  const html = page(v);

  // FLAT OUTPUT. `9763a57 feat(landers): flatten all 40 live groups to flat .html files` replaced
  // every numbered clone folder with ONE file per page, so the RV54..RV60 slices this generator
  // used to emit no longer exist and must not be recreated — re-running the old shape resurrects
  // 218 dead files the flattening deliberately deleted.
  fs.writeFileSync(path.join(repoRoot, v.flat + '.html'), html);
  let n = 1;

  // The canonical dir is still deployed and still 200s, so it is kept in step with the flat page.
  fs.mkdirSync(path.join(repoRoot, CANON_DIR, v.key), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, CANON_DIR, v.key, 'index.html'), html);
  n++;

  // Vanity path — a plain COPY, never a redirect: a redirect adds a hop and bounces the query
  // string through a rewrite where s1 can be lost. Only the flagship gets one.
  if (v.vanity) {
    fs.mkdirSync(path.join(repoRoot, v.vanity), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, v.vanity, 'index.html'), html);
    n++;
  }

  totalFiles += n;
  built.push({ v, html, n });
  console.log(
    `  ${v.geo}  ${(v.flat + '.html').padEnd(24)}`
    + ` + ${(CANON_DIR + '/' + v.key).padEnd(12)}`
    + (v.vanity ? ' + /' + v.vanity : '').padEnd(12)
    + `  ${v.amount.padEnd(7)}  ->  ${v.slug}`
  );
}
console.log(`\n  ${VARIANTS.length} offers · ${totalFiles} files (flat pages + canonical dir + vanity)\n`);

console.log('  ROOTS (must be in PRELANDER_ALLOWED_ROOTS *and* ALLOWED_ROOTS):');
// A flat page is top-level, so each FILENAME is its own root and carries its .html extension —
// cleanPath lowercases the root and does not strip the extension. Same shape as fctt.html.
console.log('    ' + [CANON_DIR, ...VARIANTS.map((v) => v.flat + '.html'), ...VARIANTS.filter((v) => v.vanity).map((v) => v.vanity)]
  .map((r) => r.toLowerCase()).join(', ') + '\n');

console.log('  ⚠️  THERE IS NO CANADIAN SHEIN OFFER. All seven Shein offers sell exactly one geo');
console.log('      (US x4, GB x2, AU x1) and none of them is CA. A CA page would either quote a');
console.log('      reward no offer pays or walk a door that 404s every paid click, so none is');
console.log('      built. His Playful Rewards pages DO cover CA — that offer sells it.\n');

console.log('  ⚠️  ONE ASSIGNMENT PER OFFER. resolveAffiliateOfferLinks keys by_offer[offer_id] with');
console.log('      no ordering, so two active rows on the same offer serve a coin flip. He is');
console.log('      currently active on shein-b2s-us-b — the SQL archives it in the same transaction.\n');

const html = built[0].html;
console.log('  ⚠️  LEFT AS SUPPLIED — his copy, Migi\'s call, not edited here:\n');
for (const [needle, why] of CONCERNS) {
  if (html.includes(needle) || SOURCE.includes(needle)) console.log(`   · ${needle}\n       ${why}\n`);
}

console.log('  ℹ️  PER-OFFER COPY: the reward figure is substituted at all 14 sites and the wrong');
console.log('      currency mark is asserted absent. His campaign label ("Flash Reward Event") is');
console.log('      HIS OWN, not an offer\'s branding, so it is left identical across all seven —');
console.log('      unlike kerman-shein.js, which had to move "Back to School" per variant.');
VARIANTS.forEach((v) => console.log(`      ${v.geo}  ${v.amount.padEnd(7)}  ${v.slug.padEnd(38)}  ${v.offer}`));
console.log();

console.log('  ℹ️  CTA WIRING: his three hero/sticky/final buttons still scroll into his survey —');
console.log('      that is his funnel. The exit fires where his own copy already promised one');
console.log('      ("Card Reserved! Redirecting..."), and a real anchor is revealed first so the');
console.log('      click survives an in-app webview that blocks programmatic navigation.\n');
