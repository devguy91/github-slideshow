# Twind API

FastAPI + SQLAlchemy 2.0 (async) + Postgres backend for Twind. See `../docs/api-contract.md`
for the HTTP contract the mobile app is built against.

## Run locally

```bash
uv venv --python 3.12 .venv && source .venv/bin/activate
uv pip install -e ".[dev]"
cp .env.example .env               # sqlite works out of the box: TWIND_DATABASE_URL=sqlite+aiosqlite:///./twind.db
alembic upgrade head
python -m app.cli seed-slices      # launch slices: midsize (UK 14–18), tall (175cm+, UK 10–14)
uvicorn app.main:app --reload      # http://localhost:8000/docs
```

Get a dev token (no auth provider needed): `GET /v1/dev/token?email=you@example.com`.

Background jobs (escrow auto-release): `arq app.jobs.worker.WorkerSettings`, or one-shot
`python -m app.cli release-due`.

## Testing

Three layers, cheapest first.

**1. Automated (no services needed, ~5s)**

```bash
pytest -q                                   # 42 tests: unit, guardrails, end-to-end API flow
ruff check app tests && ruff format --check app tests
```

`tests/test_api_flow.py` drives the whole loop through the HTTP layer: onboarding → listing →
feed → quote → order → Stripe webhook → ship → deliver → fit rating → twins/refund/relist →
auto-release job. `tests/test_guardrails.py` asserts the spec's non-negotiables.

**2. Scripted walkthrough against a running server**

```bash
alembic upgrade head && python -m app.cli seed-slices && python -m app.cli seed-demo
uvicorn app.main:app --reload
./scripts/walkthrough.sh            # fit passes → funds released → twins
FIT=fail ./scripts/walkthrough.sh   # fit fails → funds held → refund
```

Prints each step's result. `seed-demo` creates two founding sellers (one per launch slice) with
seven live listings so a new buyer sees a populated feed.

**3. Manual, via Swagger**

Open http://localhost:8000/docs, call `GET /v1/dev/token?email=you@example.com`, click
*Authorize* and paste the token. Useful requests to poke at: `/me/body/match-count` with
different query values, `/feed` before and after `PUT /me/body`, `/orders/quote` on a
listing whose seller has a high accuracy score (protection fee waived).

To move an order past the auto-release timer without waiting, set `auto_release_at` in the
past and run `python -m app.cli release-due`.

## Lint

```bash
pytest -q
ruff check app tests && ruff format --check app tests
```

Tests run against in-memory SQLite with the fake payments provider; no services required.

## Layout

```
app/
  main.py            app factory, router registration
  config.py          Settings (env-driven, TWIND_ prefix); fee + timer rules live here
  db.py              async engine/session
  models.py          SQLAlchemy models (users, body_profiles, listings, garment_measurements,
                     orders, fit_ratings, follows, twins, slices, waitlist_entries, payout_events)
  schemas.py         Pydantic v2 request/response models (mirrors the API contract)
  auth.py            JWT verification (Supabase HS256 / Clerk JWKS) + user upsert
  routers/           health+dev, me, users, body, onboarding, listings, feed, orders, slices, webhooks
  services/
    measurements.py  category rules: required fields, per-category weights, body↔garment map
    matching.py      hard filter, fit score (0–100 + confidence), style score, feed ranking
    feed.py          SQL prefilter → scoring → Redis/in-memory cache, live match-count
    fees.py          seller fee (0%) + buyer protection fee (fixed + %), waived for high accuracy
    accuracy.py      seller accuracy: shrunk pass rate, badge / silent demotion / private prompt
    precision.py     estimated → measured → confirmed tiers; capability-unlock framing
    pickers.py       style + body picker rounds, height/size → estimated measurements
    slices.py        slice resolution from the `slices` table, waitlist referral codes
    payments.py      PaymentsProvider protocol: FakeProvider (dev/test) + StripeProvider (Connect)
    escrow.py        order state machine, release/refund with payout audit log
    twins.py         symmetric twin pairs
    serializers.py   ORM → schema; the only place public views are built
  jobs/              ARQ worker + auto-release job
alembic/             migrations (0001 = initial schema)
tests/               unit (matching, fees, accuracy), guardrails, end-to-end API flow
```

## Invariants enforced in code and tests

- No weight column or field anywhere (`tests/test_guardrails.py`); unknown body fields are rejected.
- Public profiles never carry measurements; fit ratings never appear on a public endpoint.
- Fit score and style score are separate numbers end to end; ranking orders on both, never sums them.
- Listings cannot go live without a modelled fit photo first and the category's required flat measurements.
- Fee logic runs on every quote even at a 0% seller fee.
- Funds are held until the buyer confirms fit (immediate release), the auto-release timer fires
  (skipped for failed-fit orders), or the buyer chooses refund/relist.
