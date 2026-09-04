# Restoring mgfc.html to Gravy Pass

> ✅ **ALREADY DONE — this restore was carried out on 2026-09-04.** `/mgfc.html` is Gravy Pass
> again. You do not need to run the command below unless the page moves off Gravy a third time.
>
> The page's full history in one day: Gravy Pass -> Reco Social (cap ran out) -> Playful Rewards
> (owner ran traffic there) -> **back to Gravy Pass**. The restore used `d96c011` plus the rounded
> full-bleed reward icons from `a4fe34f`, exactly as the "KEEP these four" section below prescribes.
>
> So the **"Reco (now)" column in every table below is historical** — it describes a state this
> page passed through, not where it is.
>
> Current state of `/mgfc.html`: `https://monetisetrk4.co.uk/?a=26648&c=56278`, **`s1`** dialect,
> TikTok S2S round-trip present, and its `ROUNDTRIP_EXTRAS` entry restored in
> `api/_lib/_offer-link.test.mjs`.
>
> ⚠️ **The offer link is the MONETISE one, not Prescott's** (`pcbdfv7trk.com/22PLLSZ/324QNSF/`,
> Everflow, reads `sub1`). Commit `9e84149` made that swap once; the owner restated it on
> 2026-09-04. The two are not interchangeable — the dialect follows the destination.
>
> **Playful Rewards did not go away.** It runs on the separate `/mgfc-pre2` -> `/mgfc2` pair,
> which this change does not touch. Both offers are live, one link each.

The owner ran out of Gravy Pass cap on **2026-09-04** and moved his personal lander
(`/mgfc.html`) to **Reco Social**. Nothing was deleted — the Gravy Pass page is intact in git.
This is how to get it back when cap returns.

## The one command

The last Gravy Pass state of the page is commit **`d96c011`**:

```bash
git show d96c011:mgfc.html > mgfc.html
```

That restores the offer link AND all the Gravy copy in one move. Then run the guards and deploy:

```bash
node api/_lib/_offer-link.test.mjs      # expect 28 passed, 0 failed
node api/_lib/_tracking-audit.test.mjs  # expect 11 passed, 0 failed
git add mgfc.html && git commit -m "revert(mgfc): back to Gravy Pass, cap restored" && git push origin HEAD:main
```

⚠️ Restoring wholesale also reverts the four IMPROVEMENTS listed at the bottom. Read those first —
you probably want to keep them and change only the offer link + brand words.

## What actually changed (2026-09-04)

### The money path — the only change that affects revenue

| | Gravy Pass | Reco Social (now) |
|---|---|---|
| `OFFER_LINK` | `https://monetisetrk4.co.uk/?a=26648&c=56278` | `https://monetisetrk8.co.uk/?a=26648&c=56065` |
| Network | Monetise / CAKE | Monetise / CAKE |
| Outbound param | `s1` | `s1` (unchanged) |

Both are Monetise/CAKE, so the **`s1` dialect stays the same** — a straight link swap is safe here.
It would NOT be safe swapping to an Everflow host (`pcbdfv7trk.com`, `phef6trk.com`, …), which reads
`sub1..sub5` and silently discards `s1`.

⚠️ **The network quotes these links with a trailing `&s1=`. STRIP IT.** `buildOfferUrl()` appends
`&s1=<value>` itself; two `s1` keys are read first-match by the tracker, so leaving it sends the
EMPTY one and loses every subid — with no error anywhere.

### Copy

| Where | Gravy Pass | Reco (now) |
|---|---|---|
| `<title>` | Start Earning — Gravy Pass | Start Earning — Reco |
| Step 1 | Activate & open your **Gravy Pass** / Tap **Activate Wallet Pass** below, then open your Gravy Pass in **Apple Wallet** | Activate & open the **Reco App** / Tap **Activate Highest Offers** below, then open the **Reco App** |
| Step 3 | Complete 3 tasks to unlock top offers … like **Paid to Scroll**, Roblox | **Download games & complete 3 offers** … like **Subway Surfers**, Roblox |
| CTA button | ACTIVATE WALLET PASS | ACTIVATE HIGHEST OFFERS |
| Subnote | Didn't add it yet? Tap above to add your **pass** again. | Didn't unlock yet? Tap above to activate again. |
| Activation box | Top offers stay locked until your **wallet pass** is active and you've completed 3 tasks. | Exclusive offers stay locked until **your account** is active and you've downloaded the games and completed 3 offers. Highest-paying open after ~**3 hours**, or instantly once **$20** spent in one game. |
| Green tick line | Complete tasks inside your Gravy Pass to make progress. | Spending $20 total in any one game unlocks the highest-paying offers straight away. |
| Reward card 1 | **TikTok** / Paid to Scroll / UNLOCK TIKTOK | **Subway Surfers** / Play & Earn / UNLOCK SUBWAY SURFERS |

Cards 2 and 3 (Clash Royale $28/hr, Roblox $35/hr) and the header lockup
(TikTok × `freecash-mark-green-on-dark.png`) were NOT touched.

### The 3-hour / $20 terms are RECO's, supplied by the owner
If Gravy Pass does not work that way, revert that paragraph with the page — do not carry those
claims onto a different offer.

## KEEP these four when you restore — they are fixes, not Gravy-specific

Reverting wholesale to `d96c011` loses them:

1. **Rounded, full-bleed reward icons** (`a4fe34f`). `.reward-tile img` was `30px` + `object-fit:contain`,
   so art floated inside the tile showing its own square corners — Roblox read as a hard blue square.
   Now `100%` / `cover` / `border-radius:11px`. Sources are all square so nothing crops.
2. **The S2S beacon is a GET** (`d96c011` — already in the restore point, keep it). `navigator.sendBeacon`
   always POSTs and the n8n webhook is GET-only; 246 real taps produced 0 server events before this.
3. **`CompleteRegistration` @ $1.00** and the whole `tiktok-s2s/` pipeline are offer-agnostic. No change
   needed on an offer swap.
4. **The subid trap note** above the offer link. Keep that comment whatever the offer is.

## The OTHER Gravy Pass landers were never switched

Still live on Gravy Pass (`monetisetrk2.co.uk/?a=26648&c=56278`) and untouched:

- `gravypassusa.html` — affiliate lander A (rewards-to-unlock stack)
- `gravypassusa2.html` — affiliate lander B (starter bonus)
- `GP/index.html` — the Choose Your Game picker

⚠️ Those are what AFFILIATES run. If Gravy Pass is capped, they are pointing at a capped offer too —
worth checking before assuming only the owner page was affected.

SPRK rows on **Gravypass - USA ONLY**, all `self_serve`, all still active:

| slug | capacity | link |
|---|---|---|
| `gravypass-us-rewards` | 100 | `myrewardscorner.com/GPR/US1` |
| `gravypass-us-bonus` | 100 | `myrewardscorner.com/GPS/US1` |
| `gravypass` (house) | 50 | `myrewardscorner.com/GP/GP1` |
| `gravypass-us-ravi` | 1 | `gravypassusa-ravi-pre.html` — ⚠️ link is NOT numbered, so `landerProblem` refuses it and the card never renders in the picker |

## Ad link (unchanged by any of this)

```
https://www.myrewardscorner.com/mgfc-pre?s1=<your subid>
```
