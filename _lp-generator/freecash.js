#!/usr/bin/env node
/**
 * Freecash per-geo lander generator.
 *
 *   node _lp-generator/freecash.js --clones 30
 *
 * WHY THIS IS SEPARATE FROM build.js
 * The sweep offers (Shein/Sephora/Cash/ApplePay/UberEats) share one generic template. Freecash does
 * NOT: /50FC/FC1 is a specific, proven-converting page — ticker, live counter, rating pill, offer
 * card, stats row, sticky store buttons, quick-tip interstitial — and Migi has confirmed it compliant
 * with Ricky directly. So this generator does not re-design anything. It takes that exact page as a
 * literal template (_lp-generator/freecash-template.html, a byte copy of the approved 50FC/FC1) and
 * swaps ONLY: the language strings, the <html lang>, the flag, the ticker names, the number locale,
 * and the door slug. Layout, CSS, markup and behaviour are byte-identical to the approved page.
 *
 * MONEY IS DELIBERATELY LEFT IN USD.
 * $1,250-$1,500, $11.60, $50M+, $0 are NOT converted to local currency. Freecash pays out in USD via
 * PayPal / Visa / crypto, so USD is the truthful figure; converting would mean inventing an exchange
 * rate and publishing an earnings number nobody verified, which is exactly the kind of claim that
 * gets an ad pulled. If Migi wants localised amounts he supplies the numbers and they go in AMOUNTS.
 *
 * Every replacement below is ASSERTED. If the approved template is ever edited so a source string no
 * longer matches, this throws instead of silently emitting an English page into a Japanese slot.
 */
const fs = require('fs');
const path = require('path');

const TEMPLATE = fs.readFileSync(path.join(__dirname, 'freecash-template.html'), 'utf8');

const OFFER_ID_SLUG = 'freecash';          // door slug is <this>-<geo>
const FAMILY = '50FC';                     // clones land beside the legacy FC1..FC50
const CANON_DIR = 'FCASH';                 // canonical page per geo

// geo -> locale. AT runs the German page; CA/GB run English. Freecash sells in exactly these seven.
const GEOS = {
  US: { lang: 'en', numLocale: 'en-US', flag: '🇺🇸' },
  GB: { lang: 'en', numLocale: 'en-GB', flag: '🇬🇧' },
  CA: { lang: 'en', numLocale: 'en-CA', flag: '🇨🇦' },
  JP: { lang: 'ja', numLocale: 'ja-JP', flag: '🇯🇵' },
  DE: { lang: 'de', numLocale: 'de-DE', flag: '🇩🇪' },
  AT: { lang: 'de', numLocale: 'de-AT', flag: '🇦🇹' },
  NL: { lang: 'nl', numLocale: 'nl-NL', flag: '🇳🇱' },
};

// Ticker names, localised so a Japanese page does not scroll American first names past the reader.
const NAMES = {
  en: ['Devon L.', 'Marcus T.', 'Ava R.', 'Jordan P.', 'Chloe M.', 'Ethan W.', 'Sofia D.', 'Liam K.'],
  ja: ['田中 K.', '佐藤 M.', '鈴木 A.', '高橋 Y.', '渡辺 S.', '伊藤 H.', '山本 R.', '中村 T.'],
  de: ['Lukas M.', 'Anna S.', 'Jonas W.', 'Lena K.', 'Felix B.', 'Marie H.', 'Paul R.', 'Emma T.'],
  nl: ['Daan V.', 'Sanne B.', 'Lars J.', 'Emma D.', 'Sem K.', 'Julia M.', 'Finn P.', 'Noor H.'],
};

const T = {
  en: {
    title: 'Get paid to play',
    tickerEarned: 'just earned', tickerPaid: 'paid instantly',
    reviews: '(50K+ reviews)',
    head1: 'Get Paid For', head2: 'Screen Time',
    sub: 'Earn real cash playing games, completing tasks, and testing apps. Cash out anytime &mdash; no minimum.',
    earningNow: 'people earning right now',
    offerTitle: '10 games paying over thousands!',
    offerDesc: 'The highest-paying games on Freecash right now.',
    payoutLabel: 'TOP OFFER &middot; TOTAL PAYOUT',
    payoutNote: 'Paid out over about a month of daily play (~4&nbsp;hrs/day). It\'s the highest offer &mdash; most people earn less, and results vary.',
    howItWorks: 'HOW IT WORKS',
    step1: 'Sign up on Freecash (select 21+)',
    step2: 'Download one app and play 15 minutes to unlock Block Blast, Subway Surfers, &amp; More!',
    step3: 'Withdraw via PayPal, Visa, or Crypto',
    statPaid: 'PAID OUT', statRating: 'APP RATING', statJoin: 'TO JOIN',
    disclaimer: 'Availability, rewards, and eligibility may vary by user, location, and completed activity. Results are not guaranteed and are based on individual participation. Earnings vary by offer.',
    privacy: 'Privacy Policy', terms: 'Terms of Service',
    available: 'Available now on iOS and Android',
    getItOn: 'Get it on', downloadOn: 'Download on the',
    tipLabel: 'QUICK TIP',
    tipHead1: 'Select ', tipHead2: ' when you sign&nbsp;up',
    tipSub: 'This unlocks the highest-paying game offers on Freecash. Don\'t skip this step.',
    tipBtn: 'Got it &rarr;',
  },
  ja: {
    title: '遊んで稼ぐ',
    tickerEarned: 'さんが獲得', tickerPaid: '即時支払い',
    reviews: '（5万件以上のレビュー）',
    head1: 'スマホ時間を', head2: 'お金に変える',
    sub: 'ゲームやタスク、アプリのお試しで現金を獲得。いつでも出金でき、最低金額はありません。',
    earningNow: '人が現在稼いでいます',
    offerTitle: '高額報酬のゲーム10選！',
    offerDesc: 'Freecashで今もっとも稼げるゲーム。',
    payoutLabel: 'トップ案件 &middot; 合計報酬',
    payoutNote: '毎日約4時間、1か月ほどのプレイで支払われます。これは最高額の案件で、多くの方はこれより少なく、結果は人により異なります。',
    howItWorks: 'ご利用の流れ',
    step1: 'Freecashに登録（21+ を選択）',
    step2: 'アプリを1つダウンロードして15分プレイすると、Block Blast、Subway Surfers などが解除されます！',
    step3: 'PayPal、Visa、暗号資産で出金',
    statPaid: '支払総額', statRating: 'アプリ評価', statJoin: '参加費用',
    disclaimer: '提供状況・報酬・参加資格は、ユーザー、地域、完了した活動によって異なる場合があります。結果は保証されるものではなく、個人の取り組みに基づきます。報酬は案件ごとに異なります。',
    privacy: 'プライバシーポリシー', terms: '利用規約',
    available: 'iOS・Android で今すぐ利用可能',
    getItOn: 'アプリを入手', downloadOn: 'ダウンロード',
    tipLabel: 'ワンポイント',
    tipHead1: '登録時に ', tipHead2: ' を選択',
    tipSub: 'これでFreecashの最も高額なゲーム案件が解除されます。この手順を飛ばさないでください。',
    tipBtn: '了解 &rarr;',
  },
  de: {
    title: 'Spielen und Geld verdienen',
    tickerEarned: 'hat gerade', tickerPaid: 'sofort ausgezahlt',
    reviews: '(50.000+ Bewertungen)',
    head1: 'Verdiene Geld mit', head2: 'Bildschirmzeit',
    sub: 'Verdiene echtes Geld mit Spielen, Aufgaben und dem Testen von Apps. Jederzeit auszahlbar &mdash; ohne Mindestbetrag.',
    earningNow: 'Personen verdienen gerade',
    offerTitle: '10 Spiele mit Auszahlungen in Tausendenh&ouml;he!',
    offerDesc: 'Die derzeit bestbezahlten Spiele auf Freecash.',
    payoutLabel: 'TOP-ANGEBOT &middot; GESAMTAUSZAHLUNG',
    payoutNote: 'Ausgezahlt &uuml;ber etwa einen Monat t&auml;glichen Spielens (~4&nbsp;Std./Tag). Das ist das h&ouml;chste Angebot &mdash; die meisten verdienen weniger, und die Ergebnisse variieren.',
    howItWorks: 'SO FUNKTIONIERT ES',
    step1: 'Bei Freecash registrieren (21+ ausw&auml;hlen)',
    step2: 'Lade eine App herunter und spiele 15 Minuten, um Block Blast, Subway Surfers &amp; mehr freizuschalten!',
    step3: 'Auszahlung per PayPal, Visa oder Krypto',
    statPaid: 'AUSGEZAHLT', statRating: 'APP-BEWERTUNG', statJoin: 'ZUM BEITRETEN',
    disclaimer: 'Verf&uuml;gbarkeit, Pr&auml;mien und Teilnahmeberechtigung k&ouml;nnen je nach Nutzer, Standort und abgeschlossener Aktivit&auml;t variieren. Ergebnisse sind nicht garantiert und beruhen auf der individuellen Teilnahme. Die Verdienste variieren je nach Angebot.',
    privacy: 'Datenschutz', terms: 'AGB',
    available: 'Jetzt f&uuml;r iOS und Android verf&uuml;gbar',
    getItOn: 'Jetzt bei', downloadOn: 'Laden im',
    tipLabel: 'KURZER TIPP',
    tipHead1: 'W&auml;hle bei der Anmeldung ', tipHead2: '',
    tipSub: 'Damit schaltest du die bestbezahlten Spielangebote auf Freecash frei. &Uuml;berspringe diesen Schritt nicht.',
    tipBtn: 'Verstanden &rarr;',
  },
  nl: {
    title: 'Spelen en geld verdienen',
    tickerEarned: 'heeft net', tickerPaid: 'direct uitbetaald',
    reviews: '(50K+ beoordelingen)',
    head1: 'Verdien geld met', head2: 'Schermtijd',
    sub: 'Verdien echt geld met games, taken en het testen van apps. Altijd uitbetalen &mdash; geen minimum.',
    earningNow: 'mensen verdienen nu',
    offerTitle: '10 games die duizenden uitbetalen!',
    offerDesc: 'De best betalende games op Freecash op dit moment.',
    payoutLabel: 'TOPAANBOD &middot; TOTALE UITBETALING',
    payoutNote: 'Uitbetaald over ongeveer een maand dagelijks spelen (~4&nbsp;uur/dag). Dit is het hoogste aanbod &mdash; de meeste mensen verdienen minder en resultaten vari&euml;ren.',
    howItWorks: 'ZO WERKT HET',
    step1: 'Meld je aan bij Freecash (kies 21+)',
    step2: 'Download &eacute;&eacute;n app en speel 15 minuten om Block Blast, Subway Surfers &amp; meer vrij te spelen!',
    step3: 'Uitbetalen via PayPal, Visa of crypto',
    statPaid: 'UITBETAALD', statRating: 'APP-BEOORDELING', statJoin: 'OM MEE TE DOEN',
    disclaimer: 'Beschikbaarheid, beloningen en geschiktheid kunnen vari&euml;ren per gebruiker, locatie en voltooide activiteit. Resultaten zijn niet gegarandeerd en zijn gebaseerd op individuele deelname. Verdiensten vari&euml;ren per aanbod.',
    privacy: 'Privacybeleid', terms: 'Servicevoorwaarden',
    available: 'Nu beschikbaar voor iOS en Android',
    getItOn: 'Ontdek het op', downloadOn: 'Download in de',
    tipLabel: 'SNELLE TIP',
    tipHead1: 'Kies ', tipHead2: ' bij het aanmelden',
    tipSub: 'Hiermee ontgrendel je de best betalende gameaanbiedingen op Freecash. Sla deze stap niet over.',
    tipBtn: 'Begrepen &rarr;',
  },
};

/** Replace `from` with `to` exactly `count` times, throwing if the count does not match. */
function sub(html, from, to, count = 1) {
  const parts = html.split(from);
  if (parts.length - 1 !== count) {
    throw new Error(`freecash template: expected ${count} occurrence(s) of ${JSON.stringify(from.slice(0, 70))}, found ${parts.length - 1}`);
  }
  return parts.join(to);
}

function page(geo) {
  const g = GEOS[geo];
  const t = T[g.lang];
  let h = TEMPLATE;

  // ── language + document ────────────────────────────────────────────────────────────────────
  h = sub(h, '<html lang="en">', `<html lang="${g.lang}" data-geo="${geo}">`);
  h = sub(h, '<title>Get paid to play</title>', `<title>${t.title}</title>`);

  // ── ?lg=<GEO> geo selector, injected into <head> ────────────────────────────────────────────
  // Placed in the HEAD, before the body renders and before the offer script wires the CTA. That
  // ordering is load-bearing: the code-review found that running this late leaves a window where a
  // fast tap fires the CTA on the WRONG geo's door, and it also causes a visible flash of the wrong
  // language. Running first means the redirect happens before anything is painted or clickable.
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

  // ── door slug: ONE PER GEO. The landing_pages row for this geo carries landing_pages.geo, and
  //    api/link/[slug].js resolves the per-geo Monetise link from it. A shared slug would put
  //    every language back on one row with one geo, i.e. back on the US offer.
  h = sub(h, "var DOOR = 'https://sprktrax.org/api/link/freecash';",
             `var DOOR = 'https://sprktrax.org/api/link/${OFFER_ID_SLUG}-${geo.toLowerCase()}';`);

  // lg routes the lander only; it must never reach the door or the network.
  h = sub(h, "var url = DOOR + '?' + q.toString();",
             "q.delete('lg'); var url = DOOR + '?' + q.toString();");

  // ── ticker (static first render) ───────────────────────────────────────────────────────────
  h = sub(h,
    '&#127482;&#127480; <span class="name">Devon L.</span> just earned <span class="amt">$11.60</span> &mdash; paid instantly',
    `${g.flag} <span class="name">${NAMES[g.lang][0]}</span> ${t.tickerEarned} <span class="amt">$11.60</span> &mdash; ${t.tickerPaid}`);

  // ── ticker (JS: names, flag, phrasing) ─────────────────────────────────────────────────────
  h = sub(h,
    "var names = ['Devon L.','Marcus T.','Ava R.','Jordan P.','Chloe M.','Ethan W.','Sofia D.','Liam K.'];",
    `var names = [${NAMES[g.lang].map((n) => `'${n}'`).join(',')}];`);
  h = sub(h,
    "el.innerHTML = '\\u{1F1FA}\\u{1F1F8} <span class=\"name\">'+r.name+'</span> just earned <span class=\"amt\">$'+r.amt+'</span> — paid instantly';",
    `el.innerHTML = '${g.flag} <span class="name">'+r.name+'</span> ${t.tickerEarned} <span class="amt">$'+r.amt+'</span> — ${t.tickerPaid}';`);

  // ── live counter number formatting ─────────────────────────────────────────────────────────
  h = sub(h, "el.textContent = n.toLocaleString('en-US');", `el.textContent = n.toLocaleString('${g.numLocale}');`);

  // ── hero ───────────────────────────────────────────────────────────────────────────────────
  h = sub(h, '<span class="rev">(50K+ reviews)</span>', `<span class="rev">${t.reviews}</span>`);
  h = sub(h, '<h1 class="headline">Get Paid For<span class="g">Screen Time</span></h1>',
             `<h1 class="headline">${t.head1}<span class="g">${t.head2}</span></h1>`);
  h = sub(h, 'Earn real cash playing games, completing tasks, and testing apps. Cash out anytime &mdash; no minimum.', t.sub);
  h = sub(h, '&nbsp;people earning right now', `&nbsp;${t.earningNow}`);

  // ── offer card ─────────────────────────────────────────────────────────────────────────────
  h = sub(h, '10 games paying over thousands!', t.offerTitle);
  h = sub(h, 'The highest-paying games on Freecash right now.', t.offerDesc);
  h = sub(h, 'TOP OFFER &middot; TOTAL PAYOUT', t.payoutLabel);
  h = sub(h, "Paid out over about a month of daily play (~4&nbsp;hrs/day). It's the highest offer &mdash; most people earn less, and results vary.", t.payoutNote);

  // ── how it works ───────────────────────────────────────────────────────────────────────────
  h = sub(h, '>HOW IT WORKS<', `>${t.howItWorks}<`);
  h = sub(h, 'Sign up on Freecash (select 21+)', t.step1);
  h = sub(h, 'Download one app and play 15 minutes to unlock Block Blast, Subway Surfers, &amp; More!', t.step2);
  h = sub(h, 'Withdraw via PayPal, Visa, or Crypto', t.step3);

  // ── stats + legal ──────────────────────────────────────────────────────────────────────────
  h = sub(h, '>PAID OUT<', `>${t.statPaid}<`);
  h = sub(h, '>APP RATING<', `>${t.statRating}<`);
  h = sub(h, '>TO JOIN<', `>${t.statJoin}<`);
  h = sub(h, 'Availability, rewards, and eligibility may vary by user, location, and completed activity. Results are not guaranteed and are based on individual participation. Earnings vary by offer.', t.disclaimer);
  h = sub(h, '>Privacy Policy<', `>${t.privacy}<`);
  h = sub(h, '>Terms of Service<', `>${t.terms}<`);

  // ── sticky footer ──────────────────────────────────────────────────────────────────────────
  h = sub(h, 'Available now on iOS and Android', t.available);
  h = sub(h, '<small>Get it on</small>', `<small>${t.getItOn}</small>`);
  h = sub(h, '<small>Download on the</small>', `<small>${t.downloadOn}</small>`);

  // ── quick-tip interstitial ─────────────────────────────────────────────────────────────────
  h = sub(h, '>QUICK TIP<', `>${t.tipLabel}<`);
  h = sub(h, 'Select <span class="g">21+</span> when you sign&nbsp;up',
             `${t.tipHead1}<span class="g">21+</span>${t.tipHead2}`);
  h = sub(h, "This unlocks the highest-paying game offers on Freecash. Don't skip this step.", t.tipSub);
  h = sub(h, '>Got it &rarr;<', `>${t.tipBtn}<`);

  return h;
}

// ── Output ───────────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const ci = argv.indexOf('--clones');
const CLONES = ci > -1 ? parseInt(argv[ci + 1], 10) : 30;
if (!Number.isFinite(CLONES) || CLONES < 0) { console.error('--clones must be a non-negative integer'); process.exit(1); }

const repoRoot = path.join(__dirname, '..');
let written = 0;
for (const geo of Object.keys(GEOS)) {
  const html = page(geo);

  const canon = path.join(repoRoot, CANON_DIR, geo);
  fs.mkdirSync(canon, { recursive: true });
  fs.writeFileSync(path.join(canon, 'index.html'), html);
  written++;

  for (let n = 1; n <= CLONES; n++) {
    const d = path.join(repoRoot, FAMILY, geo + n);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'index.html'), html);   // same buffer -> one md5 per geo
    written++;
  }
  console.log(
    `  ${FAMILY}/${geo}1..${geo}${CLONES}`.padEnd(24),
    `lang=${GEOS[geo].lang}`.padEnd(9),
    `door=${OFFER_ID_SLUG}-${geo.toLowerCase()}`
  );
}
console.log(`\n${written} files written (7 geos x 1 canonical + ${CLONES} clones) from the approved 50FC/FC1 design`);
