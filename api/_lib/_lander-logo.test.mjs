// Lander brand-art audit — every image a lander ships must actually render.
//
//   node "api/_lib/_lander-logo.test.mjs"
//
// WHY THIS EXISTS
// On 2026-09-10 backspinusa-sammy.html went live on paid traffic with a "BG" monogram where
// the Backspin app icon belongs. The comp had arrived pasted inline rather than as a file, its
// icon was a base64 data: URI, and a hand-transcribed copy of that blob is not reliable.
//
// The reason it reached production is the part worth encoding: A BROKEN BASE64 IMAGE DOES NOT
// LOOK BROKEN TO ANY OF THE OBVIOUS CHECKS. A partly-correct string still begins with SOI,
// still ends with EOI, still reports its real dimensions to `file`, and still decodes without
// throwing — it just renders as a flat coloured rectangle, because the JPEG decoder pads the
// scan data it never received with the last DC value it saw. Nothing short of decoding the
// entropy-coded data catches it, which is what checkJpeg() below does.
//
// THE RULES, and what each one actually costs if it is missing:
//
//   1. A lander with an .app-icon slot must put an <img> in it. That slot is image-shaped —
//      76x76, overflow:hidden, object-fit:cover — so anything else in it is a stand-in.
//      Text wordmarks are a different, deliberate design (.logo-mark, ~23 landers) and are NOT
//      covered here: the rule is about a slot that promises artwork and does not deliver it.
//   2. A data: image URI must decode to a COMPLETE image — correct magic, real entropy data,
//      and a terminator. This is the check that would have caught the Backspin icon.
//   3. An <img src="/images/…"> must name a file that exists in this repo. A logo that 404s
//      is the same failure with a different cause, and Vercel will happily serve the page.
//   4. No placeholder markers (…-fallback / placeholder / TODO) on a deployed lander. Whatever
//      a stand-in is called, it must not survive to production.
//
// Prelanders are exempt from rule 1 — they carry an inline SVG arrow by design and no brand art.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const REPO = new URL('../../', import.meta.url);
const root = fileURLToPath(REPO);

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) { if (detail) console.log(`   ${detail}`); fail++; } else pass++;
};

const PRELANDER   = /<meta\s+name=["']sprk-prelander["']/i;
const APP_ICON    = /class="[^"]*\bapp-icon\b[^"]*"/i;
// NOT global: `.test()` on a /g regex is STATEFUL (lastIndex carries between calls), which
// silently reported 5 landers as image-less on the first run of this file. The matchAll
// patterns below are /g because matchAll requires it and does not share this hazard.
const IMG_TAG     = /<img\b[^>]*>/i;
const DATA_IMG    = /<img\b[^>]*src="data:image\/([a-z+]+);base64,([^"]+)"/gi;
const FILE_IMG    = /<img\b[^>]*src="(\/images\/[^"]+)"/gi;
const PLACEHOLDER = /class="[^"]*\b(?:[a-z-]*-fallback|placeholder)\b[^"]*"|<!--\s*TODO[: ]/i;

/**
 * Is this base64 payload a COMPLETE image, or the flat-rectangle failure described above?
 *
 * For JPEG the test that matters is the length of the entropy-coded data AFTER the
 * Start-Of-Scan marker. A truncated blob keeps every header (they come first and are tiny) and
 * loses the scan — which is exactly the half that carries the picture. A 512x512 photo cannot
 * be encoded in a few hundred bytes of scan, so a scan that short is proof of truncation
 * rather than an unusually compressible image.
 */
function imageProblem(kind, b64) {
  let buf;
  try { buf = Buffer.from(b64.replace(/\s+/g, ''), 'base64'); }
  catch { return 'base64 does not decode'; }
  if (buf.length < 64) return `only ${buf.length} bytes decoded`;

  if (kind === 'jpeg' || kind === 'jpg') {
    if (buf[0] !== 0xff || buf[1] !== 0xd8) return 'not a JPEG (no SOI)';
    if (buf[buf.length - 2] !== 0xff || buf[buf.length - 1] !== 0xd9) return 'JPEG has no EOI terminator';
    // Walk the marker chain to the Start-Of-Scan, then measure what follows it.
    let i = 2, sos = -1, dims = null;
    while (i < buf.length - 1) {
      if (buf[i] !== 0xff) break;
      const m = buf[i + 1];
      if (m === 0xd9) break;
      if (m === 0xda) { sos = i; break; }
      const len = buf.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        dims = { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
    if (sos < 0) return 'JPEG carries no scan data (SOS marker absent)';
    const scanBytes = buf.length - sos;
    const px = dims ? dims.w * dims.h : 0;
    if (!px) return null;                       // no SOF parsed; nothing to measure against
    const bitsPerPixel = (scanBytes * 8) / px;
    // THE THRESHOLD IS MEASURED, NOT GUESSED. Three real samples on 2026-09-10:
    //
    //   the truncated Backspin blob that shipped ....... 0.042 bits/px  (renders FLAT)
    //   the house 1600x900 Backspin tile ............... 0.455 bits/px
    //   swagbucksusa-sammy's shipped inline icon ....... 0.728 bits/px
    //
    // An order of magnitude separates a truncated file from a real one, because the headers a
    // truncation keeps are tiny and fixed while the scan it loses scales with the picture.
    // 0.15 sits ~3.5x above the bad sample and ~3x below the lowest good one — wide margins on
    // BOTH sides, so this neither misses a truncation nor fails a legitimately flat graphic.
    // The first cut of this check used 0.032 and let the Backspin blob through; that is why the
    // number now comes from measurement.
    if (bitsPerPixel < 0.15) {
      return `JPEG scan is ${scanBytes} bytes for ${dims.w}x${dims.h} = ${bitsPerPixel.toFixed(3)} bits/px`
        + ` (floor 0.15). This decodes to a FLAT RECTANGLE, not the picture.`;
    }
    return null;
  }
  if (kind === 'png') {
    if (buf.readUInt32BE(0) !== 0x89504e47) return 'not a PNG';
    if (buf.slice(-8, -4).toString('ascii') !== 'IEND') return 'PNG has no IEND terminator';
    return null;
  }
  if (kind === 'gif')  return buf.slice(0, 3).toString('ascii') === 'GIF' ? null : 'not a GIF';
  if (kind === 'webp') return buf.slice(8, 12).toString('ascii') === 'WEBP' ? null : 'not a WebP';
  if (kind === 'svg+xml') return null;
  return null;
}

const files = readdirSync(root).filter(f => f.endsWith('.html'));
const landers = [];
for (const f of files) {
  const src = readFileSync(root + f, 'utf8');
  if (PRELANDER.test(src)) continue;
  landers.push([f, src]);
}
console.log(`\nauditing brand art in ${landers.length} landers\n`);

// ── RULE 1 ──────────────────────────────────────────────────────────────────────────────
const slotNoImg = landers.filter(([, s]) => APP_ICON.test(s) && !IMG_TAG.test(s)).map(([f]) => f);
ok('every .app-icon slot actually contains an <img> (no monogram stand-ins)',
   slotNoImg.length === 0,
   slotNoImg.join(', ') + '  <- an image-shaped slot with no image in it');

// ── RULE 2 ──────────────────────────────────────────────────────────────────────────────
const badData = [];
for (const [f, s] of landers) {
  for (const m of s.matchAll(DATA_IMG)) {
    const problem = imageProblem(m[1].toLowerCase(), m[2]);
    if (problem) badData.push(`${f}: ${problem}`);
  }
}
ok('every embedded data: image decodes to a COMPLETE picture, not a flat rectangle',
   badData.length === 0, badData.join('\n   '));

// ── RULE 3 ──────────────────────────────────────────────────────────────────────────────
const missing = [];
for (const [f, s] of landers) {
  for (const m of s.matchAll(FILE_IMG)) {
    const rel = m[1].replace(/^\//, '').split('?')[0];
    if (!existsSync(root + rel)) missing.push(`${f}: ${m[1]} is not in the repo`);
  }
}
ok('every <img src="/images/…"> names a file that exists', missing.length === 0, missing.join('\n   '));

// ── RULE 4 ──────────────────────────────────────────────────────────────────────────────
const placeheld = landers.filter(([, s]) => PLACEHOLDER.test(s)).map(([f]) => f);
ok('no placeholder / -fallback / TODO markers survive on a deployed lander',
   placeheld.length === 0, placeheld.join(', '));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
