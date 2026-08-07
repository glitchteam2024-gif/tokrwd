---
name: sprk-lander-lead-capture
description: >-
  What changes when an affiliate's supplied landing page COLLECTS DATA — an email box, a survey, a
  quiz, a form of any kind. Use whenever Migi says anything like "her page collects emails", "the
  lander has a form", "it's a survey funnel", "there's a quiz before the offer", "push it to our
  project", "self-host that", "move the database over", "where do the leads go", "who can read
  those emails", "the emails aren't saving", "the leads are blank", "she's writing to her own
  Supabase", or names `survey_responses`. Covers the outbound-link grep that has to run FIRST, how
  to move a supplied page off a third-party database onto ours (`ecyawhhimmuzryxjnjng`), the
  write-only RLS shape that actually works (column grants, NOT a missing SELECT policy — the
  missing-policy version silently eats every lead), the client-minted-id race, and why a CDN import
  must never sit on the money path.
  For hosting/wiring/locking the page itself — the generator pattern, `landing_pages` +
  `landing_page_affiliates`, `self_serve` + `capacity=1`, the picker, custom domains — see the
  sibling skill `sprk-custom-landers`. This one does NOT restate any of that.
  LIVING DOCUMENT: when a new lead-capture lander ships, or the RLS/grants on `survey_responses`
  change, write it in here so the next session doesn't re-derive it.
---

# When the supplied page COLLECTS DATA

`sprk-custom-landers` owns *"give this affiliate their own page."* This skill owns the extra work
that starts the moment that page has an input box.

| Skill | Owns |
|---|---|
| **`sprk-custom-landers`** | the generator pattern, the door slug, `landing_pages` / `landing_page_affiliates`, `self_serve` + `capacity=1`, the picker, `/sasurl`-style vanity paths, custom domains |
| **this one** | the outbound-link grep, moving the write onto OUR Supabase, the RLS + grant shape, the insert/update race, killing CDN imports, what a lead row must carry to be attributable |
| `tokrwd-landers` | the NO-CLOAKING rule, the propagate loop, the s1–s5 wire |

⚠️ **Verify every claim against `origin/main` and against prod, never a local tree.** Every line
number below was read in the tokrwd worktree at **`7329e16`** (*fix(ASHL): drop supabase-js and the
jsdelivr CDN from the money path*, which **is** the head of `origin/main` — confirmed with
`git merge-base --is-ancestor`); every DB fact was **measured against prod on 2026-08-07** with the
commands in §6, not assumed. A second independent pass on 2026-08-07 re-ran every command and every
SQL statement in this file and corrected six of them — see the ✅/⚠️ markers in §6 and §7.

### The worked case this generalises from

Ashlyn — `ashlynn.brunelle@gmail.com`, AffID 18, auth id `0ea40fbc-452a-420d-9f0c-d0ad5410312a` —
supplied a **3-question survey funnel** for Apple Pay $750 US:
`q1 → q2 → q3 → activating → email → "You're all set!"`.

Live: `ASHL/US` + `/ashurl` + `AH50/US1..US100` (102 files, one md5), door
`applepay750-us-ashlyn`. Files: `_lp-generator/ashlyn-apay-source.html` (her file, byte-for-byte)
and `_lp-generator/ashlyn-apay.js` (the generator). Hosting/assignment side is
`sprk-custom-landers`; §8 records the live state.

**Five distinct defects, every one silent.** Nothing errored, nothing looked broken, and four of the
five would have cost money or leads with no signal at any layer. They are the whole teaching
material and they are threaded through §1–§5.

---

## 1. BEFORE YOU TOUCH ANYTHING — the five checks on a supplied page that collects data

Run these on `_lp-generator/<person>-<offer>-source.html` **in this order**, before writing a line
of generator. Each one found a real defect in Ashlyn's file.

### Check 1 — is there an outbound link at ALL? (run this first, always)

```bash
grep -nE 'location\.href|location\.replace|window\.open|sprktrax|api/link' <person>-<offer>-source.html
```

**Zero matches means the funnel dead-ends and there is no error anywhere to tell you.** That is
exactly what hers returned — 0 matches; the emitted page has 3. Not a broken CTA: *no* CTA. A
visitor answered three questions, handed over an email, read "Check your email for the next steps",
and closed the tab. Ashlyn would have paid for every click and earned nothing, and every dashboard
would have read normally — clicks in, zero conversions, no error anywhere.
`ashlyn-apay.js:11-23` is the postmortem.

**A dead end is harder to spot than a wrong link, because nothing looks broken.** Sammy's page at
least shipped a placeholder that 404s visibly (`example.com/your-offer-destination`). This one did
not fail at all.

### Check 2 — whose database is it writing to?

```bash
grep -nEo 'https?://[a-z0-9.-]+\.supabase\.co|fetch\(|XMLHttpRequest|action="[^"]*"' <source>.html
```

Any `*.supabase.co` host that is **not** `ecyawhhimmuzryxjnjng` is somebody else's project. Hers was
`jjdpumaccvbsktotcwgc.supabase.co` (`ashlyn-apay-source.html:267`), with an anon key in page source
(`:268`), collecting **every visitor's email address and survey answers** from a page on
`www.tokrwd.co`. We could not read it, delete from it, or answer a data request about it. The
privacy policy the page linked to was uplevelrewards', not ours. §2 is the move.

⚠️ **Grepping for the project ref is not enough on its own.** The ref also lives inside the anon-key
JWT **base64-encoded** — `ImpqZHB1bWFjY3Zic2t0b3Rjd2dj` decodes to `"jjdpumaccvbsktotcwgc"`. A
literal `never(h, 'jjdpumaccvbsktotcwgc')` passes while the page still carries her key. See §7 G5.

### Check 3 — `display: none !important`

```bash
grep -nE 'display\s*:\s*none\s*!important' <source>.html
```

Hers shipped `.hidden { display: none !important; }` (`ashlyn-apay-source.html:138`) as its
step-toggling utility. That is the exact signature of the blank-page cloak gate, and
`api/_lib/_tracking-audit.test.mjs:190` — `{ re: /display\s*:\s*none\s*!important/i, what:
'blank-page cloak gate', escapable: false }` — **fails the build** on it. It flagged all 102 files.

The class is legitimate. Fix in the **GENERATOR, never her source**:
`.hidden.hidden { display: none; }` (`ashlyn-apay.js:260`, emitted `ASHL/US/index.html:138`) —
specificity beats anything a single class can set, zero behavioural difference.

Two reasons the fix belongs in the generator and not the source: byte-fidelity (the whole point of
saving her file untouched), and — the one that is easy to miss — **`_lp-generator` is in the audit's
`SKIP_DIRS`** (`_tracking-audit.test.mjs:67`), so her source is never scanned anyway. Patching it
would be a fidelity loss for no coverage gain.

⚠️ The audit regex is whitespace-tolerant; the generator's two `never()`s are not. `:261` pins the
fully-spaced form and `:363` the fully-unspaced one, so a middle form like `display:none !important`
slips both generator asserts and is caught only by the audit. **The audit is the authority here.**

### Check 4 — CDN imports on the money path

```bash
grep -nEo 'https://cdn\.[a-z.]+/[^"'"'"']*' <source>.html
grep -n "^\s*import .*from ['\"]https" <source>.html
```

Hers: `import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';`
(`ashlyn-apay-source.html:265`). §5 is why that cannot ship and what replaces it.

### Check 5 — what columns does the code assume?

Read every `.update({...})` / `.insert({...})` and check the key names against the real table. Hers
passed the **bare question id** as a column name — `update({ [questionId]: value })`
(`ashlyn-apay-source.html:323`) — and `q1`/`q2`/`q3` are not columns. Mapped to real names at
`ashlyn-apay.js:311-316`.

⚠️ **The generator's own comment calls this "latent". It is not — trace it.** In the emitted page
`handleAnswer` runs (`ASHL/US/index.html:375-386`):

```
:377  state.answers.q3 = v
:379  state.step='activating'; goToStep()
        :424 createRecord()  →  :400 state.recordId = newId          (synchronous)
                             →  :401 state.pendingInsert = sbInsert(…)
                             →  :417 await …                          (suspends, returns to caller)
:380  if (state.recordId)  → TRUE
:384  await sbUpdateById(state.recordId, { q3_shop_frequency: v })    ← a real PATCH, every funnel
```

So **every completed funnel fires a q3 PATCH**, dispatched in the same tick as the insert POST. Who
wins is a genuine race and has **not** been measured; when the PATCH wins it is 204, zero rows,
nothing logged. With her original column names it would have been
`PATCH {q3: …}` → 400 on **every visitor**, not latent at all. It is harmless today only because the
insert body already carries all three answers (`:403-405`). Two consequences worth writing down: one
wasted request per visitor, and a live standing demonstration of the zero-row-204 property in §3.
**Move `createRecord` earlier in the funnel and q2/q3 become PATCH-only — and then they vanish
silently.**

---

## 2. MOVE THE CAPTURE TO OUR PROJECT — the whole runnable procedure

Do §1 of `sprk-custom-landers` first (save the file byte-for-byte, write the generator, fix the CTA,
the params, the legal links). Then these.

### Step 1 — decide where the leads go, out loud

Three honest options; **Migi's call, not a default:**

1. **Leave it on their project.** Then we cannot read it, delete from it, or answer a data request
   about it — and it is collected from a page on `www.tokrwd.co`, so the request lands on us.
2. **Drop the capture entirely.** Cheapest. The survey still qualifies the visitor; the email box
   goes away and the step hands straight off to the door.
3. **Move it to ours.** What was done for Ashlyn (Migi's call, 2026-08-04). Steps 2–7.

### Step 2 — the table, on OUR project

Project ref **`ecyawhhimmuzryxjnjng`**. Note this is the **same Postgres** that holds `clicks`,
`conversions`, `user_profiles`, `spark_codes` and `payout_batches` — see Trap 7. Reuse
`public.survey_responses` if the shape fits; a differently-shaped funnel gets its own table with the
**same grant shape**.

```sql
-- public.survey_responses, as it exists in prod 2026-08-07 (measured, §6)
id                 uuid         NOT NULL   -- NO DEFAULT. Minted client-side. Deliberate — §4.
q1_shop_online     text
q2_use_reward      text
q3_shop_frequency  text
reward             text                    -- e.g. 'applepay750us'
flow_id            text                    -- hers: ?Flow
affsecid           text                    -- hers: ?affsecid
s1                 text                    -- spark code: the affiliate + creative
s2                 text                    -- publisher
s3                 text                    -- ad account
ttclid             text
email              text
completed          boolean      NOT NULL default false
created_at         timestamptz  NOT NULL default now()
```

Constraints: **`survey_responses_pkey PRIMARY KEY (id)` and nothing else.** No CHECK, no UNIQUE on
`email`, no foreign keys in either direction. Indexes:

```
survey_responses_pkey            UNIQUE btree (id)
survey_responses_s1_idx                 btree (s1, created_at)
survey_responses_completed_idx          btree (completed, created_at)
```

⚠️ **There is no migration file for this table anywhere in the tokrwd repo** — `find . -name '*.sql'`
returns only `_lp-generator/2026-07-30_playful_and_shein_landing_pages.sql`. **The DDL above is the
only written record. Keep it current.**

⚠️ **There is no `is_test` column and nothing distinguishes a test row from a real lead.** Any
verification run must stamp `s1='SPK-TEST-0000'`, use `@example.invalid` emails, and clean up on
**both** predicates (§6 — an abandoned click-through leaves `email` NULL and survives an email-only
`DELETE`). Learned the hard way, twice on 2026-08-07: rows appeared in this table between two reads
of it, written by concurrent sessions' probes, carrying neither marker — and one of them is still
there (§9). Prefer the rolled-back `do $$ … raise exception … $$` harness in §3 to any real write.

### Step 3 — the RLS shape: write-only, done the way that actually works

```sql
alter table public.survey_responses enable row level security;

create policy sr_anon_insert     on public.survey_responses for insert to anon with check (true);
create policy sr_anon_update     on public.survey_responses for update to anon using (completed = false) with check (true);
-- A PERMISSIVE SELECT POLICY IS REQUIRED. Without it the UPDATE above silently matches
-- zero rows and PostgREST still answers 204. §3 — this is the whole point of this skill.
create policy sr_anon_select_min on public.survey_responses for select to anon using (true);

-- The read protection is a COLUMN GRANT, not the policy.
revoke select on public.survey_responses from anon;
grant  select (id, completed) on public.survey_responses to anon;
```

`sr_anon_update`'s `using (completed = false)` is the **finished-lead lock**: once a lead completes,
nothing with the anon key can rewrite it. **Read §3 before changing a character of this.**

### Step 4 — the generator patch shape

Everything below is an *asserted* `sub()` on her source (`sammy-acash.js:91-104` / `ashlyn-apay.js:94-107`
define `sub` / `must` / `never` identically). Patches specific to lead capture, in the order the
generator applies them:

| # | Patch | Where |
|---|---|---|
| P1 | door builder + `pendingInsert` injected at the `const state` anchor | `ashlyn-apay.js:113-150` |
| P2 | submit handler → best-effort-then-go (Step 7) | `:153-179` |
| P3 | project swap: URL **and** key | `:192-197` ⚠️ see §7 G5 |
| P4 | `createRecord` → client-minted id + `pendingInsert` (§4) | `:203-249` |
| P5 | `.hidden.hidden` (Check 3) | `:260-262` |
| P6 | drop the jsdelivr import (§5) | `:274` |
| P7 | the plain-fetch PostgREST client (§5) | `:275-303` |
| P8 | per-question column map (Check 5) | `:306-316` |
| P10 | **add** our privacy policy to the consent line | `:332-335` |

(No P9: the og:image / twitter:image de-Bolting at `:322-326` is branding, not lead capture.)

⚠️ **P1 carries three concerns in one `sub`** and is the highest-value assertion target: the
outbound itself; `doorQ`, which the insert body also reads for `s1/s2/s3/ttclid`; and
`pendingInsert`, without which `state.pendingInsert` is `undefined`, the guard at `:169` is falsy,
the await is skipped, and the §4 race silently returns.

Ordering detail worth keeping: `doorQ` is **mutated** by the `campid` / `mc_attr` promotion
(`:126-134`) *before* `createRecord` reads it, so the `s1` stored in the lead row is the same
promoted value the door receives. Not accidental.

### Step 5 — the lead row must carry the attribution wire

Her original stored `Flow` and `affsecid` only — neither identifies an affiliate or a creative.
Store the door's own params (`ashlyn-apay.js:237-243`):

```js
s1: doorQ.get('s1') || null,   // the spark code — the affiliate + creative
s2: doorQ.get('s2') || null,   // publisher
s3: doorQ.get('s3') || null,   // ad account
ttclid: doorQ.get('ttclid') || null,
```

`doorQ` is the same `URLSearchParams` the outbound builder uses, so the lead and the click carry
**identical** values by construction — no second parse to drift.

### Step 6 — the consent line: ADD our policy, do not swap theirs out

Once the email lands in our database, our privacy policy has to be named. The generator **adds**
`/Rewards/privacy` alongside UpLevel's (`ashlyn-apay.js:332-335`, `must('/Rewards/privacy', 1)`).
Replacing the network's terms would misrepresent what the visitor is agreeing to for the *offer*.
Extension-less because `vercel.json` sets `cleanUrls`. (No tokrwd **terms** link is added — that
asymmetry is in the shipped page today; note it, don't assume it was decided.)

### Step 7 — hand off to the door, best-effort-then-go

```js
if (state.pendingInsert) { try { await state.pendingInsert; } catch (e) {} }   // §4
const { error } = await sbUpdateById(state.recordId, { email, completed: true });
if (error) console.error('lead capture failed, continuing to the offer:', error);
…
window.location.href = offerUrl();     // ALWAYS — never gated on the write
```

`ashlyn-apay.js:161-178`, emitted `ASHL/US/index.html:440-453`. **A lead we failed to record is a
bad day; a paid click that never reached the offer is money already spent.** Her original `return`ed
on a database error and parked the visitor on the email screen forever
(`ashlyn-apay-source.html:365-367`).

**The invariant, verified in the emitted page:** there is **exactly one** redirect site —
`grep -n "location.href\|location.replace\|location.assign\|window.open" ASHL/US/index.html` returns
only `:453` — it sits *after* the capture block, and `must(h,'window.location.href = offerUrl();',1)`
(`:346`) pins the count at one. Two capture calls fire without redirecting (the insert at `:401` and
the q3 PATCH at `:384`); both are pre-redirect and strand nobody.

⚠️ **The one hole in that invariant: a HUNG fetch, not a failed one.** See §5.

---

## 3. THE RLS TRAP THAT SILENTLY EATS EVERY LEAD

**The most valuable thing in this skill. It will bite again.**

The design goal is *"anon can write but can never read the email list."* The obvious way to get
there is wrong, and it fails **silently, in production, forever.**

### The trap

**First attempt:** enable RLS, add INSERT + UPDATE policies, and **no SELECT policy at all.**

That broke every update. `UPDATE … WHERE id = X` still has to **scan for the row** — PostgreSQL
applies SELECT policies to the row-finding half of an UPDATE/DELETE that has a `WHERE` clause. With
RLS on and no SELECT policy the row is invisible to `anon`, so the update matched **zero rows** —
and **PostgREST returned HTTP 204 exactly as if it had worked.**

Every lead would have stored email-less, forever, with no error at any layer: not in the browser
console, not in the network tab, not in the Postgres log. The insert succeeds, the page redirects
happily, the affiliate gets paid on the conversion, and the email column is null on every row.

### Reproduce it in 30 seconds, on the real table, WITHOUT touching a single row

`RAISE EXCEPTION` at the end guarantees the rollback, so this is safe to hand to Migi or run
yourself. Swap the `drop policy` line for nothing at all to get the control case. Run it through the
Management API `q()` helper in §6:

```sql
do $$
declare n int;
begin
  drop policy sr_anon_select_min on public.survey_responses;   -- the "no SELECT policy" design
  set local role anon;
  insert into public.survey_responses (id, s1, completed)
    values ('11111111-2222-4333-8444-555555555555', 'SPK-TEST-0000', false);
  update public.survey_responses set email = 'probe@example.invalid', completed = true
    where id = '11111111-2222-4333-8444-555555555555';
  get diagnostics n = row_count;
  raise exception 'update matched % row(s)', n;   -- rolls everything back, including the drop
end $$;
```

Measured 2026-08-07, both ways:

```
without sr_anon_select_min  ->  update matched 0 row(s)     ← THE TRAP, no error raised
with    sr_anon_select_min  ->  update matched 1 row(s)
```

The same harness proves the rest of the model, all rolled back: `RETURNING email` → `42501` and
`RETURNING id` → OK (column granularity, and the mechanism behind `return=representation`);
`where email is not null` → `42501` and `order by email` → `42501` (a WHERE/ORDER BY column needs
SELECT too); an insert with no `id` → `23502`; a second update of a row already `completed = true` →
**0 rows** (the finished-lead lock); `DELETE` → 0 rows but **`TRUNCATE` SUCCEEDS** (Trap 6, D6).

### The fix — a column-level grant, plus a permissive SELECT policy

```sql
create policy sr_anon_select_min on public.survey_responses for select to anon using (true);
revoke select on public.survey_responses from anon;
grant  select (id, completed) on public.survey_responses to anon;
```

`anon` can now **find and qualify** the row — all the `WHERE id = X` needs — but `?select=email` is
refused at plan time with **`42501 permission denied for table survey_responses`** (HTTP 401).

**Row visibility and column visibility are two different mechanisms. This design uses the first for
*matching* and the second for *secrecy*.** That is the whole trick, and it is the sentence to
remember.

### The symptom, and the one header that makes it visible

A no-op `PATCH` and a successful `PATCH` are **indistinguishable from the browser**: both are 204
with no body, `r.ok === true`, and the client returns `{ error: null }`. `Prefer: count=exact` is
the only difference:

```
content-range: 0-0/1   →  one row updated
content-range: */0     →  ZERO rows updated, still HTTP 204
```

Measured live 2026-08-07, both directions (§6). **This same 204/`*/0` shape is also how a failed
insert loses an email today** — see §7 D1.

### Live policies in prod — all PERMISSIVE, all `{anon}`, three of them

| name | cmd | roles | qual (USING) | with_check |
|---|---|---|---|---|
| `sr_anon_insert` | INSERT | `{anon}` | — | `true` |
| `sr_anon_select_min` | SELECT | `{anon}` | `true` | — |
| `sr_anon_update` | UPDATE | `{anon}` | `(completed = false)` | `true` |

**No DELETE policy.** No policy for `authenticated`. These three are the **only** policies naming
`anon` anywhere in the project's `public` schema. RLS is on (`relrowsecurity=t`,
`relforcerowsecurity=f`, owner `postgres`).

### Grants — this is where the secrecy actually lives

| role | table-level | column-level SELECT |
|---|---|---|
| `anon` | DELETE, INSERT, REFERENCES, TRIGGER, TRUNCATE, UPDATE — **no SELECT** | **`id`, `completed` only** |
| `authenticated` | + SELECT | all 14 |
| `postgres`, `service_role` | + SELECT | all 14 |

`anon` also holds column-level INSERT and UPDATE on **all 14 columns**, including `id`, `email` and
`created_at` — see §7 D5 and Trap 6.

`sr_anon_select_min` is `using (true)`, so **row visibility is total and column visibility is the
entire control.** One `grant select on survey_responses to anon` re-exposes every email instantly —
and that is verbatim what the 42501 error body suggests you do (Trap 5).

---

## 4. CLIENT-SIDE IDS, AND THE RACE THAT COMES WITH THEM

### Why the id is minted in the browser

`id` is `uuid NOT NULL` with **no default** in prod. That is not an optimisation — it is mandatory
for this design:

- minting it client-side means the insert **never needs `.select()`**;
- no `.select()` means `anon` needs no read on the data columns;
- which is what makes the column-grant model in §3 possible at all.

Drop `id` from the insert body and every insert 400s with `23502`, console-only.

```js
const newId = (crypto.randomUUID ? crypto.randomUUID() : /* v4-shaped Math.random fallback */);
state.recordId = newId;                       // claim it IMMEDIATELY
state.pendingInsert = sbInsert({ id: newId, … });
```

`ashlyn-apay.js:219-244`, emitted `ASHL/US/index.html:391-416`.

### The race — introduced by the fix itself

`state.recordId` was originally assigned **after** awaiting the insert. A visitor clicking straight
through — answer, answer, answer, Quick Start, submit — reached the email step **before the insert
resolved**. The update ran against a `null` id, matched nothing, and the email was dropped while the
page redirected happily to the offer. **Reproduced with a synchronous click-through; not
theoretical.**

Two changes, **both required**:

1. **Claim the id immediately** (`:228` / emitted `:400`) — it is minted locally, so it is known
   before any network call.
2. **`state.pendingInsert`** (`:229` / emitted `:401`) — the submit handler `await`s the in-flight
   insert before patching (`:169` / emitted `:444`).

Either one alone reopens the hole.

### Why it is closed now — the trace, which is stronger than the comment claims

`state.recordId = newId` and `state.pendingInsert = …` both execute in the **same synchronous turn**
as the q3 click handler: `handleAnswer:379 → goToStep:424 → createRecord`, with **no `await`
anywhere between `createRecord`'s entry and `:401`** (the early-return at `:389` and the uuid mint at
`:391-394` are synchronous, and `sbInsert(...)` returns its promise synchronously at its first
internal `await`). There is therefore **no interleaving point** at which a later user gesture can
observe `recordId === null` or `pendingInsert === null`.

Related, and worth knowing before anyone reorders the funnel: **the email step is unreachable without
passing through `activating`.** `STEP_ORDER` advances one hop at a time (`:378`), `quickStartBtn`
(`:456`) is the only route to `email` and lives on the activating screen, and `#emailStep` is
`display:none` until then. So `pendingInsert` is always non-null at submit in practice; the
`if (state.pendingInsert)` guard is defence, not a live branch.

**Generalise: any client-minted-id design has this race.** The id being available synchronously is
precisely what tempts you to fire-and-forget the insert.

---

## 5. NO NPM CLIENT, NO CDN — the fetch pattern

### Why the import had to go

`import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';`
(`ashlyn-apay-source.html:265`).

An `import` is a **hard** dependency. If jsdelivr is blocked, throttled or down, the module never
evaluates and **nothing after it runs** — including the door hand-off. The failure mode is a
completely dead page, on paid traffic, with a third party we do not control deciding when it
happens.

**The general rule: nothing on the path between the ad click and the door may load from a host we do
not control.** Google Fonts is still on the page and is fine — a stylesheet failing to load does not
stop a listener registering. A module `import` is not in that category.

Repo precedent: `api/_lib/kv.js` — *"Upstash Redis over plain `fetch`. No npm package, no
package.json"* (`kv.js:1-2`).

### The shipped client — ~25 lines

`ashlyn-apay.js:275-301`, emitted `ASHL/US/index.html:267-292`:

```js
const SB_HEADERS = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',      // LOAD-BEARING — below
};
const SB_REST = SUPABASE_URL + '/rest/v1/survey_responses';
async function sbInsert(row)          { … POST  SB_REST … return r.ok ? {error:null} : {error:{status,body}}; }
async function sbUpdateById(id, patch){ if (!id) return {error:{message:'no record id'}};
                                        … PATCH SB_REST+'?id=eq.'+encodeURIComponent(id) … }
```

Both return `{ error }` so the call sites read **exactly** as they did with `supabase-js` — the diff
stays small and reviewable. Neither can reject: every body is inside `try/catch` and even
`r.text()` is `.catch(() => '')`.

Header by header:

- **`Prefer: return=minimal` is load-bearing, not tidiness.** Measured: the same insert with
  `Prefer: return=representation` → **HTTP 401 / `42501`, and the row is NOT created.** Asking
  PostgREST to echo the row back makes it read the row, `anon` has no read on the data columns, and
  **the entire write dies on the RETURNING privilege check.** It is the structural counterpart to
  §3: with this grant model, *every write must be non-returning.* If a future edit adds `.select()`,
  `return=representation`, or `resolution=merge-duplicates`, lead capture stops working completely.
- **`apikey` + `Authorization`** — both, mirroring supabase-js. The gateway keys off `apikey`;
  PostgREST derives the role from the JWT. Measured 2026-08-07: **`apikey` alone is enough** (200),
  **`Authorization` alone is refused by the gateway** — 401 `"No API key found in request"`, before
  PostgREST is reached. Send both anyway; matching supabase-js costs nothing.
- **`Content-Type: application/json` is required — but it does NOT 415, and "omitted" is not the
  failure.** Measured 2026-08-07: a genuinely absent header → **201**, PostgREST assumes JSON; a
  *wrong* one → **400**, and there are two different 400s — `text/plain` gives `PGRST102
  "Content-Type not acceptable: text/plain"`, and form-encoded gives `PGRST204 "Could not find the
  '{...}' column"` (the whole JSON body read as a form field name). **The reason the header is
  load-bearing in this page is browser `fetch`:** given a string body and no explicit header it
  sends `text/plain;charset=UTF-8`, which is the `PGRST102` case — so dropping this line breaks
  every write with a 400 that looks nothing like a permissions problem.
- **`encodeURIComponent(id)`** (`:297`) — cosmetic for a uuid, but it is what stops a PostgREST
  filter injection if the id ever becomes attacker-shaped. Keep it.

### Two things about the surrounding script tag

- **Keep `type="module"`** even after the import is gone (emitted `:264`). Module scripts are
  deferred, and that is the only reason `$('quickStartBtn').addEventListener(…)` at the bottom of
  the file (`:456`) finds its element.
- **There is no timeout, and that is the one real gap.** `grep -c "AbortController\|AbortSignal\|
  setTimeout" ASHL/US/index.html` → **0**. See §7 D2.

---

## 6. HOW TO VERIFY

### Repo side

```bash
cd /Users/miguelamaya/Documents/GitHub/tokrwd            # ⚠️ see the warning under this block

# run BEFORE anything else on any new supplied file
grep -nE 'location\.href|location\.replace|window\.open|sprktrax|api/link' _lp-generator/<new>-source.html

node _lp-generator/ashlyn-apay.js --clones 100 && git status --porcelain   # must stay EMPTY (deterministic)
md5 -q ASHL/US/index.html ashurl/index.html AH50/US*/index.html | sort -u | wc -l   # must be 1 (102 files)
ls AH50 | wc -l                                                                    # 100
node api/_lib/_tracking-audit.test.mjs && node api/_lib/_links-config.test.mjs      # 6/6 and 190/190 @ 7329e16

grep -o 'sprktrax.org/api/link/[a-z0-9-]*' ASHL/US/index.html   # must equal landing_pages.slug
curl -sI 'https://sprktrax.org/api/link/applepay750-us-ashlyn?s1=SPK-TEST-0000'   # 302
curl -sI 'https://sprktrax.org/api/link/applepay750-us-ashlyn'                    # 404 — the attribution gate
```

⚠️ **The door grep needs `[a-z0-9-]`, not `[a-z-]`.** `sprk-custom-landers` §8 uses `[a-z-]*` and is
right there — Sammy's slug `applecash-us-sammy` has no digits. Ashlyn's does, so the character class
truncates at the `7` and prints `sprktrax.org/api/link/applepay`, which does **not** equal the slug.
Copied verbatim, this check reports a mismatch on a page that is wired correctly. Verified both ways
2026-08-07.

⚠️ **`git fetch` is not enough, and on 2026-08-07 that checkout could not run any of this.**
`~/Documents/GitHub/tokrwd` sat at `b321a48` with **no `ASHL/`, no `ashurl/`, no `AH50/` on disk at
all**. `origin/main` *is* at `7329e16` — the work is pushed — but fetching only moves the remote ref;
the files arrive on a checkout/pull. Confirm with `ls -d ASHL ashurl AH50` before trusting any result
from that directory, or work in the worktree that produced the change.

The emitted-page counts that matter (all verified at `7329e16`):
`ecyawhhimmuzryxjnjng` ×1 · `return=minimal` ×2 · `offerUrl()` ×2 · `location.href` ×1 ·
`cdn.jsdelivr.net` ×0 · `createClient` ×0 · `jjdpumaccvbsktotcwgc` ×0.

### The browser click-through — the only way to catch the race

Load `https://www.tokrwd.co/ashurl?s1=SPK-TEST-0000` and click **as fast as the UI allows**: answer,
answer, answer, Quick Start, submit. Then check the row landed **with its email**:

```sql
select id, s1, email, completed, q1_shop_online, q2_use_reward, q3_shop_frequency, created_at
from public.survey_responses where s1 = 'SPK-TEST-0000' order by created_at desc limit 5;
```

A row with `email IS NULL` and `completed = false` after a completed click-through **is the §4
race**, or §7 D1. Slow clicking will not reproduce either.

### SQL from this Mac — there is no psql and no Supabase MCP

```bash
TOKEN=$(security find-generic-password -s "Supabase CLI" -w)
q() { curl -s -X POST "https://api.supabase.com/v1/projects/ecyawhhimmuzryxjnjng/database/query" \
        -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @-; }

# is RLS actually on?
printf '%s' '{"query":"select relrowsecurity, relforcerowsecurity from pg_class where oid = '"'"'public.survey_responses'"'"'::regclass;"}' | q
# the policies
printf '%s' '{"query":"select policyname, cmd, roles::text, qual, with_check from pg_policies where tablename='"'"'survey_responses'"'"';"}' | q
# what anon can actually SELECT, column by column  ← THE REAL CONTROL
printf '%s' '{"query":"select column_name from information_schema.column_privileges where table_name='"'"'survey_responses'"'"' and grantee='"'"'anon'"'"' and privilege_type='"'"'SELECT'"'"';"}' | q
# table-level grants (spot DELETE/TRUNCATE leftovers)
printf '%s' '{"query":"select grantee, privilege_type from information_schema.role_table_grants where table_name='"'"'survey_responses'"'"' order by 1,2;"}' | q
# is it in the realtime publication?
printf '%s' '{"query":"select * from pg_publication_tables where tablename='"'"'survey_responses'"'"';"}' | q
```

### The three security probes — run them as a visitor's browser would

```bash
ANON=$(curl -s "https://api.supabase.com/v1/projects/ecyawhhimmuzryxjnjng/api-keys" \
  -H "Authorization: Bearer $TOKEN" | python3 -c 'import json,sys;print([k["api_key"] for k in json.load(sys.stdin) if k.get("name")=="anon"][0])')
REST=https://ecyawhhimmuzryxjnjng.supabase.co/rest/v1/survey_responses
H=(-H "apikey: $ANON" -H "Authorization: Bearer $ANON")

# (a) the write works — and ONLY with return=minimal
curl -s -w '%{http_code}\n' -X POST "$REST" "${H[@]}" -H 'Content-Type: application/json' \
     -H 'Prefer: return=minimal' -d '{"id":"<uuid>","s1":"SPK-TEST-0000","completed":false}'   # 201
#    the same POST with Prefer: return=representation  → 401 / 42501, AND NO ROW IS CREATED
#    (re-verified 2026-08-07: select count(*) where id = <uuid> immediately after  →  0)

# (b) the update finds the row — and a zero-row update is a 204
curl -s -D- -o/dev/null -X PATCH "${H[@]}" -H 'Content-Type: application/json' \
     -H 'Prefer: return=minimal,count=exact' -d '{"email":"x@example.invalid","completed":true}' \
     "$REST?id=eq.<uuid>" | grep -i 'HTTP\|content-range'      # 0-0/1 = wrote · */0 = SILENT NO-OP

# (c) the email cannot be read back
curl -s -w '%{http_code}\n' "${H[@]}" "$REST?select=email"        # 42501 / 401
curl -s -w '%{http_code}\n' "${H[@]}" "$REST?select=id,completed" # 200
```

Measured 2026-08-07. Everything below returned the same `42501` / HTTP 401:
`?select=email` · `?select=*` · no `select` at all · `?select=id&order=email.asc` ·
`&order=created_at.asc` · `&email=like.*` · `&s1=eq.…` · `&or=(email.eq.…)` ·
`PATCH ?email=like.*` · `PATCH …&select=email` with `return=representation` ·
`POST … resolution=merge-duplicates,return=representation` · `POST … return=headers-only` ·
`Accept: text/csv` + `?select=email`.

Succeeding — the entire surface `anon` has: `?select=id,completed` (200, csv too),
`?select=id&limit=1` with `Prefer: count=exact` (`content-range` — **200** when the limit does not
truncate the set, 206 when it does; with one row in the table today it is `200 / 0-0/1`), and
`PATCH ?id=eq.X&select=id` with `return=representation` → `[{"id":"…"}]` — **column granularity
confirmed** (re-confirmed at SQL level: `RETURNING id` OK, `RETURNING email` `42501`).
`sb_publishable_…` (the newer key format) behaves identically: same `anon` role, same results —
re-verified 2026-08-07. A plain colliding `POST` → `23505` / HTTP 409.

The 42501 body, verbatim:

```json
{"code":"42501","details":null,
 "hint":"Grant the required privileges to the current role with: GRANT SELECT ON public.survey_responses TO anon;",
 "message":"permission denied for table survey_responses"}
```

### Test hygiene — mandatory

**Always stamp `s1='SPK-TEST-0000'`, always use `@example.invalid` emails, always clean up.**
`.invalid` is a reserved TLD that cannot resolve.

⚠️ **Clean up on `s1`, not on `email` — the email predicate misses the common case.** Any probe that
stops before the email step, and every `POST`-only probe, leaves `email IS NULL`, and
`NULL LIKE '…'` is NULL, so those rows survive an email-only `DELETE`. Measured 2026-08-07: it left a
probe row behind that had to be deleted by id. Use both:

```sql
delete from public.survey_responses
 where s1 = 'SPK-TEST-0000' or email like '%@example.invalid';
```

There is no `is_test` column. A test row you forget is a lead nobody can tell from a real one — and
the row now sitting in the table (§9) is exactly that: a probe whose only marker is a `ttclid`, which
neither predicate above would catch.

**Prefer a rolled-back probe to a real write.** Anything you want to learn about the *policies* can
be measured without leaving a row at all — the `do $$ … raise exception … $$` harness in §3 runs as
`anon` against the real table and rolls back unconditionally.

**Writes are Migi's.** tokrwd has no `CLAUDE.md`; the standing rule lives in
`~/Documents/GitHub/SPRKNetworkAds/CLAUDE.md:19-20` — *"**No production actions without explicit
approval:** do not push, deploy, merge, or touch production. Ask first, every time."* Hand over the
SQL; do not run it.

---

## 7. WHAT IS STILL OPEN — residual defects and assertion gaps

The five defects are fixed. These are not, and they are all reachable from a green build.

### D1 · A failed insert still loses the email, silently

If the POST 4xx/network-fails, `state.recordId` is **still the minted uuid**, so the subsequent PATCH
targets a row that does not exist → **204, `content-range: */0`, `r.ok === true`, `{error:null}`,
nothing logged.** Measured 2026-08-07. The insert failure *is* logged (emitted `:418`), but the
update then reports success — the same silent-loss shape as §3's trap, a different cause.

Two-line fix: add `count=exact` to `SB_HEADERS`, read `Content-Range` on the PATCH, and treat `*/0`
as an error (optionally re-issuing the insert with `email` + `completed:true` already on it).

### D2 · No fetch timeout — a hung capture CAN block the redirect

This is the one exception to Step 7's "best-effort-then-go" promise. A *failed* capture cannot block
the redirect (neither helper can reject). A *hung* one can: `fetch` never self-cancels, so a stalled
connection to Supabase leaves `await state.pendingInsert` (emitted `:444`) pending, which blocks the
PATCH, which blocks `window.location.href` — for minutes, on a paid click, with a person waiting.

The repo's own precedent is right there: `api/_lib/kv.js:45-60` wraps every call in an
`AbortController`, with a **250 ms** budget on the click path and the rationale spelled out at
`kv.js:78-82`. Fix: `signal: AbortSignal.timeout(1500)` on both fetches, or race the whole capture
block against a timer.

### D3 · Enter-key double submit

Emitted `:434` sets `$('continueBtn').disabled = true`, which is the *only* thing stopping the click
listener at `:457` re-firing (and `:451` clears it again). `:458`'s `keydown` handler calls
`handleSubmitEmail` **directly**, bypassing the button entirely, with **no `disabled` /
`state.submitting` check**. `state.submitting` is assigned at `:433` and
`:450` and **never read anywhere** — dead in her original (`ashlyn-apay-source.html:358`) and dead in
ours. Benign today: the second PATCH hits `completed = true`, `sr_anon_update`'s
`using (completed = false)` excludes it, 204, zero rows. Which is itself another instance of D1's
mechanism.

### D4 · The email gate is now the money gate

The only redirect sits behind email validation (emitted `:430-431`), so a visitor who reaches the
email screen and bails is a **paid click that never reaches the offer**. Structurally identical to
her original, but the money now depends on it. A "skip / no thanks" link calling `offerUrl()` would
recover those clicks. **Migi's call, not a defect.**

### D5 · anon can enumerate and poison in-flight leads — proven

`sr_anon_select_min` is `USING (true)`, so `?select=id,completed` returns **every** row (200), plus
the exact count. That is lead volume and completion rate — BI, not PII.

⚠️ **The write hole is the real one.** `PATCH ?completed=eq.false` returned **204 /
`content-range: 0-0/1`** against the incomplete row that existed. The filter is on a column `anon`
*can* read, and RLS permits it. Re-confirmed 2026-08-07 at SQL level with the §3 harness rather than
over HTTP — `update … where completed = false` as `anon` matched **2 rows**, one of them a real
pending lead, then rolled back. Do **not** re-run this one over the REST API on prod: it rewrites
live rows and there is no undo. `anon` holds UPDATE on all 14 columns, so a key holder can, **with
one request and no knowledge of any id**:

- overwrite `email` on every pending lead;
- flip `completed = true` on all of them, permanently freezing them — the finished-lead lock then
  works *against* us;
- rewrite `s1`/`s2`/`s3` and poison attribution.

No completed lead can be touched, and it is not a read. But it is data destruction reachable from
view-source. Honest framing: the design goal (*write but never read the list*) is met; row-id
enumeration and pre-completion tampering are the **accepted residue**, and `completed = false` is
the only thing bounding it.

### D6 · `DELETE` and `TRUNCATE` are still granted to anon

Supabase's default `grant all` was never narrowed beyond the targeted `revoke select`. `DELETE` is
blocked **only by the absence of a DELETE policy** — proven twice: `DELETE ?id=eq.X` → 204, `*/0`,
row survived; and as `anon` in SQL, `delete … where id = X` matched **0 rows**. **`TRUNCATE` is not
subject to RLS at all** — proven, not reasoned: `set local role anon; truncate
public.survey_responses;` **SUCCEEDED** inside the §3 rolled-back harness. It is unreachable today
only because PostgREST never emits it and no RPC does (verified: no function in `public` references
this table at all). Latent, one careless `SECURITY DEFINER` helper from live.

### D7 · The generator's own RLS docstring is stale and would reinstate the bug

`_lp-generator/ashlyn-apay.js:186-191` still says:

> *"SELECT — NO POLICY AT ALL — the anon key cannot read a single row back."*

**That is the design that BROKE.** Prod has `sr_anon_select_min USING (true)` plus column grants
limited to `(id, completed)`. The file even contradicts itself — the emitted comment at
`ASHL/US/index.html:273-274` ("anon has no read on the data columns (RLS + column grants)") is the
correct account. **Anyone re-deriving the model from `:186-191` will drop the SELECT policy and
silently break every UPDATE again. Fix that comment block before it teaches the wrong lesson.**

### D8 · Three of six `CONCERNS` entries are zombies

`ashlyn-apay.js:74` (`jjdpumaccvbsktotcwgc`), `:78` (`cdn.jsdelivr.net`) and `:85`
(`bolt.new/static/og_default.png`) are each guaranteed absent by a `never()` at `:196`, `:302`,
`:326`, so the `if (html.includes(needle))` guard at `:407` can never print them. Only
`fonts.googleapis.com`, "spent around $15" and "within 6-10 days of registration" print. The guard
keeps the *output* honest, but the array text now misleads if read as current state — `:76-77` still
says *"DECIDE: keep, point at our own project, or drop the capture"*, decided 2026-08-04.

### Assertion gaps — edits that would pass every `must`/`never` today

Ranked by cost. **None of these are covered.**

| # | An edit that passes every assertion | Consequence |
|---|---|---|
| G1 | move `state.recordId = newId` (`:228`) below `await state.pendingInsert` | §4's race returns verbatim; emails dropped, redirect fine |
| G2 | delete `if (state.pendingInsert) { await … }` (`:169`) | same |
| G3 | delete the whole capture `try` block from the submit handler | page redirects, captures **nothing**; the door asserts all still pass |
| G4 | re-add `if (error) { … return; }` before the redirect | paid clicks eaten by a DB blip — the exact defect Step 7 exists to remove |
| G5 | the **unasserted** `.replace()` at `:194-195` stops matching | ⚠️ **our URL + HER key** → every write 401s → 100% lead loss, console-only. Measured 2026-08-07: `POST` to our REST endpoint carrying her key → **401 `{"message":"Invalid API key"}`**, refused at the gateway before PostgREST, no row created |
| G6 | drop `Prefer: return=minimal` from `SB_HEADERS` | every write 401/42501, console-only |
| G7 | drop `id:` from the insert body (`:230`) | `23502 not-null violation` on every insert |
| G8 | change/remove the `COL` map (`:313`) | one 400 per answer today; silent loss after any funnel reorder |
| G9 | rename/remove `sbInsert` / `sbUpdateById` | nothing pins their existence but `must('const newId =', 1)` |

**G5 in detail, because it is the worst one.** `ashlyn-apay.js:192-193` swaps the URL with an
asserted `sub()`. The **key** is swapped with a bare `h.replace(/const SUPABASE_ANON_KEY = '[^']+';/, …)`
at `:194-195` — no `g` flag, and **no assertion that it matched**. If her source's key line ever
changes shape (double quotes, `let`, reflowed), the replace silently no-ops. Neither guard catches
it: `never(h,'jjdpumaccvbsktotcwgc')` misses because the ref is base64 inside the JWT, and
`must(h,'ecyawhhimmuzryxjnjng.supabase.co',1)` only inspects the URL — verified,
`grep -o -F ecyawhhimmuzryxjnjng ASHL/US/index.html | wc -l` → **1**, the key contributes nothing to
that count either way.

The cheap additions, all string-literal, all in the generator's existing style:

```js
must(h, OUR_ANON_KEY, 1);                                          // G5 — the one that matters most
must(h, "'Prefer': 'return=minimal'", 1);                          // G6
must(h, 'async function sbInsert', 1);
must(h, 'async function sbUpdateById', 1);                         // G9
must(h, 'state.recordId = newId;\n        state.pendingInsert = sbInsert({', 1);  // G1 — pins the ORDER
must(h, '            id: newId,', 1);                              // G7
must(h, 'await state.pendingInsert; } catch', 1);                  // G2
must(h, 'await sbUpdateById(state.recordId, { email, completed: true })', 1);      // G3
must(h, "COL = { q1: 'q1_shop_online', q2: 'q2_use_reward', q3: 'q3_shop_frequency' }", 1); // G8
```

G4 has no clean string form; the honest guard is structural — assert that the substring between the
capture block and `window.location.href = offerUrl();` contains no `return`.

### Is there any remaining way to READ a visitor email?

**No — not with the public anon key, as the database stands on 2026-08-07.** Rigorously:

- **Every probe fails the same way, at plan time.** Postgres requires `SELECT` on any column named in
  a `WHERE`, `ORDER BY` or `RETURNING` clause — not just the select list. Every PostgREST feature
  that could carry data out is refused before a row is touched, uniformly, so there is no
  error-message or timing differential either.
- **No blind oracle.** A boolean oracle needs a predicate over a column you may not read. The only
  predicates `anon` can build are on `id` and `completed`; neither correlates with email content, and
  there is no `UNIQUE` on `email`, so an insert-collision membership probe is unavailable too.
- **Nothing to embed.** Zero foreign keys in either direction, zero dependent views/matviews.
  PostgREST resource embedding has no path in or out.
- **Nothing to call.** No `SECURITY DEFINER` function in `public` touches the table.
  `graphql_public.graphql` is anon-executable but **pg_graphql is not installed** —
  `POST /graphql/v1` answers *"pg_graphql extension is not enabled."*
- **Not in realtime.** The table is **not** in the `supabase_realtime` publication (only
  `public.warmup_jobs` is), so no websocket streams row payloads.
- **The rest of the project is not a way in — structurally, not just by sampling.** `anon` holds
  table-level SELECT on **76** public tables by Supabase default. Measured 2026-08-07: **not one of
  them has RLS off** (`relrowsecurity = false` ∩ anon-SELECT-granted → **empty set**), **61 of them
  have RLS on and zero policies** — default deny — and all 29 `{public}` policies on the rest gate on
  `auth.uid()` or `auth.role() = 'service_role'`. Spot-checked live with the anon key anyway:
  `user_profiles`, `clicks`, `conversions`, `spark_codes`, `app_bank_info`, `affiliate_payments`,
  `login_events` all returned `[]`.

  ⚠️ **Do not "fix" those 61 tables.** RLS-on-with-no-policy is the *correct* shape for a table
  `anon` must never touch, and it is what most of this project uses. It becomes §3's trap only when
  the same table also has to be **UPDATEd** by `anon` — which is unique to lead capture.

### The hardening SQL — written, NOT applied, Migi's call

```sql
-- 1. Kill the mass-patch filter (D5). The page never READS `completed` — it PATCHes by id only —
--    so this costs the lander nothing and removes the only predicate an attacker can build.
revoke select (completed) on public.survey_responses from anon;

-- 2. Remove grants nothing uses (D6). TRUNCATE especially: RLS does not cover it.
revoke delete, truncate, references, trigger on public.survey_responses from anon;

-- 3. Narrow UPDATE to the columns the funnel actually writes.
revoke update on public.survey_responses from anon;
grant  update (q1_shop_online, q2_use_reward, q3_shop_frequency, email, completed)
  on public.survey_responses to anon;
```

✅ **Step 1 was UNTESTED; it has now been tested and it does what it claims.** The worry was that
`sr_anon_update`'s `using (completed = false)` might stop matching once `anon` loses
`SELECT (completed)` — which would lose every email silently, exactly as in §3. Measured 2026-08-07
with the §3 rolled-back harness, on the real table, with `revoke select (completed) … from anon` in
the setup:

```
update … where id = X          ->  matched 1 row(s)   ← the funnel still works
update … where completed=false ->  42501              ← D5's mass patch is closed
```

So the policy expression is evaluated in the owner's context and needs no privilege from the caller,
while a *caller-written* predicate on the same column is refused. That is the whole point of step 1
and it is confirmed. **Still re-run all three §6 probes after applying it to prod** — the test proves
the Postgres semantics, not that nothing else in the stack reads `completed`.

⚠️ Step 3 also drops `anon`'s UPDATE on `s1/s2/s3/ttclid/reward/flow_id/affsecid`. The page only
writes those on the **insert**, so that is safe today — re-check if a future funnel patches them.

---

## 8. THE TRAPS

### 1. A missing SELECT policy does not mean "cannot read" — it means "cannot UPDATE either"

§3, restated because it is the one that costs leads. **RLS row visibility gates the row-finding scan
of an `UPDATE`/`DELETE`, not just `SELECT`.** Permissive SELECT policy for *matching*, column grants
for *secrecy*.

### 2. PostgREST returns 204 for an update that matched nothing

Indistinguishable from success in the browser. `Prefer: count=exact` + `content-range` is the only
signal (`0-0/1` vs `*/0`). **Any lead write worth having should be spot-checked server-side after
deploy, not trusted because the tab looked fine.**

### 3. `Prefer: return=minimal` is load-bearing, not tidiness

§5. `return=representation` 401s the **whole write**, not just the read.

### 4. Client-minted ids race with their own insert

§4. Claim the id synchronously; keep the promise; `await` it before any update. The symptom is an
email silently dropped on exactly the visitors who move fastest.

### 5. The 42501 error body tells the reader how to break it

```
"hint": "Grant the required privileges to the current role with: GRANT SELECT ON public.survey_responses TO anon;"
```

That hint appears on **every** refused request, and running it exposes every email in the table
because `sr_anon_select_min` is `using (true)`. **Any future "the API says permission denied, just
grant it" ticket is this hole.** Point at this file instead.

### 6. Supabase's default grants are wider than any policy you write

`grant all on all tables in schema public to anon, authenticated` is applied by default, so a new
table starts with `anon` holding DELETE and TRUNCATE. RLS covers the first; **it does not cover
TRUNCATE at all.** Revoke what the page does not use rather than relying on policies to cover it.

### 7. The anon key on a lander is the key to the whole production database

`ecyawhhimmuzryxjnjng` holds `clicks`, `conversions`, `user_profiles`, `spark_codes` and
`payout_batches` alongside `survey_responses` — and `landing_pages` too, so the lead table shares the
production network database and the key printed in the lander source is the same public key the
affiliate portal uses. RLS holds everywhere today (verified §7), but that key is now in **102 static
files on a domain we run paid traffic to**, so **every future RLS mistake anywhere in that project
becomes reachable from view-source.** Every new table in this project needs RLS on and a policy
before it holds anything.

### 8. A generator comment can go stale and read as authority

D7. Believe §3, which was measured.

### 9. A supplied page's consent copy describes the OLD destination

Step 6. **Add** our policy; do not swap theirs out.

### 10. Third-party outage must never eat a click

Best-effort-then-go (Step 7) — same rule as the fail-open ladder `kv.js:23-24` describes: an outage
means fall back, never drop the click. But see D2: *failing* is handled, *hanging* is not.

---

## 9. ASHLYN'S LIVE STATE — 2026-08-07

- ✅ `ASHL/US` + `/ashurl` + `AH50/US1..US100` deployed, **one md5 across all 102 files**, door
  `applepay750-us-ashlyn`. `https://www.tokrwd.co/ashurl` returns 200; its only door string is
  `sprktrax.org/api/link/applepay750-us-ashlyn` and its only Supabase host is
  `ecyawhhimmuzryxjnjng.supabase.co`.
- ✅ The door 302s with `?s1=SPK-TEST-0000` and **404s without** — the attribution gate, by design.
- ✅ `https://www.tokrwd.co/_lp-generator/ashlyn-apay.js` → **404** (`.vercelignore:9-10`), so the
  generator and her source file are never served.
- ✅ Generator is deterministic — `--clones 100` re-run leaves `git status --porcelain` empty.
  `AH50` holds exactly 100 dirs.
- ✅ Guard tests: `_tracking-audit` 6/6, `_links-config` 190/190 — and, re-run 2026-08-07, **all
  seven** tokrwd suites are green: `_traffic-filter` 20, `_prelander-page` 62, `_partner-portal` 90,
  `_partner-store` 35, `_links-config` 190, `_partner-links` 91, `_tracking-audit` 6. `ashl`, `ah50`, `ashurl` present in
  **both** `api/_lib/links-config.js:899` and `js/breakout.js:56`.
- ✅ Emitted page: no `jjdpumaccvbsktotcwgc`, no `cdn.jsdelivr.net`, no `createClient`;
  `ecyawhhimmuzryxjnjng` ×1, `return=minimal` ×2, `location.href` ×1.
- ✅ `landing_pages`: `applepay750-us-ashlyn`, capacity 1, `self_serve` true, `template_key 'z'`, geo
  `us`, active, link `https://www.tokrwd.co/AH50/US1` — matching `DOOR_SLUG` (`ashlyn-apay.js:69`).
  Her old `applepay750-us` junction row (slot 49) is correctly **archived**; the bespoke row holds
  slot 1. Picker/assignment mechanics: `sprk-custom-landers`.
- ⚠️ On that bespoke junction row, **`slot_cycle` and `chosen_by` are both NULL.** Harmless —
  rotation *adopts* (stamps) a NULL-cycle row rather than rotating it, and a capacity-1 page never
  rotates anyway — but it is inconsistent with the `sprk-custom-landers` §1 step 5 recipe. Flagged,
  not fixed.
- ⚠️ `survey_responses` holds **1 row**, and it is a probe, not a lead: `12aca7e5-df3d-48cb-b59b-
  11e2f317206c`, created `2026-08-07 19:43:29Z`, all three answers filled, `email` NULL,
  `completed = false`, `s1 = 'SPK-7C62-26F6-2'`, `ttclid = 'SPRK-TEST-1786131799776'`. Somebody
  click-through-tested the live funnel and stopped at the activating step. **It carries no
  `SPK-TEST-0000` and no `@example.invalid`, so neither cleanup predicate in §6 catches it** — the
  ttclid is the only tell. Decide whether to delete it before real traffic starts, or it becomes a
  permanent phantom lead. (Earlier drafts of this file said "0 rows"; that was true at the moment it
  was written and stopped being true minutes later — re-count, never quote.)
- ⚠️ Open: D1 (failed insert loses the email silently), D2 (no fetch timeout), D3 (Enter double
  submit), D4 (email gate = money gate), D5 (`?completed=eq.false` mass patch), D6 (unrevoked
  DELETE/TRUNCATE), D7 (stale generator docstring), D8 (zombie CONCERNS), G1–G9 (assertion gaps).
  Hardening SQL written, **not applied**, step 1 **untested**.
- ℹ️ Still left as supplied and printed on every generator run: `fonts.googleapis.com`, "spent around
  $15", "within 6-10 days of registration". The print is guarded by `if (html.includes(needle))`
  (`ashlyn-apay.js:407`), so it is also the receipt that the CDN and the third-party project are gone.

---

## Close with the ELI5 recap (Migi's standing rule)

Her page asks three questions and then asks for an email. Before we touched it, that email went into
a stranger's database and the visitor **never reached the offer at all** — she'd have paid for clicks
and earned nothing, and nothing would have looked broken. Now the email lands in **our** database and
the visitor gets handed to our tracking door either way, even if the save fails. The key that does
the saving is printed right in the page — anyone can see it — so the database is set up so that key
can **write** a lead but can never **read** one back: ask it for an email address and it says
"permission denied". The trap to remember: the obvious way to do that (just don't let it read
anything) also stops it finding the row it is trying to update, and the server still says "OK" — so
every email vanishes with no error anywhere. The one thing that would undo all of it is somebody
running the single line of SQL that the error message itself suggests.
