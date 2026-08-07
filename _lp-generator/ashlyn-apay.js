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
 * ── 2026-08-07: SHE REPLACED THE PAGE ────────────────────────────────────────────────────────
 * The first version was a plain 3-question survey with an email box. This is a full marketing page
 * — hero, how-it-works, reward card, FAQ, and the survey in a modal. Same folders, same door slug,
 * so nothing in the database moves: ASHL/US + /ashurl + AH50/US1..US100 -> applepay750-us-ashlyn.
 *
 * ── AGAIN: IT NEVER REACHED THE OFFER ────────────────────────────────────────────────────────
 * Grepping the supplied file for location.href / location.replace / window.open / sprktrax /
 * api/link returns ZERO. The survey ends on "Survey complete! Your $750 Apple Cash reward is being
 * prepared" and a Done button that calls closeSurvey(). The visitor answers three questions, reads
 * that their reward is on its way, and closes the tab. Nothing was ever sent anywhere.
 *
 * That is the second supplied page in a row with this exact shape. It is the FIRST thing to grep.
 *
 * ── AND THE WHOLE PAGE HUNG ON A CDN ─────────────────────────────────────────────────────────
 * It loaded Tailwind from cdn.tailwindcss.com — not a stylesheet but the JIT COMPILER, which
 * generates the CSS in the browser at runtime. If that host is blocked, throttled or slow, the page
 * renders as unstyled HTML on paid traffic. Worse than the jsdelivr import it replaces, because
 * that one only broke the capture; this one breaks the entire visual page.
 *
 * So the CSS is generated ONCE, here, and inlined. `ashlyn-tailwind.css` was harvested by loading
 * her page in headless Chrome with every class token in the file injected into a hidden element, so
 * the JIT emitted the complete sheet — including the states that only exist inside JS template
 * literals (the selected option's `bg-purple-500/30`), which a plain page load never generates.
 * REGENERATE IT (see the header of that file) if her markup ever changes, or new classes will
 * silently render unstyled.
 */
const fs = require('fs');
const path = require('path');

const SOURCE = fs.readFileSync(path.join(__dirname, 'ashlyn-apay-source.html'), 'utf8');
const TAILWIND = fs.readFileSync(path.join(__dirname, 'ashlyn-tailwind.css'), 'utf8');

/** OUR project's anon key. Public by design — RLS is the control. See sprk-lander-lead-capture. */
const SUPABASE_URL = 'https://ecyawhhimmuzryxjnjng.supabase.co';
const OUR_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjeWF3aGhpbW11enJ5eGpuam5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNDU4NjcsImV4cCI6MjA5NDcyMTg2N30.GVKRI32R72B6fXpDyhSZwuXhs5ucHBHpw14_0LVbUXs';

const CANON_DIR = 'ASHL';
const FAMILY    = 'AH50';
const GEO       = 'US';
const VANITY    = 'ashurl';
const PAGE_TAG  = 'ashlyn-apay-survey-v2';   // survey_responses.page, so rows are attributable

/** Must equal the slug on her landing_pages row, or the click dies at the door — silently. */
const DOOR_SLUG = 'applepay750-us-ashlyn';
const DOOR = `https://sprktrax.org/api/link/${DOOR_SLUG}`;

/** Claims in her copy that nothing in our possession substantiates. Printed on every run. */
const CONCERNS = [
  ['2.4M+', 'invented statistic — "Surveys completed". No source, and not a figure we hold.'],
  ['$8.1M', 'invented statistic — "Apple Cash paid out".'],
  ['4.9/5', 'invented statistic — "User rating". No platform, no review count.'],
  ["Join millions who've turned a quick survey into real rewards",
   'the same invented scale restated as a closing line.'],
  ['Apple Cash is sent straight to your Wallet — instantly',
   'a delivery-time guarantee. The offer\'s own flow requires completing sponsor deals first; '
   + '"instantly" is not something we can stand behind.'],
  ['Most rewards are delivered instantly to your Apple Wallet',
   'same guarantee in the FAQ.'],
  ['Confirm the Apple ID where your Apple Cash should land',
   'describes a step this funnel does not perform. Nothing on the page or at the offer asks for '
   + 'an Apple ID.'],
  ['•••• 4291', 'a mock card number, beside an Apple mark, on a page that also shows a $750 balance.'],
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

  // ── 1. Tailwind: generated once, inlined. No CDN on the page at all. ───────────────────────
  h = sub(h, '    <script src="https://cdn.tailwindcss.com"></script>\n', '');
  h = sub(h, `    <script>
      tailwind.config = {
        theme: {
          extend: {
            colors: {
              ink: "#0a0118",
            },
          },
        },
      };
    </script>
`, `    <!-- Tailwind, compiled ahead of time and inlined. This page previously pulled the Tailwind
         Play CDN, which is the JIT COMPILER rather than a stylesheet: the CSS was generated in the
         visitor's browser on every load, so a blocked or slow CDN meant unstyled HTML on paid
         traffic. Regenerate _lp-generator/ashlyn-tailwind.css if the markup changes — see its
         header for how, and why a plain page load is not enough. -->
    <style>
${TAILWIND}
    </style>
`);
  never(h, 'cdn.tailwindcss.com', 'the JIT compiler must not sit on the render path');
  never(h, 'tailwind.config', 'the runtime config goes with the CDN script');

  // ── 2. Scaffold leftovers ──────────────────────────────────────────────────────────────────
  h = sub(h, '<meta property="og:image" content="https://bolt.new/static/og_default.png">',
             '<meta property="og:image" content="https://www.tokrwd.co/images/playful-rewards-logo.png">');
  h = sub(h, '<meta name="twitter:image" content="https://bolt.new/static/og_default.png">',
             '<meta name="twitter:image" content="https://www.tokrwd.co/images/playful-rewards-logo.png">');
  never(h, 'bolt.new', 'the Bolt scaffold defaults must not ship');

  // "This is a demo landing page." is scaffold text, not her message — the same class of leftover
  // as the Bolt og:image. It would tell a live visitor, and any ad reviewer, that the page is fake.
  // The Apple trademark disclaimer beside it is real and stays.
  h = sub(h, `          This is a demo landing page. Apple, Apple Pay, and Apple Cash are
          trademarks of Apple Inc. Not affiliated with or endorsed by Apple.`,
             `          Apple, Apple Pay, and Apple Cash are trademarks of Apple Inc. This promotion is not
          affiliated with, sponsored by, or endorsed by Apple. Reward requires completing the
          advertiser's offer requirements.
          <br><a href="/Rewards/terms" class="underline">Terms</a> &middot;
          <a href="/Rewards/privacy" class="underline">Privacy</a>`);
  never(h, 'demo landing page', 'scaffold text that tells the visitor the page is fake');

  // ── 3. The door + capture, injected above her SURVEY_STEPS ─────────────────────────────────
  const wiringAnchor = '      const SURVEY_STEPS = [';
  const wiring = `      // ---- Outbound: the SPRK tracking DOOR ----
      // Her page had NO outbound link of any kind. The survey ended on "Survey complete!" and a
      // Done button that closed the modal, so the visitor never reached the offer and the click was
      // paid for and wasted. The door mints the click_id, freezes the owner at click time, stamps
      // the outbound subid wire and 302s to the real URL, which never appears in this page.
      const DOOR = ${JSON.stringify(DOOR)};

      // Carry EVERY incoming param through (s1=<SPK>, s2 publisher, s3 ad account, ttclid).
      const doorQ = new URLSearchParams(location.search);
      if (!doorQ.get('s1') && doorQ.get('campid')) doorQ.set('s1', doorQ.get('campid'));
      if (!doorQ.get('s1')) {
        const mc = doorQ.get('mc_attr') || '', f = {};
        mc.split('..').forEach((kv) => { const i = kv.indexOf('='); if (i > 0) f[kv.slice(0, i)] = kv.slice(i + 1); });
        const d = f.e || f.c; if (d) doorQ.set('s1', d);
      }
      function offerUrl() {
        // s1 LAST — ad automations append to the tail. campid/lg route the lander, not the network.
        const out = new URLSearchParams(doorQ.toString());
        out.delete('s1'); out.delete('campid'); out.delete('lg');
        const qs = out.toString(), s1 = doorQ.get('s1') || '';
        let url = DOOR + (qs ? '?' + qs : '');
        if (s1) url += (qs ? '&' : '?') + 's1=' + encodeURIComponent(s1);
        return url;
      }

      // ---- Lead capture, into OUR project ----
      // Write-only by construction: anon holds INSERT + UPDATE and can read only \`id\`, so the key
      // embedded here cannot be used to read a single answer back. See sprk-lander-lead-capture.
      const SB_REST = ${JSON.stringify(SUPABASE_URL + '/rest/v1/survey_responses')};
      const SB_HEADERS = {
        'apikey': ${JSON.stringify(OUR_ANON_KEY)},
        'Authorization': 'Bearer ' + ${JSON.stringify(OUR_ANON_KEY)},
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      };
      // A HARD budget. The hand-off must never wait on the network: a capture that HANGS costs a
      // paid click, which is worse than a capture that fails. Same reasoning as api/_lib/kv.js.
      const SB_TIMEOUT_MS = 2000;
      let leadSent = false;
      function captureLead(finalAnswers) {
        if (leadSent) return Promise.resolve();
        leadSent = true;
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), SB_TIMEOUT_MS);
        return fetch(SB_REST, {
          method: 'POST', headers: SB_HEADERS, signal: ac.signal,
          body: JSON.stringify({
            id: (crypto.randomUUID ? crypto.randomUUID()
              : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                  const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
                })),
            page: ${JSON.stringify(PAGE_TAG)},
            reward: 'applepay750us',
            answers: finalAnswers,
            // The attribution wire, so a lead ties back to the affiliate and creative behind it.
            s1: doorQ.get('s1') || null,
            s2: doorQ.get('s2') || null,
            s3: doorQ.get('s3') || null,
            ttclid: doorQ.get('ttclid') || null,
            completed: true,
          }),
        }).then((r) => { if (!r.ok) return r.text().catch(() => '').then((b) => console.error('lead capture failed:', r.status, b)); })
          .catch((e) => console.error('lead capture failed:', e))
          .finally(() => clearTimeout(t));
      }

      // The single hand-off. Fires the capture, then goes — never the other way round, and never
      // waiting on it. \`once\` guards the double-fire when the auto-redirect and a tap race.
      let handedOff = false;
      function goToOffer() {
        if (handedOff) return;
        handedOff = true;
        try { captureLead(answers); } catch (e) { console.error(e); }
        window.location.href = offerUrl();
      }

${wiringAnchor}`;
  h = sub(h, wiringAnchor, wiring);

  // ── 4. The completion screen hands off instead of dead-ending ──────────────────────────────
  h = sub(h, `              <button onclick="closeSurvey()" class="mt-6 w-full rounded-full bg-white px-6 py-3 font-semibold text-purple-950 transition hover:bg-purple-100">
                Done
              </button>`,
             `              <button onclick="goToOffer()" class="mt-6 w-full rounded-full bg-white px-6 py-3 font-semibold text-purple-950 transition hover:bg-purple-100">
                Continue
              </button>`);

  // Auto-advance too, so a visitor who reads the screen and does nothing still reaches the offer.
  // Both paths funnel through goToOffer(), which is idempotent.
  h = sub(h, `          `.repeat(0) + `          return;
        }

        const step = SURVEY_STEPS[stepIndex];`,
             `          // The click is never lost: whether they tap Continue or simply sit here, the hand-off
          // runs. Her original ended on this screen with a button that closed the modal.
          setTimeout(goToOffer, 1800);
          return;
        }

        const step = SURVEY_STEPS[stepIndex];`);

  // ── 5. Shared ttclid backfill ──────────────────────────────────────────────────────────────
  h = sub(h, '</body>',
    '<!-- Shared ttclid backfill: fills an empty ttclid from the _ttclid cookie and tags tracker\n'
    + '     anchors. sprktrax.org is in its allowlist, so the door forwards it into the postback. -->\n'
    + '<script src="/js/ttclid.js" async></script>\n</body>');

  // ── Invariants ─────────────────────────────────────────────────────────────────────────────
  must(h, DOOR, 1);
  must(h, 'function goToOffer()', 1);
  must(h, 'window.location.href = offerUrl();', 1);
  must(h, 'onclick="goToOffer()"', 1);
  must(h, 'setTimeout(goToOffer, 1800)', 1);
  must(h, SUPABASE_URL, 1);
  must(h, OUR_ANON_KEY, 2);                       // apikey + Authorization
  must(h, 'AbortController', 1);
  must(h, 'id="surveyModal"', 1);
  never(h, 'closeSurvey()" class="mt-6 w-full', 'the completion button must hand off, not close');

  // No cloaking, same bar as every other page here.
  for (const [pat, why] of [
    ['x-safari', 'scheme-jump breakout belongs only in pre/index.html + js/breakout.js'],
    ['intent://', 'Android breakout belongs only in the prelander'],
    ['__SUBID_OK', 'the blank-page SubID gate'],
    ['document.write', 'the blank-page cloak gate'],
    ['display:none!important', 'the blank-page cloak signature'],
    ['musical_ly', 'in-app UA sniffing'],
  ]) never(h, pat, why);

  // ── The emitted script must actually PARSE ─────────────────────────────────────────────────
  // Every assertion above is a STRING test, and no string test can tell that the JavaScript stopped
  // parsing. A mangled escape once shipped `//0$/` — a SyntaxError that killed the whole module, on
  // a page that looked perfect until clicked. Parse it here instead of finding out live.
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
// through a rewrite where s1 can be lost. It carries no slot number, so it is ONE shared URL and
// the numbered fan-out's anti-flag property does not apply. Fine for one affiliate on her own link.
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
