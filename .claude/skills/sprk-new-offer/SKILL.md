---
name: sprk-new-offer
description: >-
  End-to-end checklist for adding a NEW offer to the SPRK network — offer row, tracking door,
  trustonedeal landers, creatives, network postback — with attribution locked to opaque
  SPK-XXXX-XXXX spark codes on every offer. Use whenever Migi says anything like "add the next
  offer", "new offer", "set up <brand>", "build landers for <offer>", "wire up tracking for
  <offer>", or asks why an offer-code subid (CB18-1 / TU26-3 style) is popping up in reports.
  The offer's short code (CB, TU, FC…) is a DISPLAY label only — it must never become a spark code.
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
   match the slot the network's postback echoes as `cid`. `affiliate_payout` is display-facing
   for MATCHED traffic (commission is % of gross), but it IS the recorded payout on UNMATCHED
   conversions — set a sane per-conversion figure, not a placeholder.
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
8. **Assignment + enforcement (LAST)**: assign the LP per affiliate (admin → offers). Two
   SEPARATE rosters back the two enforcement flags: `landing_page_affiliates` (status `active`)
   gates the CLICK door via `landing_pages.enforce_assignment`; `offer_assignments` (status
   `active`) gates the POSTBACK hold via `offers.enforce_assignment`. Absence is NOT fail-open —
   flipping either flag before its roster exists 404s every resolved owner / holds every
   conversion. Only after BOTH rosters are fully mirrored, flip BOTH flags (or neither — it's
   opt-in anti-framing, the Copper pattern). Revoked/paused `offer_assignments` 404 the door;
   caps/fallback via `conversion_cap`/`fallback_offer_id`.

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
`aff<N>`/`s2` stamping, ownerless `clicks` row), leaving attribution to the weaker
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
