# CLAUDE.md — tokrwd (the landing pages)

Read first, every session. The details live in `.claude/skills/` (tokrwd-landers, sprk-custom-landers).

## ⛔ Hard rules — never overpass them

1. **A landing page is ONLY for its offer's own app.** Migi, 2026-10-06: *"if they are different apps then
   there offer then dont do it, you must always make sure the landing page is coherent and consistent with
   the offer"*. Name, logo, copy, rating, payout lines, store buttons and the destination are all that app's.
   A submission for a different app is skipped and reported — never built, connected, marked built, or
   rebranded to fit. Never repoint a page at another app's offer link. Check before building:
   `git -C ~/Documents/GitHub/SPRKNetworkAds fetch -q origin main && git -C ~/Documents/GitHub/SPRKNetworkAds show origin/main:.claude/skills/sprk-lander-submissions/scripts/offer-coherence.mjs > "$TMPDIR/offer-coherence.mjs" && node "$TMPDIR/offer-coherence.mjs" --page <file|url> --offer "<offers.name>"`
   — the only pass is its printed `COHERENT …` line; no output, or a missing or crashing checker, is NOT a pass.
2. **A landing page never names our network or us**, comments included (`_lander-leak.test.mjs`).

## Working rules

- Every push to `main` deploys. Run the guards in `api/_lib/*.test.mjs` against a pristine checkout first.
- A new network tracking domain needs its exact host in `GATE_DEST_HOST_RE` (`api/_lib/links-config.js`)
  in the SAME push as the pages, or every click 404s at our own `/click` gate.
- This file is excluded from deploys by `.vercelignore` — keep it that way.
