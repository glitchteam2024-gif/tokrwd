# Master build prompt — per-geo offer routing + sweep landing pages

> Paste everything below the line into a fresh Claude Code session running locally in
> `~/Documents/GitHub/SPRKNetworkAds`. It is self-contained.

---

You are working on SPRK Network. Follow the standing rules in `CLAUDE.md`, `api/CLAUDE.md` and
`docs/current-task.md`. Read `docs/error-log.md` before debugging anything. **No push, deploy,
merge, production migration or worker restart without Migi's explicit approval — ask every time.**

There are three build parts (A, B, D) plus verification (C). **Part A is money-path code and must land first.** Part B depends on it.

---

# PREFLIGHT

Four stale git lock files from a remote session cannot be removed by anything but you. Clear them
or every git command fails:

```bash
cd ~/Documents/GitHub/SPRKNetworkAds
rm -f .git/index.lock .git/refs/heads/feat/offer-destination-by-geo.lock \
      .git/worktrees/offer-destination-by-geo/HEAD.lock \
      .git/worktrees/offer-destination-by-geo/index.lock
git fetch
git worktree list
```

A branch is already cut: **`feat/offer-destination-by-geo`**, from `origin/main` at `7a15737`, in
`.claude/worktrees/offer-destination-by-geo`. Use it, or re-cut from the current `origin/main` if it
has moved. **Never work on `main`** — it carries ~89 uncommitted files belonging to Migi that must
not be touched.

Verify every claim in this document against `origin/main`, not the local working tree. The local
checkout goes stale fast.

---

# PART A — per-geo destination routing

## A0. The problem

`offers.destination_url` is a single column. There is no geo routing anywhere in the codebase —
confirm with `git grep destination_by_geo origin/main` (returns nothing). `payout_by_geo` prices per
geo but does **not** route per geo.

This is live right now. The **Freecash** offer carries 7 geos (US GB CA JP DE AT NL) behind one
`destination_url` pointing at `c=55504` — Monetise's **[US]** link. Every non-US click lands on the
US offer. Three more offers (Shein, Sephora, Cash) are staged as Drafts in the same shape, blocked
on this feature.

Affiliates must keep seeing **one** offer card per brand with several geo flags. Routing happens
server-side at the click door.

## A1. Migration

`migrations/2026-07-26_offer_destination_by_geo.sql`

```sql
alter table offers
  add column if not exists destination_by_geo jsonb not null default '{}'::jsonb;
```

`NOT NULL DEFAULT '{}'` is deliberate — copy `2026-07-22_offer_geo_payouts.sql`. An explicit NULL
raises `23502`, `isMissingColErr` does not match that code, and the write 500s instead of retrying.
**Clear the map with `{}`, never `null`.**

Include read-only verification queries for the column, its type and its default.
**Do not run this against production.** Hand Migi the SQL.

If you add columns for A4 (served destination + resolved geo on `clicks`), put them in this same
migration file.

## A2. `api/offers.js`

Add `destination_by_geo` to:

- the POST destructure
- the insert `row`
- the PATCH `allowed` array
- `OPTIONAL_COLS`

New `normDestinationByGeo(v)`:

- upper-case keys; reject anything that is not a 2-letter A–Z code
- run **every** URL through the existing `launchLinkProblem` oracle in `api/_lib/subid.js` — the
  same screen `set_link_override` / `set_default_link` / `save_landing_page` already use (https
  only, no fragment, no embedded `s1=`)
- **fail closed.** If any single URL fails, reject the whole payload with a 400 naming the geo and
  the reason. Never silently drop one entry — a missing geo link is a mis-route, which is worse than
  a failed save
- cap the map at ~40 entries
- return `{}` for empty, never `null`

Do **not** extend `applyRevshareGuard`. Destination routing is orthogonal to pricing mode; a
revshare offer needs per-geo links as much as a fixed one.

## A3. The click door — `api/_lib/tracking.js`

In `buildClickDestination`, resolve as:

```
destination_by_geo[<resolved geo>]  ||  destination_url
```

Two ordering rules that matter:

- Resolve **after** cap fallback. A capped click that falls back to another offer must use **that
  offer's** geo map, not the original's.
- `stampAffiliateSubids` runs on whichever URL wins, so `s1`–`s5` and the click_id land on the
  served link.

**Geo source: `x-vercel-ip-country`.**

> ⛔ **STOP CONDITION.** Before building on this, prove a client cannot set that header themselves.
> Write a test that sends a forged `x-vercel-ip-country` and asserts routing does not change. If it
> IS forgeable, stop and report to Migi — an affiliate choosing their own destination is an
> attribution and payout hole, and it invalidates this whole design.

## A4. Freeze what was served

The `clicks` row must record the destination actually served **and** the resolved geo, the same way
cap fallback already freezes the served offer. Without it a conversion cannot be explained after the
fact and reconciliation against CAKE has nothing to join on.

## A5. Admin UI — `admin/_common/admin-app.js` + `admin/networks/index.html`

Step 2 of the Add/Edit Offer wizard already renders one row per GEO chip (from `offerGeos`) with a
gross amount and computed net. **Add a destination-link input to that same row**, so adding a geo
gives: flag · gross · net · link.

- Serialise into `destination_by_geo` in `saveOffer()` next to the existing `payout_by_geo` loop
- Load into per-geo state on the edit path
- Only include geos still present in `offerGeos` — same rule the payout loop uses

## A6. Guardrails — do not skip

- **Unlinked-geo warning.** If a geo is in `countries` but absent from `destination_by_geo`, surface
  it in the wizard. That unwarned state is exactly the live Freecash bug.
- **Loud-loss toast.** If the API tolerantly strips `destination_by_geo` pre-migration, `saveOffer`
  must fire an error toast. Follow the existing pattern for `payout_tiers`, `cap_period`,
  `affiliate_payout`, `payout_by_geo`. This column carries routing, so it needs one most.
- Never log a full destination URL.

## A7. Tests

Extend `api/_lib/_tracking.test.mjs` and the `_buildDestination` suite:

1. geo present in map → serves the mapped URL
2. geo absent → falls back to `destination_url`
3. **empty map → byte-identical to current behaviour** (regression guard for all 13 existing offers)
4. forged `x-vercel-ip-country` → no routing change
5. cap fallback + geo map → serves the *fallback offer's* map
6. map entry failing `launchLinkProblem` → whole save rejected, nothing persisted
7. HEAD vs GET → HEAD still writes no `clicks` / `lp_clicks` rows
8. subid stamping applied to the geo-selected URL; click_id in `clickid_slot`

Also run the existing suites — `_ssrf` (40), `_tracking` (7), `_buildDestination` (10) — and
`node --check` on every changed `api/*.js`.

## A8. Backfill

Three Draft offers hold their geo→link maps in `offers.notes` as JSON. **Read them from the DB, do
not retype.** For reference:

**Rewards - Shein $750** — code `RWSHEIN`, geos US GB CA AU
```
US → https://montrk2.co.uk/?a=26648&c=56271&p=r&s1=
GB → https://monetisetrk8.co.uk/?a=26648&c=56272&p=r&s1=
CA → https://monetisetrk4.co.uk/?a=26648&c=56275&p=r&s1=
AU → https://monetisetrk8.co.uk/?a=26648&c=56276&p=r&s1=
```

**Rewards - Sephora $750** — code `RWSEPH`, geos US GB CA AU
```
US → https://montrk4.co.uk/?a=26648&c=56274&p=r&s1=
GB → https://montrk3.co.uk/?a=26648&c=56273&p=r&s1=
CA → https://montrk.co.uk/?a=26648&c=56277&p=r&s1=
AU → https://montrk5.co.uk/?a=26648&c=56279&p=r&s1=
```

**Rewards - Cash Prize** — code `RWCASH`, geos US GB AU
```
US → https://montrk2.co.uk/?a=26648&c=56077&p=r&s1=
GB → https://montrk4.co.uk/?a=26648&c=56078&p=r&s1=
AU → https://montrk.co.uk/?a=26648&c=56079&p=r&s1=
```

Once stored properly, strip the `GEO_LINKS` blob and the DO-NOT-ACTIVATE warning from `notes`.

**Freecash's 7 per-geo links are NOT yet collected.** Only US is known (`c=55504`; the portal serves
host `montrk5`, the stored row says `montrk3`). To collect: log into mymonetise.co.uk → Offers →
Status filter = Active → open each `Freecash - New CPA [XX]` → **Creatives** tab → take the row whose
Type column is **`Link`** (not Image/Email) → read `c=` from its Unique Link. `[CA]` and `[UK]` each
appear twice at different payouts; the live SPRK config uses the **lower** of each pair
(UK $13.46, CA $14.13).

---

# PART B — sweep landing pages

Landers live in the **tokrwd** repo — `~/Documents/GitHub/tokrwd`
(`github.com/glitchteam2024-gif/tokrwd`), a **Vercel** project. Six pages are **already written
into it**, matching the existing one-directory-per-lander convention:

```
~/Documents/GitHub/tokrwd/
    SHEIN/index.html      door slug: shein
    SEPH/index.html       door slug: sephora
    CASH/index.html       door slug: cash
    APAY750/index.html    door slug: applepay750
    APAY1K/index.html     door slug: applepay1000
    UBER/index.html       door slug: ubereats
    _lp-generator/build.js   regenerate all six: node _lp-generator/build.js
```

They already follow the **proven `CR50/CR1` (Copper) pattern** in that same repo — full
`URLSearchParams` passthrough to the door, the `mc_attr` fallback, and the `/js/ttclid.js` include.
Read `CR50/CR1/index.html` before changing any of them.

**Read `MAPPING.md` (delivered alongside this prompt) — it is the authoritative
offer ↔ door ↔ lander table, including every per-geo `c=` value and the Vercel middleware sketch.**

⚠️ `middleware.js` must live at the tokrwd **repo root** with a `matcher` config. The
`/functions/<slug>/_middleware.js` pattern on the old SHEIN page is **Cloudflare Pages syntax and
does not run on Vercel.** There is no root middleware in tokrwd today — you are adding it.

## B1. Four defects in the existing SHEIN750 page — fix these, do not replicate them

**1. It bypasses the SPRK door.** The CTA goes to `https://ftblltrck.com/?lnwk=…&s1=`, a direct
network URL, skipping `sprktrax.org`. No click_id minted, no `clicks` row, no owner frozen at click
time. This is bypass failure mode C in `sprk-subid-attribution`, and `sprk-new-offer` step 3
forbids it. Note `ftblltrck.com` / `t.afftrackr.com` are not even Monetise hosts — those are the
seven `montrk*` / `monetisetrk*` domains.

**2. `s1` is overwritten with the campaign name** — `url += encodeURIComponent(campaign)` appends
onto a trailing `&s1=`. `s1` must carry the affiliate's spark code only (Ricky, 2026-07-16: *"pass
your S1 values to look like affiliate IDs"*). The door translates `s1` → bare affiliate id, SPK →
`s2`, click_id → `s5`. A campaign name in `s1` means no owner resolves: revoke gate skipped, no
`aff<N>` stamping, ownerless `clicks` row.

**3. Fabricated social proof** — `12,847 Redeemed` / `2 min ago` are hardcoded. Monetise's
restrictions on these offers include *"No False Earning Claims"*, and Ricky already pulled an ad for
implying unrealistic earnings.

**4. Third-party wordmarks** — Ricky, 2026-07-14: *"Can't use block blast logo or any 3rd party.
Can be mentioned in text but not use logos."* The staged pages use **text** wordmarks, not image
logos, which is the safer end of that line. Flag it to Migi before scaling spend.

## B2. What the staged pages already do

Same funnel structure as the SHEIN original — badge → wordmark → title → amount → stats → 3 steps →
CTA → trust — with the four defects fixed:

- CTA targets `window.__DOOR_URL__` = `https://sprktrax.org/api/link/<slug>`
- `s1` carries the incoming spark code only, placed **last** in the query string (ad automations
  append to the tail); campaign rides `utm_campaign`, TikTok id rides `ttclid`
- stats bar renders only when `window.__STATS__` is supplied; `null` by default, bar hidden
- unsubstituted TikTok macros stripped; soft bot detection retained; bfcache bust retained

| Lander | Door slug | SPRK offer | Geos |
|---|---|---|---|
| `SHEIN/index.html` | `shein` | Rewards - Shein $750 | US GB CA AU |
| `SEPH/index.html` | `sephora` | Rewards - Sephora $750 | US GB CA AU |
| `CASH/index.html` | `cash` | Rewards - Cash Prize | US GB AU |
| `APAY750/index.html` | `applepay750` | Rewards US - Apple Pay $750 | US |
| `APAY1K/index.html` | `applepay1000` | Rewards US - Apple Pay $1000 | US |
| `UBER/index.html` | `ubereats` | Rewards UK - Uber Eats £50 | GB |

**Apple Pay is two offers, two doors, two landers** — $750 and $1000 are both US, a prize tier not
a geo, so per-geo routing cannot distinguish them. Keep them separate all the way down.

**Also fix `Rewards/index.html`** (Freecash) in the same pass — it bypasses the door exactly like
the old SHEIN page, hitting `monetisetrk8.co.uk/?a=26648&c=55504` direct. Point it at
`https://sprktrax.org/api/link/freecash`; that slug already exists. `ApplePay/index.html` is a 3KB
placeholder with no offer URL — leave or delete, it is not part of this task.

## B3. Middleware contract

Each page expects a root **Vercel Edge Middleware** (`middleware.js`, matcher on the six lander
directories) to inject, based on `x-vercel-ip-country`:

```js
window.__DOOR_URL__   = "https://sprktrax.org/api/link/<slug>";
window.__GEO_AMOUNT__ = "$750";     // display string
window.__GEO_VALUE__  = 750;        // numeric, for pixel events
window.__STATS__      = null;       // or [{value,label}, …] — real numbers only
```

Multi-geo pages (`sephora750`, `cashprize`) currently render the first geo's amount as a fallback.
**Cash differs by geo — US $1,000 / GB £750 / AU $750 — so do not ship it geo-blind.**

Also confirm the TikTok pixel id. All five carry `D6CF3ABC77U56TVAPJPG`, copied from the SHEIN page.
If brands run separate pixels, change it in `BRANDS` and regenerate with `node build.js`.

## B4. `landing_pages` rows

Create one row per slug — `shein`, `sephora`, `cash`, `applepay750`, `applepay1000`, `ubereats` —
so `https://sprktrax.org/api/link/<slug>` resolves. Existing slugs in the repo for reference:
`copper`, `freecash`, `gravypass`, `testerup`.

**Leave `enforce_assignment` FALSE.** Flipping it before `landing_page_affiliates` is populated
404s every resolved owner. Per `sprk-new-offer` step 8, assignment and enforcement come last, and
the two rosters (`landing_page_affiliates` for the click door, `offer_assignments` for the postback
hold) are separate — mirror both fully before flipping either flag.

---

# PART D — offer card: square thumb → 16:9 vertical tile

**File: `SPRKNetworkAds/offers/index.html`** (the affiliate Offer Library).

## The defect

The card is a horizontal row with a square-ish thumb column:

```css
.offer-card      { display:flex; min-height:152px; ... }
.offer-card .thumb-wrap { position:relative; width:160px; flex-shrink:0; ... }
.offer-card .thumb      { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
@media (max-width:480px){ .offer-card .thumb-wrap { width:112px; } }
```

160 × 152 is ≈ 1.05:1. The new offer art is gift-card shaped (800 × 512, ≈ 1.56:1), so
`object-fit: cover` **crops the left and right off** — losing the brand wordmark and most of the
design. On mobile (112px) it is worse.

## What to build

Convert the list to a **vertical tile grid**: a **16:9 hero image on top**, text below.

- `.offer-card` → `display:flex; flex-direction:column` inside a responsive grid
  (roughly `repeat(auto-fill, minmax(260px, 1fr))`)
- `.thumb-wrap` → full card width, `aspect-ratio: 16 / 9`, no fixed px width
- `.thumb` → keep `object-fit: cover`; at 16:9 vs the art's 1.56:1 the crop is small and
  **horizontal only**, so the wordmark survives
- Keep the existing `onerror` hide on the `<img>` — thumbnails 404 until tokrwd deploys
- Move `.job-tag`, `.payout-badge`, `.go-btn` into the tile layout; keep the geo flag row
- Preserve `.offer-card:hover` treatment
- Drop the `@media (max-width:480px)` thumb-width override — it no longer applies

⚠️ **Do not crop the bottom of the art.** Every card carries a grey disclaimer bar reading
*"Offer not sponsored-endorsed by this brand."* That bar is the compliance cover for using
third-party brand names. A vertical crop would cut it off. 16:9 against 1.56:1 source crops
horizontally only — verify that holds after your CSS lands.

Check the same thumbnail treatment on the overlay (`ovThumb`) and the `w-12 h-16` spark-list
thumb further down the file — both currently assume portrait/square.

## Thumbnails already wired

Three offers have `thumbnail_url` set (all still Draft):

| Offer | thumbnail_url |
|---|---|
| Rewards - Shein $750 | `https://www.tokrwd.co/images/shein750-us-16x9.png` |
| Rewards - Sephora $750 | `https://www.tokrwd.co/images/sephora750-us-16x9.png` |
| Prograd App | `https://www.tokrwd.co/images/prograd-16x9.png` |

Those files are committed in tokrwd `images/` but **not yet deployed** — they 404 until tokrwd
ships. That is expected; the card's `onerror` hides a broken image.

Source art (800×512) is also in tokrwd `images/` as `shein750-us.png` / `sephora750-us.png` — kept
as source only. **The landers deliberately do NOT show the card art** (owner decision, 2026-07-26):
they use the text wordmark + big amount. Do not add a hero image to the sweep landers. The `-16x9`
variants are padded, never cropped, with a blurred bleed, and exist solely for the offer cards.

## Currency note — deliberate, do not "fix"

The thumbnails read `$750` even on GB/CA/AU. That is intentional: **the offer card is
affiliate-facing**, and the affiliate is not the converting party. The **prospect** only ever sees
the lander, where `__GEO_AMOUNT__` injects the correct currency per geo. Do not build per-geo
thumbnails.

---

# PART C — verification before anything goes live

Per offer and per lander:

- `curl -sI 'https://sprktrax.org/api/link/<slug>?s1=SPK-TEST-0000'` → 302 whose Location reaches
  the Monetise URL with the subid wire intact. **HEAD writes no `clicks` / `lp_clicks` rows.**
- Exactly **one** deliberate GET on the test code → confirm click_id lands in `clickid_slot` (`s5`).
  This writes one ownerless `clicks` row plus one `lp_clicks` row — known residue. **Do not follow
  it through the network funnel** or you manufacture an unmatched conversion in your own audit.
- A bare lander URL with no `s1` must still render (preview) while the door 404s.
- With the geo map populated: confirm two different `x-vercel-ip-country` values produce two
  different Location hosts.
- Read-only SQL: `destination_by_geo` present and correct for the four multi-geo offers; every geo
  in `countries` has a link.
- All offers still `status='draft'` except the four that were already live.

---

# Reference data

**Network:** Monetise (CAKE). `offers.network_id` = `acfb1539-cc7f-4a78-9a1b-3b3ba9990662` — same
UUID as the postback's `net=` parameter.

**Postback is account-global**, already set: `…&s1=#s1#&s2=#s2#&s3=#s3#&s4=#s4#&s5=#s5#&cid=#s5#
&payout=#price#&txid=#tid#`. `cid=#s5#` matches `clickid_slot='s5'`. New offers inherit it — no
per-offer postback work. **Do not disturb the slot.**

**Current offers (13):** 4 active — Testerup `TU`, Copper Banking `CB`, Reco Social `RS`, Freecash.
9 draft — Shein `RWSHEIN`, Sephora `RWSEPH`, Cash Prize `RWCASH`, Apple Pay $1000 `RWUSAP1K`,
Apple Pay $750 `AA`, Uber Eats £50 `RWUKUBR`, Prograd `PG`, Cashback `CSHUK`, Gravypass `GP`.

**Caps still to configure before activation:**
- Prograd — 20 conversions/day (Kerry, 2026-07-15)
- Reco Social — **cap counts INSTALLS, not conversions** (Ricky: *"we are capped on specifically
  installs"*). Needs `cap_event = 'install'`. Currently live and possibly mis-counting.
- Testerup 200/day and Gravy Pass 250/day already known
- Revshare offers: no cap
- Monetise caps reset **midnight UK**; SPRK `cap_period='daily'` resets **midnight UTC** — a
  one-hour offset under BST.

**Gotchas that will bite you:**
- Country codes are ISO **`GB`, not `UK`**. Monetise names say "UK"; the column stores `GB`.
- Monetise rotates **seven** tracking hosts — `montrk`, `montrk2`, `montrk3`, `montrk4`, `montrk5`,
  `monetisetrk4`, `monetisetrk8`. They appear interchangeable. **Do not normalise to one domain**; a
  host difference is not automatically a defect.
- **`&p=r` appears on revshare offer links only.** It is part of the wire — preserve it.
- `writeOfferTolerant` silently strips optional columns on schema-cache misses — hence the
  mandatory loud-loss toast.
- Freecash payouts are GBP-denominated and stored as FX-snapshot USD. Ricky is building a
  fixed-USD-payout path, ETA 2026-08-05. Don't design around the current numbers.

**Known open item:** the account's postback key sits in plaintext in the `#monetise-x-mrgltllc`
Slack channel, which includes external partners. Monetise needs it to function, so it can't be
secret from them, but it should be rotated and kept out of chat history. Not part of this task —
raise it with Migi.

---

# Definition of done

- Empty `destination_by_geo` ⇒ current behaviour, provably unchanged (test asserts it)
- Bad URL in a map ⇒ whole save rejected, nothing persisted
- Geo header proven unforgeable, or the finding reported and the feature paused
- Served destination + resolved geo frozen on the `clicks` row
- Unlinked-geo warning and loud-loss toast both present
- Five landers routed through the door, `s1` untouched, no fabricated stats
- `landing_pages` rows created, `enforce_assignment` FALSE
- All existing suites green; `node --check` clean on changed files
- **Nothing pushed, deployed or migrated without Migi's explicit approval** — hand him the
  migration SQL, do not run it
- Sanitised entry appended to `docs/error-log.md` for the Freecash mis-routing defect
- Update `.claude/skills/sprk-offer-intake/SKILL.md` and `sprk-new-offer/SKILL.md` with anything new
  learned — they are living documents
- Close in the standing format: precise click-to-conversion trace, ELI5 recap, tests performed,
  attribution/money impact, security impact, remaining risks
