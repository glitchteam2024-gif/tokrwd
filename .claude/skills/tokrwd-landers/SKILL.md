---
name: tokrwd-landers
description: >-
  How the tokrwd landing pages are structured, wired, and kept clean. Use whenever Migi asks to
  work on the landers / landing pages / prelanders — "make the landing page single", "remove the
  prelander", "remove the cloaking", "add a lander", "change the offer link", "why is this lander
  doing X", "point the ad at Y" — or names a lander folder (50FC, 50FCII, 50TU, CR50, RS50, FC, TU,
  CB, GP, TSUP, RS). Covers the ad→lander→door→offer funnel, the canonical-file + N-copies layout
  and the propagate loop, the NO-CLOAKING rule (why TikTok blocks flagged landers), the s1–s5 wire
  scheme, Path A vs Path B offers, deploy exclusions, and the browser verification recipe. LIVING
  DOCUMENT: when the lander architecture changes, update this file so the next session isn't guessing.
---

# tokrwd landers — architecture, rules, and how to change them

This is the static site deployed to **https://www.tokrwd.co** (Vercel, `main` = production). It is
the LANDER layer only. The tracking doors that re-stamp attribution (`sprktrax.org`) and the admin
network live in the separate **SPRKNetworkAds** repo. For the spark-code mint rules and the outbound
wire scheme see the `sprk-new-offer` skill; for "affiliate's conversions look wrong" see
`sprk-affiliate-conv-debug`.

## The funnel (current, since 2026-07-21)

    ad ( ?s1=<SPK>&s2=<pub>&s3=<adacct>&s4=&ttclid= )  ->  lander  ->  door  ->  offer

**One hop. No prelander. No cloaking.** The lander renders the SAME markup for every visitor
(including ad-review crawlers) and forwards the whole query string to its door untouched. There used
to be an in-app-breakout **prelander** step in front of the landers — it was removed 2026-07-21
(see Changelog). Do not re-introduce a prelander/breakout hop without an explicit ask.

## Offer → door → canonical file → copies

Every numbered folder is a **byte-identical copy** of its offer's ONE canonical lander. Edit the
canonical, then propagate (see next section). `cleanUrls:true` in `vercel.json` serves `/FC` from
`FC/index.html`, `/50FC/FC1` from `50FC/FC1/index.html`, etc. — query string always survives.

| Offer        | Door / destination                         | Canonical file            | Byte-identical copies                              |
|--------------|--------------------------------------------|---------------------------|----------------------------------------------------|
| Freecash     | `sprktrax.org/api/link/freecash` (Path A)  | `FC/index.html`           | `FCTT.html`, root `index.html`, `50FC/FC1-50`, `50FCII/FC1-50`, **`CLFC`** |
| Testerup     | `sprktrax.org/api/link/testerup` (Path A)  | `TU/index.html`           | `50TU/TU1-50`, **`CLTU`**                          |
| Freecash UK  | `/c/frrcsh-uk-off` -> monetisetrk4 (Path B) | `CLFCUK/index.html`      | — (geo copy of `FC`, DOOR line repointed)          |
| Freecash CA  | `/c/frrcsh-ca-off` -> montrk2 (Path B)      | `CLFCCA/index.html`      | — (geo copy of `FC`, DOOR line repointed)          |
| Copper       | `sprktrax.org/api/link/copper` (Path A)    | `CB/index.html`           | `CR50/CR1-50`                                      |
| Gravypass    | `sprktrax.org/api/link/gravypass` (Path A) | `GP/index.html`           | — (`GP/ob/` is a clean pass-through interstitial → `/GP/`) |
| Testerup ALT | `monetisetrk8.co.uk` DIRECT (Path B)       | `TSUP/index.html` + `js/tsup-offer.js` | —                                      |
| Testerup TRT | `/c/testerup-us-mon-off` (Path B)          | `trt/index.html`          | — (game-picker variant under test, `lp=trt`) |
| Shein $750   | door `shein-<geo>` (Path A)                | `SHEIN/<GEO>/index.html`  | `SH50/<GEO>1-30` — US GB CA AU, generated         |
| Sephora $750 | door `sephora-<geo>` (Path A)              | `SEPH/<GEO>/index.html`   | `SP50/<GEO>1-30` — US GB CA AU                    |
| Cash Prize   | door `cash-<geo>` (Path A)                 | `CASH/<GEO>/index.html`   | `CS50/<GEO>1-30` — US GB AU                       |
| Apple Pay $750 | door `applepay750-us` (Path A)           | `APAY750/US/index.html`   | `AP50/US1-30`                                     |
| Apple Pay $1000 | door `applepay1000-us` (Path A)         | `APAY1K/US/index.html`    | `AK50/US1-30`                                     |
| Uber Eats £50 | door `ubereats-gb` (Path A)               | `UBER/GB/index.html`      | `UE50/GB1-30`                                     |
| Freecash (per-geo) | door `freecash-<geo>` (Path A)         | `FCASH/<GEO>/index.html`  | `50FC/<GEO>1-30` — US GB CA JP DE AT NL           |
| Reco Social  | `/api/reco` → montrk (Path B)              | `RS/index.html`           | `RS50/RS1-50` are interstitials that forward to `/RS/` (2 distinct variants: RS1 unique, RS2–50 identical) |

Naming gotcha: **CR50 folders serve the Copper (`CB`/`copper`) lander** — "CR" is a legacy folder
name, not a different offer. `50FCII` is a SECOND set of Freecash landers; keep it identical to `50FC`.

**Path A vs Path B.** Path A routes through the `sprktrax.org/api/link/<slug>` door, which resolves
the SPK and re-stamps outbound (see wire scheme). Path B (`TSUP`, `RS`, plus the `api/*.js`
redirectors for Playful/ApplePay/go/EOZ) goes closer to the network and collapses subids by design —
that's pre-existing, not a bug, and not cloaking. Don't "fix" Path B to full s1–s5 fidelity unless
Migi asks; it's a product decision (re-route those landers through `api/link/<slug>`).

## The NO-CLOAKING rule (the load-bearing one)

**A lander must never behave differently for a crawler than for a real user, and must never
UA-sniff-and-redirect.** TikTok/Meta ad review crawls the lander HTML; a page that does either gets
the **whole domain flagged and blocked**, killing every campaign on it. That is the entire reason the
cleanup below happened.

Three cloaking patterns were removed from every deployed page — recognize them so you don't re-add:

1. **Blank-page SubID gate** — `window.__SUBID_OK` + `if(!__SUBID_OK) document.write('<style>html{display:none!important}</style>')`. Served crawlers/untagged visitors an empty page.
2. **In-app breakout** — UA test `/tiktok|musical_ly|bytedance|FB_IAB|Instagram.../` then a scheme jump: `x-safari-https://…`, `intent://…#Intent;…`, `googlechrome-x-callback://…`, `safari-https://…`.
3. **Server-side `?dest=` breakout** — `api/frcsprk.js` (deleted 2026-07-23) rendered a breakout page for an arbitrary destination; reached via a `vercel.json` rewrite.

**NOT cloaking — keep these:** the query-string forwarding to the door (`new URLSearchParams(location.search)` → door), and `js/ttclid.js` (backfills an empty `ttclid` from the `_ttclid` cookie and tags tracker anchors). These render identically for everyone.

`justincase/{FC,TU,CB}-prelander/` and `SIGNAT~1/` still contain cloaking on purpose — they are
archived/demo references and are kept OUT of the deploy via `.vercelignore`. Never link to them and
never let them deploy. `api/detector.js`, `api/harness.js`, `api/signatures.js` are cloaking
*detector* QA tooling (they find cloaking, they don't serve it) — leave them.

## GENERATED landers: ONE PAGE PER GEO, one language per geo (2026-07-26)

`SHEIN SEPH CASH APAY750 APAY1K UBER FCASH` and their `SH50 SP50 CS50 AP50 AK50 UE50 50FC`
fan-outs are emitted by `_lp-generator/build.js`. One command rebuilds the sweep landers (Freecash has its own — see below):

```bash
node _lp-generator/build.js --clones 30
```

**Geo is the unit of everything.** One geo picks the Monetise link
(`offers.destination_by_geo`), the `landing_pages` row, the currency AND the language:

```
/SH50/GB7   GB · English · £750 · opens api/link/shein-gb
/50FC/JP1   JP · Japanese · no figure · opens api/link/freecash-jp
```

**There is NO runtime geo detection and no language switcher.** No IP sniffing, no `lp_geo`
cookie, no `?lg=` param, no edge middleware — all of that was removed. The geo is decided by
WHICH PAGE the ad points at, and `api/link/[slug].js` routes on that lander's
`landing_pages.geo`. One fact drives both, so a page cannot quote £750 and hand the visitor
the US offer. It also means a visitor cannot shop geo with a VPN — there is nothing to shop.

Consequences to respect:

- **Every geo needs its own door slug and its own `landing_pages` row** (`shein-gb`, `freecash-jp`).
  A shared slug collapses every geo back onto one row with one geo — the original bug.
- **Language lives in `LOCALES` (geo → lang) and `STRINGS` (lang → every visible word).** Adding a
  language is one `STRINGS` entry; adding a geo is one `LOCALES` line. `AT` deliberately maps to
  `de`. Copy is substituted at BUILD time, so a missing key can never reach a visitor as a raw
  `{amount}` placeholder — it fails the build instead.
- **A brand with `amounts: null` quotes no figure at all** and uses the `*NoAmount` copy variants.
  Freecash ships this way to MATCH ITS LIVE PAGE, which leads with "Get Paid For Screen Time" and
  names no sum — not because the existing page is a compliance problem. ✅ **Migi confirmed with
  Ricky (screenshot sent, 2026-07-26) that the current Freecash lander IS compliant**, social proof
  included. Do not strip things from it on compliance grounds. The rule that still stands is
  narrower: do not INVENT a figure or a statistic that has no data behind it.
## Freecash has its OWN generator — `_lp-generator/freecash.js`

`/50FC/FC1` is a specific, proven-converting page (ticker · live counter · rating pill · offer card
· stats row · sticky store buttons · quick-tip interstitial). ✅ **Migi confirmed it compliant with
Ricky directly** (screenshot, 2026-07-26) — social proof included. It is NOT a compliance problem
and must not be "cleaned up".

So the Freecash geo pages are that exact page TRANSLATED, not rebuilt on the sweep template:

```bash
node _lp-generator/freecash.js --clones 30      # 7 geos x (1 canonical + 30 clones) = 217 files
```

`_lp-generator/freecash-template.html` is a byte copy of the approved page. The generator swaps
ONLY: language strings, `<html lang>`, the flag, the ticker names, the number locale, the door slug,
and it injects the `?lg=` router into `<head>`. Layout, CSS, markup and behaviour are byte-identical.
**Every substitution is asserted** — if the template is edited so a source string stops matching, the
build throws instead of silently emitting an English page into a Japanese slot.

⚠️ **`build.js` must never carry a Freecash entry again.** Both generators write into `50FC/`; a
Freecash brand in `build.js` would overwrite these with the generic sweep design.

**Money stays in USD on every locale.** $1,250–$1,500 / $11.60 / $50M+ are not converted. Freecash
pays out in USD via PayPal/Visa/crypto, so USD is the truthful figure — converting would mean
inventing an exchange rate and publishing an unverified earnings number.

- **`?lg=<GEO>` is the affiliate's geo selector.** The affiliate picks a country on their end and
  their link carries `?lg=JP`; landing on ANY geo's page with it redirects to that brand's page for
  that geo, keeping the clone index so the URL footprint stays spread
  (`/50FC/US7?lg=JP` → `/50FC/JP7`). Every param rides across; `lg` is stripped from the outbound
  door URL because it routes the lander, not the network. `UK` folds to `GB`. A geo the brand does
  not sell is ignored rather than redirected into a 404.
  It is computed from `location.pathname` (not a baked per-clone table) precisely so every clone in
  a slice stays byte-identical. It handles the bare path, a trailing slash AND `/index.html` — a
  silent non-redirect would land Japanese traffic on the English page.
  **This is not cloaking**: it keys off an explicit query param, never the user agent, and does the
  same thing for every visitor including ad-review crawlers.
- **Never hand-edit a clone.** Each (brand, geo) slice is 30 files written from one buffer, so it is
  exactly one md5. Hand-editing is how `RS50/RS1` drifted. Change `BRANDS`/`STRINGS` and regenerate.
- The legacy `50FC/FC1..FC50` (slug `freecash`, geo `us`) are hand-built and are NOT touched by the
  generator. The generated US equivalent is `50FC/US1..US30` (slug `freecash-us`). Run one or the
  other, not both — the per-geo affiliate guard refuses the same affiliate on two same-geo landers.

## How to change a lander (edit canonical + propagate)

Edits must land on the canonical file AND every copy, or the set drifts. From the repo root:

```bash
# Freecash — canonical is FC/index.html; propagate to FCTT, root, and all 100 numbered folders
for i in $(seq 1 50); do cp FC/index.html 50FC/FC$i/index.html; cp FC/index.html 50FCII/FC$i/index.html; done
cp FC/index.html FCTT.html; cp FC/index.html index.html
# Testerup / Copper
for i in $(seq 1 50); do cp TU/index.html 50TU/TU$i/index.html; done
for i in $(seq 1 50); do cp CB/index.html CR50/CR$i/index.html; done
# Carrd-cloaked affiliate funnel landers (same depth as FC/TU, so a plain copy is safe)
cp FC/index.html CLFC/index.html; cp TU/index.html CLTU/index.html
# Verify each brand is ONE hash:
md5 -q FC/index.html FCTT.html index.html 50FC/FC*/index.html 50FCII/FC*/index.html | sort -u   # expect 1 line
```

> **RS50/RS1 divergence — reported 2026-07-26, deliberately NOT normalised.** Confirmed by hash:
> 49 of the 50 RS50 clones share `c76e8ca6…`, and `RS50/RS1` alone is `e09787126…`. That matches
> the "RS1 is a unique interstitial" note above, so it may be intentional — but it is also exactly
> what an accidental hand-edit looks like, and it is the same shape as the FC1 incident (FC1 was
> the lone broken clone AND the LP assigned to Freecash). Left as-is pending Migi's call. If it
> turns out to be stale, the fix is `cp RS50/RS2/index.html RS50/RS1/index.html`, not a rewrite.
> **The general lesson, and why the sweep landers are generated:** never hand-edit one clone.

`RS50` is special: RS1 is a unique interstitial, RS2–50 are identical; both variants just forward
the full query to `/RS/`. To strip a shared block from all 50 at once, use a Python exact-string
replace (the block is byte-identical across folders) rather than `cp` (which would clobber RS1).

The offer URL is built at runtime by an inline `<script>` (Path A) or `js/tsup-offer.js` (TSUP): it
reads `location.search`, optionally derives `s1` from `mc_attr` (MaxConv fallback — `f.e || f.c`,
and if neither exists it leaves s1 EMPTY, never fabricates one), and sets the CTA `href`. The CTA
markup stays `href="#"` so a pre-JS click can't fire a param-less door hit.

## Testing a new lander on live Carrd traffic (`lp=`)

To point one ad link at a specific landing page — split-testing a new lander, or trying a variant —
put `lp=` on the ad link:

    https://anypage.carrd.co/?campid=SPK-A1B2-C3D4&lp=trt

`lp` beats every other routing signal (campaign mapping, `o=`, `CARRD_ROUTES`, default). Run two
links with two `lp` values to split-test; each arm keeps its own spark code so they stay separable in
reporting. **No deploy is needed to change where a link points** — only to create the lander itself.

Accepted values: a bare path (`trt`, `50FC/FC7`, `FCTT.html`), a full `https://www.tokrwd.co/…` URL,
or a registered alias from `OVERRIDE_LANDERS` in `api/_lib/links-config.js`.

### Every registered lander is BOUND TO ITS OFFER

`lp=` picks a page, and every lander hardcodes its own door — so pointing an ad at the wrong page
does not fail, it **credits the wrong offer** and the campaign just reads as underperforming. Each
`OVERRIDE_LANDERS` entry therefore declares what it fires:

```js
export const OVERRIDE_LANDERS = {
  trt: { path: '/trt', offer: 'testerup-mon', owner: 'Trae / TenX — scaler (aff #2)' },
};
```

Three things enforce it:
1. **Build** — `_links-config.test.mjs` reads the lander's real HTML off disk and fails if its door
   contradicts the declared `offer`. Verified to bite: flip `trt` to `freecash` and the suite fails.
   It also asserts every `LANDER_URLS` entry is offer-bound and matches its page.
2. **Admin preview** — the Test Lander tab shows "Fires offer" for whichever rule won, and raises an
   `OFFER MISMATCH` warning when the ad's `o=` disagrees with the page `lp=` sends it to.
3. **Runtime** — `/r` logs the mismatch. It does **not** drop the click: a paid click is worth more
   than a clean log line, and the override is the operator's explicit instruction.

**Scalers.** Self-managed affiliates (`role='scaler'` in SPRK) run their own tracking with custom
non-SPK campids (`TRAE_spark97_US_…`) and settle by invoice. Their landers live outside the `CL*`
set, so `OVERRIDE_LANDERS` is the only place their lander↔offer pairing is written down — always
fill in `owner`. Adding one is a single line plus `node api/_lib/_links-config.test.mjs`; the roster
itself lives in SPRK Supabase (`user_profiles.role`), not in this repo.

**Why it rides the link and not a database.** There is no database. Every `api/*.js` file is its own
Vercel lambda with its own module instance, so anything the admin dashboard writes to
`api/_lib/store.js` is structurally invisible to `api/r.js`. A param on the ad link is readable by
the lambda that actually decides. Do not "improve" this into an admin-stored override without adding
real shared storage first.

**Why an untrusted param can pick the lander.** `lp` is resolved against a HOST ALLOWLIST
(`DEFAULT_LANDER_ORIGIN` + `LANDER_URLS` hosts + `EXTRA_LANDER_HOSTS`), so it can only ever name a
page on a domain we own — a crafted value cannot make `/r` an open redirect. Query and hash are
stripped so it cannot smuggle an `s4` (which would suppress the door's offer label). An `lp` that
fails validation falls THROUGH to normal routing rather than dropping the click.

The decision lives in `resolveLander()` in `links-config.js` — shared by `/api/r` and by the admin
dashboard's **Test Lander** tab, which builds these links, dry-runs them through the same function,
and HEAD-checks that the lander is actually deployed. Run `node api/_lib/_links-config.test.mjs`
after touching any of it.

Gotcha: the Carrd embed caches `/r`'s answer in `sessionStorage` keyed by campid. Switching the page
under test with the same campid in the same session keeps loading the old lander — use a different
campid or a fresh private window.

### Assigning an override link to an affiliate

The Test Lander tab has an **Affiliates** list: name, email, campid, and a **Scaler** flag. Pick an
affiliate and the campid auto-fills, so the flow is *affiliate → Carrd page → offer → link*.

The **campid is the attribution**, not the email — the email is a label so a pile of links stays
legible. There is no affiliate DB in this repo (the roster is SPRK Supabase), so the list is
browser-local, same as the saved landers.

Tick **Scaler** for self-managed affiliates (Trae/TenX etc). Their codes are legitimately not
`SPK-` shaped, so the SPK-format warning is replaced with the one that actually applies to them:
*confirm the code is registered in SPRK (`subid_owners`) or conversions still land unmatched.*
Verified that custom codes (`TRAE_spark97_US`, `sub-abc123`, `CB19-1`) survive `/r` intact as `s1`.

## EVERYTHING routes through our own tracking (2026-07-26)

**Rule:** every outbound hop in this repo goes through tracking we run. Ours, best first:

1. `sprktrax.org/api/link/<slug>` — the door. Spark code resolved, `clicks` row, `click_id` minted,
   s1/s2/s4/s5 stamped, caps + `pulled` kill switch. This is "our bot".
2. `/c/<slug>` on `appflowconnect.com` or `www.tokrwd.co` — our code, our deploy. `mode:'direct'`
   mints no click_id, so matching leans on what the network echoes to `/postback`.
3. `sprktrax.org/aff_c?t=…` — the permanent universal link.

**Never ship** a lander wired straight to a network URL, or to a cloaker domain we do not run. This
supersedes the old "don't fix Path B unless Migi asks" note — he asked. Re-pointed 2026-07-26:
`trt` (was `buenohoodies.com` — a *separate* deploy where the same slug resolved to a different
tracker, so our `OFFER_LINKS` edits never reached it), `TSUP` and `Rewards` (were bare
`monetisetrk8.co.uk` URLs), and `/api/reco` (hardcoded network URL → `reco-social-off` in
`OFFER_LINKS`, so it can now be capped and killed).

`node api/_lib/_tracking-audit.test.mjs` enforces it: no direct network links, every `/c/` on a host
we run, every referenced slug enabled in `OFFER_LINKS`, every door URL equal to `DOOR_BASE`, and no
third-party tracker scripts. Consciously-deferred offenders live in its `EXCEPTIONS` map and are
**printed on every run** — anything unlisted fails the build.

Still open (business calls, in `EXCEPTIONS`): `api/affrkr.js` → `affrkr.com`, `api/copper.js` →
`trendhavenn.com`, and `EOZ.html`'s `vmry7.ttrk.io` script. All three pages are live but orphaned —
nothing in the repo links to them.

## s1–s5 wire scheme (what tracks)

- **Inbound to the lander:** `s1 = <SPK>` (opaque `SPK-XXXX-XXXX` spark code, THE attribution key) ·
  `s2 = <publisher>` · `s3 = <ad account>` (or campaign id for self-launched TikTok) · `s4` empty ·
  `ttclid` empty-or-set. The lander forwards ALL of them unchanged.
- **Outbound (door re-stamp, Path A):** `s1 = <affId>` — the **pure affiliate number, no `aff`
  prefix** (changed 2026-07-23; was `aff<N>` before) · `s2 = <SPK>` · `s3 = ad account` · `s4 = offer
  name` · click_id in `offers.clickid_slot` (default `s5`).
- The door **404s any click whose s1 isn't a valid SPK** — so an untagged/blank visit fails closed.
  That is why removing the blank-page gate does NOT weaken attribution: the door is the real gate.

Full detail + the mint rules live in `sprk-new-offer`. Seeing a bare affiliate number (e.g. `26`) in
the network's s1 column is CORRECT — don't "fix" it back to SPK.

## Verify before you ship (do this every time)

Source diffs lie about runtime behavior. Prove it in a browser:

```bash
cd <repo> && python3 -m http.server 8899 &     # serve statically
```

Load each edited lander with a full query, e.g. `http://localhost:8899/50FC/FC1/index.html?s1=SPK-TEST-0001&s2=pub9&s3=acct7&s4=&ttclid=`, then check in the page:
- the CTA / `a.offer-link` / `a.door` / `#tipGo` href is the correct door URL carrying **every**
  param (this catches the classic "gate removed but wiring guard left → dead `#` CTA" bug),
- no cloaking script remains (`x-safari`, `intent://`, `__SUBID_OK`, `document.write`),
- images load (no 404 from the deeper folder path),
- a BARE visit (no query) does not fabricate an `s1` (no `s1=mc`).

Repo-wide clean check (must return nothing outside `justincase/` and `SIGNAT~1/`):

```bash
grep -rlE "x-safari|intent://|googlechrome-x-callback|musical_ly|bytedance|__SUBID_OK|display:none!important" \
  --include="*.html" --include="*.js" . | grep -vE "/(\.git|justincase|SIGNAT~1)/"
```

## Deploy / push mechanics

`main` is the deploy branch. Pushing to `origin/main` triggers the Vercel production deploy, so it is
a real, outward-facing action — confirm with Migi first unless already told to push. `git push origin
HEAD:main` from a worktree branch avoids a checkout. `.vercelignore` keeps `justincase/` + `SIGNAT~1/`
off the live domain (note: `justincase/` is also untracked, so it wouldn't deploy regardless).

## Changelog

- **2026-07-21** — Removed the in-app-breakout prelander. All 150 numbered folders (50FC/50TU/CR50)
  became byte-identical copies of the canonical `/FC` `/TU` `/CB` landers. One prelander per brand
  archived, unwired, in `justincase/` (+ restore loops in `justincase/README.md`).
- **2026-07-23** — Stripped ALL client-side cloaking (blank-gate + breakout) from every deployed
  lander: FC/TU/CB + their 200 copies, root `index.html`, `GP`, `GP/ob`, `TSUP` (+`js/tsup-offer.js`),
  `RS`, `RS50` ×50; `50FCII` brought in line with `50FC`. Deleted `api/frcsprk.js` + its `/frcsprk`
  route/headers. Fixes: `js/ttclid.js` `has()`→`get()` (empty `ttclid` now backfills from cookie);
  added `ttclid.js` to Freecash; FC no longer fabricates `s1='mc'` on untagged visits. `SIGNAT~1/`
  added to `.vercelignore`. Shipped `main` `dc4cc3d`. Outbound s1 `aff` prefix dropped → pure number.
