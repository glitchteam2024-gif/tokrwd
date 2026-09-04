# TikTok server-to-server — CompleteRegistration on `mgfc`

Every CTA tap on the personal lander is reported to TikTok's Events API as a `CompleteRegistration` worth
$1.00 USD, matched on `ttclid`, through an n8n webhook. Two paths feed the same four-node workflow:

| Path | Fires from | Carries | Status |
|---|---|---|---|
| **B — page beacon** | the visitor's browser, on tap | `ttclid`, `_ttp`, real IP + UA, campaign/adgroup/creative | **live on the page**, beacon idle until `N8N_HOST` is set |
| **A — network postback** | Monetise's server, when it fires | `ttclid` (`{s2}`), event id (`{s3}`), payout | waiting on the network's macro syntax (Q2) |

Both share one `event_id`, so when both arrive TikTok collapses them into a single event.

## What is already in place

- `https://www.myrewardscorner.com/mgfc.html` carries the TikTok pixel (`DAD03V3C77UC8FLJKCOG`) and
  the Path B script in `<head>`. On every CTA tap it fires `ttq.track('CompleteRegistration')` from the
  browser **now**, and the server beacon the moment `N8N_HOST` is filled in.
- The page's offer builder forwards the click id to the network as `s2` and the shared event id as
  `s3` (Monetise/CAKE reads `s1..s5`), so the network can echo them back to n8n. Both are gated on a
  real click id: an untagged visit still ships the bare offer link.
- The token check passed against the real Events API on 2026-09-03: `{"code": 0, "message": "OK"}`.
- The token is **not** on the page. The browser side never needs it; only n8n and `test.sh` hold it.

## Setup, in order

1. **n8n** — import `n8n-workflow.json` (n8n → ⋯ → *Import from File*). Publish it. The top bar
   must read **Published** (green), not **Publish** (orange) — n8n unpublishes on every edit.
2. **Tell me the n8n host.** It is the one constant in the page (`var N8N_HOST = ''` at the top of
   the Path B script in `mgfc.html`). I set it and redeploy; the beacon goes live on the next tap.
3. **Network postback** — answer Q2 (macro syntax; click vs lead), then paste the matching line from
   `postback-url.txt` into Monetise. If their postback only fires on lead, Path A reports real
   conversions, not clicks — Path B is the click path either way.
4. **TikTok ad** — paste the URL from `ad-url-template.txt`. Do not add `ttclid=__CLICKID__`.
5. **Verify** (see below), then remove any `test_event_code` you added to Node 4 and republish.
6. **Rotate the token** (below) — it has been in a chat prompt.

## Verify — done means all four

```bash
./test.sh token  <TEST_EVENT_CODE>      # 1. code:0 from TikTok, event visible in Test Events
./test.sh webhook <N8N_HOST>            # 3. synthetic postback at the LIVE webhook
```

Then in n8n open the execution: every node green, the TikTok node's output shows `"code": 0`.
Then Events Manager → the pixel → Test Events shows `CompleteRegistration` with `value: 1`.
Then remove `test_event_code` from the Node 4 body, **check for the trailing comma it leaves**, republish.

`test.sh` stamps every id with the run time. TikTok dedupes on `event_id`; a re-sent id is
silently dropped and looks exactly like a failure.

## Gotchas

- `/webhook/`, never `/webhook-test/`. The test path only exists while *Execute step* is listening.
- Never send `ip` / `user_agent` on Path A. The request reaches n8n from the network's server, so
  those would be the network's IP and UA on every event and poison matching. TikTok's UI will
  suggest adding them — it assumes browser-side sending. The workflow only fills them when `src=page`.
- Never leave `test_event_code` in the live body. Removing it leaves a trailing comma behind —
  that exact mistake has broken a live workflow before.
- Do not add `ttclid=__CLICKID__` to the ad URL. TikTok appends `ttclid` itself; a second copy
  degrades attribution silently. The click id goes in `s2` instead.
- The spec's `s3` did double duty (campaign id on the ad URL in §3a, event id to the network in
  §4b). On Path B, `s3` to the network **is the event id** (`{s3}` → `txid`). Campaign / adgroup /
  creative reach n8n from the page beacon, so the network never has to echo them.
- The page trusts an inbound `s2` as a click id only when it has the `E.C.P.` shape, so a legacy
  publisher label in `s2` can never pose as one.
- The Path B script is on the **lander**, not the prelander. `mgfc-pre.html` must stay
  script-identical to its family (the audit hashes script bodies), and it forwards the whole query,
  so `ttclid` arrives on the lander anyway.
- The estate's offer-link guard normally allows exactly one param out. `mgfc.html` has a narrow
  exception for `s2` + `s3` that is **printed on every run** of `api/_lib/_offer-link.test.mjs`, so
  it cannot quietly become permanent. Nothing else relaxed.
- `tiktok-s2s/` is in `.vercelignore` — it carries the token and must never be served.
- The HTTP node builds the body with `JSON.stringify` in one expression rather than string-templating
  JSON, so a user-agent or id containing a quote cannot break the request.

## Rotating the token

Events Manager → the pixel → *Settings* → *Generate Access Token*. Then replace it in exactly two
places: the `Access-Token` header on the **TikTok Events API** node in n8n (republish), and
`ACCESS_TOKEN` in `test.sh`. The page needs no change — it never holds the token.

## Optimisation note

TikTok's value-based bidding ("Maximize Value") only unlocks on `CompletePayment` / `PlaceAnOrder`
type events with roughly 20 valued events in a rolling 7 days. `CompleteRegistration` optimises on count.
If that ever matters, `EVENT_NAME` on the **Config** node is the only switch.
- **Real ttclids are `E_C_P_…` (underscores), ~230 chars.** TikTok issues both `E_C_P_` and `E.C.P.`; the preview link uses dots. Every guard here (page `s2` fallback, n8n preview reject) accepts both. A guard that only knows `E.C.P.` silently drops every real click.
