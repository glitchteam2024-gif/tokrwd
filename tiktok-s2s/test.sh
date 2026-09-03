#!/usr/bin/env bash
# TikTok S2S — verification, §5 steps 1 and 3.
# IDs are stamped with the run time so every call is unique: TikTok DEDUPES ON event_id, and
# re-sending a used id is silently dropped and looks exactly like a failure.
#
#   ./test.sh token   [TEST_EVENT_CODE]        step 1 — token check straight at TikTok
#   ./test.sh webhook <N8N_HOST>               step 3 — synthetic postback at the LIVE webhook
#   ./test.sh all     <N8N_HOST> [TEST_EVENT_CODE]
set -euo pipefail

PIXEL_ID='DAD03V3C77UC8FLJKCOG'
ACCESS_TOKEN='745f33c689d87336d89bdb7afebe4c4f11219508'
EVENTS_API='https://business-api.tiktok.com/open_api/v1.3/event/track/'
RUN="$(date +%s)"

step_token () {
  local code="${1:-}"
  local test_field=''
  if [[ -n "$code" ]]; then test_field="\"test_event_code\":\"$code\","; else
    echo "note: no TEST_EVENT_CODE given — this lands as a LIVE event on the (disposable) pixel." >&2
    echo "      Get the code from Events Manager → the pixel → Test Events to see it there instead." >&2
  fi
  echo "── step 1: token check  (event_id cc-test-$RUN)"
  local resp
  resp=$(curl -s -X POST "$EVENTS_API" \
    -H "Access-Token: $ACCESS_TOKEN" -H 'Content-Type: application/json' \
    -d '{"event_source":"web","event_source_id":"'"$PIXEL_ID"'",'"$test_field"'"data":[{"event":"ClickButton","event_time":'"$RUN"',"event_id":"cc-test-'"$RUN"'","user":{"ttclid":"cc-test-ttclid-'"$RUN"'"},"properties":{"value":1,"currency":"USD"}}]}')
  echo "$resp"
  if echo "$resp" | grep -q '"code": *0'; then echo "✓ code:0"; else echo "✗ NOT code:0 — stop here, show this response"; exit 1; fi
}

step_webhook () {
  local host="${1:?N8N_HOST required}"
  host="${host#https://}"; host="${host#http://}"; host="${host%/}"
  echo "── step 3: synthetic postback → https://$host/webhook/tiktok-click  (txid cc-test-$RUN)"
  echo "   (/webhook/, NOT /webhook-test/ — the test path only listens during 'Execute step')"
  curl -s -w '\nHTTP %{http_code}\n' \
    "https://$host/webhook/tiktok-click?ttclid=cc-test-ttclid-$RUN&txid=cc-test-$RUN&payout=0"
  echo "now open the execution in n8n: all nodes green, and the TikTok node's output shows \"code\":0"
}

case "${1:-}" in
  token)   step_token "${2:-}" ;;
  webhook) step_webhook "${2:-}" ;;
  all)     step_token "${3:-}"; echo; step_webhook "${2:-}" ;;
  *)       sed -n '2,9p' "$0"; exit 2 ;;
esac
