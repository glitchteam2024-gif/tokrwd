---
name: sprk-offer-tiles
description: >-
  How the SPRK Offer Library tile art is made — the dark "plate" treatment that replaces a brand's
  own creative with a house-styled 16:9 image. Use whenever Migi says anything like "make a tile for
  <offer>", "the offers tab looks messy", "this offer has no image", "add artwork for the new offer",
  "the logos don't match", "regenerate the offer images", or asks why one offer card is a bright
  rectangle while the rest are dark. Covers the generator (build.py), the three logo-isolation modes,
  the safe zones the tile's own S-veil and chips impose, the ember colour rule (brand hue behind a
  white mark — never gold, gold means money), where the files live, and how thumbnail_url is set.
  ALSO the place to look before hand-editing anything in images/offers/. LIVING DOCUMENT: when a new
  offer gets a tile, add its row to OFFERS in build.py and note anything odd about its logo here.
---

# SPRK offer tiles — the house plate

Every card in the Offer Library (`SPRKNetworkAds/offers/index.html`) shows a 16:9 image from
`offers.thumbnail_url`. Left to itself that field collects each brand's own ad creative, and the
grid becomes thirteen competing design systems — a green rectangle beside a blue one beside a white
gift card. The plate replaces all of that with one treatment: **a near-black ground, one
low-intensity glow in the brand's colour, and the brand's real mark in white on top.**

The mark is always the brand's actual logo file, composited pixel-for-pixel. **Never generate a logo
with an image model** — every model redraws what you give it, and a subtly-wrong brand mark on a
network dashboard is worse than no mark at all. Image models are fine for the *background plate*
and nothing else.

## Run it

```bash
python3 .claude/skills/sprk-offer-tiles/build.py            # every offer
python3 .claude/skills/sprk-offer-tiles/build.py freecash   # just one
python3 .claude/skills/sprk-offer-tiles/sheet.py            # contact sheet, in the real card
```

`build.py` writes `images/offers/<slug>.webp`. `sheet.py` renders every tile inside a faithful copy
of the live `.oc` card — **always look at the sheet before committing**, because a plate that looks
fine full-size can lose its mark entirely at the 258px grid width.

Requires Chrome at `/Applications/Google Chrome.app`. No Node, no Pillow, no ImageMagick — the whole
pipeline is headless Chrome plus stdlib Python.

## Adding an offer

One row in `OFFERS` in `build.py`:

```python
'slug': dict(src='images/brand-logo.png', mode='dark', lo=.45, hi=.80,
             ember='34,208,110', a=.20, markH=.56),
```

| field | what it does |
|---|---|
| `src` | repo-relative, or `sources/…` for a logo vendored into this skill |
| `mode` | `dark` / `light` / `duo` / `color` — see below |
| `lo`,`hi` | contrast ramp. Below `lo` → transparent, above `hi` → solid |
| `ember` | `"r,g,b"` — the brand hue |
| `a` | ember strength. **0.14–0.20.** Higher and it stops being light and becomes a coloured shape |
| `markH` | mark height as a fraction of the frame. 0.54–0.58 |
| `markW` | mark **width**, default 0.50. The only lever that matters for a wordmark — a 7:1 mark never reaches the height cap, so `markH` does nothing to it. Cap around **0.56**; past that it runs into the S-veil's leading edge at ~62% |
| `keepSat` | `duo` only — saturation above which a pixel keeps its own colour |
| `crop` | `[x, y, w, h]` on the source, before anything else |

### The four modes

The whole problem is separating a mark from whatever it shipped on. The score is
**`min(R,G,B)`**, not luminance — a white mark scores 1.0 while *any* saturated colour scores low
no matter how bright. Luminance gets this wrong: Freecash's green and white are near-identical in
luma and miles apart in min.

- **`dark`** — bright mark on a dark or saturated field. Freecash (white on green), Apple (white on
  black), Copper (bright ¢ on navy).
- **`light`** — dark or coloured mark on white. Inverts the score. Sephora, Uber Eats, Shein.
- **`duo`** — a genuinely two-tone mark. Saturated pixels keep their own hue, neutral pixels go
  white. Testerup needs this: in plain `light` the navy Q and the red tick both resolve to white and
  fuse into one unreadable blob.
- **`color`** — a full-colour illustration. Keeps every pixel, only drops the flat background. The
  escape hatch for logos that aren't marks; expect it not to match the rest of the grid.

Negative-space results are usually *good*, not bugs. Shein's black disc with white letters becomes a
white disc with SHEIN knocked out of it. Prograd's green disc keeps its inner blocks as holes. Both
read correctly on a dark plate.

## Composition — fixed, and not arbitrary

The card paints three things **over** this image, so most of the frame is unusable:

- **Right 34%** — the SPRK "S" veil blacks it out at 93–99% opacity and the geo flags sit inside it.
- **Top-left** — the NEW / CAPPED / creative-count chips, plus a scrim at 78%.
- **Bottom ~18%** — scrim fading the art into the footer.

So the mark sits centred at **31% across, 52% down**, and `build.py` paints its own right-edge
falloff to keep that third clean. Output is **1280×720** — 16:9 exactly, which matters: `fitArt()`
in `offers/index.html` switches to `object-fit: cover` at ratio ≥ 1.55, so a true 16:9 export maps
1:1 with no crop and no blurred bleed.

Export **WebP, not PNG**. These are smooth dark gradients; PNG stores them at ~520KB each and
thirteen of those is a 6.8MB dashboard. WebP q0.92 lands at 8–14KB with no visible banding.

## The colour rule

`offers/index.html` says it in its own comments: **gold on that page means money and nothing else.**
The payout figure, the chips and the S-hairline are `#D8BA68` / `#E5D19A`. So:

- **Never put gold or amber in a plate.** It competes with the payout directly beneath it.
- Gravypass is the live example of this problem — its logo is literally gold coins. If it ever gets
  a tile, shift the ember well warm (`240,169,59`) or leave it on the fallback letter plate.
- The ember is the *only* brand colour on the tile. Everything else is the house palette:
  ground `#151A22 → #0B0F15 → #070A0E`, mark pure white.

## Wiring a tile up

`thumbnail_url` is a plain URL column on `offers`, set through the admin offer editor
(`admin/_common/admin-app.js`, field `offer-thumbnail`). There is no upload widget — it takes a URL.

This repo deploys to **https://www.tokrwd.co**, so once `images/offers/` is on `main`:

```
https://www.tokrwd.co/images/offers/<slug>.webp
```

`SPRKNetworkAds` has no static asset directory of its own, which is why the art lives here and is
referenced cross-origin.

## Fallback is a real option

An offer with no `thumbnail_url` renders `.oc-plate` — its offer code in 30% gold on a soft radial.
Once the surrounding grid is dark this stops looking like a hole and starts looking deliberate.
**Prefer the fallback over a bad mark.** Never reconstruct a brand's wordmark in a lookalike font to
fill the slot; that is the one thing here that genuinely misrepresents the brand.

## What each offer needed (2026-07-26)

| Offer | Source | Note |
|---|---|---|
| Freecash | `images/freecash-logo.webp` | 240px, adequate — renders ~174px on a retina tile |
| Apple Pay | `images/Applepay750.png` | 1456px, white on black. Cleanest source in the repo |
| Copper | `images/copper-logo.png` | bright ¢ on navy, low ramp (`lo=.12`) to catch the mid-bright mark |
| Testerup | `images/testerup-logo.png` | `duo`, else the Q and tick fuse |
| Reco | `sources/reco-mark.svg` | the rainbow rect stripped out of `images/reco-logo.svg` and the viewBox tightened to the bookmark's own bounds |
| Prograd | `sources/prograd-16x9.png` | no standalone mark exists; cropped tight to the disc. A wider crop drags in the creative's black registration corners, which survive `light` and paint as white L-brackets |
| Sephora | `sources/sephora.svg` | Commons. **Wordmark only — this SVG has no flame.** Its `fill="none"` path is the letter counters, not the mark; forcing it visible just fills the P/O/R/A holes |
| Shein | `sources/shein.svg` | Commons. Brand palette is pure black and white, so the ember is a muted rose lifted from the sweeps creative — otherwise the plate is dead and it becomes a twin of Apple Pay |
| Uber Eats | `sources/uber-eats.svg` | Commons, 2020 horizontal lockup. `duo` keeps "Eats" green and "Uber" white |

Logo sources are **vendored into `sources/`**, never fetched at build time — a build that reaches
the network is a build that breaks when someone's CDN moves.

**Still missing marks:** **Gravypass** and **Cash**. Neither is on any logo site; both have to come
from Migi as files. Two traps here:

- `images/gravy-logo.png` is **misnamed** — it is the Testerup mark, not Gravypass.
- `sephora750-*`, `shein750-*` and `prograd-16x9.png` in `images/` are **untracked** on `main`. They
  exist only on Migi's disk and would vanish on a clean clone, which is why Prograd's source is
  vendored here.

Chat attachments cannot be used as sources. Images pasted into a conversation are pixels in context,
not files — there is no path from an attachment to disk, and redrawing a logo from looking at it is
exactly the failure this skill exists to prevent. Ask for files in a folder, or for permission to
download from the brand's own site or Wikimedia Commons.

## Gotchas

- **Chrome must finish decoding before the DOM dump.** `build.py` uses `--virtual-time-budget=8000`
  and `--dump-dom` rather than `--screenshot`, because the page encodes the canvas to WebP itself.
- **`max-width` cannot grow an image.** An early version sized the mark with `max-width/max-height`
  and a 240px logo sat at 240px inside a 640px box. Use `width/height: 100%` + `object-fit: contain`.
- **A gift-card creative is not a logo.** The Sephora and Shein files in `images/` are composites
  with a price, artwork and a disclaimer baked in. There is no mark to isolate.
- **The compliance line does not belong on these tiles.** "Offer not sponsored-endorsed by this
  brand" is a *lander* notice aimed at the prospect. The Offer Library is affiliate-facing and
  behind auth (Migi, 2026-07-26), so the tiles stay clean.
