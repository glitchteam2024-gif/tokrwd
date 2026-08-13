#!/usr/bin/env node
/**
 * lander-check.js — the intake gate for an affiliate-supplied landing page.
 *
 *   node _lp-generator/lander-check.js <file.html>     # one file, human output
 *   node _lp-generator/lander-check.js --all           # every *-source.html in this dir
 *   node _lp-generator/lander-check.js <file> --json   # machine output, for the admin UI
 *
 * Exit code is 1 if anything BLOCKS, else 0. That makes it usable as a CI step and as the
 * auto-reject stage of the upload pipeline.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────────────
 * Seven supplied landers in, the defects repeat almost exactly. The expensive one is invisible:
 * a page can look perfect, render perfectly, and have NO WAY OUT to the offer — so the affiliate
 * pays for every click, earns nothing, and every dashboard reads normally. That defect has been
 * present in EVERY supplied file so far, in four different disguises. A human clicking around
 * does not reliably catch it. A string scan catches it every time.
 *
 * Everything here was learned by hand from a real page. Each check names the page it came from,
 * so nobody has to re-derive why it is worth running.
 *
 * ── THE THREE SEVERITIES, AND WHY THE THIRD ONE EXISTS ───────────────────────────────────────
 *   BLOCK   the page cannot be hosted as-is. It loses money, breaks attribution, or risks the
 *           domain. Auto-reject and tell the affiliate what to fix.
 *   WARN    we will fix it in the generator. Recorded so the fix cannot be silently forgotten.
 *   REVIEW  a claim or urgency device that only a human can rule on. NEVER auto-decided.
 *
 * The REVIEW tier is the important design decision. Every lander sits on www.tokrwd.co, so an
 * ad-network penalty earned by ONE affiliate's page attaches to the DOMAIN and every campaign on
 * it. A script can find a countdown that restarts on every page load; only the operator can
 * decide whether to run it. Auto-approving that tier would be the one change that makes this
 * tool actively dangerous.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/* ── Text preparation ────────────────────────────────────────────────────────────────────────
   Code patterns are scanned against a comment-stripped copy, claims against the raw file.
   Without this, a generator or a source file that MENTIONS `document.write` in a comment reads
   as using it — the exact false positive that made the old repo-wide grep unusable, and the
   reason _tracking-audit.test.mjs strips comments first too. */
function stripComments(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')          // HTML comments
    .replace(/\/\*[\s\S]*?\*\//g, ' ')         // JS/CSS block comments
    .replace(/^[ \t]*\/\/.*$/gm, ' ');         // whole-line JS comments only; a bare // inside a
                                               // string (https://) must survive
}

/* The visible COPY of the page, with markup removed.
   The claim checks below must run against this and never against the raw file. Scanning raw
   markup means scanning class attributes, and Tailwind class names are full of English words:
   `justify-center` contains "Just", `sm:text-left` contains "left". The first cut of the
   scarcity check reported both as scarcity claims. Copy in this repo also lives inside JS
   string literals (FAQ arrays, step lists, winner feeds), so those are appended — otherwise
   half the page's actual words are invisible to the claim tier. */
function prose(html) {
  const noScripts = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ');
  // Meta descriptions and og:title are real, reviewable copy — a claim there reaches every link
  // preview — so lift them out before the tags are stripped.
  const meta = [...noScripts.matchAll(/<meta[^>]+content\s*=\s*"([^"]{8,})"/gi)].map((m) => m[1]);
  const visible = noScripts.replace(/<[^>]*>/g, ' ');
  const literals = [...meta];
  for (const block of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const s of block[1].matchAll(/(['"])((?:(?!\1)[^\\]|\\.){2,120})\1/g)) {
      const v = s[2];
      // Keep sentences, drop identifiers, selectors and class lists.
      if (/\s/.test(v) && !/^[a-z0-9:_\-\s/.#]+$/i.test(v)) literals.push(v);
      else if (/[A-Z].*\s/.test(v)) literals.push(v);
    }
  }
  return (visible + ' \n ' + literals.join(' \n ')).replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ');
}

/* Several patterns can match different slices of ONE sentence — "4.8/5 player rating" yields
   "4.8/5", "4.8 /5" and "5 player rating". Keep the longest form of each and drop anything
   contained in a hit already kept, so the operator sees one claim, not three fragments. */
function dedupeOverlapping(hits) {
  const norm = (x) => x.replace(/\s+/g, ' ').trim();
  // Compare with ALL whitespace removed: "4.8 /5" and "4.8/5" are the same claim, and neither
  // contains the other while the space is still in there.
  const key = (x) => x.replace(/\s+/g, '').toLowerCase();
  const kept = [];
  for (const h of [...new Set(hits.map(norm))].sort((a, b) => b.length - a.length)) {
    if (!kept.some((k) => key(k).includes(key(h)))) kept.push(h);
  }
  return kept;
}

const countOf = (hay, needle) => hay.split(needle).length - 1;

function context(html, needle, pad = 55) {
  const i = typeof needle === 'string' ? html.indexOf(needle) : html.search(needle);
  if (i < 0) return null;
  return html.slice(Math.max(0, i - pad), i + pad).replace(/\s+/g, ' ').trim();
}

/* ── The check catalog ───────────────────────────────────────────────────────────────────────
   Each check returns null (pass) or { detail, context }. */

const CHECKS = [

  /* ═══ BLOCKERS ═══════════════════════════════════════════════════════════════════════════ */

  {
    id: 'no-outbound-path',
    severity: 'BLOCK',
    title: 'The page has no way out to the offer',
    learnedFrom: 'all seven supplied landers',
    why: 'The affiliate pays for every click and earns nothing, and every dashboard reads '
       + 'normally: clicks in, zero conversions, no error anywhere. This is the single most '
       + 'expensive defect and the hardest to spot by clicking.',
    run(raw, code) {
      const signals = [
        /location\s*\.\s*href\s*=/, /location\s*\.\s*replace\s*\(/, /location\s*\.\s*assign\s*\(/,
        /window\s*\.\s*open\s*\(/, /sprktrax/, /api\/link\//, /\/c\/[a-z0-9-]+/,
        /<a[^>]+href\s*=\s*["']https?:\/\//i,
      ];
      const found = signals.filter((re) => re.test(code));
      if (found.length) return null;
      return {
        detail: 'No location.href / location.replace / window.open / door URL / external anchor '
              + 'anywhere in the file. The funnel does not leave the page.',
        context: null,
      };
    },
  },

  {
    id: 'outbound-drops-query',
    severity: 'BLOCK',
    title: 'It navigates out but throws the query string away',
    learnedFrom: "Sammy's Apple Cash page — window.location.href = CTA_REDIRECT_URL",
    why: 'WORSE THAN HAVING NO LINK AT ALL, because it looks like it works. The page leaves for '
       + 'the destination without ?s1=<SPK>, so the door never learns who sent the click and '
       + 'EVERY CONVERSION IS UNATTRIBUTED. The page renders perfectly, the click lands, the offer '
       + 'converts, and the money silently belongs to nobody.',
    run(raw, code) {
      const navigates = /location\s*\.\s*(?:href\s*=|replace\s*\(|assign\s*\()/.test(code)
        || /window\s*\.\s*open\s*\(/.test(code)
        || /<a[^>]+href\s*=\s*["']https?:\/\//i.test(code);
      if (!navigates) return null;                       // no-outbound-path already blocks this
      const readsQuery = /location\s*\.\s*search/.test(code)
        || /URLSearchParams/.test(code)
        || /location\s*\.\s*href\s*\.\s*split\s*\(\s*['"]\?/.test(code)
        || /[?&]s1=/.test(code);                          // or it hardcodes the wire itself
      if (readsQuery) return null;
      return {
        detail: 'no location.search / URLSearchParams anywhere — the inbound s1, s2, s3 and ttclid '
              + 'are dropped at the hand-off.',
        context: context(code, /location\s*\.\s*(?:href\s*=|replace\s*\()/),
      };
    },
  },

  {
    id: 'placeholder-destination',
    severity: 'BLOCK',
    title: 'The outbound destination is a placeholder',
    learnedFrom: "Sammy's page shipped https://example.com/your-offer-destination",
    why: 'Every click 404s off-domain. Distinct from the OG-image default below, which is only '
       + 'cosmetic — this one is on the money path.',
    run(raw, code) {
      const pats = [/example\.com/, /your-offer-destination/i, /YOUR_URL/, /REPLACE_ME/i, /INSERT_LINK/i];
      for (const p of pats) {
        if (p.test(code)) return { detail: String(p), context: context(code, p) };
      }
      return null;
    },
  },

  {
    id: 'cta-cancels-click',
    severity: 'BLOCK',
    title: 'A handler cancels the converting click',
    learnedFrom: "notkerman's Apple Pay page, and again on his Shein page",
    why: 'The demo-stub disguise. A real listener calls preventDefault() and rewrites the button '
       + 'label, so something visibly happens when you tap it. It is the hardest variant to catch '
       + 'by hand precisely because the button appears to work.',
    run(raw, code) {
      if (!/preventDefault/.test(code)) return null;
      // preventDefault on a form submit is legitimate when the page genuinely posts somewhere.
      const onForm = /addEventListener\s*\(\s*['"]submit['"]/.test(code) || /onsubmit/.test(code);
      const stubby = /(Connect your|coming soon|your claim flow|placeholder|demo)/i.test(code);
      if (onForm && !stubby) return null;
      return { detail: 'preventDefault() present outside a real form submit.', context: context(code, 'preventDefault') };
    },
  },

  {
    id: 'cloaking-signature',
    severity: 'BLOCK',
    title: 'Cloaking signature present',
    learnedFrom: 'the 2026-07-23 repo-wide cloaking removal',
    why: 'A page that behaves differently for a crawler than for a buyer gets the WHOLE DOMAIN '
       + 'flagged, killing every campaign on it. The only sanctioned home for a scheme jump is '
       + 'pre/index.html + js/breakout.js.',
    run(raw, code) {
      const pats = [
        ['x-safari', 'iOS scheme jump'],
        ['intent://', 'Android scheme jump'],
        ['googlechrome-x-callback', 'Chrome scheme jump'],
        ['__SUBID_OK', 'blank-page SubID gate'],
        ['document.write', 'blank-page cloak gate'],
        ['musical_ly', 'in-app UA sniff'],
        ['FB_IAB', 'in-app UA sniff'],
      ];
      for (const [p, what] of pats) {
        if (code.includes(p)) return { detail: `${what} (${p})`, context: context(code, p) };
      }
      if (/display\s*:\s*none\s*!important/.test(code)) {
        return {
          detail: 'display:none!important — the blank-page cloak signature. If this is a genuine '
                + 'show/hide utility, fix it in the GENERATOR by raising specificity '
                + '(.hidden.hidden { display: none }), not by weakening the guard.',
          context: context(code, /display\s*:\s*none\s*!important/),
        };
      }
      return null;
    },
  },

  {
    id: 'foreign-data-endpoint',
    severity: 'BLOCK',
    title: 'Collects data into somebody else’s database',
    learnedFrom: "Ashlyn's Apple Pay survey page",
    why: 'Hers posted every visitor email and survey answer to a Supabase project that is not '
       + 'ours, from a page on our domain. We could not read it, delete from it, or answer a data '
       + 'request about it. See the sprk-lander-lead-capture skill for the in-house move.',
    run(raw, code) {
      const OURS = 'ecyawhhimmuzryxjnjng';
      const hosts = [...code.matchAll(/https?:\/\/([a-z0-9-]+)\.(supabase\.co|firebaseio\.com|firebasedatabase\.app)/gi)];
      const foreign = hosts.map((m) => m[1]).filter((h) => h !== OURS);
      if (!foreign.length) return null;
      return { detail: `posts to ${[...new Set(foreign)].join(', ')} — not our project (${OURS})`, context: context(code, foreign[0]) };
    },
  },

  {
    id: 'script-does-not-parse',
    severity: 'BLOCK',
    title: 'An inline script does not parse',
    learnedFrom: 'the admin dashboard outage — a backtick inside an HTML comment',
    why: 'Every other check here is a string test, and no string test can tell that the '
       + 'JavaScript stopped parsing. A page whose script throws on load is a page with no funnel.',
    run(raw) {
      const blocks = [...raw.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
      for (let i = 0; i < blocks.length; i++) {
        try { new Function(blocks[i][1]); }
        catch (e) { return { detail: `inline script #${i + 1}: ${e.message}`, context: null }; }
      }
      return null;
    },
  },

  /* ═══ WARNINGS — we fix these in the generator ═══════════════════════════════════════════ */

  {
    id: 'cdn-on-money-path',
    severity: 'WARN',
    title: 'A CDN sits on the conversion path',
    learnedFrom: "Ravi's Playful and Shein pages",
    why: 'The Tailwind Play CDN is render-blocking AND is the entire stylesheet — one slow or '
       + 'blocked request and a paid visitor gets unstyled HTML. An unpinned icon library at '
       + '@latest can break on any upstream major. Compile both ahead of time in the generator.',
    run(raw, code) {
      const hits = [];
      if (code.includes('cdn.tailwindcss.com')) hits.push('cdn.tailwindcss.com (Play CDN, compiles every class at runtime)');
      if (/unpkg\.com\/[^"']*@latest/.test(code)) hits.push('unpkg @latest (unpinned)');
      if (/cdn\.jsdelivr\.net/.test(code)) hits.push('jsdelivr');
      if (/cdnjs\.cloudflare\.com/.test(code)) hits.push('cdnjs');
      return hits.length ? { detail: hits.join(' · '), context: null } : null;
    },
  },

  {
    id: 'missing-legal-links',
    severity: 'WARN',
    title: 'No Terms / Privacy links',
    learnedFrom: "Sammy's page had them as href='#'; notkerman's and Ravi's had none at all",
    why: 'Several ad networks fetch these. Absent reads fine to a human and fails the same check '
       + 'as broken, so grep for the destination, not for href="#".',
    run(raw, code) {
      if (/Rewards\/(terms|privacy)/.test(code)) return null;
      const hasWords = /(Terms|Privacy)/i.test(raw);
      return {
        detail: hasWords
          ? 'the words appear but link nowhere — add /Rewards/terms and /Rewards/privacy'
          : 'no Terms or Privacy links anywhere in the page',
        context: null,
      };
    },
  },

  {
    id: 'builder-default-og-card',
    severity: 'WARN',
    title: 'Page-builder default social card left in',
    learnedFrom: 'three pages shipped the bolt.new OG image',
    why: 'Puts somebody else’s branding on our link previews. Cosmetic, not a money-path defect — '
       + 'repoint it at a real asset in this repo.',
    run(raw, code) {
      const hits = [];
      if (/bolt\.new/.test(code)) hits.push('bolt.new');
      if (/lovable\.(?:dev|app)/.test(code)) hits.push('lovable');
      if (/v0\.dev/.test(code)) hits.push('v0.dev');
      return hits.length ? { detail: hits.join(' · ') + ' default OG image', context: null } : null;
    },
  },

  {
    id: 'missing-local-asset',
    severity: 'WARN',
    title: 'References an asset that was never supplied',
    learnedFrom: "notkerman's Shein page asked for ../assets/shein-mirror-scene.png; Ravi's Playful page for /image.png",
    why: 'A failed background-image never paints, so it is invisible in review and 404s on every '
       + 'load of all ~100 copies. A relative ../assets path is also wrong from every clone depth.',
    run(raw, code, opts) {
      const repoRoot = opts.repoRoot;
      const refs = new Set();
      for (const m of code.matchAll(/url\(\s*["']?([^)"']+)["']?\s*\)/g)) refs.add(m[1]);
      for (const m of code.matchAll(/<img[^>]+src\s*=\s*["']([^"']+)["']/gi)) refs.add(m[1]);
      const missing = [];
      for (const r of refs) {
        if (/^(https?:|data:|#|blob:)/i.test(r)) continue;
        if (r.startsWith('../')) { missing.push(`${r} (relative — wrong from every clone depth)`); continue; }
        const p = path.join(repoRoot, r.replace(/^\//, '').split('?')[0]);
        if (!fs.existsSync(p)) missing.push(r);
      }
      return missing.length ? { detail: missing.join(' · '), context: null } : null;
    },
  },

  {
    id: 'stray-third-party-host',
    severity: 'WARN',
    title: 'Reaches a third-party host',
    learnedFrom: "Edwin's page POSTed every funnel step to gammastudio.xyz",
    why: 'Every outbound hop in this repo must run through tracking we run. Google Fonts is the '
       + 'established exception (431 landers already load it, and it sits on no money path).',
    run(raw, code) {
      const allowed = new Set([
        'sprktrax.org', 'www.tokrwd.co', 'appflowconnect.com', 'www.w3.org',
        'fonts.googleapis.com', 'fonts.gstatic.com',
      ]);
      const hosts = [...new Set([...code.matchAll(/https?:\/\/([a-zA-Z0-9.-]+)/g)].map((m) => m[1]))];
      const strays = hosts.filter((h) => !allowed.has(h));
      return strays.length ? { detail: strays.join(', '), context: null } : null;
    },
  },

  {
    id: 'hardcoded-reward-figure',
    severity: 'WARN',
    title: 'Reward figure is hardcoded',
    learnedFrom: "notkerman's Shein page had it at 10 sites; Ravi's at 14",
    why: 'Not a defect on its own — it becomes one the moment the design runs on a second offer '
       + 'that pays a different amount or a different currency. The generator must substitute '
       + 'every site and assert the count, then prove the wrong currency mark is gone.',
    run(raw) {
      const figs = {};
      for (const m of raw.matchAll(/[$£€]\s?[0-9][0-9,]*/g)) {
        const k = m[0].replace(/\s/g, '');
        figs[k] = (figs[k] || 0) + 1;
      }
      const list = Object.entries(figs).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
      if (!list.length) return null;
      return { detail: list.map(([k, n]) => `${k} x${n}`).join(' · '), context: null };
    },
  },

  {
    id: 'clamp-floor-on-display-type',
    severity: 'WARN',
    title: 'A clamp() floor can overrun its container on small phones',
    learnedFrom: "notkerman's Shein reward figure — clamp(92px, 28vw, 110px)",
    why: 'Below ~330px the floor stops the type shrinking while the container keeps narrowing, so '
       + 'it overruns its own padding box. Invisible at 430px and broken at 320-412. Re-ramp with '
       + 'a negative intercept, e.g. calc(30vw - 28px).',
    run(raw, code) {
      const bad = [];
      for (const m of code.matchAll(/font-size\s*:\s*clamp\(\s*([0-9.]+)px/g)) {
        if (parseFloat(m[1]) >= 48) bad.push(`clamp floor ${m[1]}px`);
      }
      return bad.length ? { detail: [...new Set(bad)].join(' · '), context: null } : null;
    },
  },

  /* ═══ REVIEW — human judgment only, never auto-decided ═══════════════════════════════════ */

  {
    id: 'countdown-from-page-load',
    severity: 'REVIEW',
    title: 'Countdown restarts on every page load',
    learnedFrom: "Sammy's Apple Cash page and Ravi's Shein page",
    why: 'The deadline never actually arrives — it resets for every visitor and on every refresh. '
       + 'A fake deadline is textbook deceptive urgency and both TikTok and Meta action it. This '
       + 'is consistently the highest-risk item on a supplied page.',
    run(raw, code) {
      const m = /(?:TARGET|DEADLINE|endsAt|expiry)\s*=\s*(?:new\s+)?Date(?:\.now\(\)|\(\))/i.exec(code)
        || /Date\.now\(\)\s*\+\s*[0-9]/.exec(code);
      if (!m) return null;
      return { detail: 'the deadline is seeded from the current time at load', context: context(code, m[0]) };
    },
  },

  {
    id: 'fabricated-activity',
    severity: 'REVIEW',
    title: 'Fabricated live activity or winner feed',
    learnedFrom: "Ravi's Shein page injects a random name every 6 seconds; his Playful page ships a static one",
    why: 'Presented to the visitor as real people claiming the reward right now. It counts whether '
       + 'the names are generated at runtime or hardcoded — a fixed list of invented winners with '
       + '"2m ago" timestamps makes exactly the same claim, and the first cut of this check missed '
       + 'it because it only looked for Math.random().',
    run(raw, code, { text }) {
      const claimVerb = /(just cashed out|claimed a|just claimed|just won|just earned)/i.test(text);
      const liveLabel = /(Live Activity|Recent Winners|Recent (?:cashouts|payouts)|LIVE\b)/i.test(text);
      const relTime = /\b[0-9]{1,3}\s*(?:m|min|mins|minutes|h|hours?)\s+ago\b|\bjust now\b/i.test(text);
      const randomised = /Math\.random\(\)/.test(code) && (claimVerb || liveLabel);
      if (randomised) {
        return { detail: 'names and/or totals are generated with Math.random() and shown as live activity', context: null };
      }
      if (claimVerb && (liveLabel || relTime)) {
        return { detail: 'a hardcoded feed of named people with relative timestamps, presented as live activity', context: null };
      }
      return null;
    },
  },

  {
    id: 'unsourced-statistic',
    severity: 'REVIEW',
    title: 'Unsourced rating or volume claim',
    learnedFrom: 'the Playful Rewards house lander, where "Trusted by over 500,000 users" was removed',
    why: 'Numbers we cannot substantiate. Swap in a real one if we have it, otherwise drop it. '
       + 'Catches bare figures too — "12,840 players online" makes the same claim as "Trusted by '
       + '12,840 players" and the first cut of this check only matched the lead-in form.',
    run(raw, code, { text }) {
      const hits = [];
      const push = (m) => hits.push(m[0].replace(/\s+/g, ' ').trim());
      for (const m of text.matchAll(/(?:Rated\s*)?\b[0-9]\.[0-9]\s*\/\s*5\b/g)) push(m);
      for (const m of text.matchAll(/\b(?:Over|Trusted by(?: over)?|Join)\s+[0-9][0-9,.]*\s*(?:\+|k|K|M|million)?[^.\n]{0,28}/g)) push(m);
      // Bare volume claims, no lead-in word.
      for (const m of text.matchAll(/\b[0-9][0-9,.]*\s*(?:\+|k|K|M|million)?\s+(?:players?|users?|members?|shoppers?|earners?|customers?|people)\b[^.\n]{0,14}/g)) push(m);
      for (const m of text.matchAll(/[$£€][0-9][0-9,.]*\s*(?:\+|k|K|M|MM|million|B)?\+?\s+(?:paid|earned|awarded|cashed out)\b[^.\n]{0,16}/gi)) push(m);
      for (const m of text.matchAll(/\b[0-9][0-9,.]*\s*(?:\+)?\s+(?:cards?|rewards?|payouts?|claims?)\s+(?:claimed|paid|sent)\b/gi)) push(m);
      const uniq = dedupeOverlapping(hits).slice(0, 5);
      return uniq.length ? { detail: uniq.join(' · '), context: null } : null;
    },
  },

  {
    id: 'third-party-endorsement',
    severity: 'REVIEW',
    title: 'Claims a third-party verification or endorsement',
    learnedFrom: '"Verified by TikTok" removed from the Playful lander; "Verified Shein Offer" on Ravi\'s page',
    why: 'A platform or brand endorsement that was never given is a false third-party claim, and '
       + 'reproducing it onto a new page is authoring it. Watch for a page that ALSO carries a '
       + '"not affiliated with" disclaimer — the two contradict.',
    run(raw, code, { text }) {
      const hits = [];
      for (const m of text.matchAll(/\bVerified\s+(?:by\s+)?[A-Z][A-Za-z]{2,14}/g)) hits.push(m[0]);
      for (const m of text.matchAll(/\b(?:Official|Endorsed by|In partnership with)\s+[A-Z][A-Za-z]{2,14}/g)) hits.push(m[0]);
      const uniq = [...new Set(hits)].slice(0, 4);
      if (!uniq.length) return null;
      const contradicts = /not\s+affiliated\s+with|no[t]?\s+endorsed\s+by/i.test(text);
      return {
        detail: uniq.join(' · ') + (contradicts ? '  ⚠ page also carries a "not affiliated" disclaimer — these contradict' : ''),
        context: null,
      };
    },
  },

  {
    id: 'scarcity-number',
    severity: 'REVIEW',
    title: 'Hardcoded scarcity claim',
    learnedFrom: "Ravi's Shein page — \"Only 14 cards left for <today>\"",
    why: 'A fixed number beside a client-generated date reads as live inventory and is not.',
    run(raw, code, { text }) {
      const hits = [];
      for (const m of text.matchAll(/\b(?:Only|Just)\b[^.\n]{0,30}?\b[0-9]{1,4}\b[^.\n]{0,24}?\b(?:left|remaining|spots?|cards?)\b/gi)) {
        hits.push(m[0].replace(/\s+/g, ' ').trim());
      }
      const uniq = [...new Set(hits)].slice(0, 3);
      return uniq.length ? { detail: uniq.join(' · '), context: null } : null;
    },
  },
];

/* ── Runner ──────────────────────────────────────────────────────────────────────────────── */

function checkFile(file, repoRoot) {
  const raw = fs.readFileSync(file, 'utf8');
  const code = stripComments(raw);
  const text = prose(raw);
  const findings = [];
  for (const c of CHECKS) {
    let r = null;
    try { r = c.run(raw, code, { repoRoot, text }); }
    catch (e) { r = { detail: `check threw: ${e.message}`, context: null }; }
    if (r) findings.push({ id: c.id, severity: c.severity, title: c.title, why: c.why, learnedFrom: c.learnedFrom, ...r });
  }
  const n = (s) => findings.filter((f) => f.severity === s).length;
  return {
    file: path.basename(file),
    bytes: raw.length,
    verdict: n('BLOCK') ? 'REJECT' : 'BUILDABLE',
    counts: { block: n('BLOCK'), warn: n('WARN'), review: n('REVIEW') },
    findings,
  };
}

const COLOR = { BLOCK: '\x1b[31m', WARN: '\x1b[33m', REVIEW: '\x1b[35m', reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m' };

function printReport(rep, { verbose }) {
  const v = rep.verdict === 'REJECT' ? `${COLOR.BLOCK}REJECT${COLOR.reset}` : `\x1b[32mBUILDABLE${COLOR.reset}`;
  console.log(`\n${COLOR.bold}${rep.file}${COLOR.reset}  ${v}`
    + `  ${COLOR.dim}${rep.counts.block} block · ${rep.counts.warn} warn · ${rep.counts.review} review${COLOR.reset}`);
  for (const sev of ['BLOCK', 'WARN', 'REVIEW']) {
    for (const f of rep.findings.filter((x) => x.severity === sev)) {
      console.log(`  ${COLOR[sev]}${sev.padEnd(6)}${COLOR.reset} ${f.title}`);
      console.log(`         ${COLOR.dim}${f.detail}${COLOR.reset}`);
      if (verbose) {
        console.log(`         ${COLOR.dim}why: ${f.why}${COLOR.reset}`);
        console.log(`         ${COLOR.dim}seen on: ${f.learnedFrom}${COLOR.reset}`);
        if (f.context) console.log(`         ${COLOR.dim}…${f.context}…${COLOR.reset}`);
      }
    }
  }
}

const argv = process.argv.slice(2);
const wantJson = argv.includes('--json');
const verbose = argv.includes('-v') || argv.includes('--verbose');
const repoRoot = path.join(__dirname, '..');
let files = argv.filter((a) => !a.startsWith('-'));

if (argv.includes('--all') || !files.length) {
  files = fs.readdirSync(__dirname).filter((f) => f.endsWith('-source.html')).sort()
    .map((f) => path.join(__dirname, f));
}
if (!files.length) { console.error('usage: lander-check.js <file.html> [--json] [-v]  |  --all'); process.exit(2); }

const reports = files.map((f) => checkFile(path.resolve(f), repoRoot));

if (wantJson) {
  console.log(JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2));
} else {
  reports.forEach((r) => printReport(r, { verbose }));
  if (reports.length > 1) {
    console.log(`\n${COLOR.bold}Summary${COLOR.reset}`);
    const w = Math.max(...reports.map((r) => r.file.length));
    for (const r of reports) {
      console.log(`  ${r.file.padEnd(w)}  ${(r.verdict === 'REJECT' ? COLOR.BLOCK + 'REJECT   ' : '\x1b[32mBUILDABLE') + COLOR.reset}`
        + `  ${COLOR.dim}${String(r.counts.block).padStart(2)} block  ${String(r.counts.warn).padStart(2)} warn  ${String(r.counts.review).padStart(2)} review${COLOR.reset}`);
    }
    console.log();
  }
}

process.exit(reports.some((r) => r.counts.block) ? 1 : 0);
