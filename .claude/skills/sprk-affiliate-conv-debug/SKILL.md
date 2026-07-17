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

## Attribution model (what "matched" means)

Inbound: `SPRKNetworkAds/api/postback.js`. Cascade: click_id (`cid`, from the offer's clickid slot,
default s5) → SPK code in s2/s1 against `spark_codes` → token fallback against live spark codes ∪
`subid_owners` (ambiguity ⇒ left NULL on purpose). Unmatched rows are still recorded with
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
- **Fix/status:** profile.js piece PREPPED 2026-07-17 (Migi approved): branch
  `fix/profile-payable-conv-count`, commit `f1df7a1` in the SPRKNetworkAds repo — `sumBalance` now
  gates the count on the shared `classifyDashboardConversion(...).payable` (finite gross > 0; the
  select adds `gross_payout`, deliberately NOT `event_type`, since payable never depends on it).
  Reviewed at /code-review high + prod-sim'd read-only: 5 users' counts change, every dropped row
  carries $0 affiliate_payout, `earned` byte-identical. NOT PUSHED yet — awaiting Migi's ship OK.
  IMPORTANT SCOPE NOTE (review finding): nothing in the UI renders `balance.conversions` today
  (sidebar/settings read `balance.earned` only) — the number the AFFILIATE actually sees comes from
  the `affiliate_earnings` Home fold in `api/cake-reports.js` (~line 1347, `per[key].conversions++`
  with no `price > 0` gate; contrast perfDash line ~2146 which gates). Making the Home tile
  payable-only is the REMAINING piece and per `sprk-money-audit` must touch the fold AND the
  snapshot/poll-cake counting together. my-analytics.js line ~231 uses a third predicate
  (event_type filter, gross-agnostic) — zero rows disagree in prod today (verified), but it's
  latent drift; ideal end-state is one shared payable predicate across all three surfaces.

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

### 5. Healthy-account baseline (what a NON-buggy new affiliate looks like — lolpantsnoa #29, 2026-07-17)
Clicks land under their SPKs, $0 events arrive WITH click_id and match by user_id, zero payable
rows simply means the network hasn't fired a paid conversion for their click_ids yet (Testerup pays
$10 gross / $9 affiliate on completed tests, registrations pay $0). Verify with audit step 5 that
someone else got paid rows the same day before suspecting the pipeline. Conclusion that day: account
100% healthy — dispute was Known Issue #1 plus the range-scoping of the admin board (3 of his 9
lifetime events were in the selected range).

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
