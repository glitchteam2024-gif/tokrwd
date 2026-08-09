#!/usr/bin/env node
/**
 * NOTKERMAN'S Shein lander — an OPERATOR-SUPPLIED design, wired onto our door, on EVERY Shein offer.
 *
 *   node _lp-generator/kerman-shein.js --clones 100
 *
 * His file is saved BYTE-FOR-BYTE as `kerman-shein-source.html`; this generator applies only
 * ASSERTED patches on top, so his design survives intact and re-running is deterministic.
 * See .claude/skills/sprk-custom-landers.
 *
 * ── ONE DESIGN, SEVEN OFFERS ────────────────────────────────────────────────────────────────
 * Migi's call 2026-08-09: he runs this page on every Shein offer we carry, and it stays LOCKED TO
 * HIM on each (capacity 1). See VARIANTS below — seven independent (canon dir, clone family, door
 * slug, landing_pages row, assignment) sets that never interact. Adding or removing one is a row
 * in that table plus a row in the SQL.
 *
 * ⚠️ THE COPY IS NOT THE SAME ON ALL SEVEN, AND MUST NOT BE. Four of the offers pay $750, two are
 * GBP, one is AUD. His file hardcodes "$1,000" in TEN places. Shipping that on a £750 offer is a
 * materially false promise on a money path, so the amount and the currency are substituted per
 * variant and asserted (all ten, or the build fails). The campaign label moves with it: the two
 * Back to School offers keep his "Back to School 2026" strip; the other five read "Shein Reward
 * 2026", because running Back-to-School branding on the AU Product Reviewer offer is a mismatch a
 * reviewer can question. Every label is one field in VARIANTS and all seven are printed on each
 * run — override any of them there, never in the source.
 *
 * ── VANITY PATHS: ONE, NOT SEVEN — DELIBERATE ───────────────────────────────────────────────
 * Only the US Back-to-School page gets `/shkrurl`. A vanity path carries no slot number, so it is
 * ONE shared URL and the numbered fan-out's anti-flag property does not apply to it — seven of
 * them would be seven single points of failure for a convenience the app never serves anyway
 * (`resolveAffiliateOfferLinks` hands out the numbered clone, Mode B). See the skill, §1 step 3.
 *
 * This is his SECOND and THIRD..EIGHTH bespoke page. The first is Apple Pay $750 (KERM/KM50/
 * /saskrurl -> applepay750-us-kerman, `kerman-apay.js`). Separate offer, separate door, separate
 * landing_pages row and assignment — nothing here touches it.
 *
 * ── What the supplied file is ───────────────────────────────────────────────────────────────
 * A single static page: a campaign strip, a three-bay "fitting corridor" (identity / reward
 * mirror / requirement tags + CTA), an FAQ, a final CTA and a sticky mobile bar. Pure CSS apart
 * from Google Fonts. NO data collection (zero <form>/<input>), so `sprk-lander-lead-capture`
 * does not apply to it. No cloak canary, no CDN script, no third-party database.
 *
 * ── DEFECT 1: NO OUTBOUND PATH AT ALL — and it wore BOTH disguises at once ───────────────────
 * The grep that has to run before anything else:
 *
 *   grep -nE "location\\.href|location\\.replace|window\\.open|sprktrax|api/link|<form" file.html
 *
 * returned ZERO matches. The money button was `href="#"` AND its only script was a DEMO STUB that
 * cancelled the click and rewrote its own label to "Connect your claim flow". Previous supplied
 * pages had one disguise or the other; this one shipped both, so neither clicking it nor reading
 * its href would have told you. The whole funnel ended on the page it started on: he would have
 * paid for every click and earned nothing, and every dashboard would have read normally —
 * clicks in, zero conversions, no error anywhere.
 *
 * That is now FIVE supplied landers in a row with the same defect. It is not a coincidence and it
 * is not carelessness — these pages are built as design comps, and the destination is the one
 * thing a comp cannot know. Assume it, every time.
 *
 * ── DEFECT 2: legal links ABSENT, not broken ────────────────────────────────────────────────
 * The skill's trap 3 says Terms/Privacy ship as `href="#"`. Here the footer carried the
 * disclaimer prose and NO links at all — which reads as fine to a human and fails the same
 * ad-network fetch. Grep for `/Rewards/terms`, never for `href="#"`.
 *
 * ── DEFECT 3 (NEW): a relative asset that does not exist in this repo ────────────────────────
 * `.mirror-bay` asked for `url("../assets/shein-mirror-scene.png")`. There is no `assets/`
 * directory in tokrwd and the photo was not supplied with the HTML, so from `SHKM/US/index.html`
 * that resolves to `/SHKM/assets/shein-mirror-scene.png` -> 404, on every page load, on all 102
 * copies. A failed background-image simply does not paint, so the RENDERED RESULT IS IDENTICAL
 * either way — the bay falls back to its own `background-color: #1a1a1a` under the gradient. The
 * reference is dropped below purely to stop the broken request; it buys nothing to keep it.
 *
 *   ➜ TO RESTORE THE PHOTO: drop the file at `assets/shein-mirror-scene.png` in the repo root,
 *     change the substitution in patch 4 to `url("/assets/shein-mirror-scene.png")` (ROOT-relative
 *     — `../assets/` is wrong from every clone depth), and re-run. Nothing in the DB moves.
 *
 * ── The funnel shape is PRESERVED, deliberately ─────────────────────────────────────────────
 * The hero CTA and the sticky bar scroll to #claim; the "See my offers" button in that section is
 * the one outbound. That two-step is his design, not an accident — the #claim section exists
 * purely to hold the converting button — so only that button is wired. If Migi wants every CTA to
 * fire the door, that is a copy/structure decision and belongs in the source file, not here.
 */
const fs = require('fs');
const path = require('path');

const SOURCE = fs.readFileSync(path.join(__dirname, 'kerman-shein-source.html'), 'utf8');

const CANON_DIR = 'SHKM';

/**
 * Every Shein offer we carry, one bespoke page each, all locked to notkerman.
 *
 *   key      subfolder under SHKM/ — the reference copy. Unique per variant; two offers share a geo.
 *   geo      UPPERCASE here (it names the clone folders, SK51/GB1). LOWERCASE in landing_pages.geo.
 *   family   the numbered clone slice. Must be unique, and `capacity` in SQL must be <= --clones.
 *   vanity   optional unnamed shared copy. Only the flagship gets one — see the header.
 *   amount   substituted into ALL TEN "$1,000" sites in his file. Currency included.
 *   campaign strip + footer label. Override freely; this is presentation, not a claim.
 *   slug     MUST equal landing_pages.slug, or every click 404s at the door — silently.
 *   offerId  verified against prod 2026-08-09: all seven are status=active, cap_mode=fcfs,
 *            enforce_assignment=false, and each has destination_by_geo[<GEO>] set.
 */
const VARIANTS = [
  { key: 'US',    geo: 'US', family: 'SK50', vanity: 'shkrurl', amount: '$1,000', campaign: 'Back to School',
    slug: 'shein-b2s-us-kerman',                   offerId: '7018d82b-f19d-4759-9910-de9e837774e5',
    offer: 'Rewards US - Shein $1000 Back to School' },
  { key: 'GBB2S', geo: 'GB', family: 'SK51', vanity: null,      amount: '£1,000', campaign: 'Back to School',
    slug: 'shein-b2s-gb-kerman',                   offerId: '01a705a9-c479-4bec-aaed-bd0b038bc4d7',
    offer: 'Rewards UK - Shein £1000 Back to School' },
  { key: 'USFP',  geo: 'US', family: 'SK52', vanity: null,      amount: '$750',   campaign: 'Shein Reward',
    slug: 'flash-poll-shein-2-us-kerman',          offerId: '4b430587-1cbc-4542-82d9-0ef0c5d61d7c',
    offer: 'Rewards US - Flash Poll - Shein $750' },
  { key: 'GBFP',  geo: 'GB', family: 'SK53', vanity: null,      amount: '£750',   campaign: 'Shein Reward',
    slug: 'flash-poll-shein-gb-kerman',            offerId: 'b4efc3f5-491e-485e-aad8-f57145d6d4d9',
    offer: 'Rewards UK - Flash Poll - Shein £750' },
  { key: 'US2X',  geo: 'US', family: 'SK54', vanity: null,      amount: '$750',   campaign: 'Shein Reward',
    slug: '2x-rewards-shein-bonus-us-kerman',      offerId: 'f56469f1-12a1-4a6b-a8c2-81dfa9359075',
    offer: 'Rewards US - 2x Rewards - Shein $750 Bonus' },
  { key: 'USRT',  geo: 'US', family: 'SK55', vanity: null,      amount: '$750',   campaign: 'Shein Reward',
    slug: 'retail-style-shein-us-kerman',          offerId: '597d4dc9-a13f-4a0e-9acc-15dd4b6ca628',
    offer: 'Rewards US - Retail Style - Shein $750' },
  { key: 'AUPR',  geo: 'AU', family: 'SK56', vanity: null,      amount: '$750',   campaign: 'Shein Reward',
    slug: 'product-reviewer-shein-bonus-au-kerman', offerId: '209e39e1-02b5-4102-ad2c-600468ed4fc8',
    offer: 'Rewards AU - Product Reviewer Shein Bonus $750' },
];

/** The amount string his file ships with, at every one of its ten sites. */
const SOURCE_AMOUNT = '$1,000';
const SOURCE_AMOUNT_COUNT = 10;
const SOURCE_CAMPAIGN = 'Back to School';

const doorFor = (slug) => `https://sprktrax.org/api/link/${slug}`;

/**
 * Claims in his copy worth a second look. Printed on every run, guarded by an includes() test so
 * editing one out of the SOURCE drops it off this list — the print is the receipt, not decoration.
 * NOT edited here: it is the operator's copy and Migi's call. Everything is on www.tokrwd.co, so a
 * penalty earned by this page attaches to the DOMAIN and to every other lander on it.
 */
const CONCERNS = [
  ['<strong>SHEIN</strong>',
   'HIGHEST RISK ON THE PAGE, and HIGHER than the equivalent on his Apple Pay lander. The brand '
   + 'block renders SHEIN as the SITE IDENTITY — top-left, logo slot, 82px, with "Gift card" as '
   + 'the tagline underneath — and the <title> is "SHEIN $1,000 Gift Card Offer". His Apple Pay '
   + 'page did the same thing BUT its footer disclaimed affiliation; THIS FOOTER DOES NOT '
   + 'DISCLAIM AT ALL. Trademark in a brand slot with no disclaimer is the shape that gets '
   + 'actioned. Sammy and Ashlyn name the reward, not the site.'],
  ['No credit card is needed',
   'CONTRADICTS STEP 2 ON THE SAME PAGE, which says "Finish the required recommended offers and '
   + 'free trials." Free trials generally do take a card. On the FAQ it is softened to "needed to '
   + 'start", but the step tag and the CTA note both state it flat.'],
  ['Limited spots remaining',
   'invented scarcity, three times on the page (campaign strip, CTA note, sticky bar) with an '
   + 'animated pulse dot on each. Nothing limits spots — the offer is fcfs with no per-day cap.'],
  ['unlocks the full $1,000',
   'stated as a certainty in a numbered step. Completion unlocks the offer wall\'s reward, whose '
   + 'amount and availability belong to the network, not to us.'],
  ['Complete 3–5 deals',
   'the number of required completions is set by the offer wall, not by us, and routinely exceeds '
   + 'five. Stated as a fixed range in a numbered step, it reads as a commitment.'],
  ['Free credit to spend at SHEIN',
   'promises the payout RAIL as well as the amount. Both belong to the network, and we cannot '
   + 'honour either if it changes them.'],
  ['The qualifying partner offers fund the reward',
   'this one is GOOD — flagged only so it is not lost in a later edit. It is the most honest line '
   + 'on the page and it is the answer a reviewer is looking for.'],
];

function sub(html, from, to, count = 1) {
  const parts = html.split(from);
  if (parts.length - 1 !== count) {
    throw new Error(`kerman-shein-source.html: expected ${count} occurrence(s) of ${JSON.stringify(from.slice(0, 90))}, found ${parts.length - 1}`);
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

function page(v) {
  const DOOR = doorFor(v.slug);
  let h = SOURCE;

  // ── 0. Per-offer copy: the reward amount, its CURRENCY, and the campaign label ──────────────
  // Ten sites, asserted. Four of the seven offers pay $750 and two are GBP; shipping his hardcoded
  // "$1,000" on those would be a materially false promise on a money path. A no-op for the US
  // Back to School variant, where source and target are the same string.
  h = sub(h, SOURCE_AMOUNT, v.amount, SOURCE_AMOUNT_COUNT);
  // Strip + footer. His two Back-to-School offers keep the label unchanged.
  h = sub(h, `<strong>${SOURCE_CAMPAIGN} 2026</strong>`, `<strong>${v.campaign} 2026</strong>`);

  // ── 1. The money button: a REAL anchor at the door, not a fragment ──────────────────────────
  // Static href = the bare door. The script below upgrades it to carry the query string. Doing it
  // in this order means a visitor with JS broken still reaches the door (which 404s an untagged
  // click by design) instead of tapping a button that reloads the page forever.
  h = sub(h, '<a class="cta" href="#" id="claim-button">',
             `<a class="cta" href="${DOOR}" id="claim-button">`);

  // ── 2. Replace the DEMO stub with the door wiring ───────────────────────────────────────────
  // ONLY the stub goes. The rest of his script block — the sticky-bar IntersectionObserver, the
  // pulse-dot observer, the visibilitychange handler — is his design and is left untouched.
  const oldStub = `    const claimButton = document.getElementById('claim-button');
    claimButton.addEventListener('click', (event) => {
      event.preventDefault();
      claimButton.textContent = 'Connect your claim flow';
      claimButton.setAttribute('aria-label', 'Demo button: connect the real claim-flow URL');
    });`;

  const newWiring = `    // ---- Outbound: the SPRK tracking DOOR ----
    // Replaced the supplied demo handler, which cancelled the only converting click on the page.
    // The door mints the click_id, freezes the owner at click time, stamps the outbound subid wire
    // and 302s to the real Shein URL — which lives in the offer row and never appears in this
    // page's source.
    const DOOR = ${JSON.stringify(DOOR)};

    // Carry EVERY incoming param through (s1=<SPK> per-creative, s2 publisher, s3 ad account, ttclid).
    const q = new URLSearchParams(location.search);

    // campid is the Carrd/Spartis name for the same value — promote it when s1 is absent.
    if (!q.get('s1') && q.get('campid')) q.set('s1', q.get('campid'));

    // mc_attr fallback (e=<spark> .. c=<code>). If neither exists s1 stays EMPTY — never fabricated;
    // the door 404s an untagged click by design, and that is the real attribution gate.
    if (!q.get('s1')) {
      const mc = q.get('mc_attr') || '', f = {};
      mc.split('..').forEach((kv) => { const i = kv.indexOf('='); if (i > 0) f[kv.slice(0, i)] = kv.slice(i + 1); });
      const d = f.e || f.c; if (d) q.set('s1', d);
    }

    function offerUrl() {
      // s1 LAST — ad automations append to the tail. campid is a lander-side alias, lg routes the
      // lander; neither belongs in what the network sees.
      const out = new URLSearchParams(q.toString());
      out.delete('s1'); out.delete('campid'); out.delete('lg');
      const qs = out.toString(), s1 = q.get('s1') || '';
      let url = DOOR + (qs ? '?' + qs : '');
      if (s1) url += (qs ? '&' : '?') + 's1=' + encodeURIComponent(s1);
      return url;
    }

    // Upgrade the static href in place. Left as a plain anchor on purpose: the browser handles the
    // navigation, so long-press / open-in-new-tab / middle-click all behave, and there is no click
    // handler that could swallow the tap. This script sits at the end of <body>, so the element
    // exists; nothing above it depends on JS, so the page still renders if this never runs.
    const claimButton = document.getElementById('claim-button');
    if (claimButton) claimButton.setAttribute('href', offerUrl());`;

  h = sub(h, oldStub, newWiring);

  // ── 3. Legal links: the supplied footer had NONE at all ─────────────────────────────────────
  // Several ad networks fetch these before approving. Extension-less on purpose: vercel.json sets
  // cleanUrls:true, so /Rewards/terms.html 308s to /Rewards/terms — linking the .html form works
  // but spends a redirect on a link a reviewer fetches.
  h = sub(h, `    <p>${SOURCE_CAMPAIGN} / 2026</p>`,
             `    <p>${v.campaign} / 2026 · <a href="/Rewards/terms">Terms &amp; Conditions</a>`
             + ' · <a href="/Rewards/privacy">Privacy Policy</a></p>');

  // ── 4. Drop the missing background photo (see DEFECT 3 in the header) ───────────────────────
  // Zero visual change — the file does not exist, so it never painted. This only stops the 404.
  h = sub(h, 'background-image: linear-gradient(rgba(9,9,9,.08), rgba(9,9,9,.08)), url("../assets/shein-mirror-scene.png");',
             'background-image: linear-gradient(rgba(9,9,9,.08), rgba(9,9,9,.08));');

  // ── 5. MOBILE REFINEMENTS ───────────────────────────────────────────────────────────────────
  // Appended as its own <style> AFTER his, so it wins on cascade order without !important and
  // without editing a single one of his rules. Everything is inside a phone media query, so the
  // desktop three-bay corridor he designed is byte-for-byte untouched.
  //
  // Measured on the emitted page at 320/360/375/390/412/430 before and after — see the numbers in
  // each comment. The reward figure was the real defect; the rest is polish.
  const mobileCss = `  <style>
    /* ── Mobile refinements — added by _lp-generator/kerman-shein.js, not by the operator ──────
       Phone-only. The desktop layout above is his, unmodified. ─────────────────────────────── */

    /* iOS Safari inflates body text in landscape without this. */
    html { -webkit-text-size-adjust: 100%; }

    @media (max-width: 720px) {
      /* THE ONE THAT ACTUALLY LOOKED BROKEN. The reward figure is the hero of this design and it
         did not fit its own card: it overran the mirror's content box by 22px at 360px and 38px
         at 320px, so the leading currency mark and the trailing digit collided with the
         illuminated bulb strips down each side. Cause: clamp(92px, 28vw, 110px) has a 92px FLOOR, so
         below ~330px the type stops shrinking while the mirror keeps narrowing. Only the largest
         phones (430px) were unaffected, which is why it survived a desktop review.
         Fix is two-part, and deliberately keeps the figure BIG: give the mirror back 20px of
         width that the bay padding was spending, then re-ramp the type with a NEGATIVE intercept
         so it stays large on a big phone and still clears the frame at 320px.

         The ramp is sized for the WIDEST case, not the one on screen while you look at it:
           · widest STRING is a six-glyph thousands figure (currency mark + 1,000), not a
             four-glyph 750 one. This generator ships both.
           · widest FONT is the FALLBACK, not Barlow Condensed. Measured em-widths for the
             six-glyph string: Barlow 2.92, Arial Narrow 2.51, generic sans 3.06. Google Fonts is
             loaded with display=swap, so EVERY Android load paints the fallback first — tuning
             to Barlow alone would flash a broken layout on every cold visit.
           Content box is (100vw - 92px) here, so the generic-sans limit is (100vw-92)/3.06,
           i.e. ~32.7vw - 30px. The ramp below sits ~8% under that at every phone width. */
      .mirror-bay { padding-inline: 12px; }
      .reward-amount { font-size: clamp(52px, calc(30vw - 28px), 110px); }

      /* The legal links were a 15px-tall tap target — well under the 44px both Apple and Google
         publish, and they are exactly the links an ad reviewer taps. */
      footer a { display: inline-block; padding: 14px 8px; }

      /* The brand block pushed the headline ~72px down, so on a short phone (iPhone SE, 667px)
         the offer itself started below the fold behind a mostly empty panel. */
      .brand { margin-bottom: 44px; }
      .identity-bay { min-height: 440px; }

      /* 9px is below comfortable reading size on a phone. */
      .brand span { font-size: 10px; }
      .mobile-claim small { font-size: 10px; }

      /* 'anywhere' breaks a word mid-word even when it would fit on a line of its own;
         'break-word' only breaks when it genuinely cannot fit. */
      .final-claim h2 { overflow-wrap: break-word; }
    }
  </style>
</head>`;
  h = sub(h, '</head>', mobileCss);

  // ── 6. Shared ttclid backfill, canonical on every lander in this repo ───────────────────────
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
  must(h, 'href="#claim"', 2);             // hero CTA + sticky bar — his scroll funnel
  must(h, 'href="#offer-title"', 1);       // the brand mark scrolls to the headline
  must(h, '/Rewards/terms', 1);
  must(h, '/Rewards/privacy', 1);
  must(h, '/js/ttclid.js', 1);
  must(h, 'See my offers', 2);             // his CTA copy survived the swap, both instances
  must(h, 'IntersectionObserver', 2);      // his sticky-bar + pulse-dot observers are still there
  must(h, 'Mobile refinements', 1);        // the phone-only override layer is present
  must(h, 'calc(30vw - 28px)', 1);         // …and still carries the reward-figure fit
  must(h, '</style>', 2);                  // his stylesheet + ours, never merged into his
  must(h, v.amount, SOURCE_AMOUNT_COUNT);  // the per-offer amount reached every one of its sites
  must(h, `${v.campaign} 2026`, 1);        // strip label
  must(h, `${v.campaign} / 2026`, 1);      // footer label

  // The WRONG currency must not survive anywhere — a £ offer showing $ is the failure this whole
  // substitution exists to prevent, and a partial replace would leave it looking almost right.
  if (v.amount !== SOURCE_AMOUNT) never(h, SOURCE_AMOUNT, `this is a ${v.amount} offer; the source amount must not survive`);
  for (const sym of ['$', '£']) {
    if (!v.amount.startsWith(sym)) {
      const at = [];
      for (let i = h.indexOf(sym); i > -1; i = h.indexOf(sym, i + 1)) at.push(JSON.stringify(h.slice(i - 40, i + 20)));
      if (at.length) throw new Error(`${v.slug}: ${at.length} stray "${sym}" on a ${v.amount} page:\n      ${at.join('\n      ')}`);
    }
  }

  never(h, 'href="#"', 'a fragment on the money button is the no-outbound-path defect');
  never(h, 'Connect your claim flow', 'the demo stub must never ship');
  never(h, 'Demo button', 'ditto — the demo aria-label');
  never(h, 'preventDefault', 'nothing may swallow the converting click');
  never(h, 'example.com', 'placeholder destinations must never ship');
  never(h, '../assets/', 'a relative asset that does not exist in this repo 404s on every load');

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

  // Nothing third-party may ride along beyond the webfonts his design already used. Google Fonts
  // is established on this domain (431 existing landers load it) and sits on no money path; it is
  // allowed here rather than stripped so his typography survives. Anything ELSE is a stray.
  const hosts = [...new Set([...h.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)].map((m) => m[1]))];
  const allowed = new Set([
    'sprktrax.org', 'www.w3.org', 'www.tokrwd.co',
    'fonts.googleapis.com', 'fonts.gstatic.com',
  ]);
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
const CLONES = ci > -1 ? parseInt(argv[ci + 1], 10) : 100;   // matches KM50, AH50 and AS50
if (!Number.isFinite(CLONES) || CLONES < 1) { console.error('--clones must be a positive integer'); process.exit(1); }

const repoRoot = path.join(__dirname, '..');

// Two variants must never share a folder or a slug — a collision would silently overwrite one
// page with another and the only symptom would be the wrong reward amount on a live offer.
for (const f of ['key', 'family', 'slug']) {
  const seen = VARIANTS.map((v) => v[f]);
  const dupes = seen.filter((x, i) => seen.indexOf(x) !== i);
  if (dupes.length) throw new Error(`VARIANTS: duplicate ${f}: ${[...new Set(dupes)].join(', ')}`);
}

let totalFiles = 0;
const built = [];

for (const v of VARIANTS) {
  const html = page(v);

  fs.mkdirSync(path.join(repoRoot, CANON_DIR, v.key), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, CANON_DIR, v.key, 'index.html'), html);
  let n_files = 1;

  // Vanity path — a plain COPY, never a redirect: a redirect adds a hop and bounces the query
  // string through a rewrite where s1 can be lost. It carries no slot number, so it is ONE shared
  // URL and the numbered fan-out's anti-flag property does not apply. Only the flagship gets one
  // (see the header); never hand the same vanity path to a second person.
  if (v.vanity) {
    fs.mkdirSync(path.join(repoRoot, v.vanity), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, v.vanity, 'index.html'), html);
    n_files++;
  }

  for (let n = 1; n <= CLONES; n++) {
    const d = path.join(repoRoot, v.family, v.geo + n);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'index.html'), html);
    n_files++;
  }
  // Prune, so the tree is a pure function of --clones rather than the union of every past run.
  const famRoot = path.join(repoRoot, v.family);
  for (const name of fs.readdirSync(famRoot)) {
    const m = /^([A-Z]{2})([0-9]+)$/.exec(name);
    if (m && (m[1] !== v.geo || Number(m[2]) > CLONES || Number(m[2]) < 1)) {
      fs.rmSync(path.join(famRoot, name), { recursive: true, force: true });
    }
  }

  totalFiles += n_files;
  built.push({ v, html, n_files });
  console.log(
    `  ${v.amount.padEnd(7)} ${CANON_DIR}/${v.key.padEnd(5)}`
    + ` + ${(v.family + '/' + v.geo + '1..' + v.geo + CLONES).padEnd(20)}`
    + `${v.vanity ? ' + /' + v.vanity : ''.padEnd(11)}  ->  ${v.slug}`
  );
}
console.log(`\n  ${VARIANTS.length} offers · ${totalFiles} files\n`);

// Every root that has to be registered in BOTH allowlists, printed so the list cannot drift
// silently when a variant is added.
console.log('  ROOTS (must be in PRELANDER_ALLOWED_ROOTS *and* ALLOWED_ROOTS):');
console.log('    ' + [CANON_DIR, ...VARIANTS.map((v) => v.family), ...VARIANTS.filter((v) => v.vanity).map((v) => v.vanity)]
  .map((r) => r.toLowerCase()).join(', ') + '\n');

const html = built[0].html;   // the concern print is copy-level, identical across variants
console.log(`  ⚠️  LEFT AS SUPPLIED — his copy, Migi's call, not edited here:\n`);
for (const [needle, why] of CONCERNS) {
  if (html.includes(needle) || SOURCE.includes(needle)) console.log(`   · ${needle}\n       ${why}\n`);
}
console.log('  ℹ️  PER-OFFER COPY, changed by THIS GENERATOR (not by him) — override in VARIANTS:');
for (const v of VARIANTS) {
  console.log(`      ${v.amount.padEnd(7)} · "${v.campaign} 2026"`.padEnd(38) + ` · ${v.offer}`);
}
console.log('      His file hardcodes $1,000 at 10 sites and "Back to School" in the strip/footer.');
console.log('      Four of these offers pay 750 and three are non-USD, so the amount MUST move.\n');
console.log('  ℹ️  MISSING ASSET: his .mirror-bay asked for ../assets/shein-mirror-scene.png, which');
console.log('      was not supplied and does not exist in this repo. The reference is dropped (zero');
console.log('      visual change — it never painted). To restore: add assets/shein-mirror-scene.png');
console.log('      and switch patch 4 to a ROOT-relative url("/assets/shein-mirror-scene.png").\n');
