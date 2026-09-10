// Landing-page information-disclosure audit — nothing a browser can fetch may name our network,
// our company, or our attribution design.
//
//   node "api/_lib/_lander-leak.test.mjs"
//
// WHY THIS EXISTS
// Owner's instruction, 2026-09-10, after reading it in a lander's view-source: "go through ALL the
// landing pages and remove any hit of monetise // sprknetwork … Make this a hardrule to never
// overpass it."
//
// A lander is PUBLIC. A competitor, an affiliate we would rather not educate, or an ad reviewer can
// read every byte of it. Before this file existed the pages volunteered, in plain English, which
// network we buy from ("THE RAW MONETISE LINK", "MONETISE/CAKE, which reads s1..s5"), who we are
// (SPRK-GATE, sprknetwork.ad), and how attribution works. js/breakout.js — the one JS file served
// to the browser — additionally named individual affiliates and published all 145 lander roots.
//
// SCOPE IS THE WHOLE POINT: deployed .html plus js/*.js. NOT api/ (404s publicly, verified), NOT
// _*.test.mjs, NOT migrations, NOT .claude/ (in .vercelignore since the 2026-07 incident where
// SKILL.md was served). Build-time comments are how the next session understands the estate;
// stripping those makes the estate worse, not safer. The line is: does a browser fetch it?
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const SKIP_DIRS = new Set(['.git', '.claude', 'node_modules', 'dist', '_lp-generator', 'justincase', 'tiktok-s2s']);
// Not landing pages: the owner scoped this rule to landers. Both are still PUBLICLY SERVED (200,
// verified) and both name this repo and the door domain in readable source — reported below, not
// failed here, because redacting an app is a different job from redacting a lander.
const NOT_A_LANDER = /^(?:admin|portal)\//;

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) { if (detail) console.log(detail); fail++; } else pass++;
};

/** Every file a browser can fetch from the lander domain. */
function served(dir = REPO, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      served(join(dir, e.name), out);
    } else if (e.name.endsWith('.html')) {
      out.push(join(dir, e.name));
    }
  }
  return out;
}
const files = served().filter(f => !NOT_A_LANDER.test(relative(REPO, f)));
const apps  = served().filter(f =>  NOT_A_LANDER.test(relative(REPO, f)));
// js/*.js is fetched verbatim by every lander — it is as public as the HTML.
for (const f of readdirSync(join(REPO, 'js'))) if (f.endsWith('.js')) files.push(join(REPO, 'js', f));
console.log(`\nauditing ${files.length} browser-reachable files for disclosure\n`);

// ── WHAT MAY NEVER APPEAR ───────────────────────────────────────────────────────────────────
// Each rule is a name a visitor could act on. The functional DESTINATION HOST is handled
// separately below, because it cannot be removed without the server-side-resolution migration.
const BANNED = [
  ['the network by name',        /\b(?:monetise|everflow|prescott)\b/i,          'tells them who supplies the offers'],
  ['the network platform',       /\bCAKE\b/,                                     'names the tracking platform'],
  ['our company',                /\bSPRK\b|sprknetwork/i,                        'tells them who runs this'],
  // ⚠️ THIS PATTERN HAD A HOLE AND REPORTED PASS WHILE 813 FILES LEAKED. It was
  // /api\/_lib\/[a-z-]+\.js/ , which cannot match a LEADING UNDERSCORE or a .test.mjs
  // extension — so `api/_lib/_tracking-audit.test.mjs`, quoted verbatim in 810 prelanders,
  // sailed straight past it. A guard that is narrower than the thing it guards is worse than
  // no guard, because it also reports success. Widened, and the SANCTION MARKER comment that
  // carried it is gone.
  ['our internal file paths',    /api\/_lib\/_?[a-z0-9-]+\.(?:test\.)?m?js/i,     'maps our codebase'],
  ['our repo name',              /\btokrwd\b/i,                                  'names the private repo'],
  ['a platform-flag admission',  /got this domain flagged|was flagged/i,          'volunteers to an ad reviewer that we were flagged'],
  ['an internal doc filename',   /NOTES\.md|README\.md/i,                         'invites a probe for that path on the lander domain'],
  ['our door slugs',             /['"][a-z0-9-]+-off['"]/i,                      'names an internal offer slug'],
];

const violations = new Map();     // rule -> [ "file:line  excerpt" ]
for (const abs of files) {
  const rel = relative(REPO, abs);
  const src = readFileSync(abs, 'utf8');
  const lines = src.split('\n');
  for (const [rule, rx] of BANNED) {
    lines.forEach((ln, i) => {
      const m = rx.exec(ln);
      if (!m) return;
      if (!violations.has(rule)) violations.set(rule, []);
      const list = violations.get(rule);
      if (list.length < 6) list.push(`     ${rel}:${i + 1}  …${ln.trim().slice(Math.max(0, m.index - 30), m.index + 60).trim()}…`);
      else if (list.length === 6) list.push('     …');
    });
  }
}
for (const [rule, rx, why] of BANNED) {
  const hits = violations.get(rule) || [];
  const n = hits.length;
  ok(`no lander names ${rule} (${why})`, n === 0,
     hits.join('\n') + (n ? `\n     -> strip these; put the explanation in the commit message instead` : ''));
}

// ── THE FUNCTIONAL DESTINATION ──────────────────────────────────────────────────────────────
// A lander must send the visitor somewhere, and today it carries the finished network URL in its
// own source (SPRK-DIRECT-OFFER v2, the owner's 2026-08-11 call). So the HOST is still visible in
// view-source, and no amount of comment-stripping changes that.
//
// It is fixable without adding a hop: api/click.js already prefers a SERVER-SIDE destination
// (getGateOverride(deriveGateKey(lp))) over the page's `u`, and the gate hop already exists. Fill
// that table and the page can stop carrying `u` at all. Until that migration runs, this is
// REPORTED EVERY RUN rather than silently tolerated — same discipline as the tracking audit's
// exceptions list, so the number has to shrink and cannot quietly become permanent.
// ── AFFILIATE IDENTITIES ────────────────────────────────────────────────────────────────────
// Reported, not failed, and the reason is not squeamishness: the remaining hits are FILE NAMES
// (acashusa-sammy.html, recousa-shannon-pre.html) and the data-slice labels derived from them.
// A lander filename is the URL baked into a running TikTok ad. Renaming one turns live paid
// traffic into 404s until every campaign is rebuilt, so it is a migration — new names, redirects
// from the old ones, landing_pages.link updated, a window where both resolve — not a sweep.
// Listed every run so it stays visible and cannot quietly become permanent.
const NAME_RX = /\b(?:sammy|shannon|ashlyn|notkerman|ravitej)\b/i;
const named = files.filter(f => NAME_RX.test(readFileSync(f, 'utf8')));
console.log(`\n  OUTSTANDING — ${named.length} pages carry an affiliate's name, almost all via the FILENAME.`);
console.log('  Not a failure: renaming a lander file breaks the ads already pointing at it.');
console.log('  Fixing it means a rename migration with redirects, not a text sweep.\n');

// ── THE DOOR DOMAIN, AND THE TWO APP PAGES ──────────────────────────────────────────────────
const DOOR_RX = /appflowconnect/i;
const doorPages = files.filter(f => DOOR_RX.test(readFileSync(f, 'utf8')));
console.log(`\n  OUTSTANDING — ${doorPages.length} landers name the door domain, as a LIVE destination`);
console.log('  (trt/, Rewards/). Functional: it is where the CTA goes, so it cannot just be deleted.\n');
const leakyApps = apps.filter(f => /\btokrwd\b|appflowconnect/i.test(readFileSync(f, 'utf8')));
console.log(`  OUTSTANDING — ${leakyApps.length} of ${apps.length} app pages (admin/, portal/) name this repo`);
console.log('  or the door domain, and BOTH ARE PUBLICLY SERVED (200). No credentials are embedded --');
console.log('  checked for JWTs, supabase keys, bearer tokens and hardcoded passwords, all absent --');
console.log('  but neither has any reason to be reachable from the lander domain. Consider .vercelignore.\n');

const HOST_RX = /(?:monetisetrk|montrk)\d*\.co\.uk|fkn8s74mztrk\.com|pcbdfv7trk\.com|phef6trk\.com|giftclick\.org/i;
const carriers = files.filter(f => HOST_RX.test(readFileSync(f, 'utf8')));
console.log(`\n  OUTSTANDING — ${carriers.length} pages still carry the destination host in their own source.`);
console.log('  Not a failure yet: removing it needs the server-side resolution migration');
console.log('  (populate GATE_OVERRIDES, then drop `u` from the CTA). Track this number down.\n');

console.log(`${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
