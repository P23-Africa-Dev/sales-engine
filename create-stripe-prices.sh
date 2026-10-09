#!/usr/bin/env bash
#
# Create Stripe products + monthly/annual prices for all Factory 23 plans,
# then print + save the resulting price IDs to stripe-prices.txt.
#
# Usage (recommended - pass a Secret key that can create products/prices):
#   STRIPE_API_KEY=sk_live_xxx bash create-stripe-prices.sh        # LIVE
#   STRIPE_API_KEY=sk_test_xxx bash create-stripe-prices.sh        # TEST
#
# Usage (fallback - uses the CLI's logged-in key; may lack write permission):
#   bash create-stripe-prices.sh          # TEST mode
#   bash create-stripe-prices.sh live     # LIVE mode
#
# Prereq: either export STRIPE_API_KEY, or run `stripe login` once first.
# NOTE: mode (test vs live) is determined by the key you pass.

MODE="${1:-test}"
STRIPE_ARGS=""

if [ -n "${STRIPE_API_KEY:-}" ]; then
  STRIPE_ARGS="--api-key $STRIPE_API_KEY"
  case "$STRIPE_API_KEY" in
    *live*)
      echo "!! Using provided LIVE Secret key: creating REAL, chargeable prices. Ctrl+C within 5s to cancel..."
      sleep 5
      ;;
    *)
      echo "Using provided TEST Secret key."
      ;;
  esac
elif [ "$MODE" = "live" ]; then
  STRIPE_ARGS="--live"
  echo "!! LIVE mode via CLI login key: creating REAL, chargeable prices. Ctrl+C within 5s to cancel..."
  echo "   (If you hit a permissions error, re-run with STRIPE_API_KEY=sk_live_xxx instead.)"
  sleep 5
else
  echo "TEST mode via CLI login key. (Pass STRIPE_API_KEY=sk_... for a key with write access.)"
fi
echo ""

# "label|plan_key|monthly_cents|annual_cents"
plans=(
  "Up to 5 users|up_to_5|9900|99000"
  "Up to 10 users|up_to_10|19900|199000"
  "Up to 15 users|up_to_15|27900|279000"
  "Up to 20 users|up_to_20|31900|319000"
  "Up to 25 users|up_to_25|38900|389000"
  "Up to 30 users|up_to_30|45900|459000"
  "Up to 40 users|up_to_40|59900|599000"
  "Up to 50 users|up_to_50|73900|739000"
  "Up to 75 users|up_to_75|104900|1049000"
  "Up to 100 users|up_to_100|134900|1349000"
)

out="stripe-prices.txt"
: > "$out"

# Extract the first "id": "<prefix>..." value from JSON on stdin.
extract_id() {
  grep -o "\"id\": \"$1[^\"]*\"" | head -1 | grep -o "$1[^\"]*"
}

for p in "${plans[@]}"; do
  IFS='|' read -r label key monthly annual <<< "$p"
  echo "Creating: $label ($key) ..."

  product_json=$(stripe products create --name "Factory 23 - $label" $STRIPE_ARGS 2>&1)
  product_id=$(printf '%s' "$product_json" | extract_id "prod_")

  if [ -z "$product_id" ]; then
    echo "  ERROR creating product. Stripe response:"
    printf '%s\n' "$product_json"
    echo ""
    continue
  fi

  monthly_json=$(stripe prices create --product "$product_id" --unit-amount "$monthly" \
    --currency usd -d "recurring[interval]=month" $STRIPE_ARGS 2>&1)
  monthly_price=$(printf '%s' "$monthly_json" | extract_id "price_")
  [ -z "$monthly_price" ] && { echo "  ERROR creating monthly price:"; printf '%s\n' "$monthly_json"; }

  annual_json=$(stripe prices create --product "$product_id" --unit-amount "$annual" \
    --currency usd -d "recurring[interval]=year" $STRIPE_ARGS 2>&1)
  annual_price=$(printf '%s' "$annual_json" | extract_id "price_")
  [ -z "$annual_price" ] && { echo "  ERROR creating annual price:"; printf '%s\n' "$annual_json"; }

  line="$key  monthly=$monthly_price  annual=$annual_price"
  echo "  OK -> $line"
  echo "$line" >> "$out"
done

echo ""
echo "Done. Saved to $out"
