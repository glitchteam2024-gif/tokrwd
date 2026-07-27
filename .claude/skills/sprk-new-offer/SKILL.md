---
name: sprk-new-offer
description: >-
  End-to-end checklist for adding a NEW offer to the SPRK network — offer row, tracking door,
  trustonedeal landers, creatives, network postback — with attribution locked to opaque
  SPK-XXXX-XXXX spark codes on every offer. Use whenever Migi says anything like "add the next
  offer", "new offer", "set up <brand>", "build landers for <offer>", "wire up tracking for
  <offer>", or asks why an offer-code subid (CB18-1 / TU26-3 style) is popping up in reports.
  The offer's short code (CB, TU, FC…) is a DISPLAY label only — it must never become a spark code.
  ALSO covers REVSHARE offers (payout varies per conversion) — use for "revshare", "rev share",
  "take a percentage of each conversion", "variable payout", "the offer pays a different amount
  each time", or any request to change SPRK's cut/split on an offer. Short answer lives in the
  "Revshare offers" section: the percentage take ALREADY works on a variable gross — do not
  build a pricing engine. The job is leaving `offers.payout_by_geo` and `offers.payout` empty
  (they flatten the price and invert chargebacks) and knowing `offers.sprk_cut_pct` is the
  shipped per-offer cut knob.
  LIVING DOCUMENT: when a session learns something new about offer wiring or offer pricing,
  write it in here so the next session doesn't re-derive it.
---

# Adding a new offer — SPK-XXXX-XXXX attribution, end to end

Mirrored in **trustonedeal** (landers) and **SPRKNetworkAds** (offer row / doors / postback) —
if you change one copy, change the other. ⚠️ The SPRKNetworkAds copy only counts once it is
COMMITTED to that repo's origin/main (approved temp-worktree flow) — an untracked working-tree
file is invisible to fresh checkouts and cloud sessions. Sibling skills (`sprk-subid-attribution`
for diagnosing attribution that already broke, `sprk-safe-ship`, `sprk-money-audit`) live in
SPRKNetworkAds only.

⚠️ The local SPRKNetworkAds checkout often sits on a stale `codex/*` branch — verify door /
postback behavior against **origin/main** (what Vercel deploys), never the working tree.

## Why this skill exists (the Copper "CB" incident, 2026-07-14)

Ashlyn (ashlynn.brunelle@gmail.com, AffID 18) added a Copper creative at 19:48 UTC and got the
code **`CB18-1`** — the old self-describing `<offerCode><affId>-<seq>` generator built it from
the offer's short code (`offers.code = 'CB'`) hours before the SPK-only fix (`35aeaf5`)
deployed. Her live TikTok ad carries `?s1=CB18-1` baked into the link, so "CB" keeps showing in
subid reports even though the money attributes correctly to her account. Same batch:
`TU26-1/2/3`, `GP25-1`. The generator is dead; this skill keeps every future offer clean.

## The iron rule (mint side)

**No SPRK code path may MINT a self-describing `<offerCode><affId>-<seq>` spark code for a
locked affiliate. Locked-affiliate codes are always opaque `SPK-XXXX-XXXX`.** (Team rule
2026-07-14, Migi — see `SPRKNetworkAds/api/CLAUDE.md` → "Spark codes / SubIDs", which also
documents the affiliate-id outbound scheme below — pure number, no `aff` prefix as of 2026-07-23.)

- `generateSPKCode()` in **`api/_lib/subid.js`** is the ONE shared mint — imported by
  `api/spark-code.js` (creative mint) and `api/admin.js` (house scaling-pull copy). Any new
  creation path (bulk upload, admin tool, worker) must import it too. Never reconstruct
  `${offerCode}${affId}`, never re-inline a private copy.
- `offers.code` (e.g. `CB`, `TU`) is a reporting label. `api/admin.js` builds the display-only
  `affofferid` (`(offer.code||'OFF') + affId`, e.g. `CB18`) for the admin UI — it never becomes
  a spark code, and admin link-assignment (`link_override`) rejects any link already carrying `s1=`.
- `SPK-` is a reserved prefix: custom codes starting with it are rejected (case-insensitive).
- Exception BY DESIGN: self-managed **scalers** (`role = 'scaler'`) name their own codes
  (`sub-xxxxxx` placeholder until renamed). Do not "fix" those to SPK. A scaler may legally
  pick an offer-code-lookalike name (`CB19-1` passes the validator) — check the row's
  ownership + role before assuming a generator regression.

## What the network actually sees (affiliate-id wire scheme — Ricky/Monetise 2026-07-16; **`aff`
prefix dropped 2026-07-23, Migi**)

> **2026-07-23 change:** the outbound `s1` is now the **pure affiliate number** — NO `aff` prefix.
> Where this doc used to say `aff<N>` (e.g. `aff26`), the network now sees just `<N>` (e.g. `26`).
> The scheme is otherwise unchanged. Old `aff<N>` values already sitting in historical network
> reports are the same affiliate — don't treat the format switch as two different owners.

The INBOUND ad link always carries `?s1=<SPK>`. The door **translates** on the way out
(`stampAffiliateSubids`, `api/_lib/tracking.js` on origin/main):

- resolved click, aff_id known → `s1 = <affId>` (the affiliate's AffID as a **bare number**, no
  `aff` prefix) · `s2 = SPK code` (the creative) · `s3 = ad account` (launcher-stamped, forwarded) ·
  `s4 = offer name` · click_id in `offers.clickid_slot` (default `s5`).
- resolved click, but the owner has NO `user_profiles.aff_id` (or the lookup blips) → `s1` keeps
  the SPK and `s2` gets the legacy `p`+6-hex publisher code. Seeing `p……` in s2 is NOT junk —
  it flags an owned click whose affiliate is missing an aff_id; fix the profile.
- UNRESOLVED `s1` (unregistered/junk code) → the subid slots pass through raw. The door still
  mints a click_id into the clickid_slot and strips its routing params (`slug/t/token/aff/source`)
  — "fail-open" means no owner and no translation, not an untouched URL. Junk `s1` values in
  network reports are expected noise, not a generator regression.

**A bare affiliate number in the network's s1 column is CORRECT — do not "fix" it back to SPK.**
(Pre-2026-07-23 it appeared as `aff<N>`; same meaning, prefix now dropped.)

## Checklist for wiring a new offer (in order)

1. **Offer row** (Supabase `offers`): `name`, `code` (2–4 letters, display only),
   `destination_url` = the real network URL (montrk/CAKE) with its subid slots — admin-only,
   never appears in any lander or affiliate-visible surface. `clickid_slot` (default `s5`) must
   match the slot the network's postback echoes as `cid`. `affiliate_payout` is admin-only —
   as of origin/main it is NO LONGER exposed to affiliates (it was the source of the wrong
   "$9.45 / conv" badge) and UNMATCHED rows now book net/margin NULL rather than falling back to
   it. `offers.payout` is a gross fallback that fires only when the network price is null or
   NEGATIVE — see "Revshare offers" before setting it.
   **If the offer is REVSHARE (payout varies per conversion), stop and read "Revshare offers"
   below before setting any payout field.**
2. **Landing page row** (`landing_pages`): `slug` → the door URL is
   `https://sprktrax.org/api/link/<slug>`. **Leave `enforce_assignment` FALSE at this step** —
   see step 8. The LP's manual `link` field is screened (write + read) by the shared
   `launchLinkProblem` oracle — no fragments, no embedded `?s1=`, http(s) only; a rejected
   value means the launch falls back rather than shipping a smuggled SubID.
3. **Landers** (trustonedeal): copy the proven CR50/50TU pattern (`CR50/CR1/index.html`):
   - Inline offer-wiring script points at the DOOR (`sprktrax.org/api/link/<slug>`) and carries
     EVERY incoming query param through (esp. `?s1=<SPK>`); the real network URL never appears
     in lander markup.
   - Keep the `mc_attr` fallback, the TikTok breakout script, and the `/js/ttclid.js`
     passthrough (sprktrax.org is in its `TRACKER_HOSTS` allowlist).
   - The door hard-404s any click without `s1`/`sub1` — by design. Never link a CTA straight to
     the network URL (that's bypass failure mode C in `sprk-subid-attribution`).
4. **Creatives**: affiliates add creatives in Spark Bank → `api/spark-code.js` auto-mints
   `SPK-XXXX-XXXX`, immutable for locked affiliates. Never hand-insert `spark_codes` rows.
   "Change Offer" re-links WITHOUT re-minting, but since 2026-07-16 it BLOCKS a locked
   affiliate's legacy non-SPK creative from moving to a different offer — fail-CLOSED (a
   lookup blip returns a retryable 503; a swap that slipped through would be permanent
   pollution). Parking (clearing the offer) is allowed; un-parking a legacy code requires
   re-adding the creative.
5. **Launcher**: nothing to configure for affiliates (resolved from `user_profiles.role` via the
   shared `resolveRoleFlags` helper): destination is resolved server-side and `?s1=<spk_code>`
   is appended, campaign name forced to the SPK code. Role drift (a stale `coach` role) is
   GUARDED since 2026-07-16: the SPK-FIRST rule in both launchers ships `spk_code` whenever the
   creative carries an SPK code, even when role resolution says non-affiliate — the legacy
   `subid_value` fallback only ever fires for pre-rework creator codes. `demo` can't launch
   (403). A drifted role still weakens URL forcing, so fix `role` when you spot it (see the
   role-gating memory).
6. **Affiliate link hygiene**: all three launch-resolvable link fields pass the shared
   `launchLinkProblem` oracle (`api/_lib/subid.js` — scheme + fragment + embedded s1) at BOTH
   write time (`set_link_override`, `set_default_link`, `save_landing_page` reject with the
   reason) and read time (`pickLinkOverride`, `pickDefaultLink`, the LP-link fallback in
   `resolveAffiliateOfferLinks` refuse silently) — so even values written by hand-run SQL or
   stored before 2026-07-16 can never launch mis-attributed.
7. **Network postback** (per offer or account-global):
   `…&s1=#s1#&s2=#s2#&s3=#s3#&s4=#s4#&s5=#s5#&cid=#s5#&payout=#price#&txid=#tid#` — the `cid`
   macro's slot MUST equal `offers.clickid_slot`. They are set in two places (offer row +
   network postback template); a mismatch silently kills the authoritative click match.
   **On a revshare offer send `txid=#tid#` and verify it is unique per transaction** — without a
   real txid a 120-second window dedup can merge two differently-priced conversions, and a
   CONSTANT txid drops every conversion after the first. See "Revshare offers".
8. **Assignment + enforcement (LAST)**: assign the LP per affiliate (admin → offers). Two
   SEPARATE rosters back the two enforcement flags: `landing_page_affiliates` (status `active`)
   gates the CLICK door via `landing_pages.enforce_assignment`; `offer_assignments` (status
   `active`) gates the POSTBACK hold via `offers.enforce_assignment`. Absence is NOT fail-open —
   flipping either flag before its roster exists 404s every resolved owner / holds every
   conversion. Only after BOTH rosters are fully mirrored, flip BOTH flags (or neither — it's
   opt-in anti-framing, the Copper pattern). Revoked/paused `offer_assignments` 404 the door;
   caps/fallback via `conversion_cap`/`fallback_offer_id`.

## ⚠️ NEVER set a payout with hand-run SQL — the display and the money read different tables

Learned 2026-07-27, wiring the Monetise payout sheet. A per-geo payout lives in **two** stores and
only the API write path fills both:

| Store | Written by | Read by |
|---|---|---|
| `offers.payout_by_geo` | the offer row itself | `payoutView()` in `api/offers.js` — the affiliate-facing payout on the Offer Library |
| `offer_geo_price_history` | `appendGeoPriceHistory()`, **API save path only** | `api/cron/poll-cake.js` — which is what actually **prices a conversion** |

`appendGeoPriceHistory(offerId, oldMap, newMap)` runs inside the POST/PATCH handlers in
`api/offers.js`. It appends one effective-dated `source:'manual'` row per geo whose amount is new or
changed (and a `source:'removed'` tombstone for a geo that disappeared).

**An `UPDATE offers SET payout_by_geo = …` writes the first table and not the second.** The
dashboard then quotes a number the money path never uses — the affiliate sees `$5.50`, the poller
keeps pricing at whatever the network sent, and nothing surfaces the split until reconciliation.
It is silent in both directions and there is no alert on it.

So: **set payouts through the admin Offers form.** It is a few clicks and it is atomic. Reach for
SQL only for fields with no second store — `status`, `cap_event`, `conversion_cap`, `cap_period`,
`cap_mode`, `thumbnail_url`.

If a payout genuinely must be set by SQL (a bulk backfill), the history row has to be written in the
same transaction:

```sql
-- Only correct together. usd must equal the value going into offers.payout_by_geo.
insert into offer_geo_price_history (offer_id, geo, usd, network_ref, source, effective_from)
values ('<offer-id>', 'GB', 5.50, null, 'manual', now());

update offers
set payout_by_geo = payout_by_geo || '{"GB": 5.50}'::jsonb
where id = '<offer-id>';
```

`network_ref` stays NULL on purpose — the poll-cake listener anchors it to the current network price
on its next run.

### The reverse trap: history outlives the map

`poll-cake.js` re-populates `offers.payout_by_geo` **from** `offer_geo_price_history`. Clearing the
map alone therefore does not stick — the poller puts it back. This is why `applyRevshareGuard`
writing `payout_by_geo = {}` is not sufficient on its own, and why the PATCH handler deliberately
does **not** suppress `priorGeo` when switching an offer to revshare: the tombstone rows are what
actually retire the price. Converting a fixed offer to revshare with SQL, without writing
`source:'removed'` rows, re-arms the flattener on the next poll.

### Checking whether an offer is already split-brained

```sql
select o.name, o.payout_by_geo,
       jsonb_object_agg(h.geo, h.usd) filter (where h.usd is not null) as history_latest
from offers o
left join lateral (
  select distinct on (geo) geo, usd
  from offer_geo_price_history
  where offer_id = o.id
  order by geo, effective_from desc
) h on true
where o.status = 'active'
group by o.id, o.name, o.payout_by_geo;
```

The two columns must agree geo for geo. Where they do not, the **history** column is what the
affiliate is actually being paid from.

## Revshare offers (payout varies per conversion) — verified against origin/main 2026-07-24

A **revshare** offer pays a different dollar amount on every conversion ($4 on one, $14 on the
next) instead of a fixed price. Goal: SPRK takes a flat **percentage** so the cut scales with
revenue. **This already works — the job is not building it, it is not breaking it.**

⚠️ **Verify everything on this page against `origin/main`, never local `HEAD`.** The local
checkout is routinely dozens of commits stale, and the money code moves. Every claim below was
checked with `git show origin/main:<path>` after a `git fetch`.

### Two ledgers price a conversion. Know which one you are looking at.

| | `conversions` (first-party postback) | `cake_conversions` (CAKE poll) |
|---|---|---|
| Written by | `api/postback.js` | `api/cron/poll-cake.js` |
| Gross | the network's real `#price#` | real `<price>`, **overridable per-geo** (see below) |
| Share | `resolveCommission` (role / `commission_type`) | `effectiveAffiliateShare(role, commission_type, offers.sprk_cut_pct)` |
| Share frozen? | no | **yes** — `cake_conversions.earn_share`, net recomputed from current gross |
| Reads `sprk_cut_pct`? | **no** | yes |

The affiliate's balance and dashboard read the **CAKE** side (`api/_lib/cake-earnings.js`). So the
CAKE column is the one that pays.

### The percentage already scales with revenue — do not build a pricing engine

`origin/main:api/postback.js` (line numbers drift; grep the symbols):

```js
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const TIER1_SHARE = 0.9;
netPayout = round2(effGross * comm.share);   // effGross = the network's REAL #price#
margin    = round2(effGross - netPayout);    // SPRK's cut, scales automatically
```

and the CAKE side does `affiliate_payout = round2(priced * earn_share)`. Both multiply a **variable**
gross by a share, so $4 → $3.60/$0.40 and $14 → $12.60/$1.40 with nothing configured.

### The take IS per-offer configurable — `offers.sprk_cut_pct`

Shipped 2026-07-23 (`migrations/2026-07-23_offer_cut_and_frozen_net.sql`). Admin-writable through
the normal Offers create/update payload (`api/offers.js`). Resolution order in
`api/_lib/offer-geo.js` → `effectiveAffiliateShare`:

```
role 'demo'   → share 0      (SPRK takes 100%)
role 'scaler' → share 1      (SPRK takes 0%)
commission_type parsed, 0 < p <= 0.90 → p        ← per-affiliate split WINS over the offer cut
offers.sprk_cut_pct, share = 1 - cut/100, if 0 < s <= 0.90 → s
otherwise → 0.9              (global default)
```

Two consequences worth stating plainly:
- **A per-affiliate `commission_type` overrides the offer's cut.** Setting `sprk_cut_pct = 20` does
  not give you 20% from an affiliate whose profile says `80/20`.
- **The honored band caps share at 0.90, so the offer cut cannot go below 10%.** A `sprk_cut_pct`
  of 5 falls through to the 0.9 default — it does not yield 95/5.
- Splits are **not** clamped to a 90/10 / 50/50 whitelist any more (that was superseded). Any
  admin-set `commission_type` in `(0, 0.90]` is honored verbatim, so `take_pct` of 20 or 50 on the
  board is legitimate, and `role='demo'` legitimately shows 100.

### ⚠️ The two settings that BREAK a revshare offer

**1. `offers.payout_by_geo` — flattens every conversion to one price.** This is the big one.
`api/_lib/offer-geo.js` describes it as "a MANUALLY-SET map of GROSS USD payout per geo", and
`api/cron/poll-cake.js` does:

```js
if (offerId && geo && offerMatches && rawPrice != null && rawPrice > 0 && atIso) {
  const amt = amountEffectiveAt(pricing.history.get(`${offerId}|${geo}`), atIso);
  if (amt != null) priced = amt;          // ← OVERRIDES the network's real price
}
```

`priced` is then written to `gross_payout`. Set a per-geo amount on a revshare offer and the $4 and
the $14 both become the same fixed figure — the exact thing revshare must not do. It is reachable
from the same Offers form step 1 sends you to. **Leave `payout_by_geo` empty on revshare offers.**

**2. `offers.payout` — inverts chargebacks.** The fallback guard is
`(gross == null || gross <= 0)`, and a `gross === 0` row has already been reclassified as telemetry,
so the only case `<= 0` actually catches is a **negative** gross — a reversal. Executed against
prod's `round2`: a matched **−$14** chargeback on an offer with `offers.payout = 15.50` books
`gross_payout = +15.50`, `affiliate_payout = +13.95`, `margin = +1.55`. With `offers.payout` NULL it
books −14 / −12.60 / −1.40 correctly. **Leave `offers.payout` NULL on revshare offers** — on a
revshare offer chargebacks are routine, and this converts each one into a payment.

(If either value needs changing on a live offer, that is prod money-path work: hand Migi the SQL —
never write prod. Root `CLAUDE.md`: "No production actions without explicit approval. Ask first,
every time.")

### Dedup — require a unique txid, and verify it is actually unique

Without a real txid every conversion falls into a 120-second window dedup, and **none of the window
arms compare gross** — so a $4 and a $14 on the same click or spark inside two minutes collapse into
one row, returning `200` with no ledger row and no money. Note the click_id arm runs **even when
`cid` is wired**, so `cid=#s5#` alone does not make an offer safe.

`txid=#tid#` closes all of it — but the txid dedup has **no time window** (it is lifetime), so a
network that sends a constant or per-user txid silently drops every conversion after the first,
forever. On the first live fires, confirm the txid actually varies per transaction.

### Not shipped yet: the `offer_geo_terms` trap

`offer_geo_terms` / `platform_take_bps` / `isPositiveTermAmountMismatch` do **not** exist on
origin/main (`git grep platform_take_bps origin/main -- api/` → nothing). They live in an in-flight
branch. Re-check before reasoning about them:

```bash
git -C ~/Documents/GitHub/SPRKNetworkAds fetch
git -C ~/Documents/GitHub/SPRKNetworkAds show origin/main:api/postback.js | grep -c isPositiveTermAmountMismatch
# 0 = still unshipped
```

When it does land: **never create an `offer_geo_terms` row for a revshare offer.** That table is the
only carrier of `platform_take_bps` there, but the same row forces `expected_gross_payout NOT NULL`,
and the mismatch guard holds any conversion more than half a cent off it — on revshare, nearly every
one. Recovery if it happens: the immutability trigger blocks DELETE and blocks economic UPDATEs, but
it explicitly permits setting `effective_to` and `status='retired'` — retiring the term stops the
holds. Use `sprk_cut_pct` instead; it is the shipped knob.

### Rounding

`net = round2(gross × share)` then `margin = gross − net` puts the sub-cent residual on SPRK's side.
Over a spread of $1–$25 amounts the realized take lands within ~0.005 points of nominal, so this is
**not worth changing** at ordinary amounts. It matters in two cases: sub-dollar conversions (10% of
a nickel is half a cent, so `$0.05` yields a $0.00 take), and price points that always land on a
half-cent — at `$X.95`, `0.9 × gross` is always `.455`/`.955`, so the residual is one-directional
and SPRK forgoes half a cent on **every** conversion.

If it ever is worth flipping, the correct form keeps the share variable — do **not** hardcode 10%,
which would charge a scaler (share 1) and a 50/50 account the wrong amount:

```js
margin    = round2(gross * (1 - share));
netPayout = round2(gross - margin);
```

Re-measure against the offer's **actual** price points before deciding; a uniform-cents simulation
hides the `$X.95` case.

### Verifying a revshare offer prices correctly

Production `conversions` has **no `payout_status` column** and never writes `status='held'` — those
are v2-only, and selecting them makes the whole query fail with `42703`. Use:

```sql
select gross_payout, affiliate_payout, margin,
       round((margin / nullif(gross_payout,0)) * 100, 2) as take_pct,
       status, commission_rate, commission_source
from conversions
where offer_id = '<revshare-offer-id>' and status = 'recorded'
order by created_at desc limit 20;
```

All three money columns are `numeric`, so `round(numeric, 2)` is valid here.

- `gross_payout` must **vary** across rows. If it is constant, the per-geo override is on — check
  `offers.payout_by_geo`.
- `take_pct` tracks `commission_rate`, not a fixed 10: scaler → 0, demo → 100, an admin-set
  `commission_type` → whatever it says. Read `commission_source` before calling a row wrong.
- Then check the ledger that actually pays:
  `select gross_payout, affiliate_payout, earn_share, network_price from cake_conversions where ...`
  — `earn_share` is the frozen share, and `affiliate_payout` should equal `round2(gross × earn_share)`.

## Verify before announcing it done

Use **HEAD requests** (`curl -sI`) for layout checks — the door 302s identically on HEAD but
writes NO clicks/lp_clicks rows. A GET writes both (plus a network-side click if the 302 is
followed), so spend exactly ONE deliberate GET, on the test code, and never follow the funnel.

- `curl -sI '<lander-or-door>?s1=SPK-TEST-0000'` → 302 Location must reach the network URL with
  `s1=SPK-TEST-0000` intact (fail-open passthrough; HEAD carries no click_id — that's expected).
- One deliberate GET on `?s1=SPK-TEST-0000` → Location must show the click_id in the offer's
  `clickid_slot`. This writes one ownerless clicks row + one lp_clicks row — known residue
  (`select * from clicks where sub1 = 'SPK-TEST-0000'` finds it later). Don't follow through the
  network funnel or you'll manufacture an unmatched conversion in your own final check.
- `curl -sI` with a REAL registered SPK → expect the production layout: `s1=<affId>` (bare number,
  no `aff` prefix as of 2026-07-23), `s2=<SPK>`, `s4=<offer name>`. That is correct — don't mistake
  it for broken wiring. (No GET needed here.)
- A bare lander URL (no `s1`) must still render (preview), but the door must 404.
- SQL audit (read-only) — must return 0 rows for the new offer. Scans BOTH pollution channels:
  non-SPK codes AND lingering legacy `subid_value` (which only a creative WITHOUT an SPK-shaped
  code can still ship, now that SPK-FIRST governs launches). Over-reports on purpose — an audit
  must never under-report:

  ```sql
  select distinct s.spk_code, s.subid_value, u.email
  from spark_codes s
  join auth.users u on u.id = s.user_id
  left join user_profiles p on lower(p.email) = lower(u.email)
  where s.offer_id = '<new-offer-id>'
    and (s.status is null or s.status <> 'deleted')
    and (s.spk_code not ilike 'SPK-%' or s.subid_value is not null)
    and coalesce(p.role, 'affiliate') <> 'scaler';
  ```

  Re-run it whenever a creative is re-pointed at this offer ("Change Offer"), not just on
  wiring day.
- After first real traffic: Admin → Network & Offers → Unclaimed SubIDs should stay empty for
  this offer; `conversions.match_source` on early rows tells you which leg attributed
  (`click_id → spk → subid_value → subid_owner → token fallback`).

## Grandfathered legacy codes — do not "fix" them

`CB18-1` (Ashlyn/Copper), `TU26-1/2/3`, `GP25-1` are LIVE attribution keys riding launched
TikTok ads. Renaming a `spk_code` does NOT remove the old label from network reports (the ad
link carries it forever) — and it's worse than useless: the door resolves owners ONLY from
`spark_codes.spk_code`, so a renamed code's clicks come in ownerless (revoke gate skipped, no
affiliate-id/`s2` stamping, ownerless `clicks` row), leaving attribution to the weaker
`subid_owners` alias leg. Locked affiliates can't rename via the bank anyway — only admin/SQL
could, so don't. Also never "claim" a junk code via admin `assign_subid` as a shortcut — that
institutionalizes it forever; use the retire path instead.
To retire one properly: the affiliate re-adds the creative (fresh SPK auto-mints) → relaunch
the ad → soft-delete the old row only after its traffic drains. That's money-path work: hand
Migi the SQL, never write prod (standing rule).

## Hardening shipped 2026-07-16 (this repo) + the one remaining optional layer

All five backlog items from the CB18-1 review are LIVE in this repo: (1) the Change Offer gate
(spark-code.js PATCH), (2) embedded-s1 screens on all three link fields (shared `hasEmbeddedS1`),
(3) the nightly non-SPK detector (`code-audit.js`, `kind='nonspk_locked'` in `code_collisions` —
the 5 grandfathered codes SHOW there on purpose; entries auto-resolve on soft-delete), (4) the
shared `generateSPKCode` mint in `_lib/subid.js`, (5) the aff<N>-scheme doc updates (api/CLAUDE.md,
freecash + subid-attribution skills, attribution map, tracking-scheme banner). Don't re-add these.

Remaining OPTIONAL layer (needs Migi to run SQL): an INSERT-only BEFORE trigger on `spark_codes`
rejecting `^[A-Za-z]{2,4}\d+-\d+$`-shaped codes for non-scaler owners — the only guard that would
also catch hand-run SQL inserts. Propose it if Migi wants belt-and-braces; CHECK constraints won't
work (legacy live rows match the pattern, and a CHECK can't do the role lookup).

## Close with the ELI5 recap (Migi's standing rule)

One short plain-English paragraph: what was wired, where the money flows, what to watch.
