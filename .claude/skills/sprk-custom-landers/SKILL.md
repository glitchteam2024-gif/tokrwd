---
name: sprk-custom-landers
description: >-
  How to give ONE affiliate their own landing page — host the HTML file they sent us, wire it onto
  our door, and lock it so nobody else can take it. Use whenever Migi says anything like "give
  <name> their own landing page", "he sent me his own HTML", "he wants to run his own ads to his
  own page", "make it only his", "hide this design from everyone else", "reserve this page for
  him", "he wants a custom domain", "can affiliates use their own domain", or names a bespoke
  lander folder (ACSM, AS50, /sasurl). Covers the operator-supplied-lander generator pattern, the
  three things a supplied HTML file can never ship with, the `landing_pages` +
  `landing_page_affiliates` SQL, `self_serve` + `capacity=1` as the single-tenant lock,
  per-affiliate design hiding, the whole picker / auto-assign / slot-rotation machinery it plugs into, and —
  honestly — what does and does not exist today for CUSTOM DOMAINS (`lp_domains`).
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
look wrong afterwards).

⚠️ **Verify every SPRK claim against `origin/main`, never the local working tree** — that checkout
routinely sits on a stale branch. Everything below was checked against `origin/main` at **`b47731b`**
and against **prod SQL**, on 2026-08-02.

### The worked case this generalises from

Sammy — `ssammyofficial18@gmail.com`, AffID 12, auth id `a42c2031-2aea-4ca8-8f2f-11d6f32a00d4` —
sent Migi a finished HTML page and wanted to run his own ads to it instead of one of our three
house designs, on **Rewards US - Cash Style - Apple Cash $750** (`510a0fa1-482a-40a4-b464-049e1653671e`).

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
`_lp-generator/sammy-acash.js` and change the five constants at the top
(`CANON_DIR`, `FAMILY`, `GEO`, `VANITY`, `DOOR_SLUG` — `sammy-acash.js:50-75`).

```bash
cd ~/Documents/GitHub/tokrwd
node _lp-generator/sammy-acash.js --clones 100
```

Why a generator and never a hand-edit: their design survives intact, re-running is deterministic
(one buffer → one md5 across the family — the `RS50/RS1` drift lesson in `tokrwd-landers`), the
tree is a pure function of `--clones` because it also **prunes** (`sammy-acash.js:221-228`), and
every patch is an assertion, so an edit to the source that breaks a substitution **fails the build**
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
fan-out does not apply to it — a flag on `/sasurl` is a flag on the only copy. Fine for one
affiliate on his own link; **never hand the same vanity path to a second person.**

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

- **`slug`** — its own, never a house design's. Reusing `applecash-us` works on day one (that door
  is already live) but blends his clicks with everyone on design A with no way to separate them. A
  `landing_pages` row has to exist either way for the page to appear in his picker, so the dedicated
  slug costs nothing (`sammy-acash.js:55-73`).
- **`link`** — must name a **numbered** clone. `landerProblem` probes with two different slots and
  refuses a link where `lpSlotLink(link,1) === lpSlotLink(link,2)` (`lander-picker.js:168-174`).
  A `/sasurl`-style link has no digit run, so `lpSlotLink` returns it unchanged and the row is
  refused everywhere.
- **`capacity`** — **THE CONTRACT WITH THE CLONE SLICE.** `lpSlotLink` swaps the trailing digit run
  blindly with no existence check (`affiliate-links.js:193-199`), so a capacity larger than the
  clones actually deployed hands out live, paid 404s. Here it is also the lock — see §2.
- **`geo`** — lowercase, matching the house rows. It is the key the same-geo clash guard
  (`admin.js:1533-1554`) and the picker's release sweep both use.
- **`template_key`** — `'z'` sorts it after the house `a`/`b`/`c` (`pickableLanders` sorts on
  `template_key` then `name`, `lander-picker.js:232-233`).
- **`preview_image`** — the picker card. NULL renders "Preview coming soon"
  (`offers/index.html:1746-1748`). Step 6.

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
UNIQUE `(landing_page_id, user_id)` (verified in prod). It is NOT correct on `landing_pages`
(Trap 2).

**Alternative, once the row exists:** the admin action `assign_landing_page_affiliate`
(`admin.js:1525-1577`) does the same thing through the API and adds three things raw SQL does not —
the same-geo clash 409, the capacity check, and lowest-free-slot allocation. It writes
`chosen_by` NULL rather than `'admin'`. Either is fine; SQL is what was used for Sammy because the
row was being created by SQL anyway.

### Step 6 — the picker preview screenshot

See §8. The PNG lives in **SPRKNetworkAds** (`images/landers/<slug>.png`) — that repo serves
`/offers` — and the `preview_image` column must be set to match, or the card reads
"Preview coming soon" forever.

### Step 7 — make it theirs only

`self_serve = true` **and** `capacity = 1`. See §2 — they do different jobs and neither alone is the
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

Two flags, and they do different jobs. Neither alone is the lock.

| | What it does | What it fails to do alone |
|---|---|---|
| `self_serve = true` | makes the row **visible at all** — `pickableLanders` filters `self_serve === true`, strictly (`lander-picker.js:230`) | it also exposes the row to **every** affiliate on that offer and lets `lander-autoassign` hand it out (`lander-autoassign.js:177`) |
| `capacity = 1` | makes it **single-tenant** — with the seat held, `claimSlot` returns `{slot:null, full:true}` for everyone else (`lander-picker.js:101, :109`) | on a `self_serve = false` row it locks nothing useful, because the row is invisible to the picker and its holder falls into Trap 4 |

`capacity=1` is a **hard** lock, refused identically by both halves of the feature:
`choose_landing_page` answers 409 off `claimAssignment`'s thrown `.full`
(`admin.js:5009`, `lander-assign.js:106-114`), and `autoAssignLanders` skips to the offer's next
design (`lander-autoassign.js:284-291`). The picker disables the card client-side too
(`offers/index.html:1743`, `:1749-1750`, `:1774-1777`), and the preview modal mirrors that guard on
purpose (`:1833-1844`) — otherwise it would offer "Use this design" on a design the grid disabled
and the affiliate would only learn it was full after watching the 5s build animation and getting a
409.

**`self_serve` is a GLOBAL boolean. There is no per-affiliate visibility column.** `capacity=1` +
a held seat is the only thing keeping the page his. **If his assignment is ever released, the page
is instantly claimable by the next affiliate who attaches a creative to that offer.**

### The picker grid stretches with few cards (fixed `f97b2d5`)

`offers/index.html` `.lpk-grid` used `repeat(auto-fit, minmax(min(260px,100%), 1fr))`. With **one**
card `auto-fit` gives that card the whole 1040px panel, blowing its 16:9 screenshot up to ~990x557 —
it reads as a broken zoom, and it is what you get the moment anything narrows the list. The column is
now capped at `340px` with `justify-content:center`, so a card is the same size whether an offer
carries one design or four. Do not put `1fr` back.

### Hiding a design from ONE affiliate (shipped `f97b2d5`)

`admin.js` `get_offer_landing_pages`, in the same read that counts seats.

**A `landing_page_affiliates` row with `status = 'hidden'` means "do not offer THIS design to THIS
affiliate."** Same junction table as the assignment, so it needs no new schema and no extra round
trip — that read now fetches every status and partitions in JS instead of filtering `'active'` in
SQL, so one query answers seats + mine + hidden.

```sql
INSERT INTO landing_page_affiliates (landing_page_id, user_id, offer_id, status)
SELECT lp.id, '<AUTH_USER_ID>'::uuid, lp.offer_id, 'hidden'
  FROM landing_pages lp WHERE lp.slug = '<slug-to-hide>'
ON CONFLICT (landing_page_id, user_id) DO UPDATE SET status = 'hidden';
```

Chosen over a flag on `landing_pages` because visibility is per-PAIR, not per-page: `self_serve` is
global, so switching it off to hide a design from one affiliate pulls it from **everyone** and stops
`lander-autoassign` offering it.

Two properties that make it safe:
- Only `'active'` rows ever count as an assignment (here and in `resolveAffiliateOfferLinks`), so a
  `'hidden'` row can never be mistaken for one — it cannot hand anybody a lander or a clone number.
- **A design the affiliate is currently RUNNING is never hidden**, whatever the hide rows say. That
  would render a picker with no "Your page" card and a gold "start a build" CTA — the same display
  bug this handler already 503s to avoid.

### ⚠️ `reservedView` was REMOVED — do not reintroduce it

`b47731b` briefly narrowed a bespoke-page holder's picker to *only* their own page. `f97b2d5`
reverted it. **Its stated rationale was wrong**, and the wrong version is still in `b47731b`'s
message, so check here before trusting it: it claimed a released `capacity=1` row *"reads as Full
even to its own former holder."* It does not — verified against the real function:

```
claimSlot({capacity:1, taken:[]})                          -> {slot:1, full:false}
claimSlot({capacity:1, taken:[], cooling:[1], exclude:1})  -> {slot:1, full:false, respectedCooldown:false}
```

A released capacity-1 slot comes straight back; the only cost is skipping the cooldown preference.

**The real exposure is different, and it is still live:** a vacated capacity-1 seat is claimable by
**anyone** on that offer — picker or auto-assigner — because the page has to be `self_serve = true`
for its holder to see it at all. If a bespoke holder switches away and someone else takes the seat
first, recovery is an admin reassign, after their ads have moved. There is no guard for this today.
Migi's call, 2026-08-02: affiliates keep the ability to test other designs, so the race is accepted.
Watch for it if a bespoke holder ever reports "my page changed".

Design notes worth not re-deriving:Design notes worth not re-deriving:

- Keyed off `capacity === 1`, not a new column, on purpose — it is the same fact `claimSlot` already
  enforces, so the lock and the visibility rule cannot drift apart. House slices are 100.
- **Viewer-scoped** (`mineId` is the caller's own assignment row), so one affiliate being reserved
  never shrinks the picker for anyone else.
- An unknown `mineId` returns the list unchanged (`lander-picker.js:224`) — never an empty picker.
- Seat counts are computed from the **un-narrowed** list (`golIds`, `admin.js:4866`), so the numbers
  stay right.
- Test: `node api/_lib/_lander-picker.test.mjs`.

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
must(h, DOOR, 1); must(h, 'id="cta-hero"', 1); must(h, 'offerUrl()', 2)
never: 'example.com' · 'href="#"' · 'CTA_REDIRECT_URL'
never (cloaking): 'x-safari' · 'intent://' · '__SUBID_OK' · 'document.write'
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

They were **NOT edited** — it is the operator's copy and Migi's call. But the generator prints all
ten on every run (`sammy-acash.js:231-236`), mirroring how `_tracking-audit.test.mjs` prints its
EXCEPTIONS, **so a deliberate carve-out cannot quietly become a permanent one nobody remembers
agreeing to.** Keep that pattern. To change a claim, edit the source HTML and re-run; never patch it
in the generator.

---

## 4. THE PICKER MODEL

Everything a bespoke page plugs into. Line numbers are SPRKNetworkAds `origin/main` @ `b47731b`.

### Which rows appear in the picker — the full filter chain

`get_offer_landing_pages` (`admin.js:4837-4925`):

1. **Auth** — Bearer token → `anon.auth.getUser` (`:4838-4842`).
2. **`landerSelfServeGate`** (`admin.js:138-185`) — **fails CLOSED**, unlike the click door:
   role first, profile resolved **by email** (`:155-157`) then `isSpkLockedAffiliate` (`:165-167`) —
   scalers and admins 403, an unreadable profile 503, never a pass; offer must exist and be
   `status='active'` else 404 (`:172`); `offer_assignments` `'revoked'` → 403, an admin kill
   outranks everything (`:180`); any other non-active → 403 (`:182`); `cap_mode='allocated'` with no
   active assignment → **404, not 403** — a private offer must not be confirmed to someone who
   cannot see it (`:183`).
3. **Rows** — `landing_pages` where `offer_id = <offer>` and `status <> 'archived'`, with
   `select('*')` so a pre-migration DB returns rows rather than erroring (`:4850-4854`).
4. **`pickableLanders(rows, offersById)`** (`lander-picker.js:228-234`) — `self_serve === true`
   strict (so `undefined` on a pre-migration DB fails closed) and `status !== 'archived'` (`:230`),
   then `!landerProblem(...)` (`:231`), then sorted by `template_key` then `name` (`:232-233`).
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

6. **Per-affiliate hide** (`admin.js`, `get_offer_landing_pages`) — drops any row with a
   `status='hidden'` junction row for this viewer, except the one they are currently running.

**`landing_pages.link` is deliberately NOT returned** (`admin.js:4894-4897`) — an affiliate who has
not chosen a design has no reason to hold the raw tokrwd clone URL. The card renders `preview_image`.

### How each label is decided

Server (`admin.js:4898-4924`):

```
seats_left = max(0, capacity - active_assignments_on_this_lander)
full       = capacity > 0 ? used >= capacity : true
chosen     = golMine && golMine.landing_page_id === l.id
chosen_id  = golMine ? golMine.landing_page_id : null
slot       = golMine.slot ?? null
cycle      = cycleKey(new Date())
```

Client (`offers/index.html:1729-1781`) — note it branches on `chosen_id`, not the per-row `chosen`:

| Surface | Rule | Line |
|---|---|---|
| card gets `is-chosen` | `String(l.id) === String(chosenId)` | `:1742` |
| `full` for display | `!!l.full && !isChosen` — your own page is never "full" to you | `:1743` |
| **"At capacity"** chip | `full` | `:1750` |
| **"N spots left"** chip | `!full && seats_left <= 10` | `:1751-1752` |
| **"Your page"** chip | `isChosen` | `:1766` |
| button **"Currently running"** (disabled) | `isChosen` | `:1774-1777` |
| button **"Full"** (disabled) | `full` | `:1777` |
| button **"Use this design"** | otherwise | `:1777` |

The picker CTA on the offer page is **never gold any more** (`renderLanderCta`,
`offers/index.html:1440-1461`): gold means "the one thing that unblocks this offer", and since
auto-assign shipped, picking unblocks nothing. Its labels are "See landing page designs" /
"Change landing page". The **modal title** is still "Start your landing page build"
(`:1735`) — do not confuse the two.

Non-affiliates never see any of it: `lpGatesViewer()` (`:1256`) is
`roleResolved ? (userType === 'affiliate' && !isScalerUser()) : true`, and `loadOfferLanders`
(`:1410`) returns early for them. **That is a courtesy, not enforcement** — `landerSelfServeGate` is
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
  anything free (`:114-120`). `exclude` outranks nothing — a cooling number is a real footprint
  problem, being handed your own previous number is a wasted rotation.
- **`full:true` means the caller must 409, never overbook** (`:101`, `:109`).
  `respectedCooldown:false` is NOT an error (a blocked affiliate is worse than a reused clone) but it
  is logged (`lander-assign.js:115-119`) — it means the slice is too small for the roster.
- **Capacity has NO default anywhere on this path.** `claimAssignment` used to fall back to 50, which
  disagreed with the picker's own read; the comment at `lander-assign.js:93-98` is the postmortem.
- **Race safety**: `lpa_lp_slot_unique (landing_page_id, slot) WHERE status='active' AND slot IS NOT
  NULL` (verified in prod) turns two affiliates picking the same number into a `23505`, retried
  against a fresh read — 4 attempts, then a `.contended` error → 503
  (`lander-assign.js:100-155`).
- **Rotation** (`rotate-lander-slots.js`): scoped to `self_serve` landers only (`:56-57`); a row with
  a NULL `slot_cycle` is **adopted** (stamped), never rotated, so flipping `self_serve` on does not
  re-number every hand-placed affiliate as a side effect (`:97-108`); `chosen_by` is preserved
  (`:121`); a `.full` failure leaves the affiliate on the number they have (`:134-141`). **Live ads
  are never touched** — the door resolves the owner from `?s1=<SPK>`, never from the path.
  ➜ **A capacity-1 page never rotates**: taken=[1], capacity 1 → `full` → `skipped_full`, holder
  keeps slot 1 forever. That is correct, and it is why `/AS50/US1` is stable.

### Switching designs — what actually happens, and what can be stranded

`choose_landing_page` (`admin.js:4929-5058`):

1. gate (`:4939`), load the row (`:4942`), **the row must belong to the offer named** (`:4953` —
   without this a self_serve row on a cheap open offer could be claimed while passing the offer_id of
   one the affiliate can access), `self_serve === true` (`:4958`), `landerProblem` → 409 (`:4966`).
2. `heldLandersFor(user, offer, geo)` (`admin.js:204-229`) — everything they hold for this
   **(offer, geo)**. A different-geo lander for the same offer is legitimate and left alone.
   **Throws → 503, fail closed**: not knowing what they hold and releasing nothing leaves two active
   landers and an ambiguous served link (`:4976-4984`).
3. already on it → idempotent `unchanged:true`, no release/re-claim (`:4986-4997`). A double-click
   must not burn a clone number and change a live URL for nothing.
4. **CLAIM BEFORE RELEASE** (`:4999-5013`) — a full slice leaves them on the design they already had
   rather than on nothing.
5. **Reconciliation sweep**: re-read (not the pre-claim list) and release every other row for this
   (offer, geo) (`:5015-5046`). Re-reading is what makes two concurrent tab-switches converge, and it
   makes the endpoint self-healing for the stale-junction rows. A release failure after a successful
   claim is logged loudly but does **not** fail the request — the affiliate IS on the new design and
   saying otherwise would be a lie. Residual race stated honestly at `:5026-5028`.
6. the returned link comes from `resolveAffiliateOfferLinks`, never rebuilt locally (`:5050`).

**What an affiliate can strand: switching off a `capacity=1` page.** `releaseAssignment` DELETEs the
row (`lander-assign.js:70-77` — DELETE not a status flip, because `'active'` is the only status value
in use), and the vacated seat is then claimable by anyone on that offer, picker or auto-assigner.
**There is no guard for this today** — `reservedView` was tried and reverted (see above). A bespoke
holder who switches away can lose their page to whoever claims the seat first.

### Every `pickableLanders` call site

Only two, and they are the two halves of one feature:

| Call site | What changes if you touch `pickableLanders` |
|---|---|
| `admin.js:4862` — `get_offer_landing_pages` | what an affiliate can SEE and choose |
| `lander-autoassign.js:194` — `autoAssignLanders` | what gets claimed for them AUTOMATICALLY, at page-load speed, with no click |

`landerProblem` additionally runs alone at `admin.js:4966` (`choose_landing_page`) and
`admin.js:5096` (`get_lander_preview`).

**Widening `pickableLanders` widens the auto-assigner too.** That is the whole reason `self_serve` is
opt-in and never derived: deriving "offerable" from "a row exists" would have opened every live row on
deploy, including the ones with a dead door.

### `autoAssignLanders` — the automatic path (2026-08-01)

`lander-autoassign.js`. Runs inside `get_my_landing_pages` (`admin.js:4683`), which `/offers`,
`/sparkbank` **and** the launcher all load.

- **Demand signal** = an offer with a live (non-deleted) creative attached (`demandOfferIds`,
  `:327`). Not "has access" (an unsafe sweep) and not "opened the page" (burns a finite number on
  browsing).
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
- `chosen_by='auto'` (`:278`), preserved by rotation. `sweepDuplicateAutoLanders` converges a race,
  and **only `chosen_by='auto'` rows are releasable** (`:124-129`) — a sweep that could delete a
  picked design would make the picker unreliable.
- **Fail-soft**: it never throws (a throw would blank the Creative Hub) and fails **closed** on any
  read error — claiming nothing (`:308-312`).

### `resolveAffiliateOfferLinks` — the ONE resolver, and its two modes

`affiliate-links.js:206-254`. Used by `get_my_landing_pages`, `choose_landing_page` (`:4991`,
`:5050`) and both launch APIs as the **server-side source of truth**, so the link the launcher shows
is the link a launch tags.

```js
// affiliate-links.js:247-249
const link = (lp.slug && dom && offerHasDest.has(lp.offer_id))
  ? ('https://' + dom + '/api/link/' + lp.slug)   // MODE A — the DOOR, one shared URL for everyone
  : lpSlotLink(lp.link, r.slot);                  // MODE B — the per-affiliate numbered clone
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
- It keys off the **lander's own `offer_id`** (`:221`, `:240`), never the junction's denormalised
  copy. Trap 9.
- Archived landers are dropped (`:216`).
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

**One `insert into lp_domains (domain) values ('x.com')` flips EVERY assigned affiliate on EVERY
offer from their numbered lander to the door.**

The domain is the only one of Mode A's three conditions that is currently false. Add one global
active row and every slugged self-serve lander collapses onto `https://x.com/api/link/<slug>` —
**one shared URL per lander, identical for all 100 affiliates on it.** The per-affiliate `slot`
becomes decorative, **the tokrwd lander is bypassed entirely** (ad → door → network; the page is
never loaded), and the anti-flag fan-out the whole numbered-clone model exists for stops existing.
Nothing warns about it. Independently flagged at `docs/lander-auto-assign-plan.md:76-90`.

**Per-affiliate uniqueness works today BECAUSE the table is empty.** That is the single most
important fact in this section.

Scoping the row to one `offer_id` narrows the blast radius to that offer — it does not remove it.

⚠️ **Drift risk before anyone changes this:** that selection rule exists in **three near-identical
copies and they are not shared code** — `affiliate-links.js:227-236` (the authoritative one),
`admin.js:1350-1362` (`served_link` on the admin Landing Pages list) and `admin.js:4041-4057`
(`run_link`). Collapsing them into one exported helper is the honest prerequisite for any change here.

### The rest of the plumbing

| Piece | State |
|---|---|
| Admin API `get_lp_domains` / `save_lp_domain` / `set_lp_domain_status` | **exists** — `admin.js:1591 / 1611 / 1653`. `save_lp_domain` strips scheme/path/port, validates the hostname shape, and revives an archived duplicate (`:1635-1640`) rather than dead-ending |
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
3. **Mode A serves the DOOR, not the lander.** `api/link/[slug].js:54-63` resolves purely by slug and
   never reads the `Host` header, so a per-affiliate domain in `lp_domains` buys cosmetics and
   reputation spread — **not** per-affiliate routing. An affiliate who wants their own domain serving
   their own *page* is a different shape: the domain has to be attached to the **tokrwd** Vercel
   project, not the SPRK one.
4. **Three host lists and one header block, in two repos, all by hand.** `TRACKING_HOSTS`
   (`middleware.js:38-44`), `SPRK_OWNED_DOMAINS` (`link-host.js:42-47`), and — easy to miss —
   **tokrwd's frame headers**. `vercel.json`'s catch-all `/(.*)` block sends
   `X-Frame-Options: SAMEORIGIN` (`:219`) **and**
   `Content-Security-Policy: frame-ancestors 'self' https://www.sprknetwork.ad https://sprknetwork.ad`
   (`:236`). `frame-ancestors` overrides XFO in modern browsers and is the **only** reason the
   picker's preview iframe (`openLanderPreview`, `offers/index.html:1798`, framing tokrwd from
   `sprknetwork.ad`) renders at all. A new lander domain without that exact CSP shows an empty black
   box in the picker with no error — the same failure mode the admin panel's own preview hits on
   `appflowconnect.com` (see `tokrwd-landers`). DNS side, for a domain on the tokrwd project: apex
   `A 76.76.21.21`, subdomain `CNAME cname.vercel-dns.com`.
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
same `sprktrax.org/api/link/<slug>` door, (b) it carries the frame headers above if the picker
preview is expected to render, and (c) somebody accepts that the page is then outside this repo, so
the generator's assertions, `_tracking-audit.test.mjs` and the compliance read in §3 no longer cover
it. That last point is the reason it has not been done. It is Migi's call, not a default.

---

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
specification`. Use **`WHERE NOT EXISTS`**. `landing_page_affiliates` is the opposite — a plain
UNIQUE `(landing_page_id, user_id)` — so `ON CONFLICT` is correct there, and `claimAssignment` upserts
on exactly that target (`lander-assign.js:131-132`).

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
assignment in that id list (`:4882-4885`).

So an affiliate holding a **non-`self_serve`** lander gets `chosen_id: null` — no "Your page" chip,
nothing marked as theirs, and every house design offered as an enabled "Use this design". **Clicking
one is a real switch** that releases their page.

Not hypothetical — prod, 2026-08-02: **50 active assignments sit on `self_serve = false` landers**
(66 on self-serve ones). Every one of those affiliates is looking at this screen.

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
claim-then-release sweep (`admin.js:5015-5046`), and `sweepDuplicateAutoLanders`
(`lander-autoassign.js:98-145`). Do not add a fourth path that bypasses all three.

### 8. `landing_page_affiliates.offer_id` is denormalised and STALE

182 of 261 active rows disagreed with their lander (measured 2026-08-01,
`lander-autoassign.js:40-46`); 26 carried a deleted offer UUID after an Apple Pay re-import
(`admin.js:189-197`). **Always resolve through the lander's own `offer_id`.** Filtering on the
junction column returns zero rows for an affiliate who demonstrably holds one — which is how a switch
releases nothing and leaves two active landers.

### 9. `/sasurl` has no slot, and the bespoke page is not offer-bound in tokrwd

The vanity path is one shared URL (§1 step 3). Separately: `acsm`, `as50` and `sasurl` appear in
`links-config.js` **only** in `PRELANDER_ALLOWED_ROOTS` (`:899`) — no `LANDER_URLS`, no
`OVERRIDE_LANDERS`, no `CARRD_ROUTES` entry. So `/r`'s OFFER MISMATCH warning cannot apply to the
page, the admin Test Lander picker will not list it, and `_links-config.test.mjs` does not pin its
door. **The only thing tying the page to the offer is `DOOR_SLUG` in the generator matching
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
-- every design on an offer, with its holder count
select lp.slug, lp.capacity, lp.self_serve, lp.template_key,
       count(a.id) filter (where a.status='active') as held
from landing_pages lp left join landing_page_affiliates a on a.landing_page_id = lp.id
where lp.offer_id = '<offer-id>' group by 1,2,3,4 order by 4;

-- is the custom-domain switch armed?
select count(*) total, count(*) filter (where status='active') active from lp_domains;

-- who is on non-self_serve landers (Trap 4)
select lp.self_serve, count(*) from landing_page_affiliates a
join landing_pages lp on lp.id = a.landing_page_id
where a.status='active' group by 1;
```

**Writes are Migi's.** Standing rule, root `CLAUDE.md`: *"No production actions without explicit
approval. Ask first, every time."* Hand over the SQL; do not run it.

**Tests to run after touching any of this:**

```bash
# SPRKNetworkAds
node api/_lib/_lander-picker.test.mjs        # claimSlot / landerProblem / pickableLanders
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
- ✅ `landing_page_affiliates`: slot 1, `chosen_by='admin'`, `slot_cycle='2026-08'`, junction
  `offer_id` matching the lander's.
- ✅ `preview_image = '/images/landers/applecash-us-sammy.png'` — **set in prod, and the PNG is
  committed to SPRKNetworkAds** (`b47731b`). An earlier note in this file said the column was still
  NULL; re-checked 2026-08-02, it is not.
- ✅ Both tokrwd guard tests pass; all four Apple Cash US designs present (`applecash-us` /`-b`/`-c`
  at capacity 100, template `a`/`b`/`c`).
- ℹ️ `AS50/US2..US100` are deployed but unreachable through the app while capacity is 1. Deliberate
  headroom if the page is ever widened; harmless as-is — capacity ≤ real clones is the safe
  direction, never the reverse.

---

## Close with the ELI5 recap (Migi's standing rule)

One short plain-English paragraph: whose page it is, where it lives, what makes it theirs alone, and
the one thing that would take it away from them.
