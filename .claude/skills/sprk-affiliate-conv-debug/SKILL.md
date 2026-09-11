---
name: sprk-affiliate-conv-debug
description: >-
  Playbook for "track this affiliate — their conversions look buggy / missing / I don't see any
  conversions" complaints on the SPRK network. Use whenever Migi names an affiliate (by name, email,
  or #AffID) and says their conversions don't show, their numbers don't match, their account "seems
  buggy", or an admin-board note mentions conversions "outside the creative tracker". Walks the exact
  DB audit (profile → sparks → conversions → clicks → offer), lists every issue we've already
  diagnosed with its fix, and says what to tell the affiliate. LIVING DOCUMENT: every time a session
  diagnoses a NEW issue (or finds the fix for an open one), write it into the Known Issues section
  below so the next session doesn't re-derive it.
---

# SPRK Affiliate Conversion Debugging

When an affiliate says "I have conversions but they don't show" (or Migi says "I don't see any
conversions for this guy"), the answer is almost never a broken pipeline — it's one of the known
mismatches below. **Diagnose from the DB first; never change money math on a hunch.** For general
money-honesty rules, the companion skill `sprk-money-audit` lives in the SPRKNetworkAds repo.

## How to query the live DB (no env vars needed)

Vercel envs are sensitive (pull back empty). Read the Supabase CLI token (sbp_…) from Windows
Credential Manager (generic credential `Supabase CLI:supabase`, via CredRead P/Invoke) and POST SQL
to the Management API for project `ecyawhhimmuzryxjnjng`:

```powershell
# save as sq.ps1, then: & .\sq.ps1 -Sql "select 1"
param([Parameter(Mandatory=$true)][string]$Sql)
Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class CredMan {
  [DllImport("advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredRead(string target, int type, int flags, out IntPtr cred);
  [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr cred);
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct CREDENTIAL { public int Flags; public int Type; public string TargetName; public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public int CredentialBlobSize;
    public IntPtr CredentialBlob; public int Persist; public int AttributeCount; public IntPtr Attributes;
    public string TargetAlias; public string UserName; }
  public static string GetPassword(string target) { IntPtr p;
    if (!CredRead(target, 1, 0, out p)) return null;
    try { CREDENTIAL c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
      byte[] b = new byte[c.CredentialBlobSize]; Marshal.Copy(c.CredentialBlob, b, 0, c.CredentialBlobSize);
      return System.Text.Encoding.UTF8.GetString(b); } finally { CredFree(p); } }
}
'@ -ErrorAction SilentlyContinue
$token = [CredMan]::GetPassword('Supabase CLI:supabase')
$body = @{ query = $Sql } | ConvertTo-Json -Depth 3
Invoke-RestMethod -Method Post -Uri 'https://api.supabase.com/v1/projects/ecyawhhimmuzryxjnjng/database/query' `
  -Headers @{ Authorization = "Bearer $token" } -ContentType 'application/json' -Body $body | ConvertTo-Json -Depth 6
```

READ-ONLY selects only. Any write (assign subid, backfill) → hand Migi the SQL, never run it.

## The audit walk (5 queries, in order)

1. **Who is it** — `user_profiles` join `auth.users` by email (the app links profile↔auth by email
   only; `user_profiles.user_id` is unused):
   `select up.email, up.aff_id, up.role, au.id from user_profiles up left join auth.users au on lower(au.email)=lower(up.email) where up.aff_id = N or up.email ilike '%name%'`
2. **Their sparks** — `select id, spk_code, status, review_state, created_at from spark_codes where user_id='<auth_id>'`
3. **Their conversions** — `select spk_code, click_id, offer_id, event_type, gross_payout, status, created_at from conversions where user_id='<auth_id>' order by created_at`
   - `event_type='event'` + `gross_payout=0` = network telemetry (Testerup registrations etc.), NOT payable.
   - `event_type IS NULL` + `gross>0` = payable conversion.
4. **Their clicks** — `select spk_code, count(*) from clicks where spk_code in (…their codes…) group by spk_code`
   (clicks recorded + $0 events matched with click_id ⇒ the door and event-postback paths are healthy).
5. **Is the payable path alive for the same offer?** —
   `select spk_code, gross_payout, created_at from conversions where offer_id='<offer>' and gross_payout::numeric>0 and created_at > now()-interval '7 days'`
   If OTHER affiliates get paid rows on the offer, the pipeline works; the affiliate simply has no
   payable conversions yet. If NOBODY does, suspect the network-side postback template.

Also always check the orphan bucket: `select spk_code, gross_payout, created_at from conversions
where user_id is null and created_at > now()-interval '7 days'` — money that matched nobody.

6. **ALWAYS cross-check `cake_conversions` (poll-cake's persisted CAKE truth) — the postback ledger
   is NOT the whole story.** The postback under-captures payable conversions (see Known Issue #6):
   `select count(*) filter (where gross_payout::numeric>0) as cake_paid, sum(gross_payout::numeric) filter (where gross_payout::numeric>0) as cake_gross from cake_conversions where user_id='<auth_id>'`
   and compare against step 3. CAKE (MyMonetise) is the money source of truth for the affiliate's
   Home dashboard; the admin revenue board reads only the postback `conversions` table. If
   cake_paid > postback paid, the affiliate is RIGHT that money is missing from the admin side.

## Attribution model (what "matched" means)

WIRE (v3, 2026-07-18, SPRKNetworkAds main `846dd71`): doors stamp `s1=<bare aff id>` ('29') ·
`s2=SPK` · `s3=ad account` · `s4=offer name` · `s5=<Name>.<click_id>` (letters-only display name +
22-char click token; the postback takes the cid echo's LAST dot-segment).

**"Ad account (s3) is blank for some affiliates"** (asked 2026-07-20): s3 is only stamped with the
real `advertiser_id` by the auto-LAUNCHER (it calls TikTok's API, knows the account). SELF-launched
affiliates (copy their run-link, build their own TikTok ad) never give us an advertiser_id, and
TikTok has NO ad-account URL macro (only campaign/adgroup/ad) — so their s3 was blank. FIX (main
`723b124`): `buildAdLink` (sparkbank) now appends `&s3=__CAMPAIGN_ID__`; TikTok fills the real
campaign id, which forwards lander→door→CAKE. So s3 = advertiser_id (launcher ads) OR campaign_id
(self-launched). Only fills in as affiliates relaunch with the new copy-link (can't touch live ads).
The column in Migi's screenshot is Monetise/CAKE's own Sub ID 3, not an SPRK view. Rows show the
affiliate number in s1 and a bare token in s5 — same data, different dressing. (Outbound s1 was
`aff<N>` until 2026-07-23; the `aff` prefix was dropped, so it's now the pure number, e.g. `26`.
See the `tokrwd-landers` skill and sprk-new-offer for the wire scheme.) NEVER register a
bare int, an `aff<N>` string, an ALL-NUMERIC compound (29-29), or an affiliate's display name as a
SubID; the click token must stay in s5 (440/455 recent conversions have no usable #tid# — it's the only per-lead dedup key +
cap-fallback offer channel). xhigh fix-pack 9b00f8d: supabase-js RESOLVES errors ({error}, never
throws) — always check the error FIELD for fail-open rails; postback probes are cached+capped;
resolver skips wire-stamp-shaped candidates.

Inbound: `SPRKNetworkAds/api/postback.js`. Cascade: click_id (`cid`, last dot-segment, honored only
when a clicks row we minted exists) → SPK code in s2/s1 against `spark_codes` → token fallback
against live spark codes ∪ `subid_owners` (ambiguity ⇒ left NULL on purpose). Unmatched rows are still recorded with
`status='unmatched'`, `user_id NULL` — invisible on every dashboard until an admin assigns the
subid (admin "Assign SubID" backfills past rows). Admin board reads `conversions` keyed by SPK for
the 500 newest sparks + a safety-net scan by user_id for older/removed sparks (the yellow
"outside the creative tracker" banner).

## Known issues (append new ones here — issue, how it presents, root cause, fix/status)

### 1. Affiliate sees "conversions", admin sees 0 — $0 events counted as conversions affiliate-side
- **Presents:** affiliate (e.g. lolpantsnoa #29, 2026-07-17) insists "I have conversions"; admin
  revenue board shows `0 paid conv · N $0 events`. Both read the same table.
- **Root cause:** `SPRKNetworkAds/api/profile.js` `sumBalance()` counts EVERY `status='recorded'`
  row as a conversion — no `event_type`/`gross>0` filter — so the affiliate's balance pill / home
  tile counts $0 telemetry events (Testerup registrations) as "conversions" with $0.00 earned.
  `my-analytics.js` and the admin board are payable-only. Same family as the known "Home tile counts
  $0 rows" item in `sprk-money-audit`.
- **Fix/status:** profile.js piece SHIPPED 2026-07-17: SPRKNetworkAds main commit `3c87141`
  (rebased onto the subid-hardening commit `7888c13` — no interaction, verified) — `sumBalance` now
  gates the count on the shared `classifyDashboardConversion(...).payable` (finite gross > 0; the
  select adds `gross_payout`, deliberately NOT `event_type`, since payable never depends on it).
  Reviewed twice (/code-review high pre-ship + medium post-rebase) + prod-sim'd read-only: 5 users'
  counts change, every dropped row carries $0 affiliate_payout, `earned` byte-identical. One extra
  latent-drift note from the second review: admin `get_tracking_report` counts unknown-gross rows
  (event_type filter) that the payable predicate excludes — zero such rows in prod, same family as
  the my-analytics drift below.
  Home-tile piece SHIPPED 2026-07-18: SPRKNetworkAds main commit `74ac489` (= `bc56569` rebased
  onto the moved main; pushed after Migi asked to fix the sxmmybills complaint, which WAS the
  pending ship OK) — `affiliate_earnings` fold + `/api/snapshot` count payable-only (raw pre-tier
  price/gross > 0, perfDash's rule) with $0 rows surfaced as `installs` (tile shows "· N $0
  events", per-row Convs cells show "+N $0"; install-only SPK rows stay visible in the list);
  frontend "has data" gates stay MONEY-ONLY where they arbitrate authority so a $0 install-only
  pull can never wipe/shadow real money (install-only views render via the cake-vs-postback pick,
  postback money preferred). Reviewed twice (owner session's 3-finder pass; second session's
  independent 8-angle × verify fan-out) + prod sim: 6 users' counts change, dropped revenue $0
  for all.
  FIX-PACK SHIPPED 2026-07-18 (main `bb2c8fb`) — post-ship /code-review high found 5 gaps in
  74ac489, all fixed: (1) both folds now classify via the shared `classifyDashboardConversion`
  helper — null/NaN gross = UNKNOWN (neither count), negative gross (reversals) subtracts revenue
  without polluting conversions OR the $0-events count; (2) events carry a raw pre-tier `paid`
  flag and the timeline trusts it — gating on tier-scaled revenue flatlined the conversions chart
  for 0-share demo/training accounts while the tile showed real counts; (3) `installs` threads
  through by_offer/byBrand/offers + every frontend row shape, so install-only SPKs no longer
  vanish under an offer filter; (4) snapPaint/snapMoney split — an install-only snapshot still
  paints instantly (no blank screen when live CAKE is down) but never claims money authority;
  (5) the perfDash "CAKE carries no $0 events" comment was FALSE (448 $0 rows in cake_conversions)
  — corrected; NOTE the trap: perfDash `installs` = postback event_type='install' rows (offer
  caps), Home `installs` = any exact-$0 CAKE row. Same word, different meaning — never sum them.
  TRIGGERING CASE (2026-07-18): sxmmybills / ssammyofficial18@gmail.com, aff #12, SPK-F8BC-DC66 —
  Discord screenshot "2 conversions / $0.00 earned" on Testerup. Audit: both rows
  `event_type='event'`, gross $0 (registrations), click_ids present, account healthy (5 payable
  Freecash rows Jul 9–10). GOTCHA that cost an hour: the fix had been sitting UNCOMMITTED in the
  prior session's worktree while prod served the old code — before re-deriving a "shipped" fix,
  check `git status` in the prepped worktree AND fingerprint the live site
  (fetch https://www.sprknetwork.ad/dashboard/ and grep for "$0 event"; apex + /soloaffiliate 404).
  Post-fix affiliate UI reads: CONVERSIONS tile = payable only; registrations appear ONLY as a
  hint — an affiliate reporting "my conversions disappeared" after 2026-07-18 is seeing this fix,
  not a tracking break. DISPLAY RULE (Migi, 2026-07-18, final — `c036098`, supersedes the brief
  "Lead Signed Up – Didn’t Download Game" label of `5f1d8ba`): affiliates see MONEY METRICS ONLY —
  clicks, payable conversions, earnings. $0 signup fires are NOT surfaced to affiliates at all (no
  tile note, no row badge, no CSV column; a signup-only SPK row stays hidden until it has
  clicks/conversions/earnings). The `installs` field remains in API payloads and plumbing for
  admin surfaces — it just never renders affiliate-side. So an affiliate with only registrations
  sees 0 conversions / $0.00 and that is CORRECT; explain via support ("signups don't pay —
  conversions appear when the referred user completes the paid action"), never via the dashboard.
  Conversions shown to affiliates = payable rows ONLY, everywhere, always.
  RESIDUALS ALL CLOSED 2026-07-18: the four "accepted residuals" from the second review were fixed
  by `bb2c8fb` (demo chart drift → per-event `paid` flag; empty-state on CAKE outage → snapPaint;
  negative-price mislabel → shared classifier) and `8d5db29` (CSV "$0 Events" column + classifier
  regression tests pinning negative gross → NEITHER bucket and non-finite price → UNKNOWN). The two
  sessions raced to the same fix-pack; bb2c8fb's snapPaint/snapMoney split + installs-through-offer-
  views superseded the second session's narrower variant — when two sessions work one bug, diff the
  worktrees against origin/main before pushing anything.
  my-analytics.js line ~231 still uses a third predicate (event_type filter, gross-agnostic) —
  zero rows disagree in prod today (verified), latent drift; ideal end-state is one shared payable
  predicate across all surfaces.

### 2. The yellow "outside the creative tracker" banner is GLOBAL, not about the row you clicked
- **Presents:** banner "Includes $X across N conversion(s) from SPKs outside the creative tracker"
  under an affiliate's row → assumed to be that affiliate's missing money.
- **Root cause:** it's `meta.rev_untracked` — a dashboard-wide total from the safety-net scan
  (rendered once, below the whole board). On 2026-07-17 the "$0.80 / 1 conversion" was
  miguel@sprknetwork.app's own legacy `RS3-0` subid conversion, nothing to do with the affiliate
  row above it.
- **Fix/status:** BEHAVIOR, not a bug. Verify whose it is:
  `select spk_code, user_id, gross_payout, created_at from conversions where gross_payout::numeric>0 and created_at >= '<range start>'` then look the user_id up. Open the affiliate's SPK
  breakdown (chevron) — untracked codes are flagged there per-affiliate.

### 3. Trae/TenX (`admin@tenxholdingsllc.com`, aff #2, scaler): every new TikTok ad mints a new unmatched subid
- **Presents:** growing pile of `status='unmatched'` conversions with subids like
  `TRAE_spark97_US_<19-digit id>_<hash>_<HHMMSS>` — no click_id, no offer_id. As of 2026-07-17:
  140 unmatched rows, 10 payable, **$84.00 gross unattributed** (spark76/83/84/92/97/99/102/104…).
- **Root cause:** Trae runs his own tracking (scaler, settles by invoice); his per-ad auto-generated
  ad names ride in the subid. spark61–66 were manually registered in `subid_owners`, later ads never
  were. Token fallback can't help: each registered code's tokens include its unique id/hash, which a
  new ad's subid doesn't contain (correct fail-safe).
- **Fix/status:** OPEN. Short-term: admin → Assign SubID for each new `TRAE_…` code (backfills).
  Durable options (Migi's call): prefix-level ownership (e.g. match token `TRAE` alone), or have
  Trae fix his ad-name macro. NOTE Trae is invoiced — this affects his numbers matching his own
  portal, not the 90/10 payout pool.

### 4. Legacy offer-code subids on live ads (CB18-1, TU26-1/2/3, GP25-1, RS1-0/RS3-0/RS4)
- **Presents:** conversions under non-SPK codes; new-offer sessions may mistake them for a subid
  scheme to copy.
- **Root cause/status:** grandfathered pre-fix codes, attribution works via click_id and/or
  `subid_owners` (RS* = miguel, CB18-1 = Ashlyn, TU26-x = Testerup-era codes). Prevention for new
  offers lives in the `sprk-new-offer` skill. Not a bug — do not "clean up" these rows.

### 5. Healthy-account baseline — CORRECTED 2026-07-18: the first verdict was WRONG
The 2026-07-17 session concluded lolpantsnoa #29 was "100% healthy, zero payable conversions yet"
from the postback `conversions` table alone. The 2026-07-18 session checked `cake_conversions` and
found **5 paid $10 Testerup conversions under his own SPK codes that the postback never delivered**
(see #6). LESSON, now audit step 6: a clean postback trail (clicks land, $0 events match) proves the
DOOR and event pixel work — it does NOT prove no money is missing. Never declare an account healthy
without comparing against `cake_conversions`.

### 6. Network payable postback under-capture — paid conversions in CAKE never reach /api/postback
- **Presents:** affiliate's Home dashboard (CAKE-sourced, money truth) shows paid conversions +
  earnings; admin revenue board (postback `conversions` table) shows $0 for the same user. The
  affiliate is RIGHT.
- **Facts (2026-07-18):** lolpantsnoa #29: 5/5 paid Testerup rows missing from postback ($50 gross /
  $45 owed at 90/10), 2026-07-16, offer "Testerup - First Active User [UK/US/CA]" — his $0 event
  postbacks arrived fine, so the door/event path works while the PAID-conversion fire doesn't.
  Also short since 7/10: costajeffery5 #26 (17 pb vs 24 cake paid), ssammyofficial18 (1 vs 2).
  Ashlyn/adan/timothy/miguel/ravitej/Trae counts match. Plus 160 paid rows / $1,410 gross sit in
  cake_conversions with user_id NULL (mostly Trae's unregistered TRAE_* subids, issue #3).
- **Root cause:** network-side (Monetise/CAKE portal) postback configuration — the paid-conversion
  postback isn't firing for some offers/dispositions while the $0 event pixel does. NOT our code:
  /api/postback records even unmatched hits, and nothing arrived at those timestamps.
- **Fix/status:** OPEN. (a) Migi: check the Monetise portal's postback settings for the Testerup
  "First Active User" offer (global vs per-offer postback, conversion vs event templates, disposition
  filters). (b) Backfill the missing rows — DRAFT SQL below, Migi reviews + runs (never auto-run):
  ```sql
  -- lolpantsnoa's 5 missing paid Testerup conversions, from cake_conversions, 90/10 split.
  -- Idempotent on txid = CAKE conversion_id (postback dedup key) — safe if the network re-fires.
  insert into conversions (network_id, offer_id, user_id, aff_id, spk_code, txid, gross_payout,
                           affiliate_payout, margin, status, created_at, commission_rate,
                           commission_source, match_source)
  select o.network_id, o.id, cc.user_id, 29, cc.spk_code, cc.conversion_id,
         cc.gross_payout::numeric, round(cc.gross_payout::numeric * 0.9, 2),
         round(cc.gross_payout::numeric * 0.1, 2), 'recorded', cc.conversion_at, 0.9,
         'backfill-cake-20260718', 'cake-backfill'
  from cake_conversions cc
  join offers o on o.id = '62efd43c-e6bf-4ecc-8b1b-e35fff75b393'
  where cc.user_id = '9b8b063d-d98f-40b5-8ada-7615d249da21' and cc.gross_payout::numeric > 0
    and not exists (select 1 from conversions c where c.txid = cc.conversion_id);
  ```
  (c) Durable: a reconcile cron that flags (or inserts, Migi's call) payable cake_conversions rows
  with no matching postback row — design not started.

### 7. Blank ad-account column (s3) / missing subids — the assigned LANDER doesn't forward params
- **Presents:** conversions show blank s3 (ad account/campaign) for some affiliates, or a creative's
  attribution/subids look thin, even though the affiliate is running ads. (Screenshot: Freecash-US
  had 1/1542 conversions with s3.)
- **Root cause (two layers):** (a) s3 is only ON the ad link when the SPRK launcher built the ad
  (stamps the real `advertiser_id`) OR the affiliate copy-link carries the TikTok macro
  `&s3=__CAMPAIGN_ID__` (added to `sparkbank` `buildAdLink`, SPRKNetworkAds `723b124` — TikTok has
  NO ad-ACCOUNT macro, only campaign/adgroup/ad, so self-launched ads can carry campaign_id at best).
  (b) **The affiliate's assigned lander must FORWARD all query params to the SPRK door**, or s1/s3
  are silently dropped. Landers resolve from `landing_pages.link` (raw tokrwd lander) whenever
  `lp_domains` has 0 active rows — which is the case today, so EVERY affiliate link is a tokrwd
  lander, not the door redirector.
- **The gotcha:** in `trustonedeal` the 50FC/50TU/50FCII/CR50 landers are 50 byte-identical copies
  of the offer's canonical lander (`/FC` = `/FCTT`, `/TU`, `/CB`), each forwarding
  `URLSearchParams(location.search) → sprktrax.org/api/link/<offer>` (s3 rides). But a
  `dest`-breakout/cloaking page (reads only `?dest=`, forwards NOTHING) drops s1/s3. **FC1 was the
  lone broken one** (also the LP assigned to Freecash) — fixed 2026-07-20 (`tokrwd` main `adbeae8`).
  RS50 (Reco Social) intentionally does NOT forward — it's a door-bypassing model (see #4).
- **No prelander step (2026-07-21):** the in-app-breakout prelander that briefly sat in front of
  these landers was removed — every folder is the single lander again, ad → lander → door. One copy
  per brand is archived, unwired, in `justincase/{FC,TU,CB}-prelander/` (repo root) with restore
  instructions in `justincase/README.md`. Don't diagnose a missing prelander hop.
- **How to check:** the affiliate's assigned lander = `select link from landing_pages where
  offer_id=…`; then in `trustonedeal` grep that lander's index.html for
  `sprktrax.org/api/link` + `URLSearchParams(location.search)` (forwards) vs `params.get('dest')`
  (breakout — broken). Fix = `cp` the offer's canonical lander (`FC/`, `TU/`, `CB/`) over it.
- **Fix/status:** FC folder 50/50 forwarding as of `adbeae8`. When a NEW attribution-blank report
  comes in, always verify the assigned lander forwards before blaming the wire/postback.

### 8. "The tile says N clicks but the SubID rows add up to less" — CAKE-only codes had no row
- **Presents:** Migi/an affiliate screenshots the Home dashboard: CLICKS tile (and the "All SubIDs"
  row, same number) shows N, the visible SubID rows sum to fewer. Triggering case 2026-07-27:
  ssammyofficial18 (aff #12) — tile 7, one row "Izzy / SPK-A10E-2374" showing 4.
- **Root cause:** the tile sums CAKE landed clicks for EVERY code the affiliate owns
  (`_applyClicksSpend` over `ce.spks`), but the LIST was seeded from `creativesData`, which is EMPTY
  on the `moneySource='none'` path, plus two partial backfills — one over `data.creatives`
  (my-analytics = postback conversions ∪ **in-window door clicks**) and one gated on `clicksMerged`,
  which is never true while CAKE is the basis (`_cakeSpks` is only ever set together with
  `clicksSource='cake'`, so that merge block is unreachable). A code with CAKE clicks but **no door
  row inside the window** and no conversion was counted and never listed. Aff #12's missing 3 were
  SPK-186D-9E04 — also named "Izzy", whose door traffic all ran 22:00–03:00 UTC, i.e. the previous
  EASTERN day, so it had zero door rows in the Today/ET window.
- **Fix/status:** SHIPPED (branch `claude/click-accuracy-fix`, commit `f70be12`, off origin/main —
  NOT yet merged). One `_ensureClickRows()` replaces both backfills and runs on every path: any code
  with clicks > 0 gets a row. `my-analytics` now also returns `spk_meta` (live codes' display name /
  thumbnail / offer) so a CAKE-only row is labelled with the creative's name, not the raw code.
  Regression pin: `api/_lib/_dashboard-click-rows.test.mjs`.
- **DIAGNOSTIC SHORTCUT for the next one of these:** the gap is almost always CAKE-vs-door WINDOW
  skew, not lost traffic. Compare
  `select spk_code, count(*) from clicks where spk_code in (…their codes…) and created_at >= <ET midnight> group by 1`
  against a live CAKE /Clicks pull for the same window. CAKE's clock IS UTC (verified 2026-07-27:
  requesting "07/27/2026 04:00:00" returned a payload whose earliest click_date was
  2026-07-27T04:06:49, matching the door log 1:1), and `cake_clicks_daily.stat_day` is the click's
  UTC calendar day — so a code that ran in the evening ET straddles two of its buckets.

### 9. Day-granularity charts were bucketed in UTC while the whole dashboard says "Eastern (ET)"
- **Presents:** the 7D/30D chart shows traffic (or earnings) on days the affiliate knows they had
  none, and a day they DID run shows almost nothing. The tile totals are correct, so it reads as "the
  graph is broken", not "my numbers are wrong".
- **Root cause:** every day bucket key was a raw `toISOString().slice(0,10)` — UTC — in
  `my-analytics` (`dayKey`), `_timelineFromEvents`, `buildSeries` and `_seriesByGroup`, while
  `rangeLabel()` appends the tz abbreviation and the header badge is hard-coded Eastern. ET is
  UTC−4/−5, so everything between 00:00 and 04:00 UTC plotted one bar LATE. Aff #12, 7D: chart drew
  94 on 07-21 and 89 on 07-23 (ZERO Eastern clicks on both) while 07-20 showed 2 instead of 96 and
  07-22 showed 21 instead of 110. The HOURLY path was always correct (UTC hour buckets relabelled
  through Intl — US zones are whole-hour offsets).
- **Fix/status:** SHIPPED in the same commit `f70be12`. `_dayKeyOf` / `_nextDayKey` (tz-aware,
  DST-safe calendar walk) key every daily bucket, and the dashboard sends `tz` to `my-analytics` so
  the server buckets in the same zone. `setTz` now refetches on day granularity too (the buckets
  themselves change, a relabel is no longer enough). Pin: `api/_lib/_dashboard-day-buckets.test.mjs`.
- **Still UTC-bucketed elsewhere (NOT fixed, admin surfaces):** `cake_clicks_daily.stat_day` and
  every perf/admin surface built on it. Don't compare an affiliate's dashboard day to an admin-board
  day and assume one of them is broken.

### 10. "The clicks number CHANGED when I refreshed" — the tile had two bases and picked by luck
- **Presents:** an affiliate screenshots the same day twice, minutes apart, with different click
  counts and no traffic in between. Triggering case 2026-08-23: timothycooper859 (Coop2x4Ever) —
  15:14 ET showed Itslaurataylor 7 · ITZJENNI 1 (tile 8), 15:15 ET showed 2 · 1 (tile 3).
- **Root cause:** `setSprkClicks` chose the whole basis on CAKE-LAYER HEALTH. `cake_ok` /
  `clicks_available` come from `affiliate_earnings`, which runs a LIVE 15-second multi-network CAKE
  `/Clicks` pull and sets `clicks_available: !!(clkList && clkList.allOk !== false) && isolationComplete`.
  Any timeout, any one network erroring, or a failed isolation scan flips it — so which of the two
  numbers an affiliate saw was decided by which HTTP call won that page load. Healthy → CAKE's landed
  clicks (2); unavailable → our first-party unique count (7). Both were right for their basis.
- **Fix/status:** SHIPPED to branch `claude/clicks-one-basis` in **SPRKNetworkAds** (commit
  `4381201c`, off origin/main — merge it). One rule now: **per code, the LARGER of the two feeds**,
  which is a pure function of the two payloads and cannot move between loads. Not a blend, never a
  sum, and it does not reinstate the whole-basis-on-door-counts gate rejected in 2026-07 (a per-code
  max can only ever RAISE a CAKE count). Units are guarded — only the DEDUPED first-party map may be
  compared; a raw-only payload keeps the old top-up-a-zero rule. Pin:
  `api/_lib/_clicks-one-basis.test.mjs` (fails on pre-fix code with exactly 3 vs 8).
- **THE OTHER HALF, and say this to the affiliate: CAKE's clicks report LAGS about an hour.** Watched
  live on 2026-08-23: SPK-14BC-B744 read 2 at 19:20 UTC and 6 at 19:33 for a burst that ran
  18:14–18:45, converging on the 7 our own log already had. Nothing is lost — the old dashboard was
  showing a stale number and labelling it today. On SETTLED days the two feeds agree to the click
  (8 of the 10 codes with CAKE data on 21–22 Aug matched exactly).
- **The first-party feed is three feeds** (`api/_lib/door-clicks.js`): the door log before
  `DOOR_RETIRED_AT` (2026-08-18), the lander beacon (`funnel_events.event='offer_click'`) after it,
  and since 2026-08-21 the `/click` gate (`clicks.entry='gate'`). Gate and beacon fire on the SAME
  tap, so the raw count is ~2x — always read `unique_by_spk` / `unique_total`, never `by_spk`.
  Verified folding correctly: 9 gate + 7 beacon rows → 7 unique.
- **The beacon alone badly under-reports** (network-wide 9 / 3 / 7 taps on 18–20 Aug against CAKE's
  44 / 134 / 37). That window is beacon-only, which is exactly why the rule is a MAX and not
  "first-party wins".
- **NOTE the shipped page:** `www.sprknetwork.ad/dashboard` is the **Next app** (`web/app/lib/dashboard/`).
  `dashboard/index.html` is the pre-React Alpine copy and its only route (`/soloaffiliate`) 404s —
  it still carries the OLD two-basis logic. Fix `web/`, not the HTML.

### 10b. THE REAL ROOT CAUSE of #10's "Today is wrong, custom works": CAKE runs on LONDON time
- **Presents:** the Today pill under-reports clicks and never shows the last hour of live traffic;
  a custom range covering the SAME day is right. 2026-08-23 16:52 ET, timothycooper859: custom
  08/23–08/23 = 29 clicks, Today = 8, same second.
- **Root cause:** MyMonetise is a UK platform. Its reports both FILTER on and RETURN **Europe/London**
  wall-clock (BST = UTC+1 Mar–Oct). `formatCakeDate` rendered **UTC** getters. Sending UTC digits to
  a London clock shifts every window an hour EARLY — it drags in an hour of the previous day and
  drops the most recent hour of this one. Nothing re-filters the returned rows by time, so the
  shifted window IS what the affiliate sees. Worst on TODAY, whose end is `now`; a CUSTOM range ends
  at the next midnight, and that whole-day end has an hour of slack that absorbs the skew — which is
  the entire "custom works better" effect.
- **PROOF, two independent ways (don't re-derive this):**
  (a) 2026-08-23 20:42:35 UTC / 21:42:35 London — CAKE's newest `click_date` was **21:36:47**. A
      click cannot be 54 minutes in the future.
  (b) Row by row: SPK-14BC-B744's nine `/click` gate rows appear in CAKE as the SAME NINE — same
      IPs, same seconds, exactly +1h, including one visitor's triple-tap on both sides.
  The 2026-07-27 "CAKE is UTC, verified" note was WRONG: it compared the string `04:06:49` against
  door rows stamped `04:xx`. Two clocks an hour apart print matching digits if you only compare digits.
- **Fix/status:** SHIPPED to `claude/clicks-one-basis` (SPRKNetworkAds commit `407852a8`, PR #13).
  ONE shared `formatCakeDate` in `api-src/_lib/cake-date.ts` renders CAKE's own clock via Intl
  (DST-aware; byte-identical to the old output in GMT). It replaces TWO hand-copied UTC twins —
  `cake-reports.ts` and `cron/poll-cake.ts` — so `cake_clicks_daily`'s windows were an hour early too.
  Pin: `api/_lib/_cake-date.test.mjs` (BST, GMT, both DST edges, the hour-24 midnight trap).
- **STILL OPEN, separate fix + data migration:** the timestamps CAKE RETURNS are London too and
  callers parse them as UTC. That is the long-known +60 min on `cake_conversions.conversion_at`
  versus the postback for the same event — it lands on chart BUCKETS and stored row timestamps, not
  on which rows a window returns.
- **Note:** the "CAKE lags about an hour" reading taken earlier the same day was NOT lag — it was
  this. Real CAKE reporting lag is ~6 minutes.

### 10c. The SAME London clock on the way BACK IN — conversion_at, stat_day, chart hours
- **Presents:** `cake_conversions.conversion_at` runs +60 min against the postback for the same
  event; a conversion in the first hour of a UTC day is attributed to the WRONG DAY on the
  affiliate's dashboard; the earnings chart's hour buckets sit an hour late.
- **Root cause:** CAKE returns `2026-08-23T14:12:40` — a bare wall clock, no zone, on the LONDON
  clock. `new Date(str)` reads a zone-less ISO string as LOCAL, and Vercel runs TZ=UTC, so it became
  an instant an hour too late in BST. Same defect as #10b, opposite direction.
- **Measured 2026-08-23:** exactly +60.0 min on 23 of 23 genuinely-postbacked rows, and **407 of
  5,983 mirrored conversions (6.8%) on the wrong calendar day**.
  ⚠️ TRAP that will fool you if you re-measure: 112 July rows read +0.0 skew. They are
  `match_source='cake-rebuild'` — `conversions` rows BUILT FROM `cake_conversions`, so they inherited
  the same wrong stamp and agree with it circularly. **Always split the comparison by
  `match_source`**; only genuine postback rows (null / 'spk' / 'subid_owner') are evidence.
- **Fix/status:** SHIPPED to `claude/clicks-one-basis` (commit `5a44d73c`, PR #13). One
  `parseCakeDate` in `api-src/_lib/cake-date.ts` at all three sites: poll-cake `conversion_at`,
  poll-cake `stat_day`, cake-reports `events[].ts`.
- **NO DATA MIGRATION — do not write one.** The poller's daily DEEP reconcile re-pulls 400 days of
  conversions and re-upserts on (cake_affiliate_id, conversion_id); any reconcile re-pulls 30 days of
  clicks and REPLACES each day's bucket. The mirror rewrites itself from source on deploy — hit
  `?mode=deep` to do it now. A `- interval '1 hour'` UPDATE is not idempotent, would corrupt correct
  rows written after the deploy, and hard-codes an offset that is wrong half the year.

### 10d. The two click feeds have PERMANENT holes in OPPOSITE directions
- **Presents:** "this creative shows 0 clicks but it's definitely running", or a code whose number
  looks nothing like the network's.
- **The two holes (verified live, 2026-08-21→23, per code per ET day):**
  - **CAKE cannot see a non-Monetise code AT ALL.** `SPK-A947-ACBE` (Fluent, Apple Pay): ours 23,
    CAKE 0. `SPK-F180-73BE` (Fluent): ours 6, CAKE 0.
  - **We cannot see traffic that never passes our lander.** `SPK-3704-A758` (Monetise, Freecash):
    ours 0 — **zero gate clicks** — CAKE 5. Self-launched links straight to the network do this.
  - Where BOTH can see, they agree tightly: `SPK-191D-6D81` 46 vs 46, `SPK-14BC-B744` 42 vs 43.
- **How to apply:** never "fix" a feed because it disagrees with the other — check the offer's
  network and the code's gate-click count FIRST. This is why the tile takes the per-code MAX
  (`api/_lib/clicks-one-basis.js`) instead of preferring either source.

### 11. Gate clicks arriving with NO spark code (open)
- **Presents:** a chunk of `clicks` rows with `entry='gate'` and `spk_code IS NULL`. 48 on 2026-08-22
  and 20 on 2026-08-23, nearly all `domain='www.myrewardscorner.com'` with `slug` NULL. CAKE
  independently reports the same shape (a `cake_clicks_daily` row with `spk_code` NULL, 17 today).
- **Impact:** they belong to nobody, so they appear on NO affiliate dashboard and in no EPC. They are
  not lost money on their own, but a conversion behind one of them lands `unmatched`.
- **Root cause:** not yet diagnosed — the lander is reaching `/click` without an `s1`. Suspect a
  myrewardscorner entry path that does not forward query params (the same family as issue #7).
- **Fix/status:** OPEN, flagged 2026-08-23.

## Closing the loop

- Tell Migi plainly: what the affiliate sees, what admin sees, which known issue explains the gap,
  and whether any money is actually missing (usually: none, or it's sitting `unmatched`).
- Give the affiliate-facing one-liner (e.g. "your registrations are tracking — Testerup only pays
  when a tester completes a paid test; registrations show as $0 events").
- Any fix touching money math: `/code-review high` + read-only prod simulation first, per
  `sprk-money-audit` guardrails. No SQL writes without Migi's explicit OK.
- **If you diagnosed something not in Known Issues, ADD IT above (issue → presents → root cause →
  fix/status) before ending the session.** When you fix an OPEN item, update its status with the
  commit/migration reference.
