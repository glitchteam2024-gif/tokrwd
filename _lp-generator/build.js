#!/usr/bin/env node
/**
 * SPRK sweep landing-page generator.
 * One structure, per-brand theming. Adding an offer = one BRANDS entry.
 *
 * Structure is a faithful port of Migi's SHEIN750 page (badge → logo → title →
 * amount → stats → 3 steps → CTA → trust), with the tracking wired through the
 * SPRK door instead of straight to the network. See NOTES.md for why.
 */
const fs = require('fs');
const path = require('path');

// ── LOCALES ──────────────────────────────────────────────────────────────────────────────────
// A geo maps to exactly ONE language. Geo is the unit of everything here: it picks the Monetise
// link (offers.destination_by_geo), the landing_pages row (landing_pages.geo, which the click door
// now routes on), the currency, AND the language. Keeping language a PROPERTY OF THE GEO rather
// than a separate ?lg= axis is deliberate — a `lg=JP` that could disagree with the routed geo is
// how you end up showing yen and paying out on the US offer.
const LOCALES = {
  US: 'en', GB: 'en', CA: 'en', AU: 'en',   // English-speaking geos; only the currency differs
  JP: 'ja',
  DE: 'de', AT: 'de',                        // Austria runs the German page
  NL: 'nl',
};

// ── STRINGS ──────────────────────────────────────────────────────────────────────────────────
// Every visible word, per language. {amount} and {brand} are substituted at build time, so a page
// ships fully-formed — there is NO runtime translation layer and no way for a missing key to reach
// a live visitor as a raw placeholder. `byKind` picks the phrasing for the offer type:
//   giftcard = spend at a retailer · credit = spend on a service · cash = paid to you · wallet = Apple Pay
// A brand with `amounts: null` renders NO figure at all and uses the `*NoAmount` variants — that is
// how Freecash ships, because its live page leads with "Get Paid For Screen Time" and quotes no
// headline sum. Do not invent one: "No False Earning Claims" is an explicit Monetise restriction.
const STRINGS = {
  en: {
    badge: '2026 Summer Drop',
    headline: 'Claim Your Reward',
    headlineNoAmount: 'Claim Your Reward',
    subByKind:  { giftcard: 'Gift Card', credit: 'Credit', cash: 'Reward', wallet: 'Reward' },
    amountSubByKind: {
      giftcard: 'FREE CREDIT TO SPEND AT {brand}',
      credit:   'FREE CREDIT TO SPEND ON {brand}',
      cash:     'PAID DIRECT TO YOUR ACCOUNT',
      wallet:   'SENT STRAIGHT TO YOUR APPLE PAY WALLET',
    },
    step1: 'Tap the button below',   step1sub: 'Reserves your {amount} credit instantly',
    step1subNoAmount: 'Takes you straight to the sign-up page',
    step2: 'Enter your email',       step2sub: 'Just a valid address &mdash; no credit card needed',
    step3: 'Complete 3-5 recommended deals',
    step3sub: 'Quick free trials &amp; offers to unlock the full {amount}',
    step3subNoAmount: 'Quick free trials &amp; offers &mdash; the more you finish, the more you earn',
    cta: 'Claim My {amount} &rarr;',  ctaNoAmount: 'Get Started &rarr;',
    trustStrong: 'Limited spots remaining.', trustRest: 'No credit card needed.',
    loading: 'Loading...',
  },
  ja: {
    badge: '2026年 サマーキャンペーン',
    headline: '特典を受け取る',
    headlineNoAmount: '特典を受け取る',
    subByKind:  { giftcard: 'ギフトカード', credit: 'クレジット', cash: '報酬', wallet: '報酬' },
    amountSubByKind: {
      giftcard: '{brand}で使える無料クレジット',
      credit:   '{brand}で使える無料クレジット',
      cash:     'ご指定の口座に直接お支払い',
      wallet:   'Apple Pay ウォレットに直接送金',
    },
    step1: '下のボタンをタップ',   step1sub: '{amount}のクレジットをすぐに確保します',
    step1subNoAmount: '登録ページへ直接移動します',
    step2: 'メールアドレスを入力', step2sub: '有効なアドレスのみ &mdash; クレジットカードは不要です',
    step3: 'おすすめの案件を3〜5件完了',
    step3sub: '無料のお試しや案件で{amount}分をすべて解除',
    step3subNoAmount: '無料のお試しや案件 &mdash; 完了するほど報酬が増えます',
    cta: '{amount}を受け取る &rarr;',  ctaNoAmount: 'はじめる &rarr;',
    trustStrong: '残りわずかです。', trustRest: 'クレジットカードは不要です。',
    loading: '読み込み中...',
  },
  de: {
    badge: 'Sommer-Aktion 2026',
    headline: 'Sichern Sie sich Ihre Prämie',
    headlineNoAmount: 'Sichern Sie sich Ihre Prämie',
    subByKind:  { giftcard: 'Geschenkkarte', credit: 'Guthaben', cash: 'Prämie', wallet: 'Prämie' },
    amountSubByKind: {
      giftcard: 'GRATIS-GUTHABEN ZUM EINLÖSEN BEI {brand}',
      credit:   'GRATIS-GUTHABEN FÜR {brand}',
      cash:     'DIREKT AUF IHR KONTO AUSGEZAHLT',
      wallet:   'DIREKT IN IHRE APPLE PAY WALLET',
    },
    step1: 'Auf den Button unten tippen', step1sub: 'Sichert Ihnen sofort {amount} Guthaben',
    step1subNoAmount: 'Bringt Sie direkt zur Anmeldeseite',
    step2: 'E-Mail-Adresse eingeben',     step2sub: 'Nur eine gültige Adresse &mdash; keine Kreditkarte nötig',
    step3: '3-5 empfohlene Angebote abschließen',
    step3sub: 'Kurze Gratis-Tests &amp; Angebote, um die vollen {amount} freizuschalten',
    step3subNoAmount: 'Kurze Gratis-Tests &amp; Angebote &mdash; je mehr Sie abschließen, desto mehr verdienen Sie',
    cta: '{amount} sichern &rarr;',  ctaNoAmount: 'Jetzt starten &rarr;',
    trustStrong: 'Nur noch wenige Plätze frei.', trustRest: 'Keine Kreditkarte nötig.',
    loading: 'Wird geladen...',
  },
  nl: {
    badge: 'Zomeractie 2026',
    headline: 'Claim je beloning',
    headlineNoAmount: 'Claim je beloning',
    subByKind:  { giftcard: 'Cadeaukaart', credit: 'Tegoed', cash: 'Beloning', wallet: 'Beloning' },
    amountSubByKind: {
      giftcard: 'GRATIS TEGOED OM TE BESTEDEN BIJ {brand}',
      credit:   'GRATIS TEGOED VOOR {brand}',
      cash:     'RECHTSTREEKS OP JE REKENING',
      wallet:   'RECHTSTREEKS NAAR JE APPLE PAY WALLET',
    },
    step1: 'Tik op de knop hieronder', step1sub: 'Reserveert direct je tegoed van {amount}',
    step1subNoAmount: 'Brengt je direct naar de aanmeldpagina',
    step2: 'Vul je e-mailadres in',    step2sub: 'Alleen een geldig adres &mdash; geen creditcard nodig',
    step3: 'Rond 3-5 aanbevolen deals af',
    step3sub: 'Korte gratis proefaanbiedingen om de volledige {amount} vrij te spelen',
    step3subNoAmount: 'Korte gratis proefaanbiedingen &mdash; hoe meer je afrondt, hoe meer je verdient',
    cta: 'Claim mijn {amount} &rarr;', ctaNoAmount: 'Aan de slag &rarr;',
    trustStrong: 'Beperkt aantal plaatsen beschikbaar.', trustRest: 'Geen creditcard nodig.',
    loading: 'Laden...',
  },
};

// Page <title> per language. Kept next to STRINGS so a new language is one object, not a hunt.
const TITLES = {
  en: '{brand} {sub} - 2026 Summer Drop',
  ja: '{brand} {sub} - 2026年サマーキャンペーン',
  de: '{brand} {sub} - Sommer-Aktion 2026',
  nl: '{brand} {sub} - Zomeractie 2026',
};

const fill = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));

// NOTE: Freecash is NOT here on purpose. It has its own generator, _lp-generator/freecash.js,
// because /50FC/FC1 is a specific proven-converting page (ticker, live counter, offer card, stats,
// sticky store buttons, quick-tip interstitial) that Migi has confirmed compliant with Ricky. It is
// translated from that exact page rather than rebuilt on this generic template. Running THIS script
// must never touch 50FC/ or FCASH/ — if you add a Freecash entry back here it will overwrite them.
const BRANDS = [
  // dir = canonical page root (one subfolder per geo). family/prefix = the numbered fan-out.
  // Clone paths are <FAMILY>/<GEO><n>, e.g. SH50/GB7, 50FC/JP1 — the geo is IN the path, so the
  // landing_pages row for that geo points at its own family slice and carries landing_pages.geo.
  // `kind` selects the phrasing in STRINGS. `amounts` is geo -> [display, numeric], or null for a
  // brand that quotes no figure at all.
  {
    dir: 'SHEIN', family: 'SH50', doorSlug: 'shein', kind: 'giftcard',
    wordmark: 'SHEIN', pixel: 'D6CF3ABC77U56TVAPJPG',
    amounts: { US: ['$750', 750], GB: ['£750', 750], CA: ['$750', 750], AU: ['$750', 750] },
    theme: { bg: '#fff', ink: '#000', muted: '#737373', accent: '#000', accentHover: '#333',
             tint: '#f7f7f7', line: '#e6e6e6', badgeBg: '#000', badgeInk: '#fff',
             logoWeight: 800, logoSpacing: '-.02em', logoSize: '2.3rem', ctaRadius: '2px' },
  },
  {
    dir: 'SEPH', family: 'SP50', doorSlug: 'sephora', kind: 'giftcard',
    wordmark: 'SEPHORA', pixel: 'D6CF3ABC77U56TVAPJPG',
    amounts: { US: ['$750', 750], GB: ['£750', 750], CA: ['$750', 750], AU: ['$750', 750] },
    theme: { bg: '#fff', ink: '#000', muted: '#767676', accent: '#000', accentHover: '#d9232e',
             tint: '#f6f6f6', line: '#e5e5e5', badgeBg: '#000', badgeInk: '#fff',
             logoWeight: 400, logoSpacing: '.34em', logoSize: '2rem', ctaRadius: '0px' },
  },
  {
    dir: 'CASH', family: 'CS50', doorSlug: 'cash', kind: 'cash',
    wordmark: 'CASH', pixel: 'D6CF3ABC77U56TVAPJPG',
    amounts: { US: ['$1,000', 1000], GB: ['£750', 750], AU: ['$750', 750] },
    theme: { bg: '#fff', ink: '#0b0b0b', muted: '#6f6f6f', accent: '#00b843', accentHover: '#009336',
             tint: '#f2fbf5', line: '#e4e4e4', badgeBg: '#00b843', badgeInk: '#000',
             logoWeight: 900, logoSpacing: '-.045em', logoSize: '2.5rem', ctaRadius: '6px' },
  },
  {
    dir: 'APAY750', family: 'AP50', doorSlug: 'applepay750', kind: 'wallet',
    wordmark: 'Apple Pay', pixel: 'D6CF3ABC77U56TVAPJPG',
    amounts: { US: ['$750', 750] },
    theme: { bg: '#fff', ink: '#1d1d1f', muted: '#86868b', accent: '#1d1d1f', accentHover: '#0071e3',
             tint: '#f5f5f7', line: '#d2d2d7', badgeBg: '#1d1d1f', badgeInk: '#fff',
             logoWeight: 600, logoSpacing: '-.02em', logoSize: '2.1rem', ctaRadius: '980px' },
  },
  {
    dir: 'APAY1K', family: 'AK50', doorSlug: 'applepay1000', kind: 'wallet',
    wordmark: 'Apple Pay', pixel: 'D6CF3ABC77U56TVAPJPG',
    amounts: { US: ['$1,000', 1000] },
    theme: { bg: '#fff', ink: '#1d1d1f', muted: '#86868b', accent: '#1d1d1f', accentHover: '#0071e3',
             tint: '#f5f5f7', line: '#d2d2d7', badgeBg: '#1d1d1f', badgeInk: '#fff',
             logoWeight: 600, logoSpacing: '-.02em', logoSize: '2.1rem', ctaRadius: '980px' },
  },
  {
    dir: 'UBER', family: 'UE50', doorSlug: 'ubereats', kind: 'credit',
    wordmark: 'Uber Eats', pixel: 'D6CF3ABC77U56TVAPJPG',
    amounts: { GB: ['£50', 50] },
    theme: { bg: '#fff', ink: '#000', muted: '#6b6b6b', accent: '#06c167', accentHover: '#048a48',
             tint: '#f3faf5', line: '#e8e8e8', badgeBg: '#06c167', badgeInk: '#000',
             logoWeight: 800, logoSpacing: '-.03em', logoSize: '2.2rem', ctaRadius: '999px' },
  },
];

// The geos a brand ships: explicit `geos`, else the keys of its amounts map.
const geosOf = (b) => b.geos || Object.keys(b.amounts || {});

const page = (b, geo) => {
  const t = b.theme;
  const lang = LOCALES[geo];
  if (!lang) throw new Error(`no language mapped for geo ${geo} (add it to LOCALES)`);
  const S = STRINGS[lang];
  if (!S) throw new Error(`no STRINGS for language ${lang}`);
  const pair = b.amounts && b.amounts[geo];
  if (b.amounts && !pair) throw new Error(`${b.dir}: no amount for geo ${geo}`);
  const amt = pair ? pair[0] : null;      // display string, or null = this brand quotes no figure
  const val = pair ? pair[1] : 0;         // numeric, for pixel events
  const V = { amount: amt, brand: b.wordmark, sub: S.subByKind[b.kind] };
  const pick = (withAmt, without) => fill(amt ? S[withAmt] : S[without], V);
  // ONE DOOR SLUG PER GEO. Each geo needs its own landing_pages row so that row can carry
  // landing_pages.geo — which is what the click door now routes on. A shared slug would collapse
  // every geo back onto one row with one geo, i.e. straight back to the bug this replaces.
  const doorSlug = `${b.doorSlug}-${geo.toLowerCase()}`;
  return `<!DOCTYPE html>
<html lang="${lang}" data-geo="${geo}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>${fill(TITLES[lang], V)}</title>
<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate, max-age=0">
<meta http-equiv="Pragma" content="no-cache">
<meta http-equiv="Expires" content="-1">
<link rel="preconnect" href="https://sprktrax.org" crossorigin>
<link rel="dns-prefetch" href="https://sprktrax.org">
<link rel="preconnect" href="https://analytics.tiktok.com" crossorigin>

<!-- ============================================================
     Injected server-side by /functions/${b.slug}/_middleware.js
     __DOOR_URL__   the SPRK click door for this offer. NOT the network URL.
                    The door mints the click_id and stamps the subid wire.
     __GEO_AMOUNT__ display string for this visitor's geo
     __GEO_VALUE__  numeric value for pixel events
     __STATS__      social-proof strings. See NOTES.md before shipping these.
     ============================================================ -->
<script id="offer-config">
/* This page IS one geo — ${geo}, rendered in ${lang} with its own figures baked into the markup.
   There is deliberately NO runtime geo detection, no language switcher and no cookie: the geo is
   decided by WHICH PAGE the ad points at, and the click door routes on landing_pages.geo for that
   same lander. One fact drives both, so the page cannot promise one country's offer and hand the
   visitor another's. ||-guarded so a server-side injection still wins if one is ever added. */
window.__DOOR_URL__ = window.__DOOR_URL__ || "https://sprktrax.org/api/link/${doorSlug}";
window.__GEO__      = "${geo}";
window.__STATS__    = window.__STATS__ || null;
</script>

<style>
*{margin:0;padding:0;box-sizing:border-box}
body,html{background:${t.bg};font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;overflow-x:hidden;min-height:100vh;color:${t.ink};-webkit-font-smoothing:antialiased}
a,button,[role="button"]{touch-action:manipulation;-webkit-tap-highlight-color:rgba(0,0,0,.08);cursor:pointer}
.page{min-height:100vh;display:flex;align-items:flex-start;justify-content:center;padding:1.1rem 1rem 1.5rem}
.card{background:${t.bg};max-width:26rem;width:100%;text-align:center}
.badge{display:inline-flex;align-items:center;gap:.4rem;background:${t.badgeBg};color:${t.badgeInk};font-size:.68rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase;padding:.4rem .8rem;margin-bottom:1.2rem;border-radius:2px}
.badge .dot{display:inline-block;width:6px;height:6px;background:currentColor;border-radius:50%;animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.logo-wrap{margin-bottom:.5rem}
.logo-mark{font-size:${t.logoSize};font-weight:${t.logoWeight};color:${t.ink};letter-spacing:${t.logoSpacing};line-height:1}
.logo-sub{display:inline-block;font-size:.7rem;font-weight:700;color:${t.accent};letter-spacing:.28em;text-transform:uppercase;margin-top:.45rem}
.title{font-size:1.5rem;font-weight:800;line-height:1.15;margin:1rem 0 .25rem;text-transform:uppercase;letter-spacing:-.01em}
.amount{margin:.5rem 0 .25rem}
.amount-big{font-size:4rem;font-weight:900;line-height:.95;letter-spacing:-.04em}
.amount-sub{font-size:.85rem;font-weight:600;color:${t.muted};margin-top:.4rem;letter-spacing:.02em}
.stats{display:flex;background:${t.tint};border-radius:2px;margin:1.3rem 0 1rem;overflow:hidden}
.stats[hidden]{display:none}
.stat{flex:1;padding:.7rem .25rem;text-align:center;border-right:1px solid ${t.line}}
.stat:last-child{border-right:none}
.stat-val{font-size:.95rem;font-weight:800;line-height:1.1}
.stat-lbl{font-size:.58rem;font-weight:600;color:${t.muted};text-transform:uppercase;letter-spacing:.08em;margin-top:.2rem}
.steps{margin:1rem 0 .25rem;text-align:left;border-top:1px solid ${t.line};padding-top:1rem}
.step{display:flex;align-items:flex-start;gap:.85rem;margin-bottom:.95rem}
.step:last-child{margin-bottom:0}
.step-num{flex-shrink:0;width:1.7rem;height:1.7rem;background:${t.accent};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.85rem;font-weight:800;margin-top:.05rem}
.step-txt{font-size:.92rem;font-weight:700;line-height:1.3}
.step-sub{font-size:.78rem;font-weight:400;color:${t.muted};line-height:1.4;margin-top:.2rem}
.step-underline{text-decoration:underline;text-decoration-thickness:1.5px;text-underline-offset:2px}
.cta{display:block;width:100%;background:${t.accent};color:#fff;font-weight:800;padding:1.1rem 1.5rem;border-radius:${t.ctaRadius};font-size:1rem;text-align:center;text-decoration:none;border:none;cursor:pointer;margin-top:1.3rem;font-family:inherit;transition:background .2s,transform .15s;letter-spacing:.04em;text-transform:uppercase}
.cta:hover{background:${t.accentHover}}
.cta:active{transform:scale(.98)}
.cta:disabled{opacity:.7;cursor:not-allowed}
.trust{font-size:.72rem;color:${t.muted};margin-top:.8rem;font-weight:400;line-height:1.4}
.trust strong{color:${t.ink};font-weight:700}
</style>

<script>
!function (w, d, t) {
  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
  ttq.load('${b.pixel}');
  ttq.page();
}(window, document, 'ttq');
</script>
</head>
<body>
<div class="page">
  <div class="card">
    <div class="badge"><span class="dot"></span>${S.badge}</div>
    <div class="logo-wrap">
      <div class="logo-mark">${b.wordmark}</div>
      <div class="logo-sub">${V.sub}</div>
    </div>
    <div class="title">${pick('headline','headlineNoAmount')}</div>
    <div class="amount">
      ${amt ? `<div class="amount-big" data-geo-amount>${amt}</div>` : ''}
      <p class="amount-sub">${fill(S.amountSubByKind[b.kind], V)}</p>
    </div>

    <!-- Rendered only when __STATS__ is supplied. Empty by default - see NOTES.md -->
    <div class="stats" id="statsBar" hidden></div>

    <div class="steps">
      <div class="step">
        <span class="step-num">1</span>
        <div>
          <p class="step-txt">${S.step1}</p>
          <p class="step-sub">${pick('step1sub','step1subNoAmount')}</p>
        </div>
      </div>
      <div class="step">
        <span class="step-num">2</span>
        <div>
          <p class="step-txt">${S.step2}</p>
          <p class="step-sub">${S.step2sub}</p>
        </div>
      </div>
      <div class="step">
        <span class="step-num">3</span>
        <div>
          <p class="step-txt step-underline">${S.step3}</p>
          <p class="step-sub">${pick('step3sub','step3subNoAmount')}</p>
        </div>
      </div>
    </div>

    <button id="ctaBtn" class="cta">${pick('cta','ctaNoAmount')}</button>
    <div class="trust"><strong>${S.trustStrong}</strong> ${S.trustRest}</div>
  </div>
</div>

<script>
(function(){
'use strict';

/* bfcache bust */
window.addEventListener('pageshow', function(e){ if (e.persisted) location.reload(); });
if (window.performance && performance.navigation && performance.navigation.type === 2) location.reload();

var DOOR       = window.__DOOR_URL__   || 'https://sprktrax.org/api/link/${b.doorSlug}';
/* Amounts are baked into the markup at build time — nothing to substitute at runtime. */
var GEO_VALUE = ${val};

/* optional social proof - only if the middleware supplied real values */
(function(){
  var s = window.__STATS__;
  if (!s || !s.length) return;
  var bar = document.getElementById('statsBar');
  bar.innerHTML = s.map(function(x){
    return '<div class="stat"><div class="stat-val"></div><div class="stat-lbl"></div></div>';
  }).join('');
  [].forEach.call(bar.querySelectorAll('.stat'), function(el, i){
    el.querySelector('.stat-val').textContent = String(s[i].value);
    el.querySelector('.stat-lbl').textContent = String(s[i].label);
  });
  bar.hidden = false;
})();

/* ------------------------------------------------------------------
   FORWARD EVERY INCOMING PARAM to the door — the tokrwd lander contract.
   Inbound the launcher sets s1=<SPK> (the attribution key), s2=<publisher>,
   s3=<ad account>, s4, ttclid. The door re-stamps outbound (s1 -> bare
   affiliate id, s2 -> SPK, s3 forwarded, s4 -> offer name, click_id -> s5).
   An earlier draft of this page whitelisted only utm_campaign/ttclid/s1,
   which silently dropped s3 — the ad-account leg — on every click.

   s1 is the AFFILIATE'S SPARK CODE and nothing else. Ricky (Monetise,
   2026-07-16): "pass your S1 values to look like affiliate IDs". Never
   overwrite s1 with a campaign name — that is what breaks attribution.
   ------------------------------------------------------------------ */
var q = new URLSearchParams(location.search);
/* ------------------------------------------------------------------
   ?lg=<GEO> — the AFFILIATE'S GEO SELECTOR.
   The affiliate picks a country on their end; their link carries ?lg=JP.
   Landing on any geo's page with ?lg=JP sends them straight to THIS brand's
   Japanese page, keeping their clone index so the URL footprint stays spread
   (/50FC/US7?lg=JP -> /50FC/JP7). Every param rides across, and 'lg' is
   dropped from the outbound door URL — it routes the lander, the network
   never needs it.

   Computed from location.pathname rather than a baked table on purpose: a
   per-clone table would give every clone a different byte and break the
   one-md5-per-slice property that makes drift detectable.

   NOT CLOAKING. It keys off an explicit query param, never the user agent,
   and does exactly the same thing for every visitor including ad-review
   crawlers. A crawler hitting ?lg=JP sees the Japanese page, which is the
   honest answer. No lg param at all -> no redirect, this page renders as-is.
   ------------------------------------------------------------------ */
var THIS_GEO = "${geo}";
var BRAND_GEOS = ${JSON.stringify(geosOf(b))};
(function () {
  var want = (q.get('lg') || '').trim().toUpperCase();
  if (want === 'UK') want = 'GB';            // networks say UK, we store GB
  if (!want || want === THIS_GEO) return;
  if (BRAND_GEOS.indexOf(want) === -1) return;   // geo this brand does not sell -> stay put
  var path = location.pathname;
  // /50FC/US7 -> /50FC/JP7 · /FCASH/US -> /FCASH/JP · and the same with a trailing slash or
  // /index.html, because Vercel cleanUrls serves the bare form but a direct /index.html hit must
  // redirect too — a SILENT non-redirect lands Japanese traffic on the English page.
  // [0-9] and [.] instead of \d and \. on purpose: this whole file is a template literal, and a
  // backslash escape does not survive into the emitted single-quoted RegExp string.
  var re = new RegExp('(^|/)' + THIS_GEO + '([0-9]*)(/index[.]html|/)?$');
  var next = path.replace(re, function (_m, pre, idx, tail) { return pre + want + idx + (tail || ''); });
  if (next === path) return;                 // nothing matched -> never redirect blindly
  var carry = new URLSearchParams(q.toString());
  carry.set('lg', want);                     // idempotent: the target page sees lg === its geo
  location.replace(next + '?' + carry.toString());
})();



/* mc_attr fallback: derive s1 (e=<spark> .. c=<code>) when the launcher did not
   pass it directly. If neither field exists s1 stays EMPTY — never fabricated. */
if (!q.get('s1')) {
  var mc = q.get('mc_attr') || '', f = {};
  mc.split('..').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) f[kv.slice(0, i)] = kv.slice(i + 1); });
  var d = f.e || f.c; if (d) q.set('s1', d);
}

/* Referrer rescue for a stripped query (in-app browsers drop params on some hops). */
if ((!q.get('s1') || !q.get('utm_campaign')) && document.referrer) {
  try {
    var r = new URLSearchParams(new URL(document.referrer).search);
    ['s1','s2','s3','s4','utm_campaign','campaign','ttclid'].forEach(function(k){
      if (!q.get(k) && r.get(k)) q.set(k, r.get(k));
    });
  } catch(e) {}
}

/* Drop unsubstituted TikTok macros rather than forwarding the literal placeholder. */
var tt = q.get('ttclid') || '';
if (tt && (tt.indexOf('CLICK_ID') > -1 || tt.indexOf('__CLICKID__') > -1 || tt.indexOf('{{') > -1 || tt.indexOf('}}') > -1)) q.delete('ttclid');

var s1 = q.get('s1') || '';
var campaign = q.get('utm_campaign') || q.get('campaign') || '';
var ttclid = q.get('ttclid') || '';

/* NO UA SNIFFING, deliberately. The earlier draft classified the visitor as a bot and
   suppressed utm_campaign/ttclid for them. Once the door URL forwards the whole query
   string that branch stopped affecting routing, leaving a bot regex sitting in the page
   doing nothing — and a lander that appears to behave differently for a crawler is what
   gets the whole domain flagged and every campaign on it blocked. Attribution does not
   need a gate here: the door 404s any click with no s1 (api/link/[slug].js). */

/* Door URL: every param rides, with s1 placed LAST (ad automations append to the
   tail). The door 404s a click with no s1 — by design, that is the real gate. */
function buildDoorUrl() {
  var out = new URLSearchParams(q.toString());
  out.delete('s1');
  out.delete('lg');   // routes the lander only — the door/network never sees it
  var qs = out.toString();
  var url = DOOR + (qs ? '?' + qs : '');
  if (s1) url += (qs ? '&' : '?') + 's1=' + encodeURIComponent(s1);
  return url;
}
var target = buildDoorUrl();

if (window.ttq) {
  try { ttq.track('ViewContent', { content_name: '${b.wordmark} ${geo} Landing', value: GEO_VALUE }); } catch(e) {}
}

var ctaBtn = document.getElementById('ctaBtn');
var clicking = false, hasTouched = false;

function handleCta(e) {
  e.preventDefault();
  if (clicking) return;
  clicking = true;
  ctaBtn.textContent = '${S.loading}';
  if (window.ttq) {
    try { ttq.track('ClickButton', { content_name: '${b.wordmark} ${geo} CTA', value: GEO_VALUE }); } catch(e) {}
  }
  location.replace(target);
}
ctaBtn.addEventListener('touchend', function(e){ hasTouched = true; handleCta(e); }, {passive:false});
ctaBtn.addEventListener('click', function(e){ if (!hasTouched) handleCta(e); });

if (location.hostname === 'localhost' || location.search.indexOf('debug=1') > -1) {
  console.log('[${b.doorSlug}/${geo} debug]', {
    geo: document.documentElement.getAttribute('data-geo') || '(unknown)',
    s1: s1 || '(none - door will 404)',
    campaign: campaign || '(none)',
    ttclid: ttclid || '(none)',
    target: target
  });
}
})();
</script>
<!-- Shared ttclid backfill: fills an empty ttclid from the _ttclid cookie and tags tracker
     anchors. sprktrax.org is in its allowlist, so the door forwards it into the postback. -->
<script src="/js/ttclid.js" async></script>
</body>
</html>
`;
};

// ── Output ───────────────────────────────────────────────────────────────────────────────
// Canonical page per geo at <DIR>/<GEO>/index.html, then N byte-identical clones at
// <FAMILY>/<GEO><n>/ — e.g. SH50/GB7, 50FC/JP1. The geo lives IN the path, which is the whole
// point: the landing_pages row for that slice carries landing_pages.geo, and the click door now
// routes on it. What the visitor reads and where the click is sent come from the same fact.
//
// Clones within a (brand, geo) are BYTE-IDENTICAL. They exist only to spread the ad-platform
// footprint so a flag on one URL does not burn the rest. NEVER hand-edit one — that is how
// RS50/RS1 drifted from RS2-RS50. Change BRANDS/STRINGS and regenerate.
const argv = process.argv.slice(2);
const cloneArg = argv.indexOf('--clones');
const CLONES = cloneArg > -1 ? parseInt(argv[cloneArg + 1], 10) : 50;
if (!Number.isFinite(CLONES) || CLONES < 0) { console.error('--clones must be a non-negative integer'); process.exit(1); }
const only = (() => { const i = argv.indexOf('--only'); return i > -1 ? argv[i + 1] : null; })();

const repoRoot = path.join(__dirname, '..');
let written = 0, pages = 0;
for (const b of BRANDS) {
  if (only && b.dir !== only && b.doorSlug !== only) continue;
  const geos = geosOf(b);
  const langs = [...new Set(geos.map(g => LOCALES[g]))];
  for (const geo of geos) {
    const html = page(b, geo);
    pages++;

    const canon = path.join(repoRoot, b.dir, geo);
    fs.mkdirSync(canon, { recursive: true });
    fs.writeFileSync(path.join(canon, 'index.html'), html);
    written++;

    for (let n = 1; n <= CLONES; n++) {
      const d = path.join(repoRoot, b.family, geo + n);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'index.html'), html);   // same buffer -> one md5 per (brand, geo)
      written++;
    }
  }
  console.log(
    (b.dir + '/').padEnd(9),
    ('door=' + b.doorSlug).padEnd(20),
    ('geos=' + geos.join(',')).padEnd(30),
    ('langs=' + langs.join(',')).padEnd(18),
    'slugs=' + geos.map(g => b.doorSlug + '-' + g.toLowerCase()).join(' ')
  );
}
console.log('\n' + written + ' files written under ' + repoRoot +
            ' (' + pages + ' distinct pages x 1 canonical + ' + CLONES + ' clones)');
