# Prompt — sweep landing-page fan-out + door wiring

> Paste below the line into Claude Code. Runs across two repos:
> `~/Documents/GitHub/tokrwd` (landers) and `~/Documents/GitHub/SPRKNetworkAds` (door + offers).

---

Wire up six sweep offers so affiliates can run traffic. The landers exist; the fan-out and the
database side do not.

**Read before writing anything:**
`CLAUDE.md`, `api/CLAUDE.md`, `docs/current-task.md`, `docs/error-log.md`, and the skills
`.claude/skills/sprk-new-offer/SKILL.md` + `.claude/skills/sprk-offer-intake/SKILL.md`.
**No push, deploy or production migration without Migi's explicit approval.**

## The pattern you are copying

`CR50` (Copper) is the reference. Verified 2026-07-26:

- `CR50/CR1` … `CR50/CR50` — **50 directories, each `index.html`, all byte-identical**
  (one md5 across all 50). Same for `50FC`/`50FCII` (Freecash, 2×50), `50TU` (Testerup), `RS50` (Reco).
- Every clone points at the **same door slug**: `https://sprktrax.org/api/link/copper`.
- The affiliate is identified by **`?s1=<SPK>` on the incoming ad link**, never by the path.
- The numbered URLs exist to spread the TikTok footprint — 50 distinct URLs instead of one URL
  hammered by every buyer, so a flag on one doesn't burn the rest.

Two exceptions you'll see, don't copy either: `Rewards/index.html` (Freecash) hits
`monetisetrk8.co.uk` **direct, bypassing the door**, and `RS50` routes via an internal
`/RS/` → `/api/reco` chain instead. Also note `RS50/RS1` differs from RS2–RS50 (49 share one hash,
RS1 has its own) — probably a stale edit; flag it to Migi, don't silently normalise it.

## Step 1 — generate the fan-out (tokrwd)

The generator is committed at `tokrwd/_lp-generator/build.js`. One command:

```bash
cd ~/Documents/GitHub/tokrwd
node _lp-generator/build.js --clones 50
```

Emits 306 files — 6 canonical pages plus 6 families of 50:

| Offer | Canonical | Fan-out | Door slug |
|---|---|---|---|
| Rewards - Shein $750 | `SHEIN/` | `SH50/SH1..SH50` | `shein` |
| Rewards - Sephora $750 | `SEPH/` | `SP50/SP1..SP50` | `sephora` |
| Rewards - Cash Prize | `CASH/` | `CS50/CS1..CS50` | `cash` |
| Rewards US - Apple Pay $750 | `APAY750/` | `AP50/AP1..AP50` | `applepay750` |
| Rewards US - Apple Pay $1000 | `APAY1K/` | `AK50/AK1..AK50` | `applepay1000` |
| Rewards UK - Uber Eats £50 | `UBER/` | `UE50/UE1..UE50` | `ubereats` |

The generator writes into `out/`. Move the six families to the repo root next to `CR50`/`50FC`, or
change `outDir` — do not leave them under `out/`.

To change copy or theming, edit the `BRANDS` array and regenerate. **Never hand-edit a clone** —
50 copies drift instantly, which is exactly how `RS50/RS1` ended up different.

Verify after generating:

```bash
find SH50 SP50 CS50 AP50 AK50 UE50 -name index.html | wc -l          # 300
for f in SH SP CS AP AK UE; do find ${f}50 -name index.html -exec md5sum {} \; \
  | cut -d' ' -f1 | sort -u | wc -l; done                            # 1 each
grep -rlE 'ftblltrck|afftrackr|montrk' SH50 SP50 CS50 AP50 AK50 UE50 | wc -l   # 0
grep -rL 'sprktrax.org/api/link' SH50 --include=index.html | wc -l   # 0
```

## Step 2 — the database side (SPRKNetworkAds / Supabase)

⚠️ **Do not guess the schema here. Read the live Copper and Freecash rows first** — they work, they
are the specification. The tables involved, from `resolveAffiliateOfferLinks` in `api/_lib/`:

- **`landing_pages`** — `slug`, `link`, `offer_id`, `status`, `enforce_assignment`. The door URL is
  `https://sprktrax.org/api/link/<slug>`.
- **`landing_page_affiliates`** — junction; rows with `status='active'` are what gate the click door
  when `landing_pages.enforce_assignment` is TRUE.
- **`lp_domains`** — active rotating domains, optionally scoped per `offer_id`, else global; oldest
  active wins. **This layer exists on top of the numbered paths** — confirm how Copper's 50 clones
  map through it before assuming the paths alone do the rotation.
- Per-affiliate overrides: `link_override`, `default_link` (`set_link_override`,
  `set_default_link`). All three link fields are screened by the shared `launchLinkProblem` oracle
  in `api/_lib/subid.js` at **both write and read** time — https only, no fragment, no embedded
  `s1=`. A rejected value silently refuses rather than shipping a smuggled SubID.

**The question to answer from the live data before writing anything:** does Copper have **one**
`landing_pages` row for slug `copper`, or **fifty** (one per numbered clone) with affiliates
assigned one each? Mirror whatever Copper does. Report the answer to Migi before creating rows.

### Order (from `sprk-new-offer` step 8 — do not reorder)

1. Create the `landing_pages` row(s) with **`enforce_assignment` FALSE**.
2. Populate `landing_page_affiliates` fully.
3. Populate `offer_assignments` fully — **separate roster**: `landing_page_affiliates` gates the
   click door, `offer_assignments` gates the postback hold.
4. Only when **both** rosters are mirrored, flip **both** flags (or neither).

Flipping either flag before its roster exists **404s every resolved owner / holds every
conversion**. Absence is not fail-open.

## Step 3 — verification per offer

```bash
# HEAD: 302s identically, writes NO clicks/lp_clicks rows
curl -sI 'https://sprktrax.org/api/link/shein?s1=SPK-TEST-0000'
```

- Location must reach the Monetise URL with the subid wire intact.
- Spend exactly **one** deliberate GET on the test code to confirm the click_id lands in `s5`
  (matches the account-global postback's `cid=#s5#`). That writes one ownerless `clicks` row plus
  one `lp_clicks` row — known residue. **Do not follow it through the network funnel** or you
  manufacture an unmatched conversion in your own audit.
- A bare lander URL with no `s1` must render (preview) while the door 404s.
- With a real registered SPK: expect the production wire — `s1=<bare aff id>`, `s2=<SPK>`,
  `s4=<offer name>`, `s5=<Name>.<click_id>`. That is correct, not broken.
- Spot-check three clones from different families resolve identically.

Already verified locally on the generated pages (headless, all outbound blocked):

| Input | Door URL produced |
|---|---|
| `?s1=SPK-ABCD-1234&utm_campaign=X&ttclid=E_C_P_xyz` | `…/api/link/shein?utm_campaign=X&ttclid=E_C_P_xyz&s1=SPK-ABCD-1234` |
| `?mc_attr=e=SPK-WXYZ-9999..c=foo` | `…/api/link/sephora?mc_attr=…&s1=SPK-WXYZ-9999` (fallback derived s1) |
| `?ttclid=__CLICKID__&s1=SPK-1111-2222` | `…/api/link/cash?s1=SPK-1111-2222` (unsubstituted macro dropped) |
| *(none)* | `…/api/link/ubereats?s1=` (door 404s — correct) |

## Step 4 — what still blocks live traffic

These six offers are **Draft** in SPRK and must stay Draft until:

1. **Per-geo destination routing ships.** Shein (US GB CA AU), Sephora (US GB CA AU) and Cash
   (US GB AU) each have one `destination_url` today, so every geo hits one country's link. The spec
   is in `CLAUDE-CODE-MASTER-PROMPT.md` Part A, and the per-geo maps are stored in each offer's
   `offers.notes` as JSON. Apple Pay ×2 and Uber Eats are single-geo and are **not** blocked by this.
2. **Caps.** All six are uncapped (correct — revshare offers have no cap per Monetise). Unrelated
   but outstanding: Prograd needs 20 conversions/day, and **Reco Social — already live — needs
   `cap_event = 'install'`**, not conversion.
3. Migi flips them Active. Not you.

## Reference

- Network **Monetise (CAKE)**, `network_id` `acfb1539-cc7f-4a78-9a1b-3b3ba9990662`.
- Postback is **account-global** and already correct:
  `…&s5=#s5#&cid=#s5#&payout=#price#&txid=#tid#`, matching `clickid_slot='s5'`. New offers inherit
  it — no per-offer postback work. Do not disturb the slot.
- Country codes are ISO **`GB`, not `UK`**.
- Monetise rotates **seven** tracking hosts (`montrk`, `montrk2`–`montrk5`, `monetisetrk4`,
  `monetisetrk8`). Interchangeable — do not normalise.
- **`&p=r`** rides revshare offer links. All six sweeps are revshare. Preserve it.
- tokrwd is **Vercel** (`vercel.json`), public at `https://www.tokrwd.co`. The
  `/functions/<slug>/_middleware.js` pattern on the old SHEIN page is Cloudflare syntax and does
  **not** run — geo injection needs a root `middleware.js` with a `matcher`.

## Done means

- 300 clones generated, one md5 per family, zero network URLs, every page routing through the door
- The Copper `landing_pages` question answered from live data and reported before any row is created
- Rows created with `enforce_assignment` FALSE and both rosters mirrored before any flag flips
- HEAD checks pass on all six slugs; at most one deliberate GET per slug
- Offers still Draft; nothing pushed or migrated without approval
- `RS50/RS1` divergence reported
- Close with: click-to-conversion trace, ELI5 recap, tests performed, attribution/money impact,
  security impact, remaining risks
