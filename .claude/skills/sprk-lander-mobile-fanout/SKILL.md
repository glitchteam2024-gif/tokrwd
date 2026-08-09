---
name: sprk-lander-mobile-fanout
description: >-
  Two jobs that come after a supplied landing page is already hosted and wired: making it look
  right on PHONES, and running that ONE design across MANY offers. Use whenever Migi says anything
  like "optimize it for mobile", "make it look good on iPhone and Android", "it looks off on their
  end", "it's broken on my phone", "check it on mobile", "give it to every <brand> offer", "run
  this page on all his offers", "put it on the rest of them", "fan it out", or asks whether a
  lander is "ready to roll" / "connected to the offer links". Covers the measure-don't-eyeball
  method for phone layout, the reward-figure clamp defect (the type stops shrinking before the
  container does), sizing fluid type against the WORST string in the WORST font, the VARIANTS
  table for one design on N offers, what copy MUST change per offer (amount, currency) versus what
  is presentation, the DEPLOY-BEFORE-ROWS ordering that decides whether paid clicks die, and the
  live end-to-end verification ladder. For hosting/wiring/locking a supplied page in the first
  place — generator pattern, `landing_pages` + `landing_page_affiliates`, `self_serve` +
  `capacity=1`, the picker — see the sibling skill `sprk-custom-landers`; this one does NOT restate
  it. LIVING DOCUMENT: when a lander is mobile-fitted or fanned out, write what was learned here.
---

# Mobile-fitting a supplied lander, and running one design across many offers

Sibling skills, and the split:

| Skill | Owns |
|---|---|
| **`sprk-custom-landers`** | hosting / wiring / locking ONE supplied page. The generator pattern, the door, the SQL, the picker, capacity=1 |
| **`sprk-lander-lead-capture`** | supplied pages that COLLECT DATA (forms, surveys, email) |
| **this one** | making a hosted page work on PHONES, and multiplying it across OFFERS |

Worked case this generalises from: **notkerman's Shein page, 2026-08-09.** One supplied design,
mobile-fitted, then run on all seven Shein offers at four different reward amounts in three
currencies. `_lp-generator/kerman-shein.js`, `SHKM/<key>` + `SK50..SK56`, doors `*-kerman`.

---

## 0. READ THIS FIRST — THE ERRORS THAT ACTUALLY HAPPENED

Written down so the next session does not repeat them. Every one of these is real, from the
2026-08-09 build.

### E1. I gave a two-step instruction without its required ORDER, and paid clicks died

I told Migi the remaining steps were "push, and run the SQL" as if either order worked. He ran the
SQL first. **The DB rows are what PUBLISH a page to the picker**, so for a live window his picker
offered seven designs whose URLs all 404'd.

➜ **Never hand over deploy + SQL as an unordered pair.** Say: *deploy first, confirm 200, then the
SQL.* Full reasoning in `sprk-custom-landers` trap 12.

### E2. I checked for the wrong kind of overflow and reported "no problems" on a broken page

My first mobile probe was `document.documentElement.scrollWidth > clientWidth`. It returned false,
and I reported the page as clean. **The actual defect was a child overflowing its own padding box** —
the reward figure colliding with the mirror frame — which produces no document-level overflow at all.

➜ **A viewport-overflow check does not find in-container collisions.** Measure the specific element
against the specific box that is supposed to contain it:

```js
const cs = getComputedStyle(box);
const inner = box.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
const r = document.createRange(); r.selectNodeContents(el);   // ink width, not the block's width
const fits = r.getBoundingClientRect().width <= inner;
```

`getBoundingClientRect()` on the element returns the BLOCK width (full container), which always
"fits". Use a `Range` over its contents to get the real ink width.

### E3. I tuned a fluid type ramp to the string and font in front of me

First fix was `clamp(58px, 25.5vw, 110px)`, measured against `$1,000` in Barlow Condensed. It looked
perfect. Then I checked the GB variant: `£1,000` had **4px** of clearance at 320px, and in the
fallback font it overflowed outright.

➜ **Size against the worst case you are about to SHIP, not the one on screen.** Two axes, both easy
to forget:
- **Worst STRING** — a six-glyph `£1,000`, not a four-glyph `$750`. If the generator emits several
  amounts, the ramp must satisfy the longest.
- **Worst FONT** — the FALLBACK, not the webfont. Google Fonts is loaded `display=swap`, so *every*
  cold Android load paints the fallback first. Measured em-widths for that string: Barlow 2.92,
  Arial Narrow 2.51, generic sans **3.06**. Tuning to 2.92 flashes a broken layout on every cold visit.

Measure the ratio, don't guess it:

```js
const em = (fam) => { const s=document.createElement('span');
  s.style.cssText=`position:absolute;visibility:hidden;white-space:nowrap;font-weight:900;font-size:100px;font-family:${fam}`;
  s.textContent=str; document.body.appendChild(s); const w=s.getBoundingClientRect().width; s.remove(); return w/100; };
const worst = Math.max(em('"Barlow Condensed"'), em('"Arial Narrow"'), em('sans-serif'));
// max safe font-size at this width = contentBox / worst
```

### E4. I believed a screenshot over the DOM and nearly chased a phantom bug

A remote-browser screenshot showed a screen-and-a-half of empty black where two step-cards should
be, plus a clipped pink sliver. It looked like a severe layout bug. It was a **compositing artifact**
— `html { scroll-behavior: smooth }` was still animating when the frame was captured. The DOM said
all three cards were present, `opacity: 1`, at the right offsets.

➜ **Screenshots from a remote/headless browser lie during scroll.** Set
`document.documentElement.style.scrollBehavior='auto'` and `window.scrollTo()` before capturing, and
**confirm any suspected layout bug against measured geometry before treating it as real.** Equally:
do not dismiss a real bug because a screenshot looks fine — E2 was invisible in the DOM check and
obvious in the screenshot. Use both, and let them disagree.

### E5. I wrote prose that tripped my own string-level guards — three times

- `"$"` inside a CSS comment → failed the GB build's stray-currency guard.
- `"£1,000"` inside a comment explaining the fix → failed the US build's guard.
- An apostrophe in `notkerman's` inside the `ALLOWED_ROOTS` block of `js/breakout.js` → the roots
  test parses that file by scanning for single-quoted literals, so the contraction opened a string
  and swallowed the list.

➜ **Guards are string-level; they cannot tell prose from code.** This is the guard WORKING. **Reword
the comment, never weaken the assertion.** When documenting a currency/quote/symbol defect, describe
it in words ("the leading currency mark") rather than reproducing the literal.

### E6. I nearly committed generated artifacts I had not just produced

Seven preview PNGs were on disk. Before committing I hashed them: three pages that render
*identically* (same amount, same campaign, differing only in an invisible href) produced **different**
files, proving they were shot at different generator states. I re-shot all seven in one pass.

➜ **Never commit generated artifacts you did not generate in the current state of the code.** Hash
them first; equal inputs must give equal outputs. If they don't, regenerate rather than reason about
why.

### E7. I used `git status | grep -c` as a determinism check

Re-ran the generator and counted `git status` lines to prove it was a no-op. It reported "114
changes" — which were just the new untracked directories, not drift. The check was meaningless in
both directions.

➜ **Determinism = hash the output set before and after a re-run**, not `git status`:

```bash
B=$(md5 -q <glob> | sort | md5 -q); node gen.js …; A=$(md5 -q <glob> | sort | md5 -q)
[ "$B" = "$A" ] && echo DETERMINISTIC
```

### E8. I reasoned toward a "fix" that would have created the bug it was preventing

I was about to add `viewport-fit=cover` plus safe-area padding for the sticky bar. Then checked the
default: with `viewport-fit=auto` (the default), iOS **already** insets the layout viewport to the
safe area, so `bottom: 12px` is already clear of the home indicator and `env(safe-area-inset-*)`
returns 0. Adding `cover` without correct padding would have pushed the bar UNDER the home indicator.

➜ **Do not add safe-area handling reflexively.** Without `viewport-fit=cover` there is no safe-area
problem to solve. Only reach for it when the design genuinely needs to paint edge-to-edge.

---

## 1. MOBILE-FITTING — THE METHOD

**Measure first, at real widths. Do not eyeball, and do not fix anything you have not measured.**

Widths that matter (cover all five; the bug lived at four of them):

| px | Devices |
|---|---|
| 320 | iPhone SE 1st gen, small Android. `body { min-width: 320px }` is the floor |
| 360 | Galaxy S-series, the most common Android width |
| 375 | iPhone SE 2/3, 13 mini |
| 390 | iPhone 13/14/15/16 — the single most common iPhone |
| 412 | Pixel, Galaxy Ultra |
| 430 | iPhone Pro Max |

⚠️ **A design can be broken on every phone except the one you test.** The Shein defect was invisible
at 430px and present at 320–412. Testing "on mobile" by checking one width is how it shipped.

### The defect class to look for first: a clamp FLOOR above the container's shrink rate

```css
.reward-amount { font-size: clamp(92px, 28vw, 110px); }   /* the bug */
```

Below ~330px the `92px` floor stops the type shrinking while its container keeps narrowing, so the
text overruns its own padding box. Rewrite with a **negative intercept** instead of a high floor —
it stays large on big phones and still clears on small ones:

```css
.reward-amount { font-size: clamp(52px, calc(30vw - 28px), 110px); }
```

Derive the slope from the measurement, do not guess: `maxFont(W) = contentBox(W) / worstEmRatio`,
fit a line through the narrowest and widest phone, then take ~8–10% off.

### Everything else worth checking, and the thresholds

| Check | Threshold | How |
|---|---|---|
| document overflow | `scrollWidth <= clientWidth` | cheap, but see **E2** — it misses in-box collisions |
| in-container collisions | ink width ≤ content box | the `Range` recipe in **E2**. Do this for every large/fluid text element |
| tap targets | ≥ 44×44 | Apple HIG and Material both. Inline footer links are the usual failure — 15px tall |
| font sizes | ≥ 10px | 9px labels are common in supplied designs |
| iOS landscape text inflation | — | `html { -webkit-text-size-adjust: 100%; }` |
| mid-word breaks | — | prefer `overflow-wrap: break-word` over `anywhere` |
| hero dead space | — | a big `margin-bottom` under a brand block can push the offer below the fold on a 667px screen |

### WHERE the fix goes: the generator, as a separate `<style>`, never the source

Append your own `<style>` immediately before `</head>` — **after** his, so it wins on cascade order
with no `!important` and without editing one of his rules. Wrap everything in the phone media query
so desktop is byte-for-byte his.

```js
h = sub(h, '</head>', `  <style>
    /* Mobile refinements — added by the generator, not by the operator */
    html { -webkit-text-size-adjust: 100%; }
    @media (max-width: 720px) { … }
  </style>
</head>`);
must(h, '</style>', 2);   // his stylesheet + ours, never merged into his
```

Assert the marker comment and the key value (`must(h, 'calc(30vw - 28px)', 1)`) so a later edit that
drops the layer fails the build instead of silently shipping the original defect.

**Why the generator and not the source file:** the source stays exactly what the operator sent, so
"what did we change" is always answerable; the fix reapplies automatically if he sends a v2; and
re-running stays deterministic. Same reasoning as Ashlyn's `display:none!important` fix in
`sprk-custom-landers` §5b.

---

## 2. ONE DESIGN, N OFFERS — THE FAN-OUT

Replace the single `CANON_DIR / FAMILY / GEO / DOOR_SLUG` constants with a table, and loop.

```js
const VARIANTS = [
  { key:'US',    geo:'US', family:'SK50', vanity:'shkrurl', amount:'$1,000', campaign:'Back to School',
    slug:'shein-b2s-us-kerman', offerId:'…', offer:'Rewards US - Shein $1000 Back to School' },
  { key:'GBB2S', geo:'GB', family:'SK51', vanity:null,      amount:'£1,000', campaign:'Back to School', … },
  …
];
```

- `key` — subfolder under the canon dir. **Must be unique; two offers routinely share a geo**, so the
  geo cannot be the key.
- `family` — its own numbered clone slice. Unique. `capacity` in SQL must be ≤ `--clones`.
- Fail the build on duplicate `key` / `family` / `slug`. A collision silently overwrites one page
  with another and the only symptom is the wrong reward amount on a live offer.

```js
for (const f of ['key','family','slug']) { /* throw on duplicates */ }
```

### WHAT MUST CHANGE PER OFFER, AND WHAT MUST NOT

**MUST change — this is a money-path correctness issue, not a preference:**

- **The reward amount and its currency.** A supplied page hardcodes one figure (the Shein file had
  `$1,000` at **ten** sites including `<title>`, the meta description, an `aria-label` and an HTML
  comment). Four of the seven offers paid 750 and three were non-USD. Shipping `$1,000` on a £750
  offer is a materially false promise.

Substitute with an asserted count, then prove the wrong currency is gone entirely:

```js
h = sub(h, '$1,000', v.amount, 10);          // all ten, or the build fails
must(h, v.amount, 10);
if (v.amount !== SOURCE_AMOUNT) never(h, SOURCE_AMOUNT, 'source amount must not survive');
for (const sym of ['$','£']) if (!v.amount.startsWith(sym)) { /* throw, with context */ }
```

⚠️ **Make the stray-symbol error print surrounding context.** "1 stray $" sends you hunting;
`"…the leading \"$\" and the trailing…"` tells you instantly it is your own comment (**E5**).

**Presentation — change it, but say so and make it one field:** a campaign label tied to one
offer's branding ("Back to School") is wrong on a differently-branded offer. Move it to `VARIANTS`,
default to something neutral, and **print all N on every run** so a deliberate choice can't become a
forgotten one.

**MUST NOT change:** the operator's claims, structure, or funnel shape. Those stay his (see
`sprk-custom-landers` §3). Print them; don't edit them.

### Vanity paths: ONE, not N

A vanity path carries no slot number, so it is a single shared URL with none of the numbered
fan-out's anti-flag property — N of them is N single points of failure for a convenience the app
never serves anyway (`resolveAffiliateOfferLinks` hands out the numbered clone). Give the flagship
one, `null` the rest.

### Print the root list

Every `key`, `family` and `vanity` must be registered in **both** `PRELANDER_ALLOWED_ROOTS`
(`api/_lib/links-config.js`) and `ALLOWED_ROOTS` (`js/breakout.js`), which a test pins together.
Have the generator print the exact lowercase list so it can't drift when a variant is added.

---

## 3. THE VERIFICATION LADDER

Run **against production**, after deploying. Each rung fails independently, and a lower rung passing
tells you nothing about a higher one — that is exactly how E1 hid.

```bash
# 1. the pages exist  (this is the one the SQL-first ordering breaks)
for u in SK50/US1 SK51/GB1 …; do curl -sI https://www.tokrwd.co/$u -o /dev/null -w "$u %{http_code}\n"; done

# 2. each page fires ITS OWN door, and carries the right amount
body=$(curl -s https://www.tokrwd.co/$u)
echo "$body" | grep -o 'api/link/[a-z0-9-]*'
echo "$body" | grep -o 'class="reward-amount">[^<]*'

# 3. the door 302s WITH s1 and 404s WITHOUT  (the 404 is the attribution gate, not a bug)
curl -sI "https://sprktrax.org/api/link/<slug>?s1=SPK-TEST-0000"
curl -sI "https://sprktrax.org/api/link/<slug>"

# 4. the door lands on the RIGHT offer destination and s1 survives the hop
curl -sI "https://sprktrax.org/api/link/<slug>?s1=SPK-TEST-0000" | grep -i '^location:'
#   assert the destination contains that offer's own network path — NOT just "a 302 happened".
#   Seven doors all 302ing proves nothing if two point at the same offer.

# 5. the picker preview card
curl -sI https://www.sprknetwork.ad/images/landers/<slug>.png
```

⚠️ **Rung 3 passing is not evidence for rung 1.** The door resolves from `landing_pages` and never
touches the page. On 2026-08-09 all seven doors answered perfectly while all eight lander URLs 404'd.

And in the DB: exactly one active assignment per (affiliate, offer); the affiliate's *other* bespoke
pages untouched; zero network-wide duplicates; `lp_domains` still empty. Queries in
`sprk-custom-landers` §7.

---

## 4. WHAT "READY TO ROLL" ACTUALLY REQUIRES

When Migi asks whether a lander is ready / connected, check all five and report the gaps, because
four of them can be green while the funnel is dead:

1. Pages deployed and 200 — **`git push origin HEAD:main`**, not just pushing the branch. Vercel
   builds `main`.
2. `landing_pages` rows exist, `self_serve = true`, `capacity` ≤ clones deployed.
3. An `active` assignment per offer, `slot` set.
4. Doors 302 with `s1`, to the correct per-offer destination.
5. Preview PNGs deployed — a **non-NULL** `preview_image` pointing at a missing file renders a
   BROKEN IMAGE; the "Preview coming soon" fallback only fires when the column is NULL.

Then separate **"set up"** from **"running."** A page can be perfect and carry zero traffic. Check
`spark_codes` for that affiliate — if there are none on the offer, say so plainly rather than letting
"it's all set up" be read as "it's live and earning."

⚠️ **Also check the offers they can access but have NO lander on.** An offer whose only lander is
`self_serve = false` will never appear in their picker and auto-assign will never hand it to them —
they are structurally stuck without an admin assignment (`sprk-custom-landers` trap 4). Found exactly
this on notkerman/Testerup: explicit access, `cap_mode='allocated'`, no page, three other affiliates
holding it.

---

## 5. SHOOTING PREVIEWS FOR A FANNED-OUT DESIGN

Base recipe is `sprk-custom-landers` §8. What this adds:

- **One shot per variant** — the amount and campaign differ, so the cards must too.
- **Shoot them in ONE pass, from the current build** (**E6**).
- `--window-size=1280,720` then `sips -z 450 800`. The default 460×259 puts a fluid-hero design into
  its own mobile breakpoint and crops the hero to three words.
- **Identical-looking variants will still hash differently** if the page has an infinite animation
  (a pulsing dot lands at a random phase). That is expected and harmless — do not chase it. What
  matters is that each card shows the right amount; **look at them**.
- Committing into **SPRKNetworkAds** — that checkout is routinely mid-feature with uncommitted files.
  Use a throwaway worktree so you never touch it:

```bash
git worktree add -b claude/<name> /tmp/wt origin/main
cp …/*.png /tmp/wt/images/landers/ && cd /tmp/wt && git add images/landers/*.png
git commit -m … && git push origin HEAD:main
cd - && git worktree remove /tmp/wt --force && git worktree prune
```

---

## 6. QUICK DO / DON'T

**DO**
- Measure at 320/360/390/412/430 before changing anything, and again after.
- Size fluid type against the longest string in the worst-case font.
- Put mobile fixes in the generator, in their own `<style>`, phone-only, asserted.
- Make per-offer copy a table field and print every value on every run.
- Deploy the pages, confirm 200, *then* run the SQL.
- Verify the door's destination, not just that it redirects.
- Hash generated artifacts before committing them.

**DON'T**
- Don't trust `scrollWidth` to find a collision inside a container.
- Don't trust a mid-scroll screenshot; don't dismiss a real bug because the DOM looks fine.
- Don't weaken an assertion because your own comment tripped it — reword the comment.
- Don't add `viewport-fit=cover` unless the design needs edge-to-edge paint.
- Don't ship one amount across offers that pay different amounts or currencies.
- Don't create a vanity path per offer.
- Don't give an affiliate's bespoke page a capacity > 1 without being told to — that un-reserves it.
- Don't report "assigned to him" without distinguishing **exclusive** (capacity 1) from **shared**
  house designs; the affiliate holds both and they mean different things.
