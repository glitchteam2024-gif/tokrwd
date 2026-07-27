#!/usr/bin/env python3
"""Render SPRK offer plates. One WebP per offer, 1280x720, from a source logo.

Usage:  python3 build.py [slug ...]      (no args = every offer in OFFERS)

Each entry: source logo, isolation mode + ramp, ember colour, mark size.
  mode  'dark'  bright mark on a dark/saturated field   -> keep the bright pixels
        'light' dark/coloured mark on white             -> keep the NON-white pixels
        'color' full-colour illustration                -> keep every pixel
  lo/hi contrast ramp on that score; widen if the mark loses its edges, tighten
        if the background survives as a haze.
"""
import base64, json, mimetypes, pathlib, re, subprocess, sys, time

HERE = pathlib.Path(__file__).parent
REPO = HERE.parents[2]          # <repo>/.claude/skills/sprk-offer-tiles -> <repo>
OUT  = REPO / 'images' / 'offers'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

OFFERS = {
  # slug            source                              mode     lo    hi   ember (r,g,b)   a     markH
  'freecash':   dict(src='images/freecash-logo.webp',   mode='dark',  lo=.45, hi=.80, ember='34,208,110',  a=.20, markH=.56),
  'apple-pay':  dict(src='images/Applepay750.png',      mode='dark',  lo=.35, hi=.70, ember='174,184,196', a=.14, markH=.54),
  'copper':     dict(src='images/copper-logo.png',      mode='dark',  lo=.12, hi=.34, ember='110,255,192', a=.16, markH=.58),
  # Testerup is genuinely two-tone — a navy Q with a red tick through it. In plain
  # 'light' both resolve to white and fuse into one unreadable blob, so 'duo' keeps
  # the tick red (its saturation clears keepSat) and turns the navy Q white.
  'testerup':   dict(src='images/testerup-logo.png',    mode='duo',   lo=.10, hi=.35, ember='225,29,46',   a=.18, markH=.56,
                     keepSat=.30),
  'reco':       dict(src='sources/reco-mark.svg',          mode='dark',  lo=.40, hi=.80, ember='139,92,246',  a=.20, markH=.58),
  # Prograd: no standalone mark in the repo, so crop the app icon out of the 16:9
  # creative. Crop is tight to the green DISC — a wider box drags in the creative's
  # black registration corners, which survive 'light' and paint as white L-brackets.
  # 'light' turns the white container transparent and leaves the disc as the mark,
  # with its inner blocks reading as knocked-out negative space.
  'prograd':    dict(src='sources/prograd-16x9.png',     mode='light', lo=.10, hi=.40, ember='43,180,140',  a=.18, markH=.58,
                     crop=[478, 112, 660, 660]),

  # ── Wordmarks (vendored from Wikimedia Commons, 2026-07-27) ────────────────────
  # No square glyph exists for these brands, so the tile carries type. Wide marks are
  # sized by markW, never markH — a 7:1 wordmark never gets near the height cap.
  # Black-on-transparent, so 'light' (w = 1 - min) keeps the letterforms and lets the
  # counters, which the source leaves fill="none", show the plate through.
  'sephora':    dict(src='sources/sephora.svg',          mode='light', lo=.10, hi=.40, ember='227,28,36',   a=.17, markH=.56, markW=.56),
  # Shein's own palette is pure black and white, which would leave the plate dead and
  # make it a twin of Apple Pay. Muted rose is taken from the sweeps creative instead.
  'shein':      dict(src='sources/shein.svg',            mode='light', lo=.10, hi=.40, ember='224,122,150', a=.15, markH=.56, markW=.56),
  # Two-tone by design: 'duo' keeps "Eats" its own green and turns "Uber" white.
  'uber-eats':  dict(src='sources/uber-eats.svg',        mode='duo',   lo=.10, hi=.40, ember='6,193,103',   a=.18, markH=.56, markW=.56,
                     keepSat=.30),
}


def data_uri(path: pathlib.Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or 'image/png'
    if path.suffix == '.svg':
        mime = 'image/svg+xml'
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def build(slug: str, spec: dict) -> pathlib.Path:
    src = HERE / spec['src'] if spec['src'].startswith('sources/') else REPO / spec['src']
    if not src.exists():
        raise SystemExit(f"missing source for {slug}: {src}")

    cfg = dict(logo=data_uri(src), mode=spec['mode'], lo=spec['lo'], hi=spec['hi'],
               ember=spec['ember'], emberA=spec['a'], markH=spec['markH'],
               keepSat=spec.get('keepSat', 0), markW=spec.get('markW', 0.50))
    if 'crop' in spec:
        cfg['crop'] = spec['crop']

    page = (HERE / 'tile.html').read_text().replace(
        'window.__CFG__', json.dumps(cfg))
    work = HERE / f'.work-{slug}.html'
    work.write_text(page)

    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / f'{slug}.webp'
    # --dump-dom, not --screenshot: the page encodes the canvas to WebP itself and
    # parks the data URL in #out. virtual-time-budget gives the logo time to decode.
    r = subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars',
                        '--force-device-scale-factor=1', '--window-size=1280,720',
                        '--virtual-time-budget=8000', '--dump-dom', f'file://{work}'],
                       capture_output=True, timeout=90, text=True)
    work.unlink(missing_ok=True)

    m = re.search(r'data:image/webp;base64,([A-Za-z0-9+/=]+)', r.stdout)
    if not m:
        raise SystemExit(f'render failed: {slug} (no image in DOM)')
    dest.write_bytes(base64.b64decode(m.group(1)))
    return dest


if __name__ == '__main__':
    want = sys.argv[1:] or list(OFFERS)
    for slug in want:
        if slug not in OFFERS:
            print(f'  ?  {slug} — not configured'); continue
        t = time.time()
        p = build(slug, OFFERS[slug])
        print(f'  ok {slug:<12} {p.stat().st_size//1024:>4}KB  {time.time()-t:.1f}s')
