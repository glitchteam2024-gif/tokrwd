---
name: sprk-custom-landers
description: >-
  How to give ONE affiliate their own landing page — host the HTML file they sent us, wire it onto
  our door, and lock it so nobody else can take it. Use whenever Migi says anything like "give
  <name> their own landing page", "he sent me his own HTML", "he wants to run his own ads to his
  own page", "make it only his", "hide this design from everyone else", "hide this design from
  him", "reserve this page for him", "he wants a custom domain", "can affiliates use their own
  domain", or names a bespoke lander folder (ACSM, AS50, /sasurl). Covers the
  operator-supplied-lander generator pattern, the three things a supplied HTML file can never ship
  with, the `landing_pages` + `landing_page_affiliates` SQL, `self_serve` + `capacity=1` as the
  single-tenant lock, the per-affiliate `status='hidden'` row, the whole picker / auto-assign /
  slot-rotation machinery it plugs into, and — honestly — what does and does not exist today for
  CUSTOM DOMAINS (`lp_domains`).
  LIVING DOCUMENT: when a new affiliate gets a bespoke page, or the picker/assignment machinery
  changes, write it in here so the next session doesn't re-derive it.
---

# An affiliate's OWN landing page — host it, wire it, lock it to them

Two repos, and the work splits cleanly:

| Repo | What it owns |
|---|---|
| **tokrwd** (`~/Documents/GitHub/tokrwd`) | the HTML. `www.tokrwd.co`, Vercel, `main` auto-deploys |
| **SPRKNetworkAds** (`~/Documents/GitHub/SPRKNetworkAds`) | the offer, the door (`sprktrax.org`), the picker, Supabase |

Sibling skills: `tokrwd-landers` (lander architecture, the NO-CLOAKING rule, the propagate loop),
`sprk-new-offer` (offer rows, door slugs, revshare), `sprk-affiliate-conv-debug` (their conversions
look wrong afterwards), **`sprk-lander-mobile-fanout`** (the page is hosted and now it has to look
right on PHONES, or run across MANY offers at different amounts — and the deploy-order and
verification ladder that go with that).

⚠️ **Verify every claim against `origin/main`, never a local working tree — in BOTH repos.** Measured
2026-08-02: `~/Documents/GitHub/tokrwd` sat on `main`, **52 commits behind `origin/main`**, with no
`_lp-generator/`, no `ACSM/`, no `AS50/` and no `sasurl/` in the tree at all — every command in §1
fails there until it is fetched. The SPRK checkout drifts the same way, and this area moved twice on
2026-08-02 alone. Every line number below was read at SPRKNetworkAds `origin/main` **`f97b2d5`** and
tokrwd `origin/main` **`3587aa8`**; every DB fact was measured against **prod**, on 2026-08-02.
**`f97b2d5` deleted `reservedView`** (shipped 18 minutes earlier in `b47731b`) and replaced it
with the per-affiliate hide in §2 — if you find a session note citing `reservedView`, it is stale.

### The worked case this generalises from

Sammy — `ssammyofficial18@gmail.com`, AffID 12, auth id `a42c2031-2aea-4ca8-8f2f-11d6f32a00d4` —
sent Migi a finished HTML page and wanted to run his own ads to it instead of one of our three house
designs, on **Rewards US - Cash Style - Apple Cash $750** (`510a0fa1-482a-40a4-b464-049e1653671e`).

Live result: `ACSM/US/index.html` + `AS50/US1..US100` + `/sasurl` in tokrwd (all 102 files one md5,
`e33e85b7…`), `landing_pages` slug `applecash-us-sammy`, capacity **1**, `self_serve = true`,
`template_key = 'z'`, preview image set, and one `landing_page_affiliates` row holding slot 1
(`chosen_by='admin'`, `slot_cycle='2026-08'`).

---

## 1. GIVE AN AFFILIATE THEIR OWN LANDING PAGE — THE WHOLE CHECKLIST

Every step is load-bearing. Do them in this order.

### Step 1 — save their file BYTE-FOR-BYTE, patch it with a generator

`_lp-generator/<person>-<offer>-source.html` is their file, untouched.
`_lp-generator/<person>-<offer>.js` applies only **asserted** substitutions on top. Copy
`_lp-generator/sammy-acash.js` and change the constants at the top — `CANON_DIR`, `FAMILY`, `GEO`,
`VANITY`, `DOOR_SLUG` (`sammy-acash.js:50-75`).

```bash
cd ~/Documents/GitHub/tokrwd && git fetch origin && git status   # ⚠️ above — this checkout is routinely dozens of commits stale
node _lp-generator/sammy-acash.js --clones 100
```

Why a generator and never a hand-edit: their design survives intact, re-running is deterministic
(one buffer → one md5 across the family — the `RS50/RS1` drift lesson in `tokrwd-landers`), the tree
is a pure function of `--clones` because it also **prunes** (`sammy-acash.js:221-228`), and every
patch is an assertion, so an edit to the source that breaks a substitution **fails the build**
instead of silently shipping the placeholder. The three primitives are `sub()` / `must()` /
`never()` at `sammy-acash.js:91-104`.

### Step 2 — fix the three things their HTML can never ship with

See §3. All three were in Sammy's file; expect all three in the next one; all three are invisible
from the rendered page.

### Step 3 — optional vanity path

`/sasurl` is a **plain copy of the same buffer, NOT a redirect** (`sammy-acash.js:199-213`). A
redirect adds a hop before the lander and bounces the query string through an extra rewrite where
`s1` can be lost.

⚠️ **It carries no slot number, so it is ONE shared URL.** The anti-flag property of the numbered
fan-out does not apply to it — a flag on `/sasurl` is a flag on the only copy. Fine for one affiliate
on his own link; **never hand the same vanity path to a second person.**

⚠️ **It is not what the app serves.** `resolveAffiliateOfferLinks` returns the row's `link` numbered
by slot (`https://www.tokrwd.co/AS50/US1`). The vanity path only works if he types it. Two URLs for
one page is a reconciliation cost you are choosing to pay — say so out loud.

### Step 4 — create the `landing_pages` row, by SQL, not the admin form

```sql
-- slug MUST equal DOOR_SLUG in the generator, or every click 404s at the door.
-- WHERE NOT EXISTS, never ON CONFLICT — see Trap 2.
insert into landing_pages
  (name, offer_id, link, slug, capacity, geo, status,
   self_serve, template_key, template_name, template_blurb, preview_image)
select 'Apple Cash $750 — Sammy (US)',
       '510a0fa1-482a-40a4-b464-049e1653671e',
       'https://www.tokrwd.co/AS50/US1',
       'applecash-us-sammy',
       1, 'us', 'active',
       true, 'z', 'Cash Card', 'Reserved page. Not available to other affiliates.',
       '/images/landers/applecash-us-sammy.png'
where not exists (select 1 from landing_pages where lower(slug) = 'applecash-us-sammy');
```

Field by field, and why:

- **`slug`** — its own, never a house design's. Reusing `applecash-us` works on day one (that door is
  already live) but blends his clicks with everyone on design A with no way to separate them. A
  `landing_pages` row has to exist either way for the page to appear in his picker, so the dedicated
  slug costs nothing (`sammy-acash.js:55-73`).
- **`link`** — must name a **numbered** clone. `landerProblem` probes with two different slots and
  refuses a link where `lpSlotLink(link,1) === lpSlotLink(link,2)` (`lander-picker.js:168-174`). A
  `/sasurl`-style link has no digit run, so `lpSlotLink` returns it unchanged and the row is refused
  everywhere.
- **`capacity`** — **THE CONTRACT WITH THE CLONE SLICE.** `lpSlotLink` swaps the trailing digit run
  blindly with no existence check (`affiliate-links.js:193-199`), so a capacity larger than the
  clones actually deployed hands out live, paid 404s. Here it is also the lock — see §2.
- **`geo`** — lowercase, matching the house rows. It is the key the same-geo clash guard
  (`admin.js:1533-1554`) and the picker's release sweep both use.
- **`template_key`** — `'z'` sorts it after the house `a`/`b`/`c` (`pickableLanders` sorts on
  `template_key` then `name`, `lander-picker.js:198-199`).
- **`preview_image`** — the picker card. NULL renders "Preview coming soon"
  (`offers/index.html:1751-1753`). Step 6.

### Step 5 — assign the affiliate

```sql
-- landing_page_affiliates.user_id is the AUTH.USERS id. Get it from auth.users, never user_profiles.
insert into landing_page_affiliates
  (landing_page_id, user_id, offer_id, status, slot, slot_cycle, slot_claimed_at, chosen_by)
select lp.id, u.id, lp.offer_id, 'active', 1, '2026-08', now(), 'admin'
from landing_pages lp
cross join auth.users u
where lp.slug = 'applecash-us-sammy'
  and lower(u.email) = 'ssammyofficial18@gmail.com'
on conflict (landing_page_id, user_id) do nothing;
```

`ON CONFLICT` is correct **here** — `landing_page_affiliates_landing_page_id_user_id_key` is a plain
UNIQUE `(landing_page_id, user_id)` (verified in prod). It is NOT correct on `landing_pages` (Trap 2).

**Alternative, once the row exists:** the admin action `assign_landing_page_affiliate`
(`admin.js:1525-1577`) does the same thing through the API and adds three things raw SQL does not —
the same-geo clash 409 (`:1533-1554`), the capacity check (`:1556-1558`), and lowest-free-slot
allocation (`:1563-1568`). It leaves `chosen_by` NULL rather than `'admin'`. Either is fine; SQL was
used for Sammy because the row was being created by SQL anyway.

### Step 6 — the picker preview screenshot

See §8. The PNG lives in **SPRKNetworkAds** (`images/landers/<slug>.png`) — that repo serves
`/offers` — and the `preview_image` column must be set to match, or the card reads "Preview coming
soon" forever.

### Step 7 — make it theirs only

`self_serve = true` **and** `capacity = 1`, plus (optionally) a `status='hidden'` row per affiliate
you want the design kept away from. See §2 — they do different jobs and none of them alone is the
lock.

### Step 8 — verify

```bash
# tokrwd: one md5 across the whole family, vanity copy included
md5 -q ACSM/US/index.html sasurl/index.html AS50/US*/index.html | sort -u   # expect 1 line
# the door the page actually fires must equal the row's slug
grep -o 'sprktrax.org/api/link/[a-z-]*' ACSM/US/index.html
# the door 302s with s1 and 404s without (HEAD writes no clicks row)
curl -sI 'https://sprktrax.org/api/link/applecash-us-sammy?s1=SPK-TEST-0000'
curl -sI 'https://sprktrax.org/api/link/applecash-us-sammy'                 # expect 404
# tokrwd guard tests
node api/_lib/_tracking-audit.test.mjs && node api/_lib/_links-config.test.mjs
```

The bare lander must still render (it is the preview surface); the **door** must 404 without `s1`.
That is the attribution gate, not a bug — Trap 5.

Also add the new folder roots to **both** `PRELANDER_ALLOWED_ROOTS` (`api/_lib/links-config.js:899`)
and `ALLOWED_ROOTS` (`js/breakout.js:56`) — `_links-config.test.mjs` pins the two lists together and
fails if they drift. `acsm`, `as50`, `sasurl` are already in both.

---

## 2. MAKING IT THEIRS ONLY

Three separate mechanisms. They do different jobs; none is a substitute for another.

| | What it does | What it does NOT do |
|---|---|---|
| `landing_pages.self_serve = true` | makes the row **visible at all** — `pickableLanders` filters `self_serve === true`, strictly (`lander-picker.js:196`) | it is **global**: it exposes the row to every affiliate on that offer and lets `lander-autoassign` hand it out (`lander-autoassign.js:177`) |
| `landing_pages.capacity = 1` | makes it **single-tenant** — with the seat held, `claimSlot` returns `{slot:null, full:true}` for everyone else (`lander-picker.js:101, :109`) | it does not stop the holder LOSING it: a released seat is immediately claimable again, by anyone |
| `landing_page_affiliates` row with **`status = 'hidden'`** | hides ONE design from ONE affiliate in the picker (`admin.js:4893-4914`) | it is **display-only** (see the gap below) and it is **per-PAIR** — "hide this design from everyone else" is one row per affiliate, hand-written, and covers nobody who joins the offer afterwards |

`capacity=1` is a **hard** lock, refused identically by both halves of the feature:
`choose_landing_page` answers 409 off `claimAssignment`'s thrown `.full` (`admin.js:5031`,
`lander-assign.js:106-114`), and `autoAssignLanders` skips to the offer's next design
(`lander-autoassign.js:284-291`). The picker disables the card client-side too
(`offers/index.html:1748`, `:1754-1755`, `:1779-1782`), and the preview modal mirrors that guard on
purpose (`:1838-1849`) — otherwise it would offer "Use this design" on a design the grid disabled and
the affiliate would only learn it was full after watching the 5s build animation and getting a 409.

**`self_serve` is a GLOBAL boolean. There is no per-affiliate visibility column on `landing_pages`.**
Turning it off to hide a design from one affiliate pulls it from everyone AND stops auto-assign
offering it — which is exactly why the hide lives on the junction instead.

### ⚠️ RELEASE BEFORE YOU CLAIM — the trap that bit on Ashlyn (2026-08-04)

**The picker switches designs release-then-claim. Raw SQL does not.** Inserting a bespoke assignment
without archiving the affiliate's existing one leaves them with **two `status='active'` rows on the
same offer**, and `resolveAffiliateOfferLinks` keys `by_offer[lp.offer_id]` inside a `forEach` with
**no `.order()`** — so the last row iterated wins and which link they are served is undefined. They
get the house design on one page load and their own page on the next, and nothing errors anywhere.

Happened live: Ashlyn ended up on `applepay750-us` (slot 49) **and** `applepay750-us-ashlyn`.

Always release in the same statement:

```sql
UPDATE landing_page_affiliates lpa SET status='archived'
  FROM landing_pages lp
 WHERE lpa.landing_page_id=lp.id AND lpa.user_id='<AUTH_USER_ID>'
   AND lp.slug='<old-slug>' AND lpa.status='active';
```

`'archived'` rather than `DELETE`: it keeps the audit trail, and every filter in the codebase tests
`status = 'active'`, so an archived row holds no slot and resolves nothing. Set `slot` on the new row
too — `lpSlotLink(link, null)` returns the link unchanged so it *works*, but a NULL slot is
inconsistent with rotation and with every other assignment.

**Network-wide check, worth running after any hand-assignment:**

```sql
SELECT u.email, o.name, count(*), string_agg(lp.slug, ', ')
  FROM landing_page_affiliates lpa
  JOIN landing_pages lp ON lp.id=lpa.landing_page_id
  JOIN offers o ON o.id=lp.offer_id
  LEFT JOIN auth.users u ON u.id=lpa.user_id
 WHERE lpa.status='active' GROUP BY u.email, o.name HAVING count(*)>1;
```

Clean as of 2026-08-04.

### A single-tenant page is PRIVATE to its holder (shipped `935a17e`)

`capacity = 1` now does double duty: the lock (`claimSlot` → `free=[]` → `full:true`) **and** the
visibility rule. `get_offer_landing_pages` hides any `capacity === 1` row from everyone except the
affiliate holding it, and hides an **unheld** one from everyone — a bespoke page is admin-assigned,
never self-served.

Before this, every other affiliate on the offer saw a card for somebody else's page parked at "At
capacity" forever: clutter they could never act on, leaking whose page it is. The viewer's CURRENT
design is always shown regardless of either rule (`id === golMineId` is checked first), because
hiding it renders a picker with no "Your page" card and a gold "start a build" CTA.

### `status='hidden'` — hide one design from one affiliate (shipped `f97b2d5`)

A `landing_page_affiliates` row whose `status` is `'hidden'` means *"do not offer THIS design to THIS
affiliate."* Same junction table the assignment already uses, so it needs no new schema and no new
join, and it rides a read that was already happening.

```sql
-- Hide design B from Sammy. NOTE: (landing_page_id, user_id) is UNIQUE, so this is one row per
-- pair — an affiliate can be 'active' on a design or 'hidden' from it, never both.
insert into landing_page_affiliates (landing_page_id, user_id, offer_id, status)
select lp.id, u.id, lp.offer_id, 'hidden'
from landing_pages lp cross join auth.users u
where lp.slug = 'applecash-us-b' and lower(u.email) = 'ssammyofficial18@gmail.com'
on conflict (landing_page_id, user_id) do update set status = 'hidden';
```

⚠️ **NEVER run that upsert against a design the affiliate is CURRENTLY ACTIVE on.** The `do update`
would flip their live `'active'` row to `'hidden'` in place, and every consequence is silent:
`resolveAffiliateOfferLinks` reads active rows only (`affiliate-links.js:210`) so their served link
vanishes; `takenSlots` (`lander-assign.js:41`) and `lpa_lp_slot_unique` are both scoped to
`status='active'`, so **their clone number is freed for someone else while the row still holds it**;
and `releaseAssignment` never runs, so nothing is written to `landing_page_slot_history` and the
cooldown never sees the number. Check first — `select status from landing_page_affiliates a join
landing_pages lp on lp.id=a.landing_page_id where a.user_id='<auth-id>' and lp.slug='<slug>'` — and
if they are on it, move them off with `choose_landing_page` / the admin unassign (both of which
release properly) BEFORE hiding it.

How it reads (`admin.js:4864-4914`):

- **One query answers three questions.** The assignment read dropped its `.eq('status','active')` and
  now partitions in JS (`:4871-4877`): active rows give the seat counts and "which is mine", hidden
  rows give the per-viewer hide set. Filtering in SQL would need a second round trip on a modal that
  opens on every offer view.
- **Only `'active'` rows ever count as an assignment** — here (`:4877`) and in
  `resolveAffiliateOfferLinks` (`affiliate-links.js:210`), `heldLandersFor` (`admin.js:207`),
  `takenSlots` (`lander-assign.js:41`) and the rotation cron (`rotate-lander-slots.js:73`). So a
  hidden row can never be mistaken for an assignment: it hands out no lander, consumes no clone
  number, and is never rotated.
- **A design they are CURRENTLY RUNNING is never hidden**, whatever the hide rows say
  (`admin.js:4910-4914`). A hidden current design would render a picker with no "Your page" card and
  a "start a build" CTA — the same display bug the handler already 503s to avoid. ⚠️ Read it as
  defence in depth, not as protection: `golMine` comes from `'active'` rows and `golHidden` from
  `'hidden'` ones, and `(landing_page_id, user_id)` is UNIQUE — so the two sets are disjoint and that
  second disjunct **can never fire**. Nothing catches the upsert warned about above.
- Chosen over a flag on `landing_pages` because visibility here is per-PAIR, not per-page
  (`admin.js:4898-4900`).

⚠️ **The hide is honoured in exactly one place, and that is a real gap.** `grep -n hidden api/` at
`f97b2d5` finds it only in `get_offer_landing_pages`. `choose_landing_page` (`admin.js:4951+`) does
not check it, and neither does `autoAssignLanders` — and `claimAssignment` upserts on
`(landing_page_id, user_id)` with `status:'active'` (`lander-assign.js:121-132`), so **an
auto-assignment (or a direct API call) can silently convert a `'hidden'` row into an active one.**
For a bespoke capacity-1 page this is moot — the seat is held, so every other claim throws `.full` —
but do not treat `'hidden'` as an access control. It is a picker-display rule.

### Why `reservedView` was removed — do not re-add it

`b47731b` narrowed a bespoke-page holder's picker to only their own page, reasoning that switching
away would strand them because a released capacity-1 row *"reads as Full even to its own former
holder."* **It does not.** `full: cap > 0 ? used >= cap : true` (`admin.js:4935`) counts only active
assignments, so a release drops `used` to 0 and the card renders pickable again; `claimSlot` merely
breaks the cooldown preference to re-issue slot 1, which is logged, not refused
(`lander-assign.js:115-119`):

```
claimSlot({capacity:1, taken:[]})                         -> { slot:1, full:false }
claimSlot({capacity:1, taken:[], cooling:[1], exclude:1})  -> { slot:1, full:false, respectedCooldown:false }
```

`f97b2d5` deleted it (and its 7 tests) because it was solving a problem that did not exist while
costing the affiliate the ability to test other designs — the picker's whole purpose. The real
exposure it half-addressed is still true and is worth saying out loud to Migi: **a vacated capacity-1
seat is claimable by anyone on that offer**, picker or auto-assigner, and whoever loses that race
needs an admin after their ads have already moved.

Same commit also capped `.lpk-grid`'s column at 340px and centred it (`offers/index.html:118`) — with
`1fr`, a one-card picker stretched that card across the whole 1040px panel and blew its 16:9
screenshot up to ~990×557, reading as a broken zoom. A bespoke page is the case that produces a
one-card picker, so this matters here.

---

## 3. HOSTING SOMEONE ELSE'S HTML

### The three things every supplied file gets wrong

| # | What | Why it is fatal | Fix |
|---|---|---|---|
| 1 | **CTA points at a placeholder.** Sammy's shipped `CTA_REDIRECT_URL = "https://example.com/your-offer-destination"` | every click 404s off-domain | point it at `https://sprktrax.org/api/link/<slug>` (`sammy-acash.js:109-151`) |
| 2 | **It forwards NO query params.** `window.location.href = CTA_REDIRECT_URL` drops the query string entirely | `?s1=<SPK>` never reaches the door → **every conversion unattributed**. The page looks perfect and the money silently vanishes. **This is the expensive one.** | the standard builder: every param rides, `s1` LAST, `campid` promoted, `mc_attr` fallback, **`s1` never fabricated** (`sammy-acash.js:117-150`) |
| 3 | **Terms / Privacy are `href="#"`** | several ad networks fetch these | `/Rewards/terms`, `/Rewards/privacy` — **extension-less**: `vercel.json` sets `cleanUrls:true` (`:3`) so the `.html` form 308s, and spending a redirect on a link a reviewer fetches is avoidable (`sammy-acash.js:153-159`) |

Then add the shared `js/ttclid.js` backfill before `</body>` (`sammy-acash.js:161-165`) —
`sprktrax.org` is in its allowlist, so the door forwards `ttclid` into the postback.

### Assert, don't edit

Every patch is a `sub()` with an exact expected occurrence count, so a source edit that breaks it
throws. Assert the **negatives** too (`sammy-acash.js:167-183`):

```
must(h, DOOR, 1)   must(h, 'id="cta-hero"', 1)   must(h, 'offerUrl()', 2)
never:  'example.com' · 'href="#"' · 'CTA_REDIRECT_URL'
never (cloaking):  'x-safari' · 'intent://' · '__SUBID_OK' · 'document.write'
                   · 'display:none!important' · 'musical_ly'
```

The NO-CLOAKING rule in `tokrwd-landers` applies to a supplied page exactly as it does to ours. The
only sanctioned home for a scheme jump is `pre/index.html` + `js/breakout.js`, and
`_tracking-audit.test.mjs` check 6 fails the build if it appears anywhere else.

### Unverifiable claims: PRINT them, do not silently edit them

**Everything is hosted on `www.tokrwd.co`. An ad-network penalty earned by ONE affiliate's page
attaches to the DOMAIN and every other lander on it.** That is why a supplied page gets read before
it is hosted.

Sammy's carried ten (`sammy-acash.js:78-89`): a countdown that resets at local midnight and so never
actually closes (`sammy-acash-source.html:596-601` — the single highest-risk item; a fake deadline is
textbook deceptive urgency and both TikTok and Meta action it), "4.8/5 average rating", "Most people
finish in under 5 minutes", "Daily availability is limited", three unsourced "Verified" badges,
"256-bit encrypted", "24/7 Support", and a mock card number beside the Apple glyph.

They were **NOT edited** — it is the operator's copy and Migi's call. But the generator prints them on
every run (`sammy-acash.js:231-236`), mirroring how `_tracking-audit.test.mjs` prints its EXCEPTIONS,
**so a deliberate carve-out cannot quietly become a permanent one nobody remembers agreeing to.** Keep
that pattern. The print is guarded by `if (html.includes(claim))` (`:235`), so it is also the receipt:
edit a claim out of the source HTML, re-run, and it drops off the list. To change a claim, edit the
source HTML and re-run; never patch it in the generator.

---

## 4. THE PICKER MODEL

Everything a bespoke page plugs into. Line numbers are SPRKNetworkAds `origin/main` @ `f97b2d5`.

### Which rows appear in the picker — the full filter chain

`get_offer_landing_pages` (`admin.js:4837-4947`):

1. **Auth** — Bearer token → `anon.auth.getUser` (`:4838-4842`).
2. **`landerSelfServeGate`** (`admin.js:138-185`) — **fails CLOSED**, unlike the click door: role
   first, profile resolved **by email** (`:155-157`) then `isSpkLockedAffiliate` (`:165-167`) —
   scalers and admins 403, an unreadable profile 503, never a pass; offer must exist and be
   `status='active'` else 404 (`:172`); `offer_assignments` `'revoked'` → 403, an admin kill outranks
   everything (`:180`); any other non-active → 403 (`:182`); `cap_mode='allocated'` with no active
   assignment → **404, not 403** — a private offer must not be confirmed to someone who cannot see it
   (`:183`).
3. **Rows** — `landing_pages` where `offer_id = <offer>` and `status <> 'archived'`, with
   `select('*')` so a pre-migration DB returns rows rather than erroring (`:4850-4854`).
4. **`pickableLanders(rows, offersById)`** (`lander-picker.js:194-200`) — `self_serve === true`
   strict (so `undefined` on a pre-migration DB fails closed) and `status !== 'archived'` (`:196`),
   then `!landerProblem(...)` (`:197`), then sorted by `template_key` then `name` (`:198-199`).
5. **`landerProblem(lp, offer)`** (`lander-picker.js:133-184`) — mirrors the door's own refusals so
   the picker can never assign a lander that 404s on the first click:

   | Refusal | Line |
   |---|---|
   | row missing / `status='archived'` | `:134-135` |
   | `offer_id` NULL (the door does `if (!lp \|\| !lp.offer_id) return 404`) | `:137` |
   | joined offer row missing | `:138` |
   | geo set but the offer has neither `destination_by_geo[GEO]` nor a flat `destination_url` | `:143-150` |
   | `capacity` not a positive integer — **no default; guessing is how slot 50 of a 30-clone slice becomes a paid 404** | `:157-158` |
   | `link` blank | `:165-166` |
   | `link` not numbered — probed with slots 1 and 2 | `:168-174` |
   | `launchLinkProblem(lpSlotLink(link,1))` — the shared oracle (`subid.js:86-93`): http(s), no `#fragment`, no embedded `s1=` | `:176-181` |

6. **The per-affiliate hide** (`admin.js:4893-4914`) — §2.

**`landing_pages.link` is deliberately NOT returned** (`admin.js:4916-4919`) — an affiliate who has
not chosen a design has no reason to hold the raw tokrwd clone URL. The card renders `preview_image`.

### How each label is decided

Server (`admin.js:4920-4946`):

```
seats_left = max(0, capacity - ACTIVE assignments on this lander)
full       = capacity > 0 ? used >= capacity : true
chosen     = golMine && golMine.landing_page_id === l.id
chosen_id  = golMine ? golMine.landing_page_id : null
slot       = golMine.slot ?? null
cycle      = cycleKey(new Date())
```

Client (`offers/index.html:1734-1786`) — note it branches on `chosen_id`, not the per-row `chosen`:

| Surface | Rule | Line |
|---|---|---|
| card gets `is-chosen` | `String(l.id) === String(chosenId)` | `:1747` |
| `full` for display | `!!l.full && !isChosen` — your own page is never "full" to you | `:1748` |
| **"At capacity"** chip | `full` | `:1755` |
| **"N spots left"** chip | `!full && seats_left <= 10` | `:1756-1757` |
| **"Your page"** chip | `isChosen` | `:1771` |
| button **"Currently running"** (disabled) | `isChosen` | `:1779-1782` |
| button **"Full"** (disabled) | `full` | `:1782` |
| button **"Use this design"** | otherwise | `:1782` |

The picker CTA on the offer page is **never gold any more** (`renderLanderCta`,
`offers/index.html:1445-1466`): gold means "the one thing that unblocks this offer", and since
auto-assign shipped, picking unblocks nothing. Its labels are "See landing page designs" / "Change
landing page" (`:1464-1465`). The **modal title** is still "Start your landing page build" (`:1740`) —
do not confuse the two.

Non-affiliates never see any of it: `lpGatesViewer()` (`:1261`) is
`roleResolved ? (userType === 'affiliate' && !isScalerUser()) : true`, and `loadOfferLanders`
(`:1415`) returns early for them. **That is a courtesy, not enforcement** — `landerSelfServeGate` is
what actually refuses a direct API call.

### The slot allocator

| Piece | Where |
|---|---|
| `COOLDOWN_CYCLES = 3` | `lander-picker.js:32` |
| `CYCLE_TZ = 'America/New_York'` | `lander-picker.js:37` |
| `cycleKey(date)` → `'YYYY-MM'` | `lander-picker.js:45` |
| `isCooling(released, now)` | `lander-picker.js:76` |
| `claimSlot({capacity, taken, cooling, exclude})` | `lander-picker.js:99-121` |
| DB half: `coolingSlots` / `takenSlots` / `recordRelease` / `releaseAssignment` / `claimAssignment` | `lander-assign.js:20 / 37 / 50 / 70 / 91` |
| Monthly rotation cron | `api/cron/rotate-lander-slots.js`, daily tick |

- **`cycleKey` uses `Intl`, not `getUTCMonth`** — the boundary is a wall-clock month in a
  DST-observing zone. `2026-03-01T04:30Z` is already March in New York and a UTC read would call it
  February. Eastern because cap resets on this platform are midnight Eastern.
- **`isCooling` fails CLOSED** — an unparseable released cycle counts as still cooling. The safe
  reading of a bad history row is "do not hand this number to someone else".
- **`claimSlot` preference order**: not-cooling and not-excluded > not-cooling > not-excluded >
  anything free (`:111-120`). `exclude` outranks nothing — a cooling number is a real footprint
  problem, being handed your own previous number is a wasted rotation.
- **`full:true` means the caller must 409, never overbook** (`:101`, `:109`).
  `respectedCooldown:false` is NOT an error (a blocked affiliate is worse than a reused clone) but it
  is logged (`lander-assign.js:115-119`) — it means the slice is too small for the roster.
- **Capacity has NO default anywhere on this path.** `claimAssignment` used to fall back to 50, which
  disagreed with the picker's own read; the comment at `lander-assign.js:93-98` is the postmortem.
- **Race safety**: `lpa_lp_slot_unique (landing_page_id, slot) WHERE status='active' AND slot IS NOT
  NULL` (verified in prod) turns two affiliates picking the same number into a `23505`, retried
  against a fresh read — 4 attempts, then a `.contended` error → 503 (`lander-assign.js:100-155`).
- **Rotation** (`rotate-lander-slots.js`): scoped to `self_serve` landers (`:56-57`) and to
  `status='active'` assignments (`:73`); a row with a NULL `slot_cycle` is **adopted** (stamped),
  never rotated, so flipping `self_serve` on does not re-number every hand-placed affiliate as a side
  effect (`:97-108`); `chosen_by` is preserved (`:121`); a `.full` failure leaves the affiliate on the
  number they have (`:134-141`). **Live ads are never touched** — the door resolves the owner from
  `?s1=<SPK>`, never from the path.
  ➜ **A capacity-1 page never rotates**: taken=[1], capacity 1 → `full` → `skipped_full`, holder keeps
  slot 1 forever. That is correct, and it is why `/AS50/US1` is stable.

### Switching designs — what actually happens, and what can be stranded

`choose_landing_page` (`admin.js:4951-5080`):

1. gate (`:4961`), load the row (`:4964`), **the row must belong to the offer named** (`:4975` —
   without this a self_serve row on a cheap open offer could be claimed while passing the offer_id of
   one the affiliate can access), `self_serve === true` (`:4980`), `landerProblem` → 409 (`:4988`).
2. `heldLandersFor(user, offer, geo)` (`admin.js:204-229`) — everything they hold for this
   **(offer, geo)**. A different-geo lander for the same offer is legitimate and left alone.
   **Throws → 503, fail closed**: not knowing what they hold and releasing nothing leaves two active
   landers and an ambiguous served link (`:4998-5006`).
3. already on it → idempotent `unchanged:true`, no release/re-claim (`:5011-5019`). A double-click
   must not burn a clone number and change a live URL for nothing.
4. **CLAIM BEFORE RELEASE** (`:5021-5035`; `.full` → 409 at `:5031`) — a full slice leaves them on the
   design they already had rather than on nothing.
5. **Reconciliation sweep**: re-read (not the pre-claim list) and release every other row for this
   (offer, geo) (`:5037-5068`). Re-reading is what makes two concurrent tab-switches converge, and it
   makes the endpoint self-healing for the stale-junction rows. A release failure after a successful
   claim is logged loudly but does **not** fail the request — the affiliate IS on the new design and
   saying otherwise would be a lie.
6. the returned link comes from `resolveAffiliateOfferLinks`, never rebuilt locally (`:5072`).

**What an affiliate can strand: switching off a `capacity=1` page.** `releaseAssignment` DELETEs the
row (`lander-assign.js:70-77` — DELETE not a status flip, because `'active'` was the only status value
in use when it was written; `'hidden'` rows are created directly and never released). ⚠️ That comment
is now stale as a description of the DATA: prod 2026-08-02 holds **116 `active`, 1 `hidden`, 1
`archived`**. Nothing in the code emits `'archived'` on this table — that row is hand-run SQL. It is
inert everywhere (every reader filters `status='active'`) but it still occupies the UNIQUE
`(landing_page_id, user_id)` pair, so an `on conflict … do update` will resurrect it. The vacated
seat is then claimable by anyone on that offer, picker or auto-assigner. Since `f97b2d5` removed
`reservedView`, **nothing prevents this** — it is a known, accepted exposure, not a bug to be
surprised by.

### Every `pickableLanders` call site

Only two, and they are the two halves of one feature:

| Call site | What changes if you touch `pickableLanders` |
|---|---|
| `admin.js:4862` — `get_offer_landing_pages` | what an affiliate can SEE and choose |
| `lander-autoassign.js:194` — `autoAssignLanders` | what gets claimed for them AUTOMATICALLY, at page-load speed, with no click |

`landerProblem` additionally runs alone at `admin.js:4988` (`choose_landing_page`) and
`admin.js:5118` (`get_lander_preview`).

**Widening `pickableLanders` widens the auto-assigner too.** That is the whole reason `self_serve` is
opt-in and never derived: deriving "offerable" from "a row exists" would have opened every live row on
deploy, including the ones with a dead door.

### `autoAssignLanders` — the automatic path (2026-08-01)

`lander-autoassign.js`. Runs inside `get_my_landing_pages` (`admin.js:4683`), which `/offers`,
`/sparkbank` **and** the launcher all load.

- **Demand signal** = an offer with a live (non-deleted) creative attached (`demandOfferIds`, `:327`).
  Not "has access" (an unsafe sweep) and not "opened the page" (burns a finite number on browsing).
- **NOT a sweep**, and the arithmetic is the reason (`:11-17`): rotation frees every holder's number
  monthly and `COOLDOWN_CYCLES = 3`, so one design sustains ~`floor(capacity/4)` holders — 7 on a
  30-clone slice. Past that `claimSlot` starts reissuing numbers a former holder's live ads still
  point at.
- Guards, all **borrowed not re-derived** (`:19-22`): `isSpkLockedAffiliate` (`:163`),
  `pickableLanders` (`:194`), offer `status='active'`, `offer_assignments` revoked/paused/allocated,
  and it **refuses an offer whose designs span more than one geo** (`:230-234` — picking a country on
  the affiliate's behalf is a real decision and stays with the picker).
- **Spreads across designs, most free seats first** (`:257-264`), which keeps a 30-clone slice inside
  its cooldown-safe headroom. **A capacity-1 page with its seat taken ranks last and throws `.full`
  anyway** (`:287`).
- `chosen_by='auto'` (`:278`), preserved by rotation. `sweepDuplicateAutoLanders` (`:98-145`)
  converges a race, and **only `chosen_by='auto'` rows are releasable** (`:124-129`) — a sweep that
  could delete a picked design would make the picker unreliable.
- **Fail-soft**: it never throws (a throw would blank the Creative Hub) and fails **closed** on any
  read error — claiming nothing (`:308-312`).
- ⚠️ **It does not read `status='hidden'`.** See §2.

### `resolveAffiliateOfferLinks` — the ONE resolver, and its two modes

`affiliate-links.js:206-254`. Used by `get_my_landing_pages`, `choose_landing_page` (`:5013`, `:5072`)
and both launch APIs as the **server-side source of truth**, so the link the launcher shows is the
link a launch tags.

```js
// affiliate-links.js:247-249 — verbatim
const link = (lp.slug && dom && offerHasDest.has(lp.offer_id))
  ? ('https://' + dom + '/api/link/' + lp.slug)   // MODE A — the DOOR, one shared URL for everyone
  // MODE B — the per-affiliate numbered clone, re-screened at READ time (see below)
  : (() => { const m = lpSlotLink(lp.link, r.slot); return (m && !launchLinkProblem(m)) ? m : null; })();
```

Mode A needs **all three**: a non-empty `lp.slug`; `dom`, an **active** `lp_domains` row (offer-scoped
first, else global, oldest active wins, `:227-236`); and a non-blank `offers.destination_url`
(`:222-225`) — otherwise the redirector would resolve to nothing, so the manual link must stay served.

Mode B additionally re-screens the numbered link with `launchLinkProblem` at READ time (`:249`), so a
value written past the write validator (hand-run SQL, or stored before 2026-07-16) can never launch
mis-attributed. A refused link means the offer simply gets **no entry** in `by_offer`.

Other properties that bite:

- `by_offer[lp.offer_id] = link` in a loop with **no ordering** (`:250`). Two active landers on one
  offer = the served link is a coin flip that can change after any write to either row (the monthly
  rotation cron writes to every one). Trap 7.
- It keys off the **lander's own `offer_id`** (`:221`, `:240`), never the junction's denormalised copy.
  Trap 8.
- Archived landers are dropped (`:216`); only `status='active'` junction rows are read (`:210`).
- **Fail-open**: any missing table or error yields `{}` so a launch is never blocked by this lookup
  (`:252`).

---

## 5. CUSTOM DOMAINS — WHAT EXISTS TODAY, HONESTLY

Migi's reason for wanting this written down: *"people will later want custom domains and what not to
run on their own landing page."* Here is what is actually built. **None of it is per-affiliate.**

### `lp_domains` — the table

`migrations/2026-06-19_lp_redirector.sql:10-22`, verified against prod schema:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | pk |
| `domain` | text NOT NULL | **bare hostname**, no scheme, e.g. `go.sprklinks.com` |
| `offer_id` | uuid NULL | optional scope. **NULL = shared/global pool** |
| `status` | text NOT NULL default `'active'` | `active` \| `flagged` \| `archived` |
| `use_count` | bigint default 0 | **nothing increments it** |
| `notes`, `added_at`, `flagged_at`, `created_by` | | |

Indexes: `lp_domains_domain_idx` UNIQUE on `lower(domain)`, `lp_domains_status_idx` on `status`.
**There is no `user_id` column.**

**Prod contains ZERO rows** — verified 2026-08-02: `select count(*) total, count(*) filter (where
status='active') active from lp_domains` → `{"total":0,"active":0}`.

### How a domain is picked

`affiliate-links.js:227-236`. One query, `status='active'`, `order('added_at', ascending)`:

```
domainByOffer[offer_id] = first active row scoped to that offer   (oldest wins)
globalDomain            = first active row with offer_id NULL     (oldest wins)
dom = domainByOffer[lp.offer_id] || globalDomain
```

There is **no rotation** — "rotating domain pool" is the table's name, not its behaviour. Oldest
active wins, deterministically, every request. Rotating means flagging one and adding another
(`set_lp_domain_status`, `admin.js:1653`).

### ⚠️ THE CONSEQUENCE NOBODY WOULD SEE COMING

**One `insert into lp_domains (domain) values ('x.com')` flips EVERY assigned affiliate on EVERY offer
from their numbered lander to the door.**

The domain is the only one of Mode A's three conditions that is currently false. Add one global active
row and every slugged self-serve lander collapses onto `https://x.com/api/link/<slug>` — **one shared
URL per lander, identical for all 100 affiliates on it.** The per-affiliate `slot` becomes decorative,
**the tokrwd lander is bypassed entirely** (ad → door → network; the page is never loaded), and the
anti-flag fan-out the whole numbered-clone model exists for stops existing. Nothing warns about it.
Independently flagged at `docs/lander-auto-assign-plan.md:76-90`.

**Per-affiliate uniqueness works today BECAUSE the table is empty.** That is the single most important
fact in this section.

Scoping the row to one `offer_id` narrows the blast radius to that offer — it does not remove it.

⚠️ **Drift risk before anyone changes this:** that selection rule exists in **three near-identical
copies and they are not shared code** — `affiliate-links.js:227-236` (the authoritative one),
`admin.js:1350-1362` (`served_link` on the admin Landing Pages list) and `admin.js:4041-4057`
(`run_link`). Collapsing them into one exported helper is the honest prerequisite for any change here.

### The rest of the plumbing

| Piece | State |
|---|---|
| Admin API `get_lp_domains` / `save_lp_domain` / `set_lp_domain_status` | **exists** — `admin.js:1591 / 1611 / 1653`. `save_lp_domain` strips scheme/path/port, validates the hostname shape, and revives an archived duplicate (`:1632-1640`) rather than dead-ending |
| Admin **UI** panel | **does not exist** — removed; `docs/subid-attribution-map.md:201` says so. Rows arrive only by direct API call or SQL |
| DNS / Vercel attachment | **manual, and validated nowhere.** A row in `lp_domains` does not attach the domain to any Vercel project |
| `middleware.js` `TRACKING_HOSTS` | **must be updated by hand** (`middleware.js:38-44`): *"any new domain attached to this Vercel project MUST also be added here, or it serves the whole brand site uncloaked"* |
| `SPRK_OWNED_DOMAINS` | `link-host.js:42-47` static floor, plus `sprkOwnedDomains(db)` (`:73-80`) which reads active `lp_domains` at call time, so a new domain automatically becomes un-targetable by a self-serve launch link |
| `lp_clicks.domain` | logged per landed click (`2026-06-19_lp_redirector.sql:38`) |
| `use_count` | column exists, nothing increments it |

### What a PER-AFFILIATE custom domain would need — none of it is built

State this as a gap, not a plan:

1. **A scoping column that does not exist.** `lp_domains` scopes by `offer_id` only — no `user_id` —
   and `landing_pages` has no domain column at all. Full prod column list: `id, name, offer_id, link,
   slug, capacity, status, notes, created_at, updated_at, created_by, geo, enforce_assignment,
   template_key, template_name, template_blurb, preview_image, self_serve`.
2. **A resolver change on a money path.** `resolveAffiliateOfferLinks` picks `dom` from offer/global
   only and takes no per-affiliate input beyond `userId`. It is the shared source of truth for both
   launch APIs, so a change there changes what live launches tag. Collapse the three rule copies first.
3. **Mode A serves the DOOR, not the lander.** `api/link/[slug].js:54-63` resolves the lander purely
   by slug; the `Host` header **routes nothing** — it is read only to stamp the click log's `domain`
   column (`:217`, `:298`). So a per-affiliate domain in `lp_domains` buys cosmetics, reputation
   spread and a per-domain click log — **not** per-affiliate routing. An affiliate who wants their own domain serving
   their own *page* is a different shape: the domain has to be attached to the **tokrwd** Vercel
   project, not the SPRK one.
4. **Three host lists and one header block, in two repos, all by hand.** `TRACKING_HOSTS`
   (`middleware.js:38-44`), `SPRK_OWNED_DOMAINS` (`link-host.js:42-47`), and — easy to miss —
   **tokrwd's frame headers**. `vercel.json`'s catch-all `/(.*)` block sends
   `X-Frame-Options: SAMEORIGIN` (`:219`) **and**
   `Content-Security-Policy: frame-ancestors 'self' https://www.sprknetwork.ad https://sprknetwork.ad`
   (`:236`). `frame-ancestors` overrides XFO in modern browsers and is the **only** reason the
   picker's preview iframe (`openLanderPreview`, `offers/index.html:1803`, framing tokrwd from
   `sprknetwork.ad`) renders at all. A new lander domain without that exact CSP shows an empty black
   box in the picker with no error — the same failure mode the admin panel's own preview hits on
   `appflowconnect.com` (see `tokrwd-landers`). DNS side, for a domain on the tokrwd Vercel project:
   apex `A 76.76.21.21`, subdomain `CNAME cname.vercel-dns.com` — Vercel's published values, pinned
   nowhere in either repo, so re-check them in their dashboard before handing them to anyone.
5. **`user_profiles.allowed_link_domains` exists in the DB (ARRAY) and is referenced by NO code** —
   `grep -rn allowed_link_domains` over SPRKNetworkAds returns nothing. It is not a hook; do not build
   on it assuming it does something.

### The one thing that IS possible today with zero code change

`landing_pages.link` accepts **any** http(s) URL. `launchLinkProblem` (`subid.js:86-93`) enforces
only: an http(s) scheme, no `#fragment`, no embedded `s1=`. There is **no host allowlist** on it, at
write time (`admin.js:1388-1392`) or read time (`affiliate-links.js:249`). The only structural
requirement is that the link be **numbered** (`lander-picker.js:168-174`).

So "his own page on his own domain" is reachable today by pointing `link` at
`https://hisdomain.com/US1` — **provided** (a) the domain serves a copy of the page that fires the
same `sprktrax.org/api/link/<slug>` door, (b) it carries the frame headers above if the picker preview
is expected to render, and (c) somebody accepts that the page is then outside this repo, so the
generator's assertions, `_tracking-audit.test.mjs` and the compliance read in §3 no longer cover it.
That last point is the reason it has not been done. It is Migi's call, not a default.

---

## 5b. SECOND CASE STUDY — ASHLYN (2026-08-04), AND WHAT A SURVEY FUNNEL ADDS

`_lp-generator/ashlyn-apay.js` · `ASHL/US` + `/ashurl` + `AH50/US1..US100` · door
`applepay750-us-ashlyn` · Apple Pay $750 US · `ashlynn.brunelle@gmail.com`
(auth `0ea40fbc-452a-420d-9f0c-d0ad5410312a`, aff 18).

Her page is a 3-question survey → activating → email capture → "You're all set!". Three things it
taught that Sammy's did not:

1. **A SUPPLIED PAGE MAY HAVE NO OUTBOUND LINK AT ALL.** Not a broken CTA — *no* CTA. Grepping for
   `location.href|location.replace|window.open|sprktrax|api/link` returned **zero matches**. The
   funnel ended on a thank-you screen. She would have paid for every click and earned nothing, and
   every dashboard would have read normally: clicks in, zero conversions, no error. **Run that grep
   on every supplied file before anything else** — a dead end is harder to spot than a wrong link,
   because nothing looks broken.

2. **`display: none !important` FAILS THE BUILD.** Her step-toggling utility shipped as
   `.hidden { display: none !important; }` — the exact signature of the blank-page cloak gate, so
   `_tracking-audit` check 6 flagged all 102 files. The class is legitimate. Fix in the GENERATOR,
   not her source: `.hidden.hidden { display: none; }` — specificity instead of the flag, zero
   behavioural difference. Verify the computed style is still `none` afterwards.

3. **A LEAD-CAPTURE PAGE MAY BE WRITING TO SOMEBODY ELSE'S DATABASE.** Hers posted every visitor's
   email and survey answers to `jjdpumaccvbsktotcwgc.supabase.co` — **not our project** (ours is
   `ecyawhhimmuzryxjnjng`) — with an anon key embedded in the page, from a page on `www.tokrwd.co`.
   We could not read it, delete from it, or answer a data request about it. **Check the Supabase/API
   host in any supplied page that collects PII**, against our own project ref.

   ➜ **Migi's call 2026-08-04: moved in-house.** Everything about a supplied page that COLLECTS DATA
   now lives in the sibling skill **`sprk-lander-lead-capture`** — the `survey_responses` table, the
   write-only RLS + column-grant shape (and the missing-SELECT-policy version that silently eats
   every lead), the client-minted-id race, dropping the jsdelivr import off the money path, and what
   a lead row must carry to be attributable. **Do not re-derive any of it here.**

   Related: her submit handler `return`ed on a database error. With a door wired in that means a
   database outage silently eating paid clicks. Any hand-off must be **best-effort-then-go** —
   attempt the write, log it, send the visitor either way.

## 5c. THIRD CASE STUDY — NOTKERMAN (2026-08-08), AND THE "DEMO STUB" VARIANT

`_lp-generator/kerman-apay.js` · `KERM/US` + `/saskrurl` + `KM50/US1..US100` · door
`applepay750-us-kerman` · Apple Pay $750 US (`2c345134-b7e2-4f55-aecf-5acf2984dce0`) ·
`notkermanh@gmail.com` (auth `70fe943b-a245-4fa3-9ef4-cca6ddec906c`, aff 32). Static page, no forms,
no external hosts, no CDN — the cleanest supplied file so far. Four things it added:

1. **THE NO-OUTBOUND-PATH DEFECT HAS A THIRD DISGUISE, AND IT IS THE CONVINCING ONE.** Sammy's
   pointed at `example.com`; Ashlyn's third design used `href='#'`; his shipped a **demo stub that
   simulates a working button** — a real listener that `preventDefault()`s and rewrites the label to
   *"Connect your claim flow here"*. It is the hardest variant to catch by clicking, because
   something visibly happens. **Four supplied landers in a row, four times the same defect.** Run the
   grep first, every time, and add a fourth item to the finding set: `example.com`, `href="#"`,
   `javascript:void(0)`, **and any handler that cancels the click**.

2. **LEGAL LINKS MAY BE ABSENT, NOT BROKEN.** §3 trap 3 says Terms/Privacy ship as `href="#"`. His
   footer had the disclaimer prose and **no links at all**, which reads as fine to a human and fails
   the same ad-network fetch. Grep for `Rewards/terms`, not for `href="#"`.

3. **THE §8 PREVIEW RECIPE FAILS ON A BIG-CLAMP HERO.** `--window-size=460,259` puts a page with
   `font-size: clamp(58px, 7.5vw, 104px)` into its own mobile breakpoint, and the card comes out as
   three cropped words — the same broken-zoom read `b47731b` fixed on the grid side. **Shoot at
   `--window-size=1280,720` and `sips -z 450 800`** when the design has a fluid hero. Check the
   capture before committing it; the recipe is a starting point, not a guarantee.

4. **THE `never()` GUARDS POLICE THE GENERATOR'S OWN COMMENTS — let them.** Adding
   `never(h, 'preventDefault', …)` failed the first build on a comment in the injected wiring that
   *described* the stub it replaced. That is the guard working (same lesson as Ashlyn's placeholder
   comment, `ashlyn-apay.js:143-145`). **Reword the comment; never weaken the assertion.**

Also worth copying: his hero and sticky CTAs are in-page anchors to `#claim`, and the `#claim`
section exists only to hold the converting button. That two-step is the operator's funnel — wire the
converting button and **leave the scroll anchors alone**, then assert `must(h, 'href="#claim"', 3)`
so a future source edit that breaks the internal funnel fails the build instead of shipping.

⚠️ He was **already active on a house design** (`applepay750-us-c`, slot 1, `chosen_by='affiliate'`),
so this is the first bespoke build where the release-before-you-claim trap in §2 was live rather
than theoretical. The SQL is committed at
`_lp-generator/2026-08-08_kerman_apay_landing_page.sql` and archives it in the same transaction.

## 5d. FOURTH CASE STUDY — NOTKERMAN AGAIN (2026-08-09), A SECOND PAGE FOR THE SAME AFFILIATE

`_lp-generator/kerman-shein.js` · `SHKM/US` + `/shkrurl` + `SK50/US1..US100` · door
`shein-b2s-us-kerman` · Rewards US - Shein $1000 Back to School
(`7018d82b-f19d-4759-9910-de9e837774e5`, code FL220841) · same affiliate as §5c. Static page,
no forms, no CDN, no third-party database; Google Fonts is its only external host.

**An affiliate can hold more than one bespoke page — they simply do not interact.** Different
offer, different door slug, different `landing_pages` row, different assignment. The release
sweep in §2 is scoped to `(offer, geo)`, so his Apple Pay page is untouched by the Shein build and
vice versa. Nothing new is needed for the second one; just do not reuse the vanity path (§1 step 3)
and do not reuse folder roots.

Four more things it taught:

1. **THE NO-OUTBOUND-PATH DEFECT CAN WEAR BOTH DISGUISES AT ONCE — and that combination is
   undetectable by inspection.** His money button was `href="#"` **and** its only script was a
   demo stub that cancelled the click and relabelled itself. Reading the href suggests the script
   handles it; clicking it makes something visibly happen. Neither check finds the truth alone.
   **Five supplied landers in a row, five times this defect.** It is not carelessness — these pages
   are built as design comps, and the destination is the one thing a comp cannot know. Assume it.

2. **A SUPPLIED PAGE MAY REFERENCE AN ASSET THAT WAS NEVER SENT.** His `.mirror-bay` asked for
   `url("../assets/shein-mirror-scene.png")`. There is no `assets/` directory in tokrwd and the
   photo did not come with the HTML, so it 404s on every load of all 102 copies. **Add
   `grep -noE 'url\(["'"'"']?[^)"'"'"']+' file.html` to the first-pass grep**, alongside the
   outbound-link check. A failed `background-image` never paints, so dropping the reference is a
   ZERO-visual-change edit that only removes the broken request — do that, and print the restore
   path (root-relative `/assets/...`, never `../assets/`, which is wrong from every clone depth).

3. **GOOGLE FONTS IS ALLOWED; THE STRAY-HOST GUARD MUST BE WIDENED DELIBERATELY, NOT DELETED.**
   431 landers in this repo already load `fonts.googleapis.com`, and it sits on no money path.
   Add the two font hosts to the generator's `allowed` set with the reason written down; keep the
   guard throwing on everything else. Sammy's and notkerman's Apple Pay pages reached zero hosts,
   so their generators allow only ours — do not copy that set blindly onto a page that uses webfonts.

4. **Legal links were absent again, not broken** — confirming §5c item 2 is the norm, not a one-off.

⚠️ **The §8 preview recipe needed the §5c override again.** This design has a `clamp(52px, 4.4vw,
66px)` hero and a 3-column grid that collapses at 1080px, so `--window-size=460,259` shoots its
mobile breakpoint. Shot at `1280,720` then `sips -z 450 800`. **The card came out well precisely
because the missing photo degrades to a flat dark panel** — check the capture, do not assume.

### 5d-ii. ONE DESIGN ACROSS MANY OFFERS, AND MOBILE (2026-08-09, same page)

Migi then asked for the page to be phone-optimised and run on **all seven** Shein offers, still
locked to notkerman. Both went in the GENERATOR — the source file stays byte-for-byte his, and
every change stays auditable as ours. Four things worth keeping:

1. **A SUPPLIED PAGE'S HERO NUMBER IS THE THING THAT BREAKS ON A PHONE, AND A DESKTOP REVIEW
   CANNOT SEE IT.** His reward figure overran the mirror's content box by 22px at 360px and 38px
   at 320px and sat on top of the frame's bulb strips. Cause: `clamp(92px, 28vw, 110px)` — the
   **floor** stops the type shrinking while the container keeps narrowing. Only 430px-class phones
   were clean. **A `clamp()` floor on a display figure is the bug; look for it first.** Fix shape:
   claw back container padding, then re-ramp with a NEGATIVE intercept (`calc(30vw - 28px)`) so it
   stays large at the top of the range and clears at the bottom.

2. **SIZE THE RAMP FOR THE WIDEST FONT, NOT THE ONE YOU SEE.** Google Fonts is loaded with
   `display=swap`, so **every Android cold load paints the fallback first**. Measured em-widths for
   a six-glyph thousands figure: Barlow Condensed 2.92, Arial Narrow 2.51, **generic sans 3.06**.
   Tuning to the webfont alone flashes a broken layout on every first visit. Measure the fallback
   in-page (`font-family: sans-serif` on a hidden span) and target ≥8% margin against the worst.

3. **FANNING ONE DESIGN ACROSS OFFERS IS A COPY PROBLEM BEFORE IT IS A PLUMBING PROBLEM.** His file
   hardcodes its amount in **ten** places. Four of the seven offers pay 750 and three are non-USD.
   Copying the page unchanged would promise a figure the offer does not pay — on a money path, in
   the affiliate's name. Substitute amount + currency per variant, assert **all ten**, and add a
   guard that fails the build if a symbol from the wrong currency survives anywhere. Move the
   campaign label with it (Back-to-School branding on an AU Product Reviewer offer is a mismatch a
   reviewer can question). Structure it as a `VARIANTS` table — one row per offer carrying
   `{key, geo, family, vanity, amount, campaign, slug, offerId}` — and print all of them each run.

4. **ONE VANITY PATH, NOT ONE PER OFFER.** It carries no slot number, so it is a single shared URL
   with none of the numbered fan-out's anti-flag property, and `resolveAffiliateOfferLinks` serves
   the numbered clone anyway. Seven of them would be seven single points of failure for a
   convenience nothing uses.

⚠️ **The currency guard fired twice on this generator's OWN comments** — the same lesson as §5c
item 4, now with a second instance. A comment that *names* the thing it is guarding against trips
the guard. **Reword the comment; never weaken the assertion.** Worth making guard errors print
surrounding context — a bare "1 stray symbol" is unactionable across a 700-file build.

## 5e. FIFTH CASE STUDY — RAVITEJ (2026-08-10): FOUR GEOS THAT ARE ONE OFFER, AND A CDN PAGE

`_lp-generator/ravi-playful.js` · `RAVI/{US,GB,CA,AU}` + `RV50..RV53` (30 clones each) + `/ravurl`
· doors `playful-<geo>-ravi` · Playful Rewards (`eaf3fdda-1474-4c9a-adb6-516247e3fca8`) ·
`ravitejkathuria011@gmail.com` (auth `9a619c72-035e-4fec-92d9-cc2a17034317`, aff 25).

### ⚠️ THE BIG ONE: "one design across N geos" is NOT the same shape as "across N offers"

§5d-ii fanned one design across seven SEPARATE Shein offers, and those never interact. **Playful
Rewards is the opposite: all four English geos are `landing_pages` rows on ONE `offer_id`.** That
one difference inverts the assignment rule, and every guard that would normally catch it is blind:

- `resolveAffiliateOfferLinks` (`affiliate-links.js:238-251`) does `by_offer[lp.offer_id] = link`
  in a `forEach` with **no `.order()`**, and `lp.geo` is **not even in its `select`** (`:214`). Two
  active rows on one offer therefore serve **whichever row PostgREST returns last** — undefined,
  and able to flip after any write to either (the rotation cron writes them all). This is the
  **money path**: `spark-test/jobs.js:399` and `sales-test/jobs.js:318` use that map as the
  server-side source of truth for a launch's Destination URL. A US spark code launches against a
  GB lander, the door resolves the GB row's geo, and the visitor lands on the wrong country.
- **The same-geo clash 409 does not fire** (`admin.js:1552-1573`) — four distinct geos, zero
  clashes. The admin panel builds this state with no warning.
- **`choose_landing_page` will not clean it up**: `heldLandersFor` is scoped `(offer, geo)`
  (`admin.js:214-239`), deliberately, so picking GB while holding US releases nothing.
- `autoAssignLanders` **already refuses this offer entirely** (`lander-autoassign.js:218-234`,
  `skipped: 'ambiguous-geo'`) — the guard's own comment says *"this is the guard for when that
  stops being true"*, and that is now. Cost: nothing is ever auto-claimed for Playful Rewards, and
  because a refusal writes nothing, the ~6-round-trip pipeline re-runs on **every**
  `get_my_landing_pages` load.
- The picker shows all four geo cards **with the country invisible** — the payload carries
  `geo` (`admin.js:5042`) and the card markup never renders it, so the affiliate reads four
  countries as four styling choices.

➜ **Build all N geo pages and all N rows; keep exactly ONE assignment `active`.** Switching geo is
a release+claim pair in one transaction (committed at
`_lp-generator/2026-08-10_ravi_playful_landing_pages.sql`, which also carries `DO $$` guards that
RAISE if the count is ever not 1). Prod had **zero** affiliates holding two active landers on any
offer on 2026-08-10 — check that invariant still holds before and after
(query (d) in that file), and do not be the one who breaks it.

**Also**: he was already active on the house `playful-us` (slot 2), so the release-before-claim
trap in §2 was live again, as it was for notkerman. That is now three builds in a row where it
mattered — assume it, always archive first.

### A supplied page whose STYLING is a runtime CDN

His file loaded `cdn.tailwindcss.com` (the Play CDN) plus `unpkg.com/lucide@latest`. Measured:
**~824 KB of blocking third-party JS to produce 23 KB of CSS**, and no other lander in tokrwd
loads either host. Two consequences that are invisible until the network is slow:

1. **`hidden` is itself a Tailwind class.** If the CDN is slow or blocked, all three quiz steps
   render at once and the result screen is exposed from first paint. The page is not merely
   unstyled, it is *wrong*.
2. **The icon CDN sat ON the conversion path, unpinned.** `lucide.createIcons()` runs immediately
   before the `setTimeout` that reveals the only converting button. If it throws, the assignment
   never happens, the spinner spins forever and the CTA is **never shown**. One hiccup, or one
   breaking `@latest` major, dead-ends every visitor silently.

**Fix: compile ahead of time, embed the icons, keep the design byte-identical.** `npm i -D
tailwindcss@3` + the inline `tailwind.config` transcribed to a real config, `content` pointed at
his HTML. 22.6 KB minified / 5.2 KB gzip.

⚠️ **Do NOT extract the CSS by rendering the page and scraping the generated `<style>`.** Proven
unsound: the Play CDN's candidate source is **the DOM, not the file text**, so classes that exist
only inside JS strings are absent from a load-time snapshot — here that included
`.border-neon-500`, the green border on the *selected* quiz option, and the close-state `x` icon.
It self-heals at runtime via MutationObserver, so the omission never shows up until a user clicks.
The real compiler's extractor scans the file as **raw text** and catches all of them; verify by
grepping the output for the JS-only classes.

**Fidelity is measurable — measure it.** Render the CDN build and the compiled build side by side
and diff `getComputedStyle` across every element. Result here: **zero** differences in layout,
colour, type, spacing, shadow or grid across 450+ elements. The only deltas were
autoprefixer-prefix supersets (`-webkit-text-decoration-*`, plus `-moz-`/`-o-` the CDN omits) and
`opacity` sampling on infinite animations — neither is a regression.

**Pin the source hash.** The CSS and the icon map are compiled FROM the supplied file, so a v2
silently makes them stale and a newly added utility class ships with **no CSS behind it** — a
broken layout that appears in no diff. `SOURCE_MD5` in the generator turns that into a build
failure. Verified to bite.

### Smaller things this one added

- **The no-outbound-path defect, sixth in a row, in its purest form yet**: not a placeholder, not
  `href="#"`, not a demo stub — a *complete cycle*. All 16 anchors were in-page fragments and the
  funnel looped hero → `#quiz` → result → `#final-cta` → `#quiz` forever, with no terminal state.
  Assume it on every supplied file; the grep is still the first thing to run.
- **A missing asset we already owned.** `/image.png` (3 refs) was never supplied, but
  `images/playful-rewards-logo.png` is the genuine app icon already in the repo. Repointing beats
  dropping — check what the repo has before deleting a reference.
- **A third-party OG card.** `og:image`/`twitter:image` pointed at `bolt.new`'s default, so every
  social preview of a tokrwd.co URL rendered StackBlitz's branding and fingerprinted the tool the
  page was built in. Grep supplied files for `og:image`.
- **An animation the operator declared that never ran.** His config defines a `shimmer` keyframe
  and his CSS calls it by name, but the `animate-shimmer` utility is never used as a class, so
  Tailwind never emitted the keyframe — on the CDN build either. Restoring a keyframe the author
  already asked for is not editing his design; inventing one would be. Verify in-browser first.
- **Mobile was tap targets, not layout.** His Tailwind layout is genuinely responsive at
  320–430px; the document-level overflow (240px) is deliberate decorative bleed clipped by the
  wrapper's own `overflow-hidden`. What was actually wrong: 16px-tall footer legal links, a 20px
  FAQ CTA and a 38px hamburger. **Do not go looking for the §1 clamp-floor defect on every page** —
  measure, then fix only what measured badly.
- **Currency across geos can be unanswerable, and then you leave it.** His copy quotes USD
  throughout; CA and AU also write "$", so only GB visibly mismatches. Every "fix" invents
  something — `£5` fabricates a UK figure, converting fabricates a rate *and* an earnings number.
  Left unchanged, with `currency` as a VARIANTS field and the question printed on every run.
  Changing an amount is a claim, not a translation.

## 6. THE TRAPS

### 1. Three different id columns, and two of them are wrong

**`auth.users.id` ≠ `user_profiles.id` ≠ `user_profiles.user_id`.**

`landing_page_affiliates.user_id` is the **`auth.users.id`**. Measured on Sammy's row, 2026-08-02:

```
auth.users.id           a42c2031-2aea-4ca8-8f2f-11d6f32a00d4   ← what the junction stores
user_profiles.id        ec1f35c2-f606-437e-a49c-f6407fbe1795
user_profiles.user_id    NULL                                  ← on a real, live row
```

`api/CLAUDE.md:51-55` says it outright: *"A query that joins `user_profiles.id = *.user_id` returns
NULL"* — always go through email. That is why `landerSelfServeGate` resolves the profile **by email**
(`admin.js:155-157`), and why `autoAssignLanders` takes the profile as a parameter with a docblock
saying the caller must have resolved it by email.

**In SQL, get the id from `auth.users` by email.** Never from `user_profiles`.

### 2. `landing_pages.slug` — `ON CONFLICT` gives you 42P10

There **is** a unique index. It is partial **and** on an expression:

```
landing_pages_slug_uniq UNIQUE ON landing_pages (lower(slug))
  WHERE slug IS NOT NULL AND status <> 'archived'
```

(`migrations/2026-06-19_lp_redirector.sql:28-29`, verified in prod.) Plain `ON CONFLICT (slug)` finds
no matching arbiter → `42P10 there is no unique or exclusion constraint matching the ON CONFLICT
specification`. Use **`WHERE NOT EXISTS`**. `landing_page_affiliates` is the opposite — a plain UNIQUE
`(landing_page_id, user_id)` — so `ON CONFLICT` is correct there, and `claimAssignment` upserts on
exactly that target (`lander-assign.js:131-132`).

### 3. `save_landing_page` cannot create a bespoke row — for a different reason than you'd expect

The old "it NULLs the slug" bug is **fixed**: `admin.js:1418-1455` now does present-key writes
(`wants(k) = !isUpdate || has(k)`), so a key the admin modal omits is left alone, and `offer_id`
(`:1433-1435`) and `capacity` (`:1449-1452`) are explicitly refused rather than defaulted.

The reason to use SQL is narrower and still true: **the handler writes no `self_serve`,
`template_key`, `template_name`, `template_blurb` or `preview_image` at all** — the row builder is
`{name, offer_id, link, slug, capacity, status, notes, updated_at}` and nothing else
(`admin.js:1422-1455`). A row created through the form is invisible to the picker forever until SQL
sets `self_serve`. (A create also defaults `capacity` to 50, `:1452` — wrong for a bespoke row.)

### 4. `get_offer_landing_pages` computes "is this mine" ONLY among `self_serve` rows

`golIds = golPickable.map(l => l.id)` (`admin.js:4866`), and `golMine` is only ever set from an
assignment in that id list (`:4888-4891`).

So an affiliate holding a **non-`self_serve`** lander gets `chosen_id: null` — no "Your page" chip,
nothing marked as theirs, and every house design offered as an enabled "Use this design". **Clicking
one is a real switch** that releases their page.

Not hypothetical — prod, 2026-08-02: **50 active assignments sit on `self_serve = false` landers** (66
on self-serve ones). Every one of those affiliates is looking at this screen.

If you make a page bespoke, `self_serve` must be **true**, or you have built the trap instead of the
lock.

### 5. The door hard-404s a click with **no** `s1` — an *unresolved* one still serves

`api/link/[slug].js:43-49` is `const spk = qparam(req.query,'s1','sub1'); if (!spk) return 404`.
**Absence** is the refusal. A **present but unregistered/junk** `s1` still 302s, unattributed, on
purpose — resolution is fail-open so a DB blip or a legacy code never drops a paid lead. Do not read
an unattributed conversion as "the gate let it through broken"; that is the designed behaviour, and it
is why the generator leaves `s1` **empty** rather than fabricating one (`sammy-acash.js:130-136`).

The door also 404s on: no slug (`:40-41`), lander missing or `offer_id` NULL (`:63`), a payout-locked
spark (`:110-113`), a revoked owner, `enforce_assignment` with an unassigned owner, no served offer,
and no destination for the geo. `landerProblem` exists to mirror those in advance.

### 6. Everything is on one domain

`www.tokrwd.co` serves every lander. **An ad-network penalty earned by one affiliate's supplied page
attaches to the DOMAIN.** That is why a supplied page is read for unverifiable claims before it is
hosted, and why the generator prints them on every run. See §3.

### 7. Two active landers on one offer = a coin flip on a money path

`by_offer[lp.offer_id] = link` with no ordering (`affiliate-links.js:250`). Three separate mechanisms
exist to prevent it — the admin same-geo clash 409 (`admin.js:1533-1554`), the picker's
claim-then-release sweep (`admin.js:5037-5068`), and `sweepDuplicateAutoLanders`
(`lander-autoassign.js:98-145`). Do not add a fourth path that bypasses all three.

### 8. `landing_page_affiliates.offer_id` is denormalised and STALE

182 of 261 active rows disagreed with their lander (measured 2026-08-01,
`lander-autoassign.js:40-46`); 26 carried a deleted offer UUID after an Apple Pay re-import
(`admin.js:189-197`). **Always resolve through the lander's own `offer_id`.** Filtering on the junction
column returns zero rows for an affiliate who demonstrably holds one — which is how a switch releases
nothing and leaves two active landers.

### 9. `/sasurl` has no slot, and the bespoke page is not offer-bound in tokrwd

The vanity path is one shared URL (§1 step 3). Separately: `acsm`, `as50` and `sasurl` appear in
`links-config.js` **only** in `PRELANDER_ALLOWED_ROOTS` (`:899`) — no `LANDER_URLS`, no
`OVERRIDE_LANDERS`, no `CARRD_ROUTES` entry. So `/r`'s OFFER MISMATCH warning cannot apply to the page,
the admin Test Lander picker will not list it, and `_links-config.test.mjs` does not pin its door.
**The only thing tying the page to the offer is `DOOR_SLUG` in the generator matching
`landing_pages.slug`** — check it by hand
(`grep -o 'sprktrax.org/api/link/[a-z-]*' ACSM/US/index.html`).

### 10. The affiliate's assigned link gets NO prelander — inherited, not a bug here

`/pre` is applied at exactly one live site: the `/r` choke point (`wrapPrelander()`,
`links-config.js:938`, called from `api/r.js:261`; the second call at `links-config.js:1583` is the
admin panel's trace, not traffic). The link SPRK hands the affiliate is Mode B —
`https://www.tokrwd.co/AS50/US1`, a **direct static URL that never touches `/r`** — so the
in-app-browser escape never fires on the real affiliate path. The roots are registered in
`PRELANDER_ALLOWED_ROOTS`/`ALLOWED_ROOTS` because an `lp=`/`to=`-routed hit does go through `/r`, and
because the test pins the two lists together. **This is true of every SPRK-assigned lander** — do not
"fix" it for one bespoke page.

### 11. NO APOSTROPHES IN THE `ALLOWED_ROOTS` BLOCK IN `js/breakout.js`

`_links-config.test.mjs` reads that list by scanning the raw file for **single-quoted literals** —
it does not parse the JS. So a contraction in a nearby comment (`notkerman's two pages`) opens a
string at the `'` and the parser swallows everything up to the next quote, emitting comment
fragments as roots and dropping the real ones. The failure is loud but the message is baffling:
the `got:` list comes back full of `",\n    "` entries and prose.

Measured 2026-08-09, adding `shkm`/`sk50`/`shkrurl`. The pre-existing comments in that block have
no apostrophes, which is why nobody had hit it. **Reword the comment; never weaken the test** —
and note that the sibling list in `links-config.js` is parsed the same way. A warning comment now
sits in `breakout.js` above the bespoke roots.

### 12. ORDER OF OPERATIONS: DEPLOY THE PAGES **BEFORE** THE ROWS

The §1 checklist reads generator → SQL → verify, and taking that as a running order is what produced
a live window of paid 404s on 2026-08-09.

**The two halves go live independently, and the DB half is the one that publishes.** The moment the
`landing_pages` + `landing_page_affiliates` rows exist, `get_offer_landing_pages` shows the design in
the affiliate's picker and `resolveAffiliateOfferLinks` starts handing out
`https://www.tokrwd.co/<FAMILY>/<GEO>1`. If tokrwd has not deployed, **every one of those URLs is a
404** — and nothing anywhere reports it:

- the DOOR still answers perfectly (302 with `s1`, 404 without) — it resolves from `landing_pages`
  and never touches the page, so door checks pass and prove nothing about the lander;
- the picker card renders, the launcher issues links, the affiliate sees a normal screen;
- the only symptom is clicks with no conversions, which reads like a bad creative.

Measured that day: all 7 doors 302'd correctly while all 8 lander URLs returned 404.

**Correct order:** push tokrwd and confirm `curl -sI <link>` is 200 on every numbered link the SQL
names, THEN run the SQL. If the rows are already in (someone ran the SQL first), the fix is to
deploy immediately — the exposure lasts exactly as long as the gap.

⚠️ **Pushing the branch is not deploying.** Vercel builds `main`. `git push -u origin claude/<x>`
leaves the pages 404 — the deploy is `git push origin HEAD:main` (a fast-forward, once the branch is
0 behind). Same for the preview PNGs in SPRKNetworkAds, which serve `/offers`: a non-NULL
`preview_image` pointing at an undeployed file renders a BROKEN IMAGE, not the "Preview coming soon"
placeholder — that fallback only fires when the column is NULL.

**Working in the SPRK repo without disturbing WIP:** that checkout is routinely mid-feature on
another branch with uncommitted files, and `git checkout -b … origin/main` can refuse or drag them
along. Use a throwaway worktree instead — it leaves the working tree untouched:

```bash
git worktree add -b claude/<name> /tmp/wt origin/main
cp …/*.png /tmp/wt/images/landers/ && cd /tmp/wt && git add images/landers/*.png
git commit -m … && git push origin HEAD:main
cd - && git worktree remove /tmp/wt --force && git worktree prune
```

---

## 7. HOW TO QUERY THE DB FROM THIS MAC

No psql, no Supabase MCP on this machine — the migration-runner skill's MCP step cannot be followed as
written. Use the Management API with the CLI's keychain token:

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -w)
curl -s -X POST "https://api.supabase.com/v1/projects/ecyawhhimmuzryxjnjng/database/query" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"select slug, capacity, self_serve, template_key, geo, preview_image, link from landing_pages where offer_id = '"'"'<offer-id>'"'"' order by template_key;"}'
```

Useful one-liners (same wrapper):

```sql
-- every design on an offer, with its holder count and who it is hidden from
select lp.slug, lp.capacity, lp.self_serve, lp.template_key,
       count(a.id) filter (where a.status='active') as held,
       count(a.id) filter (where a.status='hidden') as hidden_from
from landing_pages lp left join landing_page_affiliates a on a.landing_page_id = lp.id
where lp.offer_id = '<offer-id>' group by 1,2,3,4 order by 4;

-- is the custom-domain switch armed?
select count(*) total, count(*) filter (where status='active') active from lp_domains;

-- who is on non-self_serve landers (Trap 4)
select lp.self_serve, count(*) from landing_page_affiliates a
join landing_pages lp on lp.id = a.landing_page_id
where a.status='active' group by 1;

-- an affiliate's ids, the right way (Trap 1)
select u.id as auth_id, p.id as profile_id, p.user_id as profile_user_id
from auth.users u left join user_profiles p on lower(p.email) = lower(u.email)
where lower(u.email) = '<email>';
```

**Writes are Migi's.** Standing rule, root `CLAUDE.md`: *"No production actions without explicit
approval. Ask first, every time."* Hand over the SQL; do not run it.

**Tests to run after touching any of this:**

```bash
# SPRKNetworkAds
node api/_lib/_lander-picker.test.mjs        # claimSlot / landerProblem / pickableLanders (49 at f97b2d5)
node api/_lib/_lander-autoassign.test.mjs    # the double-claim + dead-link screens
# tokrwd
node api/_lib/_tracking-audit.test.mjs       # no cloaking, no naked network links
node api/_lib/_links-config.test.mjs         # lander↔offer pairing, prelander root lists in step
```

## 8. HOW TO SHOOT A PICKER PREVIEW

800×450 to match the other cards. Headless Chrome at 2× scale:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
  --virtual-time-budget=6000 --window-size=460,259 \
  --screenshot=out.png 'https://www.tokrwd.co/AS50/US1'
sips -z 450 800 out.png
```

⚠️ **If the page has a scroll reveal that sets `opacity:0`, screenshot a LOCAL copy with the
`IntersectionObserver` block deleted** — otherwise you capture it mid-transition and the card is a
half-faded page. Sammy's source does exactly this (`sammy-acash-source.html:613-624`).

The file goes in **SPRKNetworkAds** at `images/landers/<slug>.png` (that repo serves `/offers`), and
the column must be set to match:

```sql
update landing_pages
   set preview_image = '/images/landers/applecash-us-sammy.png', updated_at = now()
 where slug = 'applecash-us-sammy';
```

---

## Known state of the Sammy case, 2026-08-02

- ✅ tokrwd: `ACSM/US`, `AS50/US1..US100`, `/sasurl` — deployed, one md5 (`e33e85b7…`), door
  `applecash-us-sammy`. `_lp-generator/` is in `.vercelignore`, so the generator and his source file
  are never served.
- ✅ `landing_pages`: capacity 1, `self_serve` true, `template_key 'z'`, geo `us`, link
  `https://www.tokrwd.co/AS50/US1`.
- ✅ `landing_page_affiliates`: slot 1, `status='active'`, `chosen_by='admin'`, `slot_cycle='2026-08'`,
  junction `offer_id` matching the lander's.
- ✅ `preview_image = '/images/landers/applecash-us-sammy.png'` — **set in prod, and the PNG is
  committed to SPRKNetworkAds**. An earlier session note said this column was still NULL; re-checked
  2026-08-02, it is not.
- ✅ Both tokrwd guard tests pass; all four Apple Cash US designs present (`applecash-us` /`-b`/`-c` at
  capacity 100, template `a`/`b`/`c`; Sammy's at capacity 1, template `z`).
- ℹ️ **He IS already hidden from one house design.** Measured in prod, not assumed: he holds a
  `status='hidden'` row on **`applecash-us-c`** (written 2026-08-03 00:37 UTC, ten seconds after
  `f97b2d5`), so his picker shows **three** cards — `applecash-us` (a), `applecash-us-b` (b) and his
  own, which is the one marked "Your page". Add hide rows for `applecash-us` / `-b` too if Migi wants
  the rest out of his view. He also carries a `status='archived'` row on `applecash-us-b` (slot 1,
  `chosen_by='affiliate'`, 2026-08-02 02:36 — he had picked design B himself before the bespoke page
  existed). Nothing in the code writes that status; it is inert, but it holds the
  `(landing_page_id, user_id)` pair, so the §2 hide upsert on `-b` would resurrect it as `'hidden'`.
- ℹ️ `AS50/US2..US100` are deployed but unreachable through the app while capacity is 1. Deliberate
  headroom if the page is ever widened; harmless as-is — capacity ≤ real clones is the safe direction,
  never the reverse.

---

## Close with the ELI5 recap (Migi's standing rule)

One short plain-English paragraph: whose page it is, where it lives, what makes it theirs alone, and
the one thing that would take it away from them.
