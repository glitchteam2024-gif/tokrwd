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

    ad ( ?s1=<SPK>&s2=<pub>&s3=<adacct>&s4=&ttclid= )  ->  /r  ->  /pre  ->  lander  ->  door  ->  offer

**No cloaking.** The lander renders the SAME markup for every visitor (including ad-review
crawlers) and forwards the whole query string to its door untouched.

**One prelander, in front of everything (added 2026-07-27 — Migi asked; TikTok's in-app webview
was failing on real devices).** `/pre` hands the visitor to their real browser before the offer
page. It is ONE page — `pre/index.html` + `js/breakout.js` — and no lander file contains any part
of it. See "The prelander" below before touching either. Prior history: an in-app-breakout
prelander per brand existed until 2026-07-21 and was removed for cloaking; the thing that made
those pages cloaking (`looksLikeReview()` → a different page for reviewers) is deliberately absent
from this one.

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
| Shein B2S $1,000 | door `shein-b2s-us` (Path A)          | `SHB2S/US/index.html`     | `SB50/US1-30` — US only, generated                |
| Sephora $750 | door `sephora-<geo>` (Path A)              | `SEPH/<GEO>/index.html`   | `SP50/<GEO>1-30` — US GB CA AU                    |
| Cash Prize   | door `cash-<geo>` (Path A)                 | `CASH/<GEO>/index.html`   | `CS50/<GEO>1-30` — US GB AU                       |
| Apple Pay $750 | door `applepay750-us` (Path A)           | `APAY750/US/index.html`   | `AP50/US1-30`                                     |
| Apple Pay $1000 | door `applepay1000-us` (Path A)         | `APAY1K/US/index.html`    | `AK50/US1-30`                                     |
| Uber Eats £50 | door `ubereats-gb` (Path A)               | `UBER/GB/index.html`      | `UE50/GB1-30`                                     |
| Freecash (per-geo) | door `freecash-<geo>` (Path A)         | `FCASH/<GEO>/index.html`  | `50FC/<GEO>1-30` — US GB CA JP DE AT NL           |
| Playful Rewards | door `playful-<geo>` (Path A)             | `PLAY/<GEO>/index.html`   | `PR50/<GEO>1-30` — US GB CA AU (English only)     |
| Reco Social  | `/api/reco` → montrk (Path B)              | `RS/index.html`           | `RS50/RS1-50` are interstitials that forward to `/RS/` (2 distinct variants: RS1 unique, RS2–50 identical) |

Naming gotcha: **CR50 folders serve the Copper (`CB`/`copper`) lander** — "CR" is a legacy folder
name, not a different offer. `50FCII` is a SECOND set of Freecash landers; keep it identical to `50FC`.

### Scaler landers (override-only, NOT in the table above)

Some landers are reachable **only** by `lp=<alias>` on an ad link — never by an `o=` key and never
from `LANDER_URLS`. That is the point: a scaler runs their own affiliate link, so no affiliate on the
network must be able to route traffic onto it. They are registered in `OVERRIDE_LANDERS`
(`api/_lib/links-config.js`), which is the only place the lander↔offer pairing is written down.

| Alias     | Folder  | Outbound hop                                    | Lands on                          | Owner                              |
|-----------|---------|-------------------------------------------------|-----------------------------------|------------------------------------|
| `lp=trt`  | `trt/`  | `appflowconnect.com/c/testerup-us-mon-off`       | montrk `a=26648 c=56132`          | Trae / TenX — scaler (aff #2)      |
| `lp=esgp` | `ESGP/` | `/c/esgp-off` (relative → `www.tokrwd.co`)       | `phef6trk.com/213T8QJ/32BB7QT/`   | Edwin — scaler, own affiliate link |

`ESGP` is also bound to `laboedomegan.carrd.co` by host (see `CARRD_ROUTES` below), so Edwin's ad links
need no `lp=` on them.

These use `mode:'direct'` on purpose: the payout is the scaler's, so the click must **not** walk the
SPRK door (which would resolve it to a SPRK affiliate and credit the conversion inside our network).
No clicks row and no click_id on this path, by design — they settle by invoice, and `sub1` carries the
spark code only so their reported volume can be reconciled against our traffic.

**`ESGP`'s hop is deliberately RELATIVE, and must stay that way.** `/c/esgp-off` resolves against
`www.tokrwd.co`, which is *this* repo's deploy — the one whose `OFFER_LINKS` actually contains
`esgp-off`. Rewriting it to `appflowconnect.com/c/esgp-off` for symmetry with `trt` would point it at
a SEPARATE deploy that has never heard of the slug, so it would 404 every one of Edwin's clicks. That
is the same class of failure as the old `buenohoodies.com` hop (see "EVERYTHING routes through our own
tracking" below): a slug only means something on the deploy that defines it.

`ESGP` is UPPERCASE and Vercel serves paths case-sensitively: the alias key is lowercase (`lp=` is
lowercased before the alias lookup) but `OVERRIDE_LANDERS.esgp.path` must stay `/ESGP`.

**Adding a scaler lander** — the whole checklist:
1. `<FOLDER>/index.html` — the page. Outbound goes to a **relative** `/c/<slug>`, never the network
   directly (keeps the affiliate URL out of page source and the hop on a deploy that knows the slug).
2. `OFFER_LINKS` += `{ slug, mode:'direct', destination:'<their link>', forwardParam:'sub1', enabled:true }`
3. `OFFERS` += `'<key>': { label, match: '/c/<slug>' }`
4. `OVERRIDE_LANDERS` += `<alias>: { path:'/<FOLDER>', offer:'<key>', owner:'<who>' }`
5. `node api/_lib/_links-config.test.mjs` — it reads the page HTML off disk and fails if the declared
   offer and the page's real `/c/` link disagree. Then `node api/_lib/_tracking-audit.test.mjs`, which
   fails if the page links straight to a network tracker or names a slug that is not enabled.

Nothing else. The admin **Test Lander** tab reads `OVERRIDE_LANDERS` from `/api/admin/data`, so the new
alias appears in its dropdown as `alias → Offer label · owner` automatically, where it gets paired with
a Carrd page + campid to produce the ad link.

### Partner links — one person, their page, their OWN affiliate link (2026-07-28)

**This is the answer to "assign a link to someone", and it is the first thing in this repo that
saves from the dashboard and actually routes.** `PARTNER_LINKS` in `links-config.js` is one row per
person:

```js
{ key:'fuomgi', owner:'…', carrd:'fuomgihatetiktok.carrd.co', lander:'esgp',
  code:'FUOMGI-01', destination:'https://www.phef6trk.com/213T8QJ/32BB7QT/', forwardParam:'sub1' }
```

**A row binds; it does not create.** It points at an *existing* `OVERRIDE_LANDERS` alias (or a
`LANDER_URLS` value), which already carries the offer, which already names an existing `/c/` slug.
Only `CARRD_ROUTES` is derived from it (`...PARTNER_LINKS.map(...)`, spread into the literal ABOVE
`CARRD_HOST_MAP` — pushing to the array after module load validates clean and routes nothing).

**Two people can share ONE lander on two different affiliate links.** The lander hardcodes one
`/c/<slug>`; `api/c/[slug].js` swaps the DESTINATION when the inbound sub-ID is a partner's code.
So `/ESGP` serves Edwin and the fuomgi page from the same HTML, on different accounts, with zero new
files and zero new slugs. Rules that make it safe, all tested:

- **The code is the routing key.** `partnerKey()` = `extractSparkCode()` + upper-case, used on write,
  on read, AND for the outbound sub-ID. If those three ever disagree, the click routes to one person
  while the payout claim names another. A code that does not round-trip is refused at write time.
- **Slug-scoped.** A code only overrides the slug ITS OWN lander fires. Otherwise
  `/c/frrcsh-us-off?campid=<their code>` would aim house traffic at their link.
- **Door-mode slugs are never partner-influenced** — those attribute inside SPRK at the door.
- **A miss is indistinguishable from a hit** on the house destination: a distinguishable miss is an
  oracle for enumerating partner codes.
- Lookup is a `Map` keyed `slug` + NUL + `CODE`, never a plain object (`?campid=__proto__`).

**Deriving OVERRIDE_LANDERS / OFFERS / OFFER_LINKS per partner does NOT work** — three separate
build checks reject it (a shared lander makes `offerForLander` return the first match; every partner
on `/ESGP` would have to claim the same `match` string; a per-partner `/c/` slug appears in no
lander's HTML). Derive `CARRD_ROUTES` only.

### Saving without a deploy — the datastore (2026-07-28)

`api/_lib/kv.js` (Upstash Redis over plain `fetch`, no npm) + `api/_lib/partner-store.js`.
**This is the thing that was missing every previous time the answer was "there is no database".**

- **Committed rows are the FLOOR and always win a collision** on key, host or `(lander, code)`. A
  stored row may ADD a person; it may never silently repoint one that is in source control — the
  tracking audit is a static read of the tree and cannot see Redis.
- **Three read outcomes, TWO of which mean "use committed config":** OK / UNAVAILABLE / ABSENT.
  `ABSENT` must never read as "there are no partners" — a flushed Redis would otherwise route every
  partner click to the house destination and look normal on every dashboard until invoice time.
- Every record is re-validated **on read** (`sanitizePartnerRow`, field-whitelisted, never spread).
  The lambda that saved it is a different process; the writer's validator is not in the reader's path.
- 30s in-lambda cache, `_inflight` coalescing, 250ms abort. `/r` reads the store **only** when
  committed routing returned `default`; `/c/` only for direct-mode slugs with a sub-ID. House traffic
  pays nothing.
- **Setup is Migi's, and env vars bind at build time:** Vercel → Storage → Create Database → Redis
  (Upstash) → Free → us-east-1 → connect to the project, **then redeploy**. Without it the panel
  still validates and emits the `PARTNER_LINKS` row to paste; `storage.enabled:false` makes the panel
  say so instead of pretending.
- **Writes fail closed.** `ADMIN_KEY` must be genuinely set in env — the committed `'sprk2026'`
  default is accepted for reads (so a deploy cannot lock Migi out) and never for writes. Optional
  `ADMIN_WRITE_KEY` is a second secret, held in memory only. Header-only (`X-Admin-Key`), origin
  checked, every mutation logged.
- `isSafePartnerDestination()` gates the operator-supplied URL: https, no userinfo, no port, no IP
  literal, no punycode, no private host, and **not a host we own** (a destination pointing back into
  our own funnel loops).

Tests: `node api/_lib/_partner-links.test.mjs` and `node api/_lib/_partner-store.test.mjs` (the
second stands up a stub Upstash and drives the REAL handlers, including the store-is-dead fallback).
Both are in `_tracking-audit`'s `SKIP_FILES` — their fixtures are network URLs by definition.

### The partner portal — `/portal` (2026-07-28)

**A second, separate front end for the SCALERS themselves** (Edwin, Osvaldo), so they stop needing
Migi in the loop to wire up a new Carrd page. `portal/index.html` + `api/partner.js` +
`api/_lib/partner-access.js`.

- **One static file, no server of its own.** It can be deployed as its own Vercel project (Root
  Directory = `portal`) and still work: it calls `https://www.tokrwd.co/api/partner` cross-origin,
  and the ACCESS CODE authorises the call, not the origin. Served from tokrwd it uses a relative
  path instead. That is why `/api/partner` is the one endpoint with `Access-Control-Allow-Origin: *`.
- **Access codes are not tracking codes.** A tracking code rides on every ad link — it is public by
  construction, so it could never be a login. An access code is separate, random, 20 chars from an
  alphabet with no `0/O/1/I/l`, and **only its SHA-256 is stored**. Shown once at mint time; the
  answer to "I lost it" is to mint another, which revokes the old one.
- **The code identifies you; it never selects who you are asking about.** `api/partner.js` resolves
  the partner ONCE, up front, and no action takes a partner key from the request. Passing
  `key: 'someone-else'` alongside a valid code changes nothing — asserted.
- **A partner may change their own Carrd pages AND their own offer link. Nothing else.** The
  lander and the tracking code stay the operator's: those two decide ROUTING and ATTRIBUTION and
  can collide with another partner, so they are read-only in the portal. Migi widened this on
  2026-07-28 ("my brother can put his carrd.co link and his affiliate offer") — the earlier build
  was pages-only.
- **The offer link is the one field a partner controls that points OFF our domain.** It lives in an
  `offers` map in the same document, is gated by `isSafePartnerDestination` on write *and* on every
  read, supersedes the row's destination (a committed row's included), and every change is logged
  with the value it replaced (`[partner] offer changed`). The panel labels it *"they set this"* and
  keeps the operator's original visible as `operator_destination`.
  **"Committed rows win" still holds for IDENTITY** — key, Carrd page, tracking code. A stored
  record can never impersonate a committed partner or take their traffic; it may only update where
  that partner's own clicks are sent.
- **A partner can never claim someone else's page.** Refused on write against committed rows, stored
  rows and other partners' hosts — and stripped again at merge time, where committed rows are
  assigned first. A silent accept would leave them looking at a page they think is wired while every
  click on it pays somebody else.
- Extra pages live in the `hosts` map of the SAME KV document as the rows, so they cost no extra
  round trip on the click path. **`writeStoredRows` carries `hosts` forward** — an admin saving one
  partner must not unregister every page every partner added.
- `portal` is in `RESERVED_LANDER_ROOTS`, for the same reason `admin` is: `lp=portal` would otherwise
  put paid traffic on a login screen.

Test: `node api/_lib/_partner-portal.test.mjs` (drives the real handlers against a stub Upstash).

### Binding a Carrd page to a lander (`CARRD_ROUTES`)

`lp=` puts the lander on the AD LINK. `CARRD_ROUTES` binds it to the **Carrd page's hostname**, so
every ad link on that page routes there with nothing extra on the URL. That is the durable way to give
someone a page: they get `https://theirpage.carrd.co/?campid=<code>` and never have to carry `lp=`.

    { host: 'laboedomegan.carrd.co', lander: 'esgp' },   // alias into OVERRIDE_LANDERS
    { host: 'somepage',              lander: LANDER_URLS.FCCA },  // or a standing lander

A row's `lander` is either a `LANDER_URLS` value **or an `OVERRIDE_LANDERS` alias**. The alias form is
what lets a Carrd page point at a scaler lander that is deliberately kept out of `LANDER_URLS` — see
`resolveRouteLander`, which also explains why the expansion is lazy (`CARRD_ROUTES` is declared above
`OVERRIDE_LANDERS`, so resolving in the array literal hits the TDZ).

Precedence is unchanged and matters: **`lp=` > campaign > `o=` > `CARRD_ROUTES` > default.** A host
binding is the standing assignment; `lp=` and `o=` still override it for a one-off test, which is why
you can test a new lander on an already-assigned page without unpicking the assignment.

Admin UI: **Test Lander → "Assign a Landing Page to a Carrd Page."** It lists the committed routes
(host → lander → offer → live/broken), resolves a proposed pairing through the real `resolveLander`,
warns when a host is already assigned (a duplicate host is dead config — the first row always wins),
and emits the `CARRD_ROUTES` line.

### Handing a lander to a scaler (admin: "Hand a Landing Page to a Scaler")

Same tab, below the assignment section. Pick a lander + the tracking code they settle against and it
shows: **two phones side by side — `1 Prelander`, then `2 Landing page`** — with `s1` applied, the
ad link to send them (from the host binding), every hop the click walks, and — the thing they
actually need — **which param their sub-ID arrives in at their own network**.

The same pair renders in **Assign a Landing Page to a Carrd Page** (under "What the visitor sees, in
order") and in the per-affiliate **🔗 Link** panel; Live Assignments has a Prelander column. All of
them come from `hndPhonePair()`, and all of the URLs come from the server — the prelander frame
carries `&preview=1`, and `js/breakout.js` also refuses to navigate when `window.top !== window.self`,
because without both the preview would escape-and-redirect itself inside the dashboard and both
phones would end up showing the lander. A missing left-hand phone is meaningful: it means no
prelander fronts that lander (kill switch off, or the path is outside `PRELANDER_ALLOWED_ROOTS`).

The hop chain comes from the server action `trace_chain` → `traceOfferChain()` in `links-config.js`,
which walks `offerForLander` → `OFFERS[].match` → `OFFER_LINKS[]` and builds the final URL with the
**same `buildDirectUrl`** `api/c/[slug].js` uses. That sharing is load-bearing: `buildDirectUrl` was
moved out of `api/c/[slug].js` into `links-config.js` precisely so the panel cannot promise a scaler a
sub-ID param the live redirect does not send. Never re-derive these URLs in the browser.

`traceOfferChain` fails loudly (`ok:false` + `reason`) when a lander is offer-unbound or its `/c/`
slug is missing/disabled, because both are silent in production — the click just 404s or lands
unattributed.

Two limits the UI states rather than hides:
- **The preview iframe needs same-origin.** Landers send `X-Frame-Options: SAMEORIGIN`, so the frame
  only renders when the dashboard is opened on `www.tokrwd.co/admin`. On `appflowconnect.com/admin`
  (an alias of the same deploy, but a different origin to the browser) it is refused — `hndPreviewBlocked()`
  detects that and shows an explanation plus an open-in-new-tab link, instead of an empty black box.
- **A lander with no Carrd page bound has no ad link to hand over.** The panel says so and gives the
  `?campid=…&lp=<alias>` form to append to a page you already run, rather than handing over a raw
  lander URL — that would skip `/r`, which is what filters bots and desktops.

### Per-person handover (admin: "Affiliates" table)

Each roster row carries `name, email, code, scaler, lander, carrd`. The **🔗 Link** button on a row
runs `trace_chain` for that person and shows their page previewed plus **the finished link to send
them**, with exactly the params it needs:

| Their Carrd page vs their lander | Generated link                                    |
|---------------------------------|----------------------------------------------------|
| bound in `CARRD_ROUTES`         | `https://host/?campid=CODE`                        |
| **not** bound                   | `https://host/?campid=CODE&lp=<alias>`             |

The server decides which form to emit (`handoff.needs_lp`), because getting it wrong is silent: a
missing `lp=` on an unbound page routes the click to the DEFAULT offer and credits the wrong one,
while a needless `lp=` is just noise on the link. The row itself shows `assigned` vs `needs lp=` so
the state is visible without clicking.

The roster is **localStorage** (`lm_test_affiliates`) — an operator address book, not routing, and not
the real affiliate roster (that lives in SPRK). Routing still comes only from committed
`CARRD_ROUTES`, which is why a row shows `missing` when its saved `lander` key no longer resolves: an
alias renamed in config would otherwise leave a row that silently builds a default-offer link.

**This roster and these two sections have no Save button, and still should not get one.** The admin
store is per-lambda in-memory (`api/_lib/store.js`), so a write here lands in the admin lambda's heap
and `/api/r` can never read it — the assignment would look saved while every click kept going to the
default offer.

**Partner Links is the exception, and it is the one that got the datastore.** See "Partner links"
above: it writes to Upstash, `/r` and `/c/` both read it, and committed rows still win. If the ask is
"let me assign a link to someone from the panel", that tab is the answer — do not re-derive the
"there is no database" explanation, and do not bolt a fake Save onto the sections here.

Gotcha when writing a scaler page: the clean check below greps for `display:none` carrying an
`!important` flag, because that is the blank-page cloaking gate's signature. A legitimate
show/hide utility class must therefore use plain `display:none` (raise specificity instead of
reaching for the flag) or it trips the canary and the next session treats the page as cloaked.

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

**Pattern 2 now exists on purpose, in exactly two files** — `pre/index.html` and `js/breakout.js`.
That is the sanctioned carve-out and nowhere else counts:
`node api/_lib/_tracking-audit.test.mjs` check 6 **fails the build** if a scheme jump, an in-app UA
test, `__SUBID_OK`, `display:none!important` or `document.write` appears in any other deployed file.
The old repo-wide grep was a doc note nobody ran; it is now a test.

## The prelander — `/pre` (2026-07-27)

`ad -> Carrd -> /r -> /pre?…&to=/CLFC -> lander -> door -> offer`

**Why it is one page and not 1000.** `/r` is the single choke point every routing rule already
funnels into (`lp=` > campaign > `o=` > `CARRD_ROUTES` > default), so `wrapPrelander()` wraps
whatever `resolveLander()` picked. Every rule gets a prelander; no lander file changed. Put the
breakout in the landers instead and you have re-smeared it over ~1000 files and lost the
containment test above.

    api/_lib/links-config.js   PRELANDER_ENABLED · PRELANDER_ALLOWED_ROOTS · wrapPrelander() · hopUrl()
    api/r.js                   wraps buildLanderUrl()'s answer — the ONLY wrap site
    pre/index.html             the card. Renders for everyone, identically.
    js/breakout.js             cleanPath / in-app detection / the escapes / the watchdog

**`PRELANDER_ENABLED = false` + deploy is the kill switch.** `/r` returns landers again and the
admin panel stops showing the hop. Nothing else has to change.

**Do NOT wrap inside `buildLanderUrl()`.** That function answers "what is the lander URL", and the
admin panel, the tests and `traceOfferChain` all depend on that answer being the lander.

**Read hops by STEP NAME, never by index** — `hopUrl(chain, 'Their network')`. The prelander shifts
every later position, and `api/admin/data.js` used `chain.hops[0].url` for `preview_url`, which
silently became the prelander the moment a hop went in front of it.

### The rules the page holds to (all four are tested)

1. **One destination for everyone.** No UA/IP/bot check ever changes where the visitor goes — only
   which mechanism opens it. A crawler takes the same branch a desktop buyer does.
2. **One page for everyone.** No gate, no blanking, no `document.write`. There is deliberately no
   `looksLikeReview()` — *that*, not the scheme jump, is what made the 2026-07-21 prelanders cloaking.
3. **The scheme fires only inside a detected webview.** `x-safari-https://` in real Safari renders
   "the address is invalid" and replaces the document, which would kill the watchdog with it and
   lose the click. Real browsers get a straight `location.replace`.
4. **The click is never lost.** Escape worked, escape blocked, user tapped, or the 6s watchdog
   fires — every path ends on the lander.

### `to=` is the security surface

It is read by a STATIC page with no server in front of it. Both of these were live holes in the
first cut, so do not relax the checks:

- `to=//evil.com/x` satisfies `^/[A-Za-z0-9._/-]*$` **and** `new URL()` resolves it off-origin. The
  charset is not the control — collapsing leading `/` and `\` **before** resolving is.
- `to=/pre` looped forever; `to=/c/<slug>` was a public way to fire our redirector with a chosen
  sub-ID and no ad spend. Hence `PRELANDER_ALLOWED_ROOTS` (an allowlist, not a denylist) plus
  `RESERVED_LANDER_ROOTS` in `cleanLanderPath`.

`RESERVED_LANDER_ROOTS` also fixed a pre-existing hole in `lp=`: **`lp=admin` used to resolve**, so
an ad link could put paid traffic on the dashboard. Reserved paths now fall THROUGH to normal
routing rather than resolving, so the click still converts.

**Adding a lander folder?** Add its first path segment to `PRELANDER_ALLOWED_ROOTS` *and* to
`ALLOWED_ROOTS` in `js/breakout.js` — `_links-config.test.mjs` pins the two lists together. Forget
it and the lander silently loses its prelander (fail-open: the click still lands).

### Known limits — say these out loud rather than rediscovering them

- **Rollout tail.** The Carrd embed caches `/r`'s answer in `sessionStorage` (`_rurl_<campid>`) and
  reads it *before* it POSTs, so an in-session visitor keeps the old direct-lander URL. Self-heals
  when the session ends. It cannot be fixed from this repo — `admin/carrd-script.js` is one big
  comment; the live code is pasted into each Carrd page by hand.
- **iOS escape is best-effort.** WKWebView hosts drop unregistered schemes silently. The visible
  "Open in my browser" tap, the instructions and Copy link are the reliable route; the scheme is a
  bonus. Android's `intent://` carries `S.browser_fallback_url` and encodes `#`/`;`, without which
  a `#` in a forwarded `ttclid` truncates the target.
- **`/pre` scores over BLOCK_THRESHOLD on our own `api/signatures.js`.** Expected — the detector's
  job is to find this mechanism, and this is the one place we run it deliberately. `to` is listed in
  `DEST_INJECTION` on purpose, so the detector scores our page the way it scores anyone else's.
- **Forced browser escape is its own TikTok policy question**, separate from cloaking. Migi's call,
  made 2026-07-27; `PRELANDER_ENABLED` is the lever if it needs reversing.

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
## Testerup runs the /trt design — `_lp-generator/testerup.js`

`50TU/TU1..TU50` is the **/trt page** ("Choose Your Game" video picker → claim screen), which is the
design Migi wants every affiliate on.

```bash
node _lp-generator/testerup.js --clones 50
```

⚠️ **The design came from /trt; the WIRING did not.** /trt's own CTA goes to
`appflowconnect.com/c/testerup-us-mon-off?campid=` — our own cloaker domain, but it emits `campid`
and **never `s1`**, so it skips the door: no click_id, no clicks row, no owner frozen at click time.
The generator swaps that for the door builder (`sprktrax.org/api/link/testerup`, every param
forwarded, `s1` last), and promotes `?campid=` → `s1` so a Carrd-sourced click still resolves an
owner. If neither exists `s1` stays empty and the door 404s it — never fabricated.

**ONE page, no geo fan-out.** Testerup sells US/GB/CA behind a SINGLE Monetise link (c=56132 — the
network splits the geo its side), so `landing_pages.geo` is NULL for it and there is no per-geo link
to route to. Splitting it per geo would add three slugs resolving to the same destination while
stamping a guessed geo on every clicks row.

**`/trt` itself is left alone** — it is registered in `OVERRIDE_LANDERS` (Trae / TenX) and pinned by
`_links-config.test.mjs` to fire `testerup-mon` through that `/c/` hop. Only `50TU/` is generated.

## Shein Back to School is a SEPARATE offer, not a Shein variant

```bash
node _lp-generator/build.js --only SHB2S --clones 30    # SHB2S/US + SB50/US1-30
```

Offer *"Rewards US - Shein $1000 Back to School"*, US only, $1,000. It shares SHEIN's wordmark and
theme deliberately — it IS Shein, and an affiliate should recognise it instantly. What separates them
is the amount and the **campaign badge**.

⚠️ **It has its own offer row, its own door slug (`shein-b2s-us`, not `shein-us`) and its own
`landing_pages` row.** Sharing SHEIN's slug would collapse both offers onto one row and credit every
Back-to-School conversion to the standing $750 offer. They are NOT two geos of one thing — and note
both are geo `us`, so the per-geo assign guard will 409 if you try to put one affiliate on both. That
409 is correct behaviour, not a bug to work around.

**`badge` is now a per-brand override in `build.js`.** It defaults to the language's seasonal string
(`2026 Summer Drop`); a brand sets its own when the OFFER is the campaign. Adding it exposed a real
bug: `TITLES` carried a SECOND hardcoded copy of the season, so the first build rendered
"Back to School 2026" in the badge and "2026 Summer Drop" in the tab and every link preview — two
campaign names for one page. `TITLES` now interpolates `{badge}`, so they cannot disagree. (The old
`ja` title had already drifted from the `ja` badge by a space, which is what a duplicated constant
always eventually does.) Verified: regenerating all 1,147 sweep files changes **nothing** outside the
new B2S dirs — the override is genuinely opt-in.

The badge override is English-only. `SHB2S` is US-only so that is moot today; if a non-English geo is
ever added to a custom-badge brand, make `badge` a per-language map first or an English badge ships
onto a translated page.

## Playful Rewards is the /trt design in purple, PER GEO — `_lp-generator/playful.js`

```bash
node _lp-generator/playful.js --clones 30      # 4 geos x (1 canonical + 30 clones) + bare /PLAY = 125 files
```

**Geo is the unit, exactly as with Freecash.** `PLAY/<GEO>/index.html` + `PR50/<GEO>1..30` for
**US GB CA AU** — English only. One geo picks the language AND the door slug `playful-<geo>`, so a
page cannot render in one language and hand the visitor another geo's offer.

⚠️ **FR and DE are BUILT AND TRANSLATED BUT SWITCHED OFF, and the reason is creative, not copy.**
The two claim-screen videos are **English-language UGC**. A French visitor would read French copy and
then watch two people speak English on the page's most prominent proof element — that reads as a scam
page and converts worse than not running the geo. Migi pulled them 2026-07-30. `T.fr` and `T.de` stay
in `playful.js`, complete and reviewed; re-enabling is ONE COMMENTED LINE EACH in `GEOS` the day there
is localised video (or the videos come off the claim screen for those geos). **Do not re-translate
from scratch** — see the purpose-vs-promise section below for why that wording was expensive. `?lg=<GEO>` is the affiliate's geo selector and keeps the
clone index (`/PR50/US7?lg=DE` → `/PR50/DE7`); `lg` is stripped before the door because it routes the
lander, not the network. No runtime geo detection anywhere — not cloaking, it keys off an explicit
query param and renders identically for crawlers.

**No money on this page**, so unlike Freecash there is no currency question at all — the only numeric
strings are "2 offers" and "2 minutes". Don't add a figure to "localise" it.

⚠️ **`PR50/PR1..PR50` (the old single-geo pool) was DELETED when the geo pools landed.** Keeping both
would put two same-geo pools on one offer, which is the `50FC/FC1-50` vs `50FC/US1-30` trap — the
per-geo affiliate guard refuses the same affiliate on two same-geo landers. The bare `/PLAY` survives
as a byte copy of `PLAY/US` so the `lp=play` / `lp=playful` aliases, the admin preview and any link
already handed out keep working. `?lg=` cannot re-route from `/PLAY` (no geo segment in the path for
the regex to swap) — fail-safe, and real traffic lands on `PR50/<GEO>n` where the geo IS in the path.
`OFFERS.playful.match` therefore names `playful-us`, not a bare `playful` slug — there is no bare one.

⚠️ **Payment rails are per-geo (`rail2` on each `GEOS` row), because Cash App is US/GB only.**
The claim screen's second video caption used to say "paid via Cash App" for everyone — false anywhere
else, where it promises a rail the visitor cannot use.

| `rail2` | geos | caption names |
|---------|------|---------------|
| `cashapp` | US, GB | Cash App |
| `paypal`  | CA, AU | PayPal — Migi's call 2026-07-30 |
| `wallet`  | spare  | no payment brand at all; restates the page's own step-3 claim |

On CA/AU **both** captions read "paid via PayPal", since caption 1 is always PayPal. That is accurate
(two people, one rail), not a bug — don't "fix" it by inventing a second rail.

**`RAIL_MARKETS` is the guard that matters, and it is about the world, not the code.** The per-page
assertion only proves the emitted caption matches the config — useless if the config itself names a
rail the market cannot use. `rail2:'cashapp'` on CA passed every other check. It now fails the build:
*"rail2 cashapp does not operate there … Available in: US, GB"*. Extend those sets ONLY against a real
source; a wrong entry is a false payment claim on a live page.

**This generator PRUNES, and it is the only one here that does.** Output is a pure function of
`GEOS` + `--clones`: it deletes any `PLAY/<GEO>` or `PR50/<GEO><n>` the current config no longer
emits. Turning FR/DE off otherwise left 62 live orphan folders — still deployed, still serving, never
regenerated again, walking a door slug the offer no longer sells. That is the RS50/RS1 drift shape
with worse consequences. The prune is scoped to this family's own `<GEO>` / `<GEO><n>` name shape so
it can never reach another offer's folders, even though `PLAY` and `PR50` are shared roots. Verified
idempotent across three consecutive runs.

### Translation rule learned here — purpose vs promise

Both a native-speaker review and a compliance review independently caught the same drift in the first
FR and DE drafts, and it is the thing to watch on every future translation:

> English says "Pick a game **to start** earning" — a PURPOSE infinitive. Picking is the means toward
> a possibility. Both drafts rendered it as coordinated imperatives — "Pick a game **and** earn" —
> which German ad review in particular reads as a conditional promise: *do this and you get that.*

Every instance is now `um … zu` / `pour + infinitif`. **A translation must never claim more than the
English it was approved from.** Two more of the same family, both fixed and worth not undoing:
- DE `importantBody` once ended `…Subway Surfers und vielen mehr Geld zu verdienen`, putting **"mehr
  Geld" adjacent** — a German reader parses that comparative first ("earn MORE money"), but the
  English "and more" modifies the GAME LIST. Word order alone manufactured an earnings claim.
- Both `<title>`s are the bare brand, matching the English. A localised tagline would put a claim in
  the title the English title does not make.

The generator asserts translated endorsement strings too (`Vérifié par TikTok`, `Von TikTok
verifiziert`, `TikTok-geprüft`, `500.000`) — the English needles alone would not catch a translated
false claim, and the tracking audit greps English only.

`playful-template.html` is a FORK of `testerup-template.html`, not a translation of it — Migi asked
for "the Testerup landing page made into Playful Rewards, purple, keep the Block Blast logo". Four
things changed: the palette (orange → the brand's own `#7c3aed`/`#9333ea`/`#a855f7`, `#c084fc` accent
text, `#0a0014` page), the brand mark, the door slug (`testerup` → `playful`), and — asked for in a
follow-up, "keep the background structure of Playful/index because it looks cool" — **that page's
background treatment ported on top**: the 40-dot twinkling particle field (`.bg-canvas` / `.particle`
/ the loop at the foot of the template), the gradient hero text clipped to the title on both screens,
and the glowing app-icon ring on the brand mark. The game grid is untouched — Block Blast, Candy
Crush, Subway Surfers, Roblox, same icons, same 2-offers unlock.

The `.bg-canvas` div sits OUTSIDE both `.screen` sections so the field survives the picker → claim
toggle instead of being rebuilt per screen, and the loop appends one DocumentFragment rather than 40
separate nodes. None of it is a cloaking surface — it reads nothing about the client and renders
identically for a buyer and an ad-review crawler — but the generator asserts all of it, because
losing a decorative block to a stray edit is invisible in a diff of 51 generated files.

**The logo is real, not invented.** `images/playful-rewards-logo.png` was extracted from the base64
PNG that the orphaned `Playful/index.html` had inlined — it is the actual app icon, and the same mark
the offer tile uses. Don't regenerate it; and if a tile is ever needed, `sprk-offer-tiles` can use it.

**The header is MARK ONLY — no visible "Playful Rewards" wordmark.** Migi had it removed 2026-07-30;
it shipped with one for about an hour. `alt="Playful Rewards"` stays on the `<img>` — that is
screen-reader and crawler text, not a visible title, and stripping it would leave the brand nameless
to both. Don't "restore" the wordmark as a fix for the header looking sparse.

**Two copy strings deliberately diverge from the Testerup page, and both are compliance:**
- `Verified by TikTok` → `Free to download`. A platform endorsement TikTok never gave is a false
  third-party claim, and reproducing it onto a new page is authoring it. The pill itself is kept.
  (First cut said "Free on iOS & Android" — walked back, because nothing we hold substantiates that
  Playful Rewards ships on Google Play. Don't name a store we haven't checked.)
- `Trusted by over 500,000 users …` → a line with **no number**. That figure is Testerup's; aiming it
  at Playful Rewards invents a statistic (No False Earning Claims). Swap in a real one if we get it.

Both are single strings in the template. The generator ASSERTS both are absent, so a future edit that
re-adds them fails the build instead of shipping.

**The generator stats every local asset it references** (`assertAssetsExist`), because a `must()` on
the path STRING passes happily while the file is missing or renamed case-only — and macOS is
case-insensitive, so that bug is invisible locally and 404s on Vercel. Verified to bite: renaming the
template's ref to `/images/Roblox.jpg` fails the build naming the real on-disk casing. It also asserts
every element id the wiring script touches (`backBtn` included) — `getElementById('backBtn')` runs
BEFORE the CTA href is set, so a typo there would ship 51 landers with a dead `href="#"` CTA while the
generator printed success.

⚠️ **`lp=Playful` used to leak a paid click off-network, and the fix is why there are TWO aliases.**
The offer key is `playful` while the lander alias is `play`, so `lp=playful` is the likeliest thing an
operator types — it is the name the admin picker shows. Unregistered it fell through to free-form path
resolution, where `lp=playful` → `/playful` 404s and **`lp=Playful` → `/Playful`, the still-deployed
orphan redirector that exits via `/api/affrkr` to affrkr.com** — no door, no click_id, and every
dashboard looks normal. `OVERRIDE_LANDERS.playful` now points at the same `/PLAY`; because `lp=` is
lowercased before the alias lookup, that one row captures `playful`/`Playful`/`PLAYFUL`. Cost is a
duplicate row in the admin picker. The other fix — adding `Playful/` to `.vercelignore` — would
un-deploy a live page with unknown external inbound links, so it stays **Migi's call**.

**Still Testerup-specific and needs replacing when Playful creative exists:** the two claim-screen
videos are the Testerup clips (the second one's on-screen caption literally says "the tester…").

**One page, no geo fan-out** — same call as Testerup. The offer sells US/GB/CA/AU/FR/DE, but until we
know there is a per-geo network link, six slugs resolving to one destination would just stamp a
guessed geo on every clicks row. FR/DE also need translated copy before they get a page.

⚠️ **`PG50` is Prograd, not Playful** — a live naming trap, which is why this family is `PR50`.

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

The prelander sits in front now, so also load it and confirm the whole chain:
`http://localhost:8899/pre/index.html?s1=SPK-TEST-0001&s3=acct7&ttclid=TT1&to=%2F50FC%2FFC1` —
a desktop browser must land on the lander with `s1`/`ttclid`/`s3` intact, **no `to=` on the door
URL**, and `&preview=1` must render the card without navigating (that is the admin iframe path).

Run the suite. All four must be green — the last two are the prelander's:

```bash
for t in _links-config _tracking-audit _traffic-filter _prelander-page; do node "api/_lib/$t.test.mjs" | tail -1; done
```

The old repo-wide clean grep is now **check 6 of `_tracking-audit.test.mjs`**, which strips comments
first (so `js/safe.js` saying it avoids `document.write` no longer reads as using it) and allows the
scheme patterns only in `pre/index.html` + `js/breakout.js`. Run the test rather than the grep — the
grep flagged those two sanctioned files and every comment mentioning the patterns.

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
- **2026-07-27** — Added `ESGP/` — Edwin's scaler lander (Gravy Pass / Apple Wallet angle), reachable
  only by `lp=esgp`. New `/c/esgp-off` direct link → his own affiliate URL; new `OFFERS` key
  `gravypass-esgp`. Documented scaler override landers (section above) — they were undocumented, `trt`
  included. The page as supplied POSTed every funnel step to a third-party `gammastudio.xyz` endpoint
  and linked the network URL in plain page source: both replaced by our own `/c/` hop (see the
  "our tracking only" rule). Also fixed on intake: a double-`?` that made the outbound URL malformed,
  a `window.open` with no popup-blocked fallback (silently ate the click in in-app browsers), and
  hotlinked freepik/gstatic/jsdelivr logos repointed at local `/images/`.
- **2026-07-27** — `CARRD_ROUTES` rows may now name an `OVERRIDE_LANDERS` alias, not just a
  `LANDER_URLS` value (`resolveRouteLander`), so a Carrd page can be bound to an override-only scaler
  lander. Bound `laboedomegan.carrd.co` → `esgp`. New admin section **Test Lander → Assign a Landing
  Page to a Carrd Page** (lists committed routes, resolves through the real router, emits the config
  line, no fake Save). `/api/admin/data` now returns `carrd_routes`, `routable_landers`, `lander_urls`
  and `carrd_route_problems`. Confirmed while doing this: **`appflowconnect.com` is an alias domain of
  this same Vercel project** — the Carrd embed posts to `appflowconnect.com/r`, which runs this repo's
  `api/r.js`, so this repo's `CARRD_ROUTES` is what that traffic follows.
- **2026-07-27** — **`/pre` prelander in front of every landing page** (Migi: TikTok's in-app browser
  was failing on his phone). New `pre/index.html` + `js/breakout.js`; `wrapPrelander()` in
  `links-config.js` applied at the single `/r` choke point, so `lp=`/campaign/`o=`/`CARRD_ROUTES`/
  default all get one and **no lander file changed**. `traceOfferChain` gained a `Prelander` hop, and
  every consumer now reads hops by name (`hopUrl`) instead of by index. Admin shows the prelander
  BESIDE the landing page in all three panels + a Prelander column on Live Assignments.
  Closed while doing it: `to=//evil.com` was a live open redirect, `to=/pre` looped, `to=/c/<slug>`
  minted clicks for free — and, pre-existing, **`lp=admin` resolved**, so an ad link could route paid
  traffic to the dashboard (`RESERVED_LANDER_ROOTS` now makes those fall through). New tests:
  `_prelander-page.test.mjs` (executes the SHIPPED `js/breakout.js` against a fake DOM; also
  syntax-checks the admin panel's inline script, after a backtick inside an HTML comment silently
  killed the whole dashboard) and audit check 6 (breakout code confined to the two sanctioned files).
- **2026-07-28** — **Partner Links** (Migi asked repeatedly; every previous answer was "there is no
  database"). New `PARTNER_LINKS` table, new `api/_lib/kv.js` + `api/_lib/partner-store.js`, new admin
  tab. One row = a person + their Carrd page + an existing lander + THEIR OWN affiliate link + their
  tracking code; the code is the routing key and `api/c/[slug].js` swaps the destination on it, so one
  lander serves many partners on different accounts. `CARRD_ROUTES` is now derived from it (Edwin's
  hand-written row deleted, behaviour proven identical). `fuomgihatetiktok.carrd.co` → `/ESGP` →
  `phef6trk` shipped as a committed row. Hardened while doing it: writes fail closed on an unset
  `ADMIN_KEY` (the committed `'sprk2026'` default is reads-only now), header-only auth + origin check
  + audit log, `isSafePartnerDestination`, `carrdHostsForLander` gained a partner scope (unscoped it
  handed one person a link on another's Carrd page — which, under per-code routing, *works*), and
  `ESGP/index.html`'s `localStorage` sub-ID replay got a 30-minute TTL (per-origin storage on a shared
  lander would otherwise route a returning device to the previous partner's link). `overrideLanderProblems`
  and `offerKeyProblems` now reach the panel; they were exported and called by nothing.
- **2026-07-30** — **Playful Rewards fanned out per geo** (`PLAY/<GEO>` + `PR50/<GEO>1-30`, door
  `playful-<geo>`, `?lg=` router). Built for six geos with reviewed FR/DE translations, then cut to
  **US GB CA AU** on Migi's call — the claim-screen videos are English UGC and would confuse a FR/DE
  prospect on the page's main proof element. FR/DE string tables retained in the generator, one
  commented line from returning. Retired the old single-geo `PR50/PR1-50` pool (two same-geo pools on
  one offer is the `50FC/FC1-50` trap). The generator now PRUNES output the config no longer emits —
  the FR/DE cut would otherwise have left 62 live orphan folders. Fixed a gap in someone else's
  Apple Pay/Flash Poll/Apple Cash commit while merging: `ac50`, `acash`, `af50`, `apayfp` were missing
  from `PRELANDER_ALLOWED_ROOTS` + `js/breakout.js`, so four live lander families were silently
  running with no prelander — fail-open, so clicks landed, but the in-app breakout never fired.
- **2026-07-30** — **Playful Rewards lander** (Migi: "the Testerup landing page, made into Playful
  Rewards, purple, keep the Block Blast logo"). New `_lp-generator/playful.js` +
  `playful-template.html` → `PLAY/index.html` + `PR50/PR1..PR50` (51 files, one md5), door slug
  `playful`, plus the old `Playful/index.html` background treatment (particle field + gradient hero +
  glowing brand mark) ported on top at Migi's request. Registered `OFFERS.playful` +
  `OVERRIDE_LANDERS.play` (house, not a scaler) so it is
  previewable/handoverable from the admin panel and pinned by the build test; `play`/`pr50` added to
  `PRELANDER_ALLOWED_ROOTS` **and** `js/breakout.js`. Logo extracted from the base64 inlined in the
  orphaned `Playful/index.html` — the real app icon, nothing invented. `_lp-generator` added to the
  tracking audit's `SKIP_DIRS`: it is already in `.vercelignore`, and a generator must NAME the
  cloaking patterns it refuses in order to refuse them; the files it WRITES are still scanned, which
  is what actually deploys. Hardened after an adversarial pre-deploy review: the second `playful`
  alias closing the `lp=Playful` → affrkr leak (see the ⚠️ above), `assertAssetsExist` in the
  generator, element-id assertions, the brand mark wired as favicon + apple-touch-icon, and the admin
  lander pickers relabelled `Scaler landers (override-only)` → `Override-only landers (lp= / scalers)`
  because `play` is the first override entry that is a HOUSE page, and the `tlAffLander` picker
  renders only name → offer, so it read as somebody's private scaler page.
  **Blocked on Migi's side before traffic:** the offer is still Draft with no payout, and
  `landing_pages.slug = 'playful'` does not exist yet — until it does the door 404s every click.
  **Known, inherited, NOT introduced here** (all byte-identical to live `50TU/TU1`, so fixing them is
  a family-wide decision): the CTA click handler recomputes the door URL and so discards the `ttclid`
  that `js/ttclid.js` backfilled into the href; the claim screen says "paid via PayPal / Cash App"
  above the CTA and "No cashout apps" below it, which contradict; the `TikTok × brand` header lockup
  still implies a partnership even with the "Verified by TikTok" string removed; and
  `*{animation:none!important}` misses `::before`/`::after`, so `drift` and `sweep` keep animating
  under prefers-reduced-motion.
- **2026-07-27** — Admin section **Hand a Landing Page to a Scaler**: iframe preview of the lander with
  `s1` applied, the ad link to send, the full hop chain, and the sub-ID param their network receives.
  New `traceOfferChain()` + `carrdHostsForLander()`; new admin action `trace_chain`. **`buildDirectUrl`
  moved from `api/c/[slug].js` into `links-config.js`** so the panel and the live redirect share one
  builder — verified byte-identical against the production redirect before and after the move.
