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

    ad ( ?s1=<SPK>&s2=<pub>&s3=<adacct>&s4=&ttclid= )  ->  lander  ->  door  ->  offer

**One hop. No prelander. No cloaking.** The lander renders the SAME markup for every visitor
(including ad-review crawlers) and forwards the whole query string to its door untouched. There used
to be an in-app-breakout **prelander** step in front of the landers — it was removed 2026-07-21
(see Changelog). Do not re-introduce a prelander/breakout hop without an explicit ask.

## Offer → door → canonical file → copies

Every numbered folder is a **byte-identical copy** of its offer's ONE canonical lander. Edit the
canonical, then propagate (see next section). `cleanUrls:true` in `vercel.json` serves `/FC` from
`FC/index.html`, `/50FC/FC1` from `50FC/FC1/index.html`, etc. — query string always survives.

| Offer        | Door / destination                         | Canonical file            | Byte-identical copies                              |
|--------------|--------------------------------------------|---------------------------|----------------------------------------------------|
| Freecash     | `sprktrax.org/api/link/freecash` (Path A)  | `FC/index.html`           | `FCTT.html`, root `index.html`, `50FC/FC1-50`, `50FCII/FC1-50` |
| Testerup     | `sprktrax.org/api/link/testerup` (Path A)  | `TU/index.html`           | `50TU/TU1-50`                                      |
| Copper       | `sprktrax.org/api/link/copper` (Path A)    | `CB/index.html`           | `CR50/CR1-50`                                      |
| Gravypass    | `sprktrax.org/api/link/gravypass` (Path A) | `GP/index.html`           | — (`GP/ob/` is a clean pass-through interstitial → `/GP/`) |
| Testerup ALT | `monetisetrk8.co.uk` DIRECT (Path B)       | `TSUP/index.html` + `js/tsup-offer.js` | —                                      |
| Reco Social  | `/api/reco` → montrk (Path B)              | `RS/index.html`           | `RS50/RS1-50` are interstitials that forward to `/RS/` (2 distinct variants: RS1 unique, RS2–50 identical) |

Naming gotcha: **CR50 folders serve the Copper (`CB`/`copper`) lander** — "CR" is a legacy folder
name, not a different offer. `50FCII` is a SECOND set of Freecash landers; keep it identical to `50FC`.

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

## How to change a lander (edit canonical + propagate)

Edits must land on the canonical file AND every copy, or the set drifts. From the repo root:

```bash
# Freecash — canonical is FC/index.html; propagate to FCTT, root, and all 100 numbered folders
for i in $(seq 1 50); do cp FC/index.html 50FC/FC$i/index.html; cp FC/index.html 50FCII/FC$i/index.html; done
cp FC/index.html FCTT.html; cp FC/index.html index.html
# Testerup / Copper
for i in $(seq 1 50); do cp TU/index.html 50TU/TU$i/index.html; done
for i in $(seq 1 50); do cp CB/index.html CR50/CR$i/index.html; done
# Verify each brand is ONE hash:
md5 -q FC/index.html FCTT.html index.html 50FC/FC*/index.html 50FCII/FC*/index.html | sort -u   # expect 1 line
```

`RS50` is special: RS1 is a unique interstitial, RS2–50 are identical; both variants just forward
the full query to `/RS/`. To strip a shared block from all 50 at once, use a Python exact-string
replace (the block is byte-identical across folders) rather than `cp` (which would clobber RS1).

The offer URL is built at runtime by an inline `<script>` (Path A) or `js/tsup-offer.js` (TSUP): it
reads `location.search`, optionally derives `s1` from `mc_attr` (MaxConv fallback — `f.e || f.c`,
and if neither exists it leaves s1 EMPTY, never fabricates one), and sets the CTA `href`. The CTA
markup stays `href="#"` so a pre-JS click can't fire a param-less door hit.

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

Repo-wide clean check (must return nothing outside `justincase/` and `SIGNAT~1/`):

```bash
grep -rlE "x-safari|intent://|googlechrome-x-callback|musical_ly|bytedance|__SUBID_OK|display:none!important" \
  --include="*.html" --include="*.js" . | grep -vE "/(\.git|justincase|SIGNAT~1)/"
```

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
