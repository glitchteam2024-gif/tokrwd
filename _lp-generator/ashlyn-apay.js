#!/usr/bin/env node
/**
 * ASHLYN'S Apple Pay $750 survey lander — an OPERATOR-SUPPLIED design, wired onto our door.
 *
 *   node _lp-generator/ashlyn-apay.js --clones 100
 *
 * Same pattern as _lp-generator/sammy-acash.js: her file is saved BYTE-FOR-BYTE as
 * `ashlyn-apay-source.html`, and this generator applies only ASSERTED patches on top, so her design
 * survives intact and re-running is deterministic. See .claude/skills/sprk-custom-landers.
 *
 * ── THE ONE THING THAT MADE THIS PAGE UNRUNNABLE ─────────────────────────────────────────────
 *
 * IT NEVER REACHED THE OFFER. Not a broken link — there was no link. Her funnel is
 *
 *     q1 -> q2 -> q3 -> activating -> email -> "You're all set!"
 *
 * and "You're all set!" is the end. Grepping the source for location.href / location.replace /
 * window.open / sprktrax / api/link returns NOTHING. A visitor answered three questions, handed over
 * their email, read "Check your email for the next steps", and closed the tab. Ashlyn would have
 * paid for every one of those clicks and earned nothing on any of them, and every dashboard would
 * have looked normal — clicks in, zero conversions, no error anywhere.
 *
 * So the email step now hands off to the SPRK door. That is the only structural change.
 *
 * ── AND THE THING THAT WOULD HAVE EATEN CLICKS QUIETLY ───────────────────────────────────────
 *
 * Her submit handler `return`s on a Supabase error, leaving the visitor on the email screen. With
 * the door wired in that would mean an outage in a THIRD-PARTY database silently costing us paid
 * clicks. The hand-off is therefore best-effort-then-go: the write is attempted, its outcome is
 * logged, and the visitor is sent to the door either way. A lead we failed to record is a bad day;
 * a paid click that never reached the offer is money already spent.
 *
 * ── WHAT IS NOT CHANGED, AND WHAT YOU ARE BEING TOLD ABOUT EVERY RUN ─────────────────────────
 *
 * `jjdpumaccvbsktotcwgc.supabase.co` IS NOT OUR SUPABASE PROJECT (ours is ecyawhhimmuzryxjnjng).
 * Every visitor's EMAIL ADDRESS and survey answers are inserted into that outside project, from a
 * page served on www.tokrwd.co, using an anon key embedded in the page. This generator does not
 * remove it — it is her funnel and the operator's call — but it prints it on every run, the same
 * way _tracking-audit.test.mjs prints its EXCEPTIONS, so it cannot quietly become permanent.
 *
 * Worth knowing before deciding: we cannot see that project, cannot delete from it, and cannot
 * answer a data request about it. The privacy policy the page links to is uplevelrewards', not ours.
 *
 * The claim copy is hers and unedited. Several lines are specific and checkable — "customers who
 * received a $500 Reward only spent around $15", "within 6-10 days of registration" — which is
 * BETTER than an invented round number, provided the network stands behind them. They read as
 * lifted from UpLevel's own disclosures; confirm that before spend.
 */
const fs = require('fs');
const path = require('path');

const SOURCE = fs.readFileSync(path.join(__dirname, 'ashlyn-apay-source.html'), 'utf8');

/** OUR project's anon key. Public by design — RLS is the control, see the patch below. */
const OUR_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjeWF3aGhpbW11enJ5eGpuam5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNDU4NjcsImV4cCI6MjA5NDcyMTg2N30.GVKRI32R72B6fXpDyhSZwuXhs5ucHBHpw14_0LVbUXs';

const CANON_DIR = 'ASHL';                 // ASHL/US/index.html
const FAMILY    = 'AH50';                 // AH50/US1..US100 — one clone per affiliate slot
const GEO       = 'US';
const VANITY    = 'ashurl';               // /ashurl — Migi's naming, matching Sammy's /sasurl

/**
 * WHICH DOOR THIS PAGE FIRES.
 *
 * Must equal the `slug` on the landing_pages row created for her, or the click dies at the door —
 * silent from the page's side. Apple Pay $750 US already has three house designs
 * (applepay750-us / -b / -c); hers is a FOURTH, so it gets its own slug and its own reporting.
 */
const DOOR_SLUG = 'applepay750-us-ashlyn';
const DOOR = `https://sprktrax.org/api/link/${DOOR_SLUG}`;

/** Things in her page nothing in our possession substantiates or controls. Printed every run. */
const CONCERNS = [
  ['jjdpumaccvbsktotcwgc.supabase.co',
   'NOT our Supabase project. Visitor EMAIL + survey answers are written into an outside database '
   + 'from a page on www.tokrwd.co. We cannot read it, delete from it, or answer a data request '
   + 'about it. DECIDE: keep, point at our own project, or drop the capture.'],
  ['cdn.jsdelivr.net',
   'the Supabase JS client is loaded from a third-party CDN at runtime. If jsdelivr is blocked or '
   + 'down the module import throws, and with it every listener registered after it — including the '
   + 'door hand-off. Self-host it under /js/ to remove that dependency from the money path.'],
  ['fonts.googleapis.com',
   'Google Fonts, loaded per visitor. Cosmetic, but it is a third-party request on a paid-traffic '
   + 'page and an EU-visitor question. Self-host the woff2 if that matters.'],
  ['bolt.new/static/og_default.png',
   'the og:image is still the Bolt scaffold default — link previews of her page show Bolt branding.'],
  ['spent around $15',
   'a specific spend figure. Better than an invented round number IF UpLevel publishes it — '
   + 'confirm it is theirs before running traffic.'],
  ['within 6-10 days of registration',
   'a specific delivery window, same caveat as above.'],
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
  if (n !== count) throw new Error(`ashlyn-apay-source.html: expected ${count} x ${JSON.stringify(needle.slice(0, 60))}, found ${n}`);
}
function never(html, needle, why) {
  if (html.includes(needle)) throw new Error(`emitted page must not contain ${JSON.stringify(needle)} — ${why}`);
}

function page() {
  let h = SOURCE;

  // ── The door builder, injected just above her state object ─────────────────────────────────
  const stateAnchor = `      const state = { step: 'q1', answers: {}, recordId: null, submitting: false };`;
  const wiring = `      // ---- Outbound: the SPRK tracking DOOR ----
      // Her page had NO outbound link of any kind — the funnel ended on "You're all set!" and the
      // visitor never reached the offer. The door mints the click_id, freezes the owner at click
      // time, stamps the outbound subid wire and 302s to the real Apple Pay URL, which lives in the
      // offer row and never appears in this page's source.
      const DOOR = "${DOOR}";

      // Carry EVERY incoming param through (s1=<SPK> per-creative, s2 publisher, s3 ad account,
      // ttclid). Her getQueryParam() read only Flow and affsecid, and only to store them.
      const doorQ = new URLSearchParams(location.search);

      // campid is the Carrd/Spartis name for the same value — promote it when s1 is absent.
      if (!doorQ.get('s1') && doorQ.get('campid')) doorQ.set('s1', doorQ.get('campid'));

      // mc_attr fallback (e=<spark> .. c=<code>). If neither exists s1 stays EMPTY — never
      // fabricated; the door 404s an untagged click by design, and that is the real gate.
      if (!doorQ.get('s1')) {
        const mc = doorQ.get('mc_attr') || '', f = {};
        mc.split('..').forEach((kv) => { const i = kv.indexOf('='); if (i > 0) f[kv.slice(0, i)] = kv.slice(i + 1); });
        const d = f.e || f.c; if (d) doorQ.set('s1', d);
      }

      function offerUrl() {
        // s1 LAST — ad automations append to the tail. campid is a lander-side alias, not a network
        // param, and lg routes the lander only.
        const out = new URLSearchParams(doorQ.toString());
        out.delete('s1'); out.delete('campid'); out.delete('lg');
        const qs = out.toString(), s1 = doorQ.get('s1') || '';
        let url = DOOR + (qs ? '?' + qs : '');
        if (s1) url += (qs ? '&' : '?') + 's1=' + encodeURIComponent(s1);
        return url;
      }

      // pendingInsert added: the lead insert is fired without being awaited, and the submit handler
      // has to be able to wait on it. See createRecord / handleSubmitEmail below.
      const state = { step: 'q1', answers: {}, recordId: null, submitting: false, pendingInsert: null };`;
  h = sub(h, stateAnchor, wiring);

  // ── The email step hands off to the door instead of dead-ending ────────────────────────────
  const oldSubmit = `        const { error } = await supabase.from('survey_responses').update({ email, completed: true }).eq('id', state.recordId);
        state.submitting = false;
        $('continueBtn').disabled = false;
        $('continueLabel').textContent = 'Continue';
        if (error) { errEl.textContent = 'Something went wrong. Please try again.'; errEl.classList.remove('hidden'); return; }
        state.step = 'done';
        goToStep();`;

  const newSubmit = `        // BEST EFFORT, THEN GO. Her original \`return\`ed on a Supabase error and left the visitor
        // parked on this screen. That database is not ours, so an outage there would have silently
        // eaten paid clicks. Record the lead if we can, then hand off either way: a lead we failed
        // to store is a bad day, a paid click that never reached the offer is money already spent.
        try {
          // The insert is fired from goToStep() without being awaited, so on a fast click-through it
          // can still be in flight here. Await it first or this update races ahead of the row it is
          // meant to find, matches nothing, and returns 204 as if it worked.
          if (state.pendingInsert) { try { await state.pendingInsert; } catch (e) { /* logged there */ } }
          const { error } = await sbUpdateById(state.recordId, { email, completed: true });
          if (error) console.error('lead capture failed, continuing to the offer:', error);
        } catch (e) {
          console.error('lead capture threw, continuing to the offer:', e);
        }
        state.submitting = false;
        $('continueBtn').disabled = false;
        $('continueLabel').textContent = 'Continue';
        window.location.href = offerUrl();`;
  h = sub(h, oldSubmit, newSubmit);

  // ── Lead capture moved to OUR Supabase project ─────────────────────────────────────────────
  // Her page posted every visitor's email and survey answers to jjdpumaccvbsktotcwgc.supabase.co —
  // an outside project we cannot read, delete from, or answer a data request about. Migi's call
  // 2026-08-04: bring it in-house. Now writes to ecyawhhimmuzryxjnjng, our own project.
  //
  // The anon key below is PUBLIC by design (it ships in page source); the RLS policies on
  // survey_responses are what actually protect the data:
  //   INSERT  allowed
  //   UPDATE  allowed only while completed = false, so a finished lead cannot be rewritten
  //   SELECT  policy is permissive, but anon's COLUMN grant is `id` alone — so it can find a row
  //           by id and nothing else. `?select=email` returns 42501.
  //   anon holds INSERT + UPDATE only. DELETE and TRUNCATE were revoked: TRUNCATE is not
  //           row-level-security bound, so no policy could ever have stopped it.
  //
  // ⚠️ DO NOT "simplify" this to having NO SELECT policy. That was the first design and it silently
  // ate every lead: an UPDATE ... WHERE id = X still has to SCAN for the row, an invisible row
  // matches zero, and PostgREST answers 204 as though it worked. See sprk-lander-lead-capture.
  h = sub(h, "const SUPABASE_URL = 'https://jjdpumaccvbsktotcwgc.supabase.co';",
             "const SUPABASE_URL = 'https://ecyawhhimmuzryxjnjng.supabase.co';");
  // Asserted, not a bare replace. never('jjdpumaccvbsktotcwgc') does NOT cover this: the project ref
  // lives base64-encoded inside the JWT payload, so a reflow of her source that broke this regex
  // would ship OUR url with HER key — every write 401s, 100% lead loss, visible only in a console
  // nobody is watching. Count the swap explicitly.
  const KEY_RE = /const SUPABASE_ANON_KEY = '[^']+';/g;
  const keyHits = (h.match(KEY_RE) || []).length;
  if (keyHits !== 1) throw new Error(`expected exactly 1 SUPABASE_ANON_KEY assignment, found ${keyHits}`);
  h = h.replace(KEY_RE, "const SUPABASE_ANON_KEY = '" + OUR_ANON_KEY + "';");
  must(h, OUR_ANON_KEY, 1);
  never(h, 'jjdpumaccvbsktotcwgc', 'the third-party project must be gone');
  must(h, 'ecyawhhimmuzryxjnjng.supabase.co', 1);

  // The row id is minted CLIENT-SIDE so the insert never needs `.select()`. That is what lets the
  // anon role have no SELECT policy at all — with insert().select() PostgREST would need read
  // permission on the returned row, and any read policy broad enough to allow that is broad enough
  // to dump every email in the table.
  const oldCreate = `        const { data, error } = await supabase
          .from('survey_responses')
          .insert({
            q1_shop_online: state.answers.q1 ?? null,
            q2_use_reward: state.answers.q2 ?? null,
            q3_shop_frequency: state.answers.q3 ?? null,
            reward: \`applepay\${REWARD_VALUE}us\`,
            flow_id: getQueryParam('Flow'),
            affsecid: getQueryParam('affsecid'),
            completed: false,
          })
          .select('id')
          .maybeSingle();
        if (error) { console.error(error); return; }
        if (data) state.recordId = data.id;`;
  const newCreate = `        // Mint the id here, so the insert needs no .select() and the anon role needs no read.
        const newId = (crypto.randomUUID ? crypto.randomUUID()
          : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            }));
        // Claim the id BEFORE awaiting the insert. The id is minted here, so it is known
        // immediately — and a visitor who clicks straight through (answer, answer, answer, Quick
        // Start, submit) can reach the email step before this insert resolves. Setting recordId
        // afterwards left it null at submit time, the update matched no row, and the email was
        // silently dropped while the page still redirected happily. Measured, not theoretical.
        state.recordId = newId;
        state.pendingInsert = sbInsert({
            id: newId,
            q1_shop_online: state.answers.q1 ?? null,
            q2_use_reward: state.answers.q2 ?? null,
            q3_shop_frequency: state.answers.q3 ?? null,
            reward: \`applepay\${REWARD_VALUE}us\`,
            flow_id: getQueryParam('Flow'),
            affsecid: getQueryParam('affsecid'),
            // The attribution wire, so a lead can be tied back to the affiliate and creative that
            // produced it. Her original stored only Flow/affsecid, which identify neither.
            s1: doorQ.get('s1') || null,
            s2: doorQ.get('s2') || null,
            s3: doorQ.get('s3') || null,
            ttclid: doorQ.get('ttclid') || null,
            completed: false,
        });
        const { error } = await state.pendingInsert;
        if (error) console.error('lead insert failed, continuing:', error);`;
  h = sub(h, oldCreate, newCreate);
  must(h, 'const newId =', 1);
  never(h, ".select('id')", 'the insert must not read back — anon has no SELECT policy');

  // ── The cloaking canary: `display:none !important` ─────────────────────────────────────────
  // Her step-toggling utility shipped as `.hidden { display: none !important; }`. That exact string
  // is the signature of the blank-page cloak gate stripped from this repo on 2026-07-23, so
  // _tracking-audit.test.mjs check 6 FAILS THE BUILD on it — verified: it flagged all 102 files.
  //
  // Her class is entirely legitimate (it hides the survey steps that are not current), so the fix
  // is the one the skill documents: keep plain `display:none` and raise SPECIFICITY instead of
  // reaching for the flag. `.hidden.hidden` doubles the selector weight, which beats anything a
  // single class could set, with no behavioural difference at all.
  h = sub(h, '.hidden { display: none !important; }', '.hidden.hidden { display: none; }');
  never(h, 'display: none !important', 'trips the blank-page cloak canary in _tracking-audit check 6');
  must(h, '.hidden.hidden { display: none; }', 1);

  // ── Drop the jsdelivr CDN entirely: two REST calls, plain fetch ────────────────────────────
  // Her page imported the whole @supabase/supabase-js client from cdn.jsdelivr.net at runtime.
  // `import` is a HARD dependency: if jsdelivr is blocked, throttled or down, the module never
  // evaluates and NOTHING after it runs — including the door hand-off. A third party we do not
  // control sat directly on the money path, and its failure mode is a completely dead page.
  //
  // The page makes exactly two calls (one insert, one update). PostgREST speaks plain HTTP, so
  // they are two fetches. Same precedent as api/_lib/kv.js, which talks to Upstash over fetch
  // rather than pulling an npm client. Net: one less third party, ~100KB less JS, and the money
  // path depends on nothing but our own origin.
  h = sub(h, "      import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';\n\n", '');
  h = sub(h, "      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);",
`      // Minimal PostgREST client — insert + update, nothing else. Returns { error } so the call
      // sites below read exactly as they did with supabase-js.
      const SB_HEADERS = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        // return=minimal: never ask PostgREST to echo the row back. anon has no read on the data
        // columns (RLS + column grants), so a returning request would 401 the whole write.
        'Prefer': 'return=minimal',
      };
      const SB_REST = SUPABASE_URL + '/rest/v1/survey_responses';

      // Every capture call is on a HARD budget. "Best effort then go" only holds for a capture that
      // FAILS — a capture that HANGS is worse, because the submit handler awaits it before setting
      // location.href, so a stalled request parks the visitor on the email screen indefinitely and
      // the paid click is lost. Same reasoning and roughly the same budget as api/_lib/kv.js, which
      // puts a 250ms abort on anything sitting on the click path.
      const SB_TIMEOUT_MS = 2500;
      function sbFetch(url, init) {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), SB_TIMEOUT_MS);
        return fetch(url, Object.assign({}, init, { signal: ac.signal }))
          .finally(() => clearTimeout(t));
      }

      async function sbInsert(row) {
        try {
          const r = await sbFetch(SB_REST, { method: 'POST', headers: SB_HEADERS, body: JSON.stringify(row) });
          return r.ok ? { error: null } : { error: { status: r.status, body: await r.text().catch(() => '') } };
        } catch (e) { return { error: e }; }
      }
      async function sbUpdateById(id, patch) {
        if (!id) return { error: { message: 'no record id' } };
        try {
          const r = await sbFetch(SB_REST + '?id=eq.' + encodeURIComponent(id),
            { method: 'PATCH', headers: SB_HEADERS, body: JSON.stringify(patch) });
          if (!r.ok) return { error: { status: r.status, body: await r.text().catch(() => '') } };
          // A PATCH that matched NOTHING is a 204 too — PostgREST reports the count in content-range
          // ('*/0' means zero rows). Without this check a lost lead is indistinguishable from a
          // saved one: that is exactly how the missing-SELECT-policy bug hid, and the same shape
          // recurs whenever the insert failed and this update targets a row that never existed.
          const range = r.headers.get('content-range') || '';
          if (range.slice(-2) === '/0') return { error: { message: 'update matched no row', range: range } };
          return { error: null };
        } catch (e) { return { error: e }; }
      }`);
  never(h, 'cdn.jsdelivr.net', 'the CDN import must not ship — it sits on the money path');
  never(h, 'createClient', 'the supabase-js client is gone');

  // Her three per-question updates used the RAW question ids (q1/q2/q3) as column names, which do
  // not exist on the table. They never fired (recordId is null until the activating step) so it was
  // latent, but reordering the funnel would have turned it into a 400 on every answer. Map them.
  h = sub(h, `        if (state.recordId) {
          await supabase.from('survey_responses').update({ [questionId]: value }).eq('id', state.recordId);
        }`,
`        if (state.recordId) {
          // Real column names. Hers passed the bare question id, which is not a column.
          const COL = { q1: 'q1_shop_online', q2: 'q2_use_reward', q3: 'q3_shop_frequency' };
          const col = COL[questionId];
          if (col) await sbUpdateById(state.recordId, { [col]: value });
        }`);

  // ── tokrwd.co branding: drop the Bolt scaffold leftovers ───────────────────────────────────
  // The og:image was still bolt.new's default, so every share preview of her page showed Bolt's
  // logo. Point it at our own domain instead (og:image must be ABSOLUTE — scrapers do not resolve
  // relative URLs).
  h = sub(h, '<meta property="og:image" content="https://bolt.new/static/og_default.png" />',
             '<meta property="og:image" content="https://www.tokrwd.co/images/playful-rewards-logo.png" />');
  h = sub(h, '<meta name="twitter:image" content="https://bolt.new/static/og_default.png" />',
             '<meta name="twitter:image" content="https://www.tokrwd.co/images/playful-rewards-logo.png" />');
  never(h, 'bolt.new', 'the Bolt scaffold defaults must not ship');

  // The consent line named only UpLevel's policies. Those still govern the OFFER and stay exactly
  // as she wrote them — but the email now lands in OUR database, so OUR privacy policy has to be
  // named too. Adding it, rather than swapping theirs out: replacing UpLevel's terms would
  // misrepresent what the visitor is agreeing to for the offer itself.
  h = sub(h, 'and site visit recordation by TrustedForm and Jornaya.',
             'the tokrwd <a href="/Rewards/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>, '
             + 'and site visit recordation by TrustedForm and Jornaya.');
  must(h, '/Rewards/privacy', 1);

  // ── Shared ttclid backfill, canonical on every lander in this repo ─────────────────────────
  h = sub(h, '</body>',
    '<!-- Shared ttclid backfill: fills an empty ttclid from the _ttclid cookie and tags tracker\n'
    + '     anchors. sprktrax.org is in its allowlist, so the door forwards it into the postback. -->\n'
    + '<script src="/js/ttclid.js" async></script>\n</body>');

  // ── Invariants ─────────────────────────────────────────────────────────────────────────────
  must(h, DOOR, 1);
  must(h, 'offerUrl()', 2);                      // defined + called on the hand-off
  must(h, 'window.location.href = offerUrl();', 1);
  must(h, "id=\"continueBtn\"", 1);
  must(h, "id=\"emailInput\"", 1);
  never(h, "state.step = 'done';\n        goToStep();", 'the dead-end must be gone from the submit path');

  // Her survey steps must survive intact — this is the design Migi asked to keep.
  for (const id of ['giftCard', 'questionStep', 'activatingStep', 'emailStep', 'doneStep',
                    'rewardAmount', 'progressBar', 'quickStartBtn']) {
    must(h, `id="${id}"`, 1);
  }

  // No cloaking, same bar as every other page here (see the skill's NO-CLOAKING rule).
  for (const [pat, why] of [
    ['x-safari', 'scheme-jump breakout belongs only in pre/index.html + js/breakout.js'],
    ['intent://', 'Android breakout belongs only in the prelander'],
    ['__SUBID_OK', 'the blank-page SubID gate'],
    ['document.write', 'the blank-page cloak gate'],
    ['display:none!important', 'the blank-page cloak signature'],
    ['musical_ly', 'in-app UA sniffing'],
  ]) never(h, pat, why);

  // ── The emitted <script type="module"> must actually PARSE ─────────────────────────────────
  // Every assertion above tests STRINGS, and a string test cannot tell that the JavaScript is
  // broken. A mangled regex escape once shipped `//0$/` — a SyntaxError that kills the whole
  // module, so the survey never renders, nothing is captured and the door hand-off never runs. The
  // page still looks perfect until someone clicks it. Parse it here instead of finding out live.
  const mod = /<script type="module">([\s\S]*?)<\/script>/.exec(h);
  if (!mod) throw new Error('emitted page has no <script type="module"> block');
  try {
    new Function(mod[1]);
  } catch (e) {
    throw new Error(`emitted module does not parse: ${e.message}`);
  }

  return h;
}

const argv = process.argv.slice(2);
const ci = argv.indexOf('--clones');
const CLONES = ci > -1 ? parseInt(argv[ci + 1], 10) : 100;   // matches the house slices
if (!Number.isFinite(CLONES) || CLONES < 1) { console.error('--clones must be a positive integer'); process.exit(1); }

const repoRoot = path.join(__dirname, '..');
const html = page();

fs.mkdirSync(path.join(repoRoot, CANON_DIR, GEO), { recursive: true });
fs.writeFileSync(path.join(repoRoot, CANON_DIR, GEO, 'index.html'), html);

// Vanity path, same reasoning as Sammy's /sasurl: a plain COPY, never a redirect — a redirect adds
// a hop and bounces the query string through a rewrite where s1 can be lost. It carries no slot
// number, so it is ONE shared URL and the numbered fan-out's anti-flag property does not apply to
// it. Fine for one affiliate on her own link; do not hand this path to a second person.
fs.mkdirSync(path.join(repoRoot, VANITY), { recursive: true });
fs.writeFileSync(path.join(repoRoot, VANITY, 'index.html'), html);

for (let n = 1; n <= CLONES; n++) {
  const d = path.join(repoRoot, FAMILY, GEO + n);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'index.html'), html);       // one buffer -> one md5 across the family
}

// Prune clones this config no longer emits, so the tree is a pure function of --clones.
const famRoot = path.join(repoRoot, FAMILY);
for (const name of fs.readdirSync(famRoot)) {
  const m = /^([A-Z]{2})([0-9]+)$/.exec(name);
  if (m && (m[1] !== GEO || Number(m[2]) > CLONES || Number(m[2]) < 1)) {
    fs.rmSync(path.join(famRoot, name), { recursive: true, force: true });
  }
}

console.log(`${CANON_DIR}/${GEO} + /${VANITY} + ${FAMILY}/${GEO}1..${GEO}${CLONES}   door=${DOOR_SLUG}   (${CLONES + 2} files, Ashlyn's supplied survey design)`);
console.log(`\n  ⚠️  LEFT AS SUPPLIED — her design, Migi's call, not edited here. Printed every run so`);
console.log(`      a deliberate carve-out cannot quietly become one nobody remembers agreeing to.\n`);
for (const [needle, why] of CONCERNS) {
  if (html.includes(needle)) console.log(`      • ${needle}\n          ${why}`);
}
console.log('');
