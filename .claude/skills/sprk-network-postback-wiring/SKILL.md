---
name: sprk-network-postback-wiring
description: >-
  How an affiliate NETWORK is wired into SPRK so its conversions come back attributed — the
  per-network macro dialect, the postback URL, and the offers.clickid_slot ↔ cid= contract.
  Use whenever Migi says: "wire up Fluent", "wire up Everflow", "set up the <network> postback",
  "add a new network", "which macros does <network> use", "what goes in the postback template",
  "the conversions are all coming in with the subids empty", "everything is unmatched on the new
  network", "sub1 vs s1", "why doesn't sub1 pull through", "clickid_slot", "which slot should the
  click id go in", "cid doesn't match", "Conversions tab or Events tab", "the postback never
  fires", "what does the Type field on a network do", or "prove which subids survive".
  SHORT ANSWER so you get it right without opening this file: SPRK's doors can ONLY emit the
  param names s1..s5. An Everflow-family network reads sub1..sub5 and sees none of them. The ONE
  escape hatch is offers.clickid_slot = sub2 | sub3 | sub4 — and sub5 is ACCEPTED THEN SILENTLY
  IGNORED. The offer's clickid_slot and the network postback's cid= must name the SAME slot; they
  live in two different systems and a mismatch pays zero with no error.
  NOT for "affiliate X's conversions look wrong" (→ sprk-affiliate-conv-debug), "who does this
  conversion belong to" (→ sprk-subid-attribution), or "add the next offer" (→ sprk-new-offer).
  LIVING DOCUMENT: when a session learns a new network dialect or portal quirk, append it to the
  "Network dialects" table and the "Traps" catalogue below.
---

# Network postbacks — the s-vs-sub namespace wall and the clickid_slot↔cid contract

⚠️ **Mirrored in tokrwd and SPRKNetworkAds — if you change one copy, change the other.** The code
this describes (`api/postback.js`, `api/link/[slug].js`, `api/c.js`, `api/_lib/tracking.js`,
`api/offers.js`, `admin/_common/admin-app.js`) all lives in **SPRKNetworkAds**; tokrwd holds only
the landers. Everything below was verified against SPRKNetworkAds `origin/main` @ `724302c` on
**2026-07-30**, plus a live Fluent test conversion on **2026-07-31**. Line numbers drift — grep the
SYMBOLS named here. For lander edits see `tokrwd-landers`; for per-affiliate diagnosis see
`sprk-affiliate-conv-debug`; for offer setup see `sprk-new-offer`.

## The one fact everything else follows from

SPRK's tracking doors speak **CAKE**, and only CAKE. `stampAffiliateSubids` in
`api/_lib/tracking.js` writes four hard-coded string-literal keys — `out.s1`, `out.s2`, `out.s4`,
`out.s5`. There is no slot argument, no prefix parameter, and no network branch. Neither door
(`api/link/[slug].js`, `api/c.js`) reads `offers.network_id` or `affiliate_networks.type`.

An Everflow-family network records `sub1..sub5`. It never looks at `s1..s5`. So on a default
configuration **every conversion returns with all five SubIDs empty**, lands `status='unmatched'`
with `user_id` NULL, and the affiliate is paid **$0** on revenue SPRK still collects. The postback
returns HTTP 200, so the network never retries.

Pre-slotting the destination URL with `?sub1=&sub2=` does **not** work. `buildDestination`'s fill
regex matches `([?&]<key>=)[^&]*` for a key of `s1`, which cannot match `sub1=`, so the CAKE names
get appended alongside your empty slots.

**The only code path that emits a `sub`-named param is `buildClickDestination`**, reached when
`offers.clickid_slot` is `sub2`, `sub3`, or `sub4`. That is the whole escape hatch.

## Network dialects — what each network type substitutes

The four presets ship in `admin/_common/admin-app.js` as `POSTBACK_PRESETS`. `postbackTemplateFor(n)`
picks by `affiliate_networks.type`, falling back to `POSTBACK_DEFAULT` — **which is the CAKE string**.

| Type | affiliate SubID | payout | transaction id |
|---|---|---|---|
| `cake` (MyMonetise) | `#s1#`..`#s5#` | `#price#` | `#tid#` |
| `everflow` (Fluent) | `{sub1}`..`{sub5}` | `{payout_amount}` ⚠️ see below | `{transaction_id}` |
| `affise` | `{sub1}`..`{sub5}` | `{payout}` | `{click_id}` — the CLICK id, not a transaction id |
| `tune` | `{aff_sub}`, `{aff_sub2}`..`{aff_sub5}` | `{payout}` | `{transaction_id}` |

⚠️ **The shipped `everflow` preset says `{payout}` and that is WRONG.** A live Fluent conversion on
2026-07-31 proved `{payout}` arrives as the literal string while **`{payout_amount}` substitutes to a
real number** (`0.19949999999999998` for a $0.20 conversion). `admin-app.js` `POSTBACK_PRESETS.everflow`
needs a one-line correction — that is a production code change, so hand Migi the diff, do not apply it.

**Portal check that costs nothing:** Everflow's URL field outlines every macro it recognises. A macro
rendering as plain text is not real and will arrive literal. Use the portal's own `{ } Add Macro`
picker rather than typing macros by hand.

## The postback URL

Assembled in `admin-app.js` `copyPostbackUrl` as `origin + '/api/postback?net=' + id + '&key=' + postback_key + tpl`.
The template is a **fragment that is concatenated, never parsed** — it must begin with `&`, and the
PARAM NAMES (`s1`..`s5`, `cid`, `payout`, `txid`) must never be edited. Only the macros change.

⚠️ The base is whatever origin the admin page was loaded from. Copy it from a Vercel preview and the
network will hammer a staging URL forever.

Base: `https://<APP_ORIGIN>/api/postback?net=<NET_ID>&key=<POSTBACK_KEY>`

**CAKE / MyMonetise:**

`&s1=#s1#&s2=#s2#&s3=#s3#&s4=#s4#&s5=#s5#&cid=#s5#&payout=#price#&txid=#tid#`

**Everflow / Fluent — paired with `offers.clickid_slot='sub2'`:**

`&s1={sub1}&s2={sub2}&s3={sub3}&s4={sub4}&s5={sub5}&cid={sub2}&payout={payout_amount}&txid={transaction_id}`

Two deltas from the shipped preset, **both required**: `cid` must name the same slot as
`offers.clickid_slot` (the shipped `{sub5}` is provably empty — see T1), and `{payout_amount}`
replaces `{payout}`.

**Install variant:** append `&event=install`. Records a $0 `event_type='install'` row and drives
install-based caps. `api/postback.js` only honours it when the value matches `/^installs?$/i`.

## Everflow registers postbacks under three separate tabs

**Portal knowledge, established 2026-07-31 in the live Fluent wiring. No repo trace — it cannot be
verified from either codebase.**

Everflow's Manage Postbacks screen has **Conversions**, **Events**, and **CPC** tabs. A postback
registered on the Events tab fires only on *additional* post-conversion events. **It never fires for
a conversion.**

Fluent's original SPRK postback was registered on **Events only**, which is why zero real conversions
had ever reached SPRK despite live offers. This is the single highest-value thing to check first when
a new network "isn't sending anything" — before touching any code.

⚠️ **SPRK treats any fire carrying a payout above $0 as a payable conversion** unless the URL says
`&event=install` (`api/postback.js`, `eventKind`). So an Events-tab postback with real money credits
the affiliate as if it were a conversion. On a revshare offer that may be correct — the affiliate did
earn it — but it is a decision to make deliberately. A real `txid` protects you either way: dedup is
exact on `(network_id, txid, event_type)`, so the same conversion arriving on both tabs records once.

This supersedes `sprk-affiliate-conv-debug` Known Issue #6, which named "conversion vs event
templates" as a thing to check and had no playbook. Update #6 to point here.

## The clickid_slot ↔ cid contract

Two settings, in two different systems, that must agree. Nothing validates the pair and a mismatch
is silent.

1. **`offers.clickid_slot`** — SPRK side. Which param the click token rides out in.
   Accepted values are `s2 s3 s4 s5 sub2 sub3 sub4 sub5` (`api/offers.js` `CLICKID_SLOTS`).
   **DB default is `s5`**, and clearing the field PATCHes it back to `'s5'`.
2. **the postback's `cid=`** — network side. Which param the network echoes back.

They must name the SAME slot. `api/postback.js` resolves the owner from `cid` → the `clicks` row
first; that is the authoritative leg. If `cid` arrives empty, attribution falls back to an SPK-shaped
value in `s1`/`s2` — which on an Everflow network is permanently empty, so **there is no fallback.**

Read the current state (read-only; hand Migi the SQL, never write prod):

```sql
select code, name, clickid_slot, pricing_mode, status
  from offers
 where network_id = '<NET_ID>'
 order by code;
```

```sql
select name, type, status, (credentials is not null) as has_creds, postback_template
  from affiliate_networks
 order by name;
```

⚠️ `affiliate_networks.postback_template` is **DISPLAY-ONLY**. `api/postback.js` never reads it — it
selects exactly `id, postback_key` off that row. Changing it in the DB only changes what the admin
screen shows you to copy. **The postback that actually fires lives inside the network's own portal.**

⚠️ `api/postback.js` does not check `affiliate_networks.status` either. An **archived** network with
a postback key still authenticates and records conversions.

## The sentinel-URL test — prove which slots survive before trusting any of this

The diagnostic that settles every question above empirically. It works because `api/postback.js`
stores the entire inbound query object on the row as `raw: q`.

Fire it **directly at the network, bypassing the door**, so you are testing the network's carry and
not SPRK's stamping. Put a distinct recognisable value in every slot:

```
https://<NETWORK_DESTINATION>/?sub1=SENTINELONE&sub2=SENTINELTWO&sub3=SENTINELTHREE&sub4=SENTINELFOUR&sub5=SENTINELFIVE
```

Convert on it, then read the payload back:

```sql
select c.created_at, k.key, k.value
  from conversions c, jsonb_each_text(c.raw::jsonb) k
 where c.network_id = '<NET_ID>'
   and c.created_at > now() - interval '6 hours'
 order by c.created_at desc, k.key;
```

**Healthy wire:** every sentinel echoes back intact at full length, `payout` is a real number, `txid`
is a real id. Any slot returning empty is a slot the network did not capture. Any value returning as
a literal `{macro}` means the network is not substituting — a portal problem, not a code problem.

The row will land `status='unmatched'` with `user_id` NULL. **That is correct** — there is no `clicks`
row behind a hand-typed token. You are testing the pipe, not the plumbing. It is also safe: with no
matched affiliate it cannot trip T5.

**Fluent result, 2026-07-31 (dated observation):** all five sub slots echoed back intact at 22
characters, no truncation; `{payout_amount}` → `0.1995`; `{transaction_id}` → a real id. Separately,
Fluent **remaps `sub2` and `sub4` to its own values downstream toward the advertiser landing page**
(you will see `subaff2=<their affiliate id>` there) while Everflow's own click record keeps the
affiliate's value. Do not read the landing-page URL as evidence a slot was overwritten — read the
postback payload.

## Traps

### T1 — `clickid_slot='sub5'` is accepted, then silently ignored

**Presents:** an Everflow offer configured exactly as the shipped preset implies, paying zero.
**Root cause:** `slotIsS5 = (cslotOut === 's5' || cslotOut === 'sub5')` in *both* doors folds `sub5`
into the s5 branch, which writes the literal key `s5` and sets `injectCid = null`, suppressing the
only code that respects a sub-named slot. Output is **byte-identical** to slot `s5`. No `sub5` param
is ever emitted. The comment above that code claims it will "never silently orphan an offer whose
network reserves s5" — for `sub5` it does exactly that.
**Perverse:** the fail-open branch (identity unresolved — no `aff_id`, or any DB blip) *does* set
`injectCid = clickId` and *does* emit `sub5`. So an affiliate without an `aff_id` attributes and one
with an `aff_id` does not. **The bug is intermittent.**
**Fix-status:** FIX WRITTEN 2026-07-31 on branch `claude/fluent-money-fixes`, not yet pushed.
`subidPrefixForSlot()` in `api/_lib/tracking.js` derives the namespace from the slot and both doors
pass it through, so `sub5` now emits `sub1..sub5` for real. CAKE offers stay byte-identical — pinned
by `api/_lib/_subid-namespace.test.mjs`. Until that ships, use `sub2`, `sub3`, or `sub4`.
**Correction:** `docs/fluent-2026-07-28/FLUENT-IMPORT.md` says clickid_slot "must be sub2–sub5".
That was CORRECTED 2026-07-30 — `sub5` is a trap. Use `sub2`, `sub3`, or `sub4`.

### T2 — network Type left blank ships CAKE macros to a non-CAKE network

**Presents:** conversions arriving with `s1='#s1#'`, `cid='#s5#'`, `txid='#tid#'`.
**Root cause:** `postbackTemplateFor` falls through to `POSTBACK_DEFAULT`, the CAKE string, whenever
`type` is blank or unrecognised. `escLike` escapes only `\ % _`, so `#s1#` becomes an exact ILIKE
match, and the 120-second window dedup collapses every fire network-wide into roughly one per 120s.
**Impact:** no money lost directly (those rows were unattributed anyway) — but the forensic record
needed to back-credit affiliates after the fix is destroyed, and networks do not resend.
**Fix-status:** OPEN. Set `affiliate_networks.type` explicitly; never leave the dropdown at
"— Select type —".

### T3 — a junk non-empty `s1` disables the SPK fallback in `s2`

**Presents:** a fire carrying a perfectly valid SPK in `s2` resolves to nobody.
**Root cause:** `s2IsCandidate` requires `s1IsAffStamp || (!s1 && /^SPK-/i.test(s2v))`. Any junk in
`s1` — a literal `{sub1}`, a typo — closes candidacy.
**Fix-status:** OPEN, code fix. Allow an SPK-shaped `s2` regardless of `s1`.

### T4 — revshare with a missing or negative price bricks the affiliate's entire Get Paid

**Presents:** "Some of your conversions are still being verified" on every payout attempt, forever.
**Root cause:** the missing-price fallback in `api/postback.js` is gated on `offers.payout != null`,
but `applyRevshareGuard` plus a DB CHECK force `offers.payout` NULL on **every** revshare offer — so
the one guard that exists can never fire on the only offer class where the price is unknowable, and
its `console.error` sits in the same dead branch. The row writes `status='recorded'` with NULL money.
`stage_spark_payout` preflights the affiliate's **whole ledger** scoped only by `user_id`, so one
poisoned row 409s every payout across every creative they own.
**Triggers:** a payout macro that does not substitute (see the dialect table), or a chargeback.
**Fix-status:** FIX WRITTEN 2026-07-31 on branch `claude/fluent-money-fixes`, not yet pushed. A
matched conversion whose money cannot be booked as a non-negative number now records
`status='needs_review'` with a loud `console.error` instead of `'recorded'`, so it is excluded from
the payout preflight and cannot brick the ledger. `api/admin.js` Tracking Health gains a
`needs_review_7d` counter. Until that ships, nothing clears such a row and the only escape destroys
the code's attribution.
**Prevention today:** get the payout macro right before the first conversion. Verify with the
sentinel test.

### T5 — the launcher's link screens are blind to `sub1=` (⚠️ DO NOT "fix" this by widening)

**Presents:** an affiliate's spend tagged with someone else's code — in theory. Never observed.
**Root cause:** `hasEmbeddedS1` in `api/_lib/subid.js` tests `/[?&#]s1=/i`, which does not match
`?sub1=` — the preceding character is `b`. `launchLinkProblem` is built entirely on that oracle and
is the only screen behind every link resolver. A link carrying `?sub1=SPK-EVIL-0000` is accepted.

**Fix-status: WILL NOT FIX by widening. Attempted 2026-07-31 and REVERTED the same day.**

Widening the oracle to `(s1|sub1|aff_sub)` looks like a two-line fix and breaks live traffic,
because the premise is wrong for the links the launcher actually stores. **A launcher destination
is usually an intermediate LANDER, not a network endpoint.** On a lander `sub1` is the lander
operator's own passthrough label and `s1` is separately SPRK's match key — they legitimately
coexist. Real stored rows (`form_jobs`, prod, read-only):

```
...frrcsh-us-mon-man-prelander.html?sub1=SPK-CD6E-AAEB&s1=SPK-CD6E-AAEB&s3=76233488...
...playful-us-flu-man-prelander.html?sub1=ediplay1&s1=sub-1rxg8s&s3=76233476...
```

31 such rows, 6 of them `link_source='self_serve'`. The widening broke them two ways:

- **Hard 400.** `launchLinkProblem` returns a reason → `pickSelfServeLaunchLink` yields `{link:''}`
  → `spark-test/jobs.js` 400s the WHOLE batch. The affiliate cannot launch at all.
- **Silent attribution loss — worse than the bug.** `appendSubid`'s presence test bails on the
  existing `sub1`, so the unscreened client arm ships the ad with SPRK's own `s1` **missing** and no
  error anywhere. Verified by execution: `appendSubid('…?sub1=ediplay1…', 'SPK-MINE-1111')` returned
  the URL unchanged.

If this is ever worth closing it must be **network-aware** — screen `sub1` only when the destination
is a known Everflow/Tune endpoint — never a blanket widening. Regression assertions pinning the
correct lander behavior live in `api/_lib/_subid-namespace.test.mjs`.

### T6 — money from a non-CAKE network is invisible on every revenue display

**Presents:** balance pill, Home snapshot, admin revenue board and earnings leaderboard all read $0
for an affiliate whose money came from a non-CAKE network.
**Root cause:** `cake_conversions` has exactly one writer, `api/cron/poll-cake.js`, hard-wired to the
MyMonetise base URL. There is no Everflow poller in the tree. Non-CAKE money exists **only** in
`conversions`.
**NOT lost money.** Get Paid is role-gated and priced off the server dry-run against `conversions`,
and the dashboard falls back to the postback ledger. But for a **mixed** affiliate the claimable
figure subtracts `payout_batches` (minted from `conversions`) from earned (read from
`cake_conversions`) — different ledgers, and a `Math.max(0,…)` clamp hides the error.
**Fix-status:** OPEN, larger design decision — build a poller, or move every display surface to a
de-duplicated union. They must move together or they will contradict each other.

### T7 — the tolerant-save class

`clickid_slot` and `sprk_cut_pct` are both in `OPTIONAL_COLS` and get stripped-and-retried on a schema
error, with no loud-loss toast. A save can appear to succeed while silently dropping the field. There
is also **no DB CHECK constraint** on `clickid_slot`, so hand-run SQL can write anything. Always read
the value back after setting it.

### T8 — a fire with no SubIDs at all is invisible in Unclaimed SubIDs

`spk_code` stores NULL when `s1` is null and `s2` isn't SPK-shaped, and the Unclaimed SubIDs queue
filters `spk_code is not null`. That count is precisely the signal that a postback URL is mis-wired,
and it is the one thing the admin cannot see. Those rows are unrecoverable — there is nothing to
assign.

## Before you write to anyone's money

Three rules, all learned by getting them wrong on 2026-07-31. Read them before any backfill,
Assign-SubID, or hand-written `UPDATE conversions`.

### R1 — a scaler's code is NOT lost affiliate money

**Scalers run their own tracking.** They bring their own subids and they keep **100%** — `share = 1`,
SPRK margin **zero** (`resolveShare` in `api/admin.js`, `resolveCommission` in `api/postback.js`, both
branch on `role === 'scaler'`). Attribution on a scaler row is bookkeeping; it does not decide what
they are owed, because there is no split to compute.

So an unfamiliar code sitting in Unclaimed SubIDs is **not** automatically an affiliate who lost
money. Resolve the ROLE first. Scaler accounts as of 2026-07-31: `edwinamaya8085@gmail.com`,
`osvaldeo7@gmail.com`, `admin@tenxholdingsllc.com` (Trae/TenX), `miguel@sprknetwork.app` — plus
jcastillo per Migi. Codes seen from them include `Edvid1`, `Edvid2`, `edplay2`, `TRAE_*`,
`Dyl-*`.

**What went wrong:** a session saw `Edvid1` unmatched, applied the affiliate playbook, and backfilled
at 90/10. That underpaid Edwin by $3.28 and booked SPRK margin it was not entitled to. The admin UI's
Assign SubID would have got it right — it calls `resolveShare()`. Hand-written SQL does not.

**The whole tracking/postback effort in this skill exists for AFFILIATES.** For a scaler, every fix
here changes nothing about what they are paid.

### R2 — `user_profiles` is keyed by EMAIL, not by the id on the row

`resolveShare` goes `auth.admin.getUserById(userId)` → email → `user_profiles.eq('email', email)`.
`conversions.user_id`, `spark_codes.user_id` and `clicks.owner_user_id` all hold the **auth** id,
which is NOT `user_profiles.id`.

```sql
-- WRONG — returns 0 rows and will convince you the user has no profile
select * from user_profiles where id = '<conversions.user_id>';

-- RIGHT
select au.id as auth_id, au.email, up.display_name, up.role, up.commission_type
  from auth.users au
  left join user_profiles up on up.email = au.email
 where au.id = '<conversions.user_id>';
```

A session hit exactly this, concluded "no profile → falls to the 90% default", and wrote the wrong
split on that basis.

### R3 — derive margin by SUBTRACTION, never as a second percentage

`api/postback.js` computes `margin = round2(effGross − netPayout)` — subtracting the **already
rounded** payout. That makes `affiliate_payout + margin == gross_payout` true by construction.

A backfill that rounds both halves independently drifts:

```sql
-- WRONG: gross 18.75 → round(16.875)=16.88 and round(1.875)=1.88 → sums to 18.76
margin = round((gross_payout - gross_payout * 0.90)::numeric, 2)

-- RIGHT
affiliate_payout = round((gross_payout * <share>)::numeric, 2),
margin           = round(gross_payout::numeric, 2) - round((gross_payout * <share>)::numeric, 2)
```

Always verify with `sum(affiliate_payout + margin) = sum(gross_payout)` before you call a backfill done.

## Already correct — do not re-litigate

- **The postback INBOUND side already speaks every dialect.** `api/postback.js` aliases `s1/sub1` and
  `s2..s5 / sub2..sub5`, takes `cid || click_id`, `txid || tid`, `payout || price`. Empty strings are
  falsy so the populated one wins. Every loss is on the OUTBOUND door.
- **No truncation or mangling anywhere on the outbound path.** Values are percent-encoded exactly
  once. Worst-case composed s5 is 55 characters. Proven by the 2026-07-31 sentinel test at 22
  characters intact. **The failure is purely the parameter NAMES.**
- **Money arithmetic is exact.** `margin = round2(effGross - netPayout)`, not a re-derived
  percentage. Gross always reconciles to net + margin.
- **The macro-literal guard works where applied** — `cid`, `txid` and `event` correctly reject
  `#s5#` / `{sub5}` / `#tid#`.
- **`$0` pixel fires are correctly kept out of the money bucket**, excluded from the payout fold, and
  cannot window-dedup away the real payable fire.
- **Path A is correct for Fluent.** The Fluent landers set `window.__DOOR_URL__` to
  `https://sprktrax.org/api/link/<slug>` — through the door, no direct-to-network CTA. See
  `tokrwd-landers` for Path A vs Path B; do not "fix" this either way.

## Known-unverified — state these as open rather than guessing

1. Whether a given network's `{transaction_id}` equivalent is reliably populated. On the CAKE side
   440/455 recent conversions had no usable `#tid#`. Without a real txid a conversion falls into the
   120-second window dedup, whose arms do not compare gross.
2. Whether a reversal reuses the ORIGINAL transaction id. If it does, exact-txid dedup drops it
   entirely — no hold, no clawback, and SPRK keeps paying a reversed conversion.
3. Whether non-CAKE money should be polled at all or remain postback-only. Postback-only is a code
   fact today; whether that is intended is a product decision.

## Standing rules

- **READ-ONLY selects only.** Hand Migi the SQL; never write prod from a session.
- **No push, deploy, or merge without explicit approval**, every time. See `sprk-safe-ship`.
- **Attribution and money code needs `/code-review high`** plus a read-only prod simulation (rows
  lost / flipped / recovered) before shipping.
- **Never re-fire postbacks to "fix" attribution** — that double-counts. Unmatched rows are
  recoverable through Assign SubID.
- Close with the ELI5 recap. Migi's standing rule.

## ELI5

SPRK writes the affiliate's ID onto the outgoing link using CAKE's labels — `s1`, `s2`, `s5`. Some
networks only read labels called `sub1`, `sub2`, `sub5`. Same information, different envelope, so
they throw it away and tell us "somebody converted" with no idea who. The one label SPRK *can* write
in their language is the click ticket, and only if you put it in slot `sub2`, `sub3`, or `sub4` —
`sub5` looks like it works and does nothing. Then you have to tell the network to send that same slot
back, in the right place in their portal, using a macro they actually recognise. Get all three right
and the right affiliate gets paid. Get any one wrong and everything silently goes to nobody.
