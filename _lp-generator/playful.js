#!/usr/bin/env node
/**
 * Playful Rewards PER-GEO lander generator — the /trt design in brand purple, one page per geo.
 *
 *   node _lp-generator/playful.js --clones 30
 *
 * WHY THIS PAGE LOOKS LIKE IT DOES
 * Migi asked for the Testerup lander he runs (the /trt "Choose Your Game" game-picker -> claim
 * screen that 50TU ships) rebuilt as Playful Rewards. `playful-template.html` is a FORK of
 * `testerup-template.html` and changed four things:
 *
 *   1. PALETTE      orange -> the brand's own #7c3aed / #9333ea / #a855f7, #c084fc accent text,
 *                   #0a0014 page. Lifted from the app icon and the original Playful/index.html.
 *   2. BRAND        /images/playful-rewards-logo.png — the base64 PNG that the orphaned
 *                   Playful/index.html had inlined, extracted byte-identically. Not a lookalike.
 *   3. DOOR         slug testerup -> playful-<geo>.
 *   4. BACKGROUND   Playful/index.html's own treatment ported on at Migi's request: the 40-dot
 *                   twinkling particle field, the gradient hero text, the glowing app-icon ring.
 *
 * The game grid is UNCHANGED — Block Blast, Candy Crush, Subway Surfers, Roblox, same icons, same
 * 2-offers unlock mechanic. Block Blast stays because Migi asked for it by name. The header is the
 * mark only; the visible "Playful Rewards" wordmark was removed 2026-07-30 on his call.
 *
 * ── GEO IS THE UNIT OF EVERYTHING (the Freecash model, deliberately copied) ───────────────────
 *
 *   /PLAY/DE     DE · German · opens api/link/playful-de
 *   /PR50/FR7    FR · French · opens api/link/playful-fr
 *
 * One geo picks the language AND the door slug, so a page cannot render in German and hand the
 * visitor the US offer. There is NO runtime geo detection — no IP sniffing, no UA branching, no
 * cookie. The geo is decided by WHICH PAGE the ad points at, which is also why a visitor cannot
 * shop geo with a VPN: there is nothing to shop.
 *
 * EVERY GEO NEEDS ITS OWN DOOR SLUG AND ITS OWN `landing_pages` ROW. A shared slug collapses every
 * language back onto one row carrying one geo — i.e. back onto the US offer. That was the original
 * bug the per-geo split exists to fix.
 *
 * MONEY: there is none. Unlike Freecash (which had to keep $1,250-$1,500 in USD rather than invent
 * exchange rates) this page quotes no figure at all, so localisation raises no currency question.
 *
 * ── COPY THAT DELIBERATELY DIVERGES, all compliance, all asserted below ───────────────────────
 *   "Verified by TikTok"        -> "Free to download". A platform endorsement TikTok never gave is
 *                                  a false third-party claim; reproducing it onto a new page is
 *                                  authoring it. The pill is kept, the claim is not.
 *   "Trusted by 500,000 users"  -> a line with NO number. That figure is Testerup's; aiming it at
 *                                  Playful Rewards invents a statistic.
 *
 * ── WHY THE FR/DE STRINGS READ THE WAY THEY DO ───────────────────────────────────────────────
 * Both a native-speaker review and a compliance review independently caught the same drift in the
 * first drafts: English uses a PURPOSE INFINITIVE ("Pick a game ... *to start* earning") and both
 * translations rendered it as coordinated imperatives ("... *and* earn"), which German ad review in
 * particular reads as a conditional promise — do this and you get that. Every instance is now a
 * purpose construction (`um ... zu`, `pour + infinitif`). A translation must never claim more than
 * the English it was approved from.
 *
 * Two further corrections worth not undoing:
 *   - DE importantBody once ended "...Subway Surfers und vielen mehr Geld zu verdienen", putting
 *     "mehr Geld" adjacent. A German reader parses that comparative first — "earn MORE money" —
 *     but the English "and more" modifies the GAME LIST, not the money. Word order alone created
 *     an earnings claim. "Geld" now sits ahead of the list.
 *   - Both <title>s are the bare brand, matching the English. A localised tagline would put a
 *     claim in the title that the English title does not make.
 *
 * ── CASH APP IS NOT GLOBAL, AND THE SECOND VIDEO CAPTION KNOWS IT ────────────────────────────
 * Cash App operates in the US and GB only. The claim screen's second caption said "paid via Cash
 * App" for everyone — true for those two, FALSE anywhere else, where it promises a visitor a
 * payment rail they cannot use. The caption is therefore per-geo, via `rail2` on each GEOS row:
 *
 *   rail2:'cashapp'  US, GB   — Cash App
 *   rail2:'paypal'   CA, AU   — PayPal (Migi's call 2026-07-30; PayPal operates in both)
 *   rail2:'wallet'   spare    — names no payment brand at all, restates the page's own step-3
 *                               claim. Use it for a market where neither rail is confirmed.
 *
 * `assertPage` refuses to emit "Cash App" on any page whose rail2 is not 'cashapp', so a geo added
 * without thinking about its rails fails the build instead of publishing an unusable promise.
 *
 * NEVER HAND-EDIT A CLONE. Every file in a geo slice is written from ONE buffer, so each slice is
 * exactly one md5 — that is how the RS50/RS1 and FC1 drift incidents are prevented. Change the
 * template or the strings and re-run. Every substitution is ASSERTED: if the template is edited so
 * a source string stops matching, this throws rather than silently emitting an English page into
 * the German slot.
 */
const fs = require('fs');
const path = require('path');

const TEMPLATE = fs.readFileSync(path.join(__dirname, 'playful-template.html'), 'utf8');

const DOOR_SLUG = 'playful';     // real slug is <this>-<geo>
const CANON_DIR = 'PLAY';        // canonical page per geo: PLAY/<GEO>/index.html
const FAMILY = 'PR50';           // numbered pool per geo: PR50/<GEO>1..<GEO>n
const HOME_GEO = 'US';           // what the bare /PLAY serves (see the write step)

/**
 * ENGLISH-SPEAKING GEOS ONLY — and that is a creative constraint, not an oversight.
 *
 * The offer row sells US GB CA AU FR DE, and FR/DE pages were built and translated. Migi pulled
 * them on 2026-07-30 for a reason that no amount of copy work fixes: **the two claim-screen videos
 * are English-language UGC.** A French visitor would read French copy and then watch two people
 * talk in English on the page's most prominent proof element. That reads as a scam page and kills
 * the conversion, which is worse than not running the geo at all.
 *
 * So FR/DE are OFF, not deleted. `T.fr` and `T.de` below are complete, reviewed by a native speaker
 * AND a compliance pass, and stay in this file. Re-enabling is ONE LINE EACH here — the day there is
 * French/German video creative (or the videos come out of the claim screen for those geos), add the
 * rows back and re-run. Do not re-translate from scratch; the wording below was hard-won, see the
 * purpose-vs-promise note in the header.
 *
 * `rail2` names the payment rail in the SECOND video caption, per geo. See the header note: the
 * first caption is always PayPal, and Cash App is US/GB only.
 */
const RAILS = { cashapp: 'vidCap2CashApp', paypal: 'vidCap2PayPal', wallet: 'vidCap2Wallet' };

/**
 * Where each rail actually operates. This is the guard that matters, and it is about the WORLD, not
 * about this codebase: the per-page assertion below only proves the emitted caption matches the
 * config, which is useless if the config itself names a rail the market cannot use. Setting
 * `rail2:'cashapp'` on CA passed every other check and would have published a payment promise a
 * Canadian visitor cannot act on.
 *
 * `null` = available everywhere we sell, so nothing to check. Extend these sets ONLY against a real
 * source; a wrong entry here is a false claim on a live page, which is the exact failure mode the
 * whole rails split exists to prevent.
 */
const RAIL_MARKETS = {
  cashapp: new Set(['US', 'GB']),
  paypal: null,
  wallet: null,
};

const GEOS = {
  US: { lang: 'en', rail2: 'cashapp' },
  GB: { lang: 'en', rail2: 'cashapp' },
  // Cash App does not operate in CA or AU. Migi's call (2026-07-30) is to name PayPal rather than
  // hedge to the wallet wording — PayPal does operate in both, and a named rail converts better
  // than a vague one. Consequence to know and not "fix": caption 1 is ALSO PayPal, so on these two
  // geos both videos carry the same caption. That is accurate (two people, one rail), not a bug.
  CA: { lang: 'en', rail2: 'paypal' },
  AU: { lang: 'en', rail2: 'paypal' },
  // FR: { lang: 'fr', rail2: 'paypal' },  // OFF — English videos, see above
  // DE: { lang: 'de', rail2: 'paypal' },  // OFF — English videos, see above
};

// Every visible string, per language. Generated from the reviewed translation sets — see the
// header for why the FR/DE wording is what it is. Adding a language is one block here plus a
// `lang` on a GEOS row; a missing key throws at build time rather than reaching a visitor.
const T = {
  en: {
    title: "Playful Rewards",
    metaDesc: "Choose a game and start earning real cash through Playful Rewards while you play.",
    badge: "Free to download",
    h1Pre: "Choose Your ",
    h1Grad: "Game",
    lead: "Pick a game below to start earning real cash through Playful Rewards while you play.",
    kick: "Get paid to play",
    noticeTitle: "Block Blast and Subway Surfers are locked at first",
    noticeBody: "Download &amp; complete <span class=\"hl\">2 quick game offers</span> from the App Store to unlock <span class=\"hl\">either Block Blast or Subway Surfers</span> &mdash; pick the one you want to play. Both stay hidden in Playful Rewards until the 2 offers are done &mdash; usually under 2 minutes.",
    trustGames: "Real cash for the games you already play",
    back: "Back",
    claimGrad: "You're In!",
    claimLead: "Install the Playful Rewards app to start earning!",
    cashLabel: "REAL CASH-OUTS AFTER ACTIVATION",
    unlocked: "Unlocked",
    tapSound: "Tap for sound",
    vidCap1: "After 2 offers &middot; paid via <b>PayPal</b>",
    vidCap2CashApp: "After 2 offers &middot; paid via <b>Cash App</b>",
    vidCap2PayPal: "After 2 offers &middot; paid via <b>PayPal</b>",
    vidCap2Wallet: "After 2 offers &middot; straight to your <b>wallet</b>",
    cta: "Install App &amp; Start Earning",
    sectionLabel: "YOUR EARNING JOURNEY",
    step1Title: "Install the Playful Rewards app",
    step1Body: "Available for free on both the App Store and Google Play Store.",
    step2Title: "Complete Starter Offers",
    step2Body: "Play games, try apps, or complete simple challenges. Unlock access to popular gaming rewards.",
    step2Sub: "(Block Blast, Candy Crush, Clash Royale, Subway Surfers)",
    step3Title: "Get Paid Instantly",
    step3Body: "Earnings are credited directly to your Apple Wallet or Google Wallet.",
    step3Sub: "No cashout apps &middot; No waiting",
    importantTag: "IMPORTANT",
    importantTitle: "Activation Required",
    importantBody: "New users: Complete <span style=\"color:var(--violet4);font-weight:700\">2 quick offers</span> to unlock full access and start earning with top games like Block Blast, Subway Surfers, and more.",
    trustWallet: "Real cash, credited straight to your wallet",
  },

  fr: {
    title: "Playful Rewards",
    metaDesc: "Choisis un jeu et commence à gagner du vrai argent avec Playful Rewards tout en jouant.",
    badge: "Téléchargement gratuit",
    h1Pre: "Choisis ton ",
    h1Grad: "jeu",
    lead: "Appuie sur un jeu ci-dessous pour commencer à gagner du vrai argent avec Playful Rewards tout en jouant.",
    kick: "Payé pour jouer",
    noticeTitle: "Block Blast et Subway Surfers sont verrouillés au départ",
    noticeBody: "Télécharge et termine <span class=\"hl\">2 offres rapides</span> sur l'App Store pour débloquer <span class=\"hl\">soit Block Blast, soit Subway Surfers</span> &mdash; choisis celui que tu préfères. Les deux restent masqués dans Playful Rewards tant que tu n'as pas terminé les 2 offres &mdash; généralement moins de 2 minutes.",
    trustGames: "Du vrai argent pour les jeux auxquels tu joues déjà",
    back: "Retour",
    claimGrad: "C'est parti&nbsp;!",
    claimLead: "Installe l'appli Playful Rewards pour commencer à gagner de l'argent&nbsp;!",
    cashLabel: "RETRAITS RÉELS APRÈS ACTIVATION",
    unlocked: "Débloqué",
    tapSound: "Active le son",
    vidCap1: "Après 2 offres &middot; paiement via <b>PayPal</b>",
    vidCap2PayPal: "Après 2 offres &middot; paiement via <b>PayPal</b>",
    vidCap2Wallet: "Après 2 offres &middot; directement dans ton <b>portefeuille</b>",
    cta: "Installe et commence à gagner",
    sectionLabel: "COMMENT TU GAGNES",
    step1Title: "Installe l'appli Playful Rewards",
    step1Body: "Disponible gratuitement sur l'App Store et Google Play.",
    step2Title: "Termine tes premières offres",
    step2Body: "Joue à des jeux, teste des applis ou relève des défis simples. Débloque l'accès aux récompenses de jeux populaires.",
    step2Sub: "(Block Blast, Candy Crush, Clash Royale, Subway Surfers)",
    step3Title: "Reçois ton argent instantanément",
    step3Body: "Les gains sont crédités directement sur ton Apple Wallet ou Google Wallet.",
    step3Sub: "Pas d'appli de retrait &middot; Pas d'attente",
    importantTag: "IMPORTANT",
    importantTitle: "Activation requise",
    importantBody: "Première fois&nbsp;? Termine <span style=\"color:var(--violet4);font-weight:700\">2 offres rapides</span> pour débloquer l'accès complet et commencer à gagner en jouant à des jeux phares comme Block Blast, Subway Surfers et d'autres encore.",
    trustWallet: "Du vrai argent, directement dans ton portefeuille",
  },

  de: {
    title: "Playful Rewards",
    metaDesc: "Wähle ein Spiel, um mit Playful Rewards beim Spielen echtes Geld zu verdienen.",
    badge: "Kostenloser Download",
    h1Pre: "Wähle dein ",
    h1Grad: "Spiel",
    lead: "Wähle unten ein Spiel aus, um mit Playful Rewards beim Spielen echtes Geld zu verdienen.",
    kick: "Geld fürs Spielen",
    noticeTitle: "Block Blast und Subway Surfers sind erst mal gesperrt",
    noticeBody: "Installiere <span class=\"hl\">2 schnelle Spielangebote</span> aus dem App Store und schließe sie ab, um <span class=\"hl\">entweder Block Blast oder Subway Surfers</span> freizuschalten &mdash; du hast die Wahl. Beide bleiben in Playful Rewards ausgeblendet, bis die 2 Angebote erledigt sind &mdash; meistens unter 2 Minuten.",
    trustGames: "Echtes Geld für Spiele, die du sowieso spielst",
    back: "Zurück",
    claimGrad: "Du bist dabei!",
    claimLead: "Installiere die Playful Rewards-App, um mit dem Verdienen zu beginnen!",
    cashLabel: "ECHTE AUSZAHLUNGEN NACH AKTIVIERUNG",
    unlocked: "Freigeschaltet",
    tapSound: "Für Ton tippen",
    vidCap1: "Nach 2 Angeboten &middot; Auszahlung per <b>PayPal</b>",
    vidCap2PayPal: "Nach 2 Angeboten &middot; Auszahlung per <b>PayPal</b>",
    vidCap2Wallet: "Nach 2 Angeboten &middot; direkt in dein <b>Wallet</b>",
    cta: "App installieren &amp; verdienen",
    sectionLabel: "DEIN WEG ZUM VERDIENEN",
    step1Title: "Playful Rewards installieren",
    step1Body: "Kostenlos im App Store und im Google Play Store erhältlich.",
    step2Title: "Starter-Angebote abschließen",
    step2Body: "Teste Apps, spiele Games oder erledige einfache Challenges. Schalte den Zugang zu beliebten Gaming-Belohnungen frei.",
    step2Sub: "(Block Blast, Candy Crush, Clash Royale, Subway Surfers)",
    step3Title: "Sofort Geld erhalten",
    step3Body: "Deine Einnahmen werden dir direkt über Apple Wallet oder Google Wallet gutgeschrieben.",
    step3Sub: "Keine Auszahlungs-Apps &middot; Kein Warten",
    importantTag: "WICHTIG",
    importantTitle: "Aktivierung erforderlich",
    importantBody: "Neu hier? Schließe <span style=\"color:var(--violet4);font-weight:700\">2 schnelle Angebote</span> ab, um den vollen Zugang freizuschalten und Geld mit Top-Spielen wie Block Blast, Subway Surfers und vielen weiteren zu verdienen.",
    trustWallet: "Echtes Geld, direkt in dein Wallet",
  },
};

/** Replace `from` with `to` exactly `count` times, throwing if the count does not match. */
function sub(html, from, to, count = 1) {
  const parts = html.split(from);
  if (parts.length - 1 !== count) {
    throw new Error(`playful template: expected ${count} occurrence(s) of ${JSON.stringify(String(from).slice(0, 70))}, found ${parts.length - 1}`);
  }
  return parts.join(to);
}

/** Assert `needle` appears NOWHERE in the emitted page. */
function never(html, needle, why) {
  if (html.includes(needle)) throw new Error(`playful page: must not contain ${JSON.stringify(needle)} — ${why}`);
}

function page(geo) {
  const g = GEOS[geo];
  const t = T[g.lang];
  if (!t) throw new Error(`no string table for lang "${g.lang}" (geo ${geo})`);
  for (const k of Object.keys(T.en)) {
    if (Object.values(RAILS).includes(k)) continue;          // rail variants are per-geo, checked below
    if (typeof t[k] !== 'string') throw new Error(`T.${g.lang} is missing key "${k}" (geo ${geo})`);
  }

  let h = TEMPLATE;

  // ── language + document ────────────────────────────────────────────────────────────────────
  h = sub(h, '<html lang="en">', `<html lang="${g.lang}" data-geo="${geo}">`);
  h = sub(h, '<title>Playful Rewards</title>', `<title>${t.title}</title>`);
  h = sub(h, 'content="Choose a game and start earning real cash through Playful Rewards while you play."',
             `content="${t.metaDesc}"`);

  // ── ?lg=<GEO> geo selector, injected into <head> ───────────────────────────────────────────
  // In the HEAD, before the body renders and before the offer script wires the CTA. That ordering
  // is load-bearing (the Freecash review found it): running late leaves a window where a fast tap
  // fires the CTA on the WRONG geo's door, and it flashes the wrong language first.
  // NOT CLOAKING: keyed on an explicit query param, never the user agent, identical for crawlers.
  const lgScript = [
    '<script>',
    '(function(){',
    `  var GEOS = ${JSON.stringify(Object.keys(GEOS))}, THIS_GEO = "${geo}";`,
    '  var q = new URLSearchParams(location.search);',
    "  var want = (q.get('lg') || '').trim().toUpperCase();",
    "  if (want === 'UK') want = 'GB';",
    '  if (!want || want === THIS_GEO || GEOS.indexOf(want) === -1) return;',
    // [0-9] and [.] rather than backslash escapes: this string is assembled in JS and must survive
    // verbatim into the emitted single-quoted RegExp.
    "  var re = new RegExp('(^|/)' + THIS_GEO + '([0-9]*)(/index[.]html|/)?$');",
    '  var next = location.pathname.replace(re, function (_m, pre, idx, tail) { return pre + want + idx + (tail || \'\'); });',
    '  if (next === location.pathname) return;',
    "  q.set('lg', want);",
    "  location.replace(next + '?' + q.toString() + location.hash);",
    '})();',
    '<\/script>',
  ].join('\n');
  h = sub(h, '<link rel="icon"', lgScript + '\n<link rel="icon"');

  // ── door: ONE SLUG PER GEO ─────────────────────────────────────────────────────────────────
  h = sub(h, "var DOOR = 'https://sprktrax.org/api/link/playful';",
             `var DOOR = 'https://sprktrax.org/api/link/${DOOR_SLUG}-${geo.toLowerCase()}';`);

  // lg routes the LANDER; it must never reach the door or the network.
  h = sub(h, "    var out = new URLSearchParams(q.toString());\n    out.delete('s1'); out.delete('campid');",
             "    var out = new URLSearchParams(q.toString());\n    out.delete('s1'); out.delete('campid'); out.delete('lg');");

  // ── screen 1 ───────────────────────────────────────────────────────────────────────────────
  h = sub(h, '    Free to download\n', `    ${t.badge}\n`);
  h = sub(h, 'Choose Your <span class="grad">Game</span>', `${t.h1Pre}<span class="grad">${t.h1Grad}</span>`);
  h = sub(h, 'Pick a game below to start earning real cash through Playful Rewards while you play.', t.lead);
  h = sub(h, '<div class="kick">Get paid to play</div>', `<div class="kick">${t.kick}</div>`, 4);
  h = sub(h, '<b>Block Blast and Subway Surfers are locked at first</b>', `<b>${t.noticeTitle}</b>`);
  h = sub(h, '<p>Download &amp; complete <span class="hl">2 quick game offers</span> from the App Store to unlock <span class="hl">either Block Blast or Subway Surfers</span> &mdash; pick the one you want to play. Both stay hidden in Playful Rewards until the 2 offers are done &mdash; usually under 2 minutes.</p>',
             `<p>${t.noticeBody}</p>`);
  h = sub(h, '>Real cash for the games you already play</p>', `>${t.trustGames}</p>`);

  // ── screen 2 ───────────────────────────────────────────────────────────────────────────────
  h = sub(h, '    Back\n', `    ${t.back}\n`);
  h = sub(h, '<span class="grad">You\'re In!</span>', `<span class="grad">${t.claimGrad}</span>`);
  h = sub(h, 'Install the Playful Rewards app to start earning!', t.claimLead);
  h = sub(h, '>REAL CASH-OUTS AFTER ACTIVATION<', `>${t.cashLabel}<`);
  h = sub(h, '<span class="badge">Unlocked</span>', `<span class="badge">${t.unlocked}</span>`, 2);
  h = sub(h, '</svg>Tap for sound</span>', `</svg>${t.tapSound}</span>`, 2);
  h = sub(h, '<span>After 2 offers &middot; paid via <b>PayPal</b></span>', `<span>${t.vidCap1}</span>`);
  const rail2Key = RAILS[g.rail2];
  if (!rail2Key) throw new Error(`geo ${geo}: unknown rail2 "${g.rail2}" (expected one of ${Object.keys(RAILS).join(', ')})`);
  const market = RAIL_MARKETS[g.rail2];
  if (market && !market.has(geo)) {
    throw new Error(`geo ${geo}: rail2 "${g.rail2}" does not operate there — it would promise a payment method the visitor cannot use. Available in: ${[...market].join(', ')}`);
  }
  if (typeof t[rail2Key] !== 'string') throw new Error(`geo ${geo}: T.${g.lang} has no ${rail2Key} for rail2="${g.rail2}"`);
  h = sub(h, '<span>After 2 offers &middot; paid via <b>Cash App</b></span>',
             `<span>${t[rail2Key]}</span>`);
  h = sub(h, '>Install App &amp; Start Earning</a>', `>${t.cta}</a>`);
  h = sub(h, '>YOUR EARNING JOURNEY</div>', `>${t.sectionLabel}</div>`);
  h = sub(h, '<h3>Install the Playful Rewards app</h3>', `<h3>${t.step1Title}</h3>`);
  h = sub(h, '<p>Available for free on both the App Store and Google Play Store.</p>', `<p>${t.step1Body}</p>`);
  h = sub(h, '<h3>Complete Starter Offers</h3>', `<h3>${t.step2Title}</h3>`);
  h = sub(h, '<p>Play games, try apps, or complete simple challenges. Unlock access to popular gaming rewards. <span class="sub">(Block Blast, Candy Crush, Clash Royale, Subway Surfers)</span></p>',
             `<p>${t.step2Body} <span class="sub">${t.step2Sub}</span></p>`);
  h = sub(h, '<h3>Get Paid Instantly</h3>', `<h3>${t.step3Title}</h3>`);
  h = sub(h, '<p>Earnings are credited directly to your Apple Wallet or Google Wallet. <span class="sub">No cashout apps &middot; No waiting</span></p>',
             `<p>${t.step3Body} <span class="sub">${t.step3Sub}</span></p>`);
  h = sub(h, '>IMPORTANT</div>', `>${t.importantTag}</div>`);
  h = sub(h, '<b>Activation Required</b>', `<b>${t.importantTitle}</b>`);
  h = sub(h, '<p>New users: Complete <span style="color:var(--violet4);font-weight:700">2 quick offers</span> to unlock full access and start earning with top games like Block Blast, Subway Surfers, and more.</p>',
             `<p>${t.importantBody}</p>`);
  h = sub(h, '>Real cash, credited straight to your wallet</p>', `>${t.trustWallet}</p>`);

  assertPage(h, geo);
  return h;
}

/**
 * Invariants that must hold on the EMITTED page for every geo. These are checked after
 * substitution, not before, so a translation that breaks markup fails the build for that geo.
 */
function assertPage(h, geo) {
  const g = GEOS[geo];
  const need = (needle, count, why) => {
    const n = h.split(needle).length - 1;
    if (n !== count) throw new Error(`${geo}: expected ${count}x ${JSON.stringify(needle)}, found ${n} — ${why}`);
  };

  // Wiring — the CTA must walk OUR door, on THIS geo's slug, exactly once.
  need(`var DOOR = 'https://sprktrax.org/api/link/${DOOR_SLUG}-${geo.toLowerCase()}';`, 1, 'door slug');
  need('sprktrax.org/api/link/', 1, 'exactly one outbound hop, and it is the door');
  need('id="claimBtn"', 1, 'CTA id');
  need("out.delete('lg')", 1, 'lg must be stripped before the door — it routes the lander, not the network');
  need('<script src="/js/ttclid.js" async></script>', 1, 'shared ttclid backfill');
  never(h, 'appflowconnect.com', 'a /c/ hop here would skip click_id attribution');
  never(h, 'monetisetrk', 'the network URL must never appear in lander markup');

  // Every element id the wiring script touches. getElementById('backBtn') runs BEFORE the CTA href
  // is set, so a typo there ships a lander whose CTA is still href="#" with the build green.
  for (const id of ['screen-games', 'screen-claim', 'backBtn', 'claimBtn', 'bgCanvas']) need(`id="${id}"`, 1, 'element id');

  // No cloaking. Audit check 6 confines these to pre/index.html + js/breakout.js.
  for (const [pat, why] of [
    ['x-safari', 'scheme-jump breakout belongs only in /pre'],
    ['intent://', 'scheme-jump breakout belongs only in /pre'],
    ['googlechrome-x-callback', 'scheme-jump breakout belongs only in /pre'],
    ['__SUBID_OK', 'the blank-page SubID gate is what got the domain flagged'],
    ['document.write', 'used only by the blank-page gate'],
    ['display:none!important', 'signature of the blank-page gate'],
    ['musical_ly', 'in-app UA sniffing is the cloaking test we removed'],
  ]) never(h, pat, why);

  // Brand + the bits Migi asked for by name.
  need('/images/playful-rewards-logo.png', 4, 'icon + apple-touch-icon + both screen headers');
  need('/images/block-blast.jpg', 1, 'Block Blast tile');
  need('>Block Blast<', 1, 'Block Blast tile label');

  // The Playful/index.html background treatment.
  need('<div class="bg-canvas" id="bgCanvas"></div>', 1, 'particle canvas');
  need("getElementById('bgCanvas')", 1, 'particle loop');
  need('@keyframes twinkle', 1, 'particle animation');
  need('class="grad"', 2, 'gradient hero on both screen titles');
  need('brandmark', 3, 'glow rule + both logo imgs');

  // Markup the translations must preserve, or the page renders broken in that language only.
  need('<span class="hl">', 2, 'the two highlighted phrases in the locked-games notice');
  need('<span style="color:var(--violet4);font-weight:700">', 1, 'the highlight in the activation notice');
  need('<span class="sub">', 2, 'the two muted sub-clauses in the journey steps');

  // Language + geo actually landed.
  need(`<html lang="${g.lang}" data-geo="${geo}">`, 1, 'lang + geo attributes');
  never(h, '<html lang="en">', 'the language swap did not happen');

  // Copy that must never come back, in ANY language. The English needles alone are not enough —
  // a translated endorsement is the same false claim, and the audit greps English only.
  never(h, 'Verified by TikTok', 'false platform endorsement');
  never(h, 'Vérifié par TikTok', 'false platform endorsement (fr)');
  never(h, 'Von TikTok verifiziert', 'false platform endorsement (de)');
  never(h, 'TikTok-geprüft', 'false platform endorsement (de)');
  never(h, '500,000', 'invented user count');
  never(h, '500.000', 'invented user count (de/fr number format)');

  // Left over from the fork.
  never(h, 'Testerup', 'copy left over from the template this was forked from');
  never(h, 'gravy-logo', "Testerup's mark left in the brand header");
  never(h, '#e8671a', 'Testerup orange left in the palette');
  never(h, '232,103,26', 'Testerup orange left in a glow/border rgba()');

  // Cash App must not appear on a page for a market where it does not operate.
  if (g.rail2 !== 'cashapp') never(h, 'Cash App', `Cash App does not operate in ${geo} — rail2 is "${g.rail2}"`);
}

/**
 * Every LOCAL asset the page references must exist on disk, with byte-identical casing.
 *
 * Asserting the path STRING is not enough — a substring assertion passes happily while the file is
 * missing or renamed case-only. The casing half is the subtle one: macOS is case-INSENSITIVE, so
 * existsSync('/images/Roblox.jpg') returns true for roblox.jpg and the bug is invisible locally,
 * while Vercel serves case-sensitively and 404s it in production.
 *
 * This repo has already shipped a mislabeled asset (images/gravy-logo.png actually contains
 * TESTERUP's mark, fixed in f61d996). Existence and casing are checkable here; whether the picture
 * is the right BRAND is not, so that stays a human check — see the skill doc.
 */
function assertAssetsExist(html) {
  const repoRoot = path.join(__dirname, '..');
  const refs = [...new Set([...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map(m => m[1]))]
    .filter(r => !r.startsWith('//'));
  const bad = [];
  for (const ref of refs) {
    const abs = path.join(repoRoot, ref.replace(/^\//, ''));
    if (!fs.existsSync(abs)) { bad.push(`${ref} — no such file`); continue; }
    const entries = fs.readdirSync(path.dirname(abs));
    if (!entries.includes(path.basename(abs))) {
      const near = entries.find(e => e.toLowerCase() === path.basename(abs).toLowerCase());
      bad.push(`${ref} — case mismatch, on disk it is "${near}" (Vercel is case-sensitive)`);
    }
  }
  if (bad.length) throw new Error('page references assets that will 404 in production:\n  - ' + bad.join('\n  - '));
  return refs;
}

// ── Output ───────────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const ci = argv.indexOf('--clones');
const CLONES = ci > -1 ? parseInt(argv[ci + 1], 10) : 30;
if (!Number.isFinite(CLONES) || CLONES < 0) { console.error('--clones must be a non-negative integer'); process.exit(1); }

const repoRoot = path.join(__dirname, '..');
const GEO_KEYS = Object.keys(GEOS);

/**
 * Delete output this config no longer produces, so the tree is a PURE FUNCTION of GEOS + --clones.
 *
 * Without this, shrinking anything leaves live orphans: turning FR/DE off left PLAY/FR, PLAY/DE and
 * 60 PR50/FR*|DE* folders on disk, still deployed, still serving — pages nobody re-generates, which
 * silently drift from the template and become exactly the RS50/RS1 / FC1 incident this generator's
 * one-md5 rule exists to prevent. A stale geo page is worse than a missing one: it renders fine and
 * walks a door slug the offer no longer sells.
 *
 * Scoped deliberately narrowly — it only ever removes a directory whose name matches this family's
 * own <GEO> or <GEO><n> shape, so it can never reach another offer's folders even though PR50 and
 * PLAY are shared roots.
 */
function prune() {
  const removed = [];
  const rmdir = (p, label) => { fs.rmSync(p, { recursive: true, force: true }); removed.push(label); };

  // Canonical pages: PLAY/<GEO> for a geo we no longer emit.
  const canonRoot = path.join(repoRoot, CANON_DIR);
  if (fs.existsSync(canonRoot)) {
    for (const name of fs.readdirSync(canonRoot)) {
      if (!/^[A-Z]{2}$/.test(name)) continue;                 // leaves index.html and anything else alone
      if (!GEO_KEYS.includes(name)) rmdir(path.join(canonRoot, name), `${CANON_DIR}/${name}`);
    }
  }

  // Clone pools: PR50/<GEO><n> for a dropped geo, or an index above the current --clones.
  const famRoot = path.join(repoRoot, FAMILY);
  if (fs.existsSync(famRoot)) {
    for (const name of fs.readdirSync(famRoot)) {
      const m = /^([A-Z]{2})([0-9]+)$/.exec(name);
      if (!m) continue;
      const [, geo, idx] = m;
      if (!GEO_KEYS.includes(geo) || Number(idx) > CLONES || Number(idx) < 1) {
        rmdir(path.join(famRoot, name), `${FAMILY}/${name}`);
      }
    }
  }
  return removed;
}

let written = 0;

for (const geo of Object.keys(GEOS)) {
  const html = page(geo);
  assertAssetsExist(html);

  const canon = path.join(repoRoot, CANON_DIR, geo);
  fs.mkdirSync(canon, { recursive: true });
  fs.writeFileSync(path.join(canon, 'index.html'), html);
  written++;

  // The bare /PLAY serves the home geo. It is what OVERRIDE_LANDERS `play`/`playful` resolve to
  // and what the admin preview and _links-config.test.mjs read, and it is a URL that has already
  // been handed out — so it keeps working rather than 404ing. Byte-identical to PLAY/<HOME_GEO>.
  // Note ?lg= cannot re-route from here: the path carries no geo segment for the regex to swap,
  // so it no-ops. That is fail-safe (visitor stays on a real page) and real traffic lands on
  // PR50/<GEO>n anyway, where the geo IS in the path.
  if (geo === HOME_GEO) {
    fs.writeFileSync(path.join(repoRoot, CANON_DIR, 'index.html'), html);
    written++;
  }

  for (let n = 1; n <= CLONES; n++) {
    const d = path.join(repoRoot, FAMILY, geo + n);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'index.html'), html);   // same buffer -> one md5 per geo slice
    written++;
  }

  console.log(
    `  ${FAMILY}/${geo}1..${geo}${CLONES}`.padEnd(26),
    `lang=${GEOS[geo].lang}`.padEnd(9),
    `door=${DOOR_SLUG}-${geo.toLowerCase()}`.padEnd(20),
    `cap2=${GEOS[geo].rail2}`
  );
}

const pruned = prune();
if (pruned.length) console.log(`\n  pruned ${pruned.length} stale folder(s) this config no longer emits: ${pruned.slice(0, 6).join(', ')}${pruned.length > 6 ? ` … +${pruned.length - 6} more` : ''}`);

console.log(`\n${written} files written (${GEO_KEYS.length} geos x 1 canonical + ${CLONES} clones, + the bare /${CANON_DIR})`);
