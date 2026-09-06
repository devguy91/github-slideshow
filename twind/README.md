# Twind

Peer-to-peer secondhand clothing marketplace that matches buyers and sellers by body
measurements. Users find "twins" — people whose clothes genuinely fit them — and shop their closets.

**Core loop:** seller lists a garment with flat measurements and a modelled fit photo → buyer
matched on body proportions sees it ranked high in their feed → buyer purchases → buyer confirms
whether it fit → that outcome improves matching and the seller's accuracy score.

```
twind/
  backend/   FastAPI + SQLAlchemy 2.0 + Postgres. Matching, fees, escrow, accuracy, twins, slices.
  mobile/    Expo SDK 52 / React Native / Expo Router app (primary surface).
  docs/      api-contract.md — the HTTP contract both sides are built against.
```

The web layer (Next.js landing page, public listing/profile pages, deep links) is build-order
step 9 and is not in this folder yet.

## Build order status

| # | Step | Status |
|---|------|--------|
| 1 | Auth, user model, body profile, measurement form (numeric path) | backend ✅ · mobile ✅ |
| 2 | Listing creation with garment measurements | backend ✅ · mobile ✅ |
| 3 | Matching function and ranked feed | backend ✅ · mobile ✅ |
| 4 | Stripe Connect, checkout, escrow, payout release | backend ✅ (fake + Stripe providers) · mobile ✅ |
| 5 | Fit rating flow and accuracy scoring | backend ✅ · mobile ✅ |
| 6 | Twins, follows, notifications | twins + follows ✅ · push notifications ⏳ |
| 7 | Onboarding pickers (style, then body) | backend ✅ · mobile ✅ (picker images pending consent pipeline) |
| 8 | Slice gating and waitlist | ✅ |
| 9 | Next.js web layer and deep links | ⏳ (app.json carries the universal-link config) |

## Quick start

```bash
# backend
cd backend && uv venv --python 3.12 .venv && source .venv/bin/activate
uv pip install -e ".[dev]" && cp .env.example .env
alembic upgrade head && python -m app.cli seed-slices
uvicorn app.main:app --reload            # http://localhost:8000/docs

# mobile (separate terminal)
cd mobile && npm install && npx expo start
```

The dev token endpoint (`GET /v1/dev/token?email=`) lets the app sign in with no auth provider.

## Non-negotiables (see backend/tests/test_guardrails.py)

- Never collect or store weight.
- No searchable directory of measurements; public profiles carry none. Matching is server-side.
- Fit ratings are private and never rendered as reviews.
- Fit % and style % are separate numbers everywhere.
- Age gate 18+ before purchase. Bust/chest optional at every tier.
- Precision tiers are framed as capability unlocked, never as an incomplete profile.
