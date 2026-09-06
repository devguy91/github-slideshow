#!/usr/bin/env bash
# End-to-end manual test of the core loop against a running API (default http://localhost:8000).
# Requires: curl, python3. Uses the dev token endpoint, so TWIND_ENV must not be prod.
#
#   ./scripts/walkthrough.sh              # full loop, fit passes → funds released, twins created
#   FIT=fail ./scripts/walkthrough.sh     # fit fails → funds held → refund
set -euo pipefail
API="${API:-http://localhost:8000}/v1"
FIT="${FIT:-pass}"
RUN=$(date +%s)

j() { python3 -c "import sys,json; d=json.load(sys.stdin); print(eval('d'+sys.argv[1]))" "$1"; }
tok() { curl -sf "$API/dev/token?email=$1" | j "['token']"; }
call() { # call METHOD PATH TOKEN [JSON]
  local m=$1 p=$2 t=$3 body=${4:-}
  if [ -n "$body" ]; then
    curl -sf -X "$m" "$API$p" -H "Authorization: Bearer $t" -H 'content-type: application/json' -d "$body"
  else
    curl -sf -X "$m" "$API$p" -H "Authorization: Bearer $t"
  fi
}
step() { printf '\n\033[1m%s\033[0m\n' "$*"; }

step "1. Sign in seller and buyer (dev tokens)"
SELLER=$(tok "seller-$RUN@twind.test"); BUYER=$(tok "buyer-$RUN@twind.test")
call PATCH /me "$SELLER" '{"confirm_age_18_plus":true,"display_name":"Walkthrough Seller"}' >/dev/null
call PATCH /me "$BUYER"  '{"confirm_age_18_plus":true,"display_name":"Walkthrough Buyer"}'  >/dev/null
echo "ok"

step "2. Buyer onboarding: height + size → slice, estimated tier"
call POST /me/onboarding/height-size "$BUYER" '{"height_cm":170,"usual_size":"UK 14"}' \
  | j "['body']['precision_tier'], d['slice']['is_open']"
call POST /me/onboarding/body-picker "$BUYER" '{"round":1,"choice":1}' >/dev/null

step "3. Seller lists jeans with flat measurements + modelled photo, publishes"
LISTING=$(call POST /listings "$SELLER" '{"title":"Walkthrough 501s","category":"bottoms","brand":"Levi'"'"'s","size_label":"UK 14","price_pence":3500,
  "photos":[{"url":"https://picsum.photos/seed/501/900/1200","is_modelled_fit":true}],
  "measurements":{"outseam_cm":104,"inseam_cm":78,"rise_cm":26,"waist_flat_cm":40,"hip_flat_cm":52}}' | j "['id']")
call POST "/listings/$LISTING/publish" "$SELLER" | j "['status']"

step "4. Buyer's live match count before/after typing an inseam"
call GET "/me/body/match-count" "$BUYER" | j "['match_count']"
call GET "/me/body/match-count?inseam_cm=95&outseam_cm=125" "$BUYER" | j "['match_count']"   # far off → 0

step "5. Buyer enters garment measurements → tier becomes 'measured'"
call PUT /me/body "$BUYER" '{"outseam_cm":103,"inseam_cm":77,"rise_cm":26,"waist_cm":80,"hip_cm":104}' \
  | j "['precision_tier'], d['unlocked']"

step "6. Feed: listing ranked with separate fit % and style %"
call GET /feed "$BUYER" | python3 -c "
import sys,json
for c in json.load(sys.stdin)['items']:
    print(f\"  {c['listing']['title']:<32} fit {c['fit_score']:>3}% (conf {c['fit_confidence']})  style {c['style_score']:>3}%  [{c['reason']}]\")"

step "7. Quote and create order (fake Stripe payment intent)"
call POST /orders/quote "$BUYER" "{\"listing_id\":\"$LISTING\"}" | j "['item_pence'], d['protection_fee_pence'], d['shipping_pence'], d['total_pence']"
ORDER_JSON=$(call POST /orders "$BUYER" "{\"listing_id\":\"$LISTING\"}")
ORDER=$(echo "$ORDER_JSON" | j "['order']['id']")
echo "order $ORDER status=$(echo "$ORDER_JSON" | j "['order']['status']")"

step "8. Simulate Stripe webhook: payment_intent.succeeded → paid, listing sold"
PI=$(cd "$(dirname "$0")/.." && .venv/bin/python - "$ORDER" <<'PY'
import asyncio, sys, uuid
from sqlalchemy import select
from app.db import get_sessionmaker
from app.models import Order
async def main():
    async with get_sessionmaker()() as s:
        o = await s.get(Order, uuid.UUID(sys.argv[1])); print(o.stripe_payment_intent_id)
asyncio.run(main())
PY
)
curl -sf -X POST "$API/webhooks/stripe" -H 'content-type: application/json' \
  -d "{\"type\":\"payment_intent.succeeded\",\"data\":{\"object\":{\"id\":\"$PI\"}}}" >/dev/null
call GET "/orders/$ORDER" "$BUYER" | j "['status']"

step "9. Seller ships, buyer confirms delivery (auto-release timer starts)"
call POST "/orders/$ORDER/ship" "$SELLER" '{"tracking_ref":"RM123456789GB"}' | j "['status']"
call POST "/orders/$ORDER/deliver" "$BUYER" | j "['status'], d['auto_release_at']"

if [ "$FIT" = "pass" ]; then
  step "10. Buyer: 'Did it fit as described?' → Yes → funds released, twins created"
  call POST "/orders/$ORDER/fit-rating" "$BUYER" '{"fit_as_described":true}' | j "['became_twins']"
  call GET "/orders/$ORDER" "$BUYER" | j "['status']"
  call GET /me/twins "$BUYER" | j "['count']"
  call GET /me/accuracy "$SELLER" | j "['tier'], d['rated_sales'], d['score']"
else
  step "10. Buyer: 'Did it fit?' → No (too_short, waist_tight) → funds held → refund"
  call POST "/orders/$ORDER/fit-rating" "$BUYER" '{"fit_as_described":false,"issues":["too_short","waist_tight"]}' | j "['became_twins']"
  call GET "/orders/$ORDER" "$BUYER" | j "['status']"
  call POST "/orders/$ORDER/refund" "$BUYER" | j "['status']"
  call GET /me/accuracy "$SELLER" | j "['tier'], d['private_prompt']"
fi

step "11. Public profile of the seller carries no measurements and no ratings"
HANDLE=$(call GET /me "$SELLER" | j "['handle']")
curl -sf "$API/users/$HANDLE" -H "Authorization: Bearer $BUYER" | python3 -c "import sys,json; print(sorted(json.load(sys.stdin).keys()))"

printf '\n\033[32mWalkthrough complete.\033[0m\n'
