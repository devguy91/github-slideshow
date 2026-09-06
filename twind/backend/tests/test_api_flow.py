"""End-to-end: onboarding → listing → feed → checkout → escrow → fit rating → twins."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app import db
from app.jobs.payouts import release_due_orders
from app.models import Order, Twin
from tests.conftest import BOTTOMS_LISTING, BUYER_BODY_MATCHING, make_live_listing


async def test_health(client):
    r = await client.get("/v1/health")
    assert r.json() == {"status": "ok"}


async def test_auth_required(client):
    assert (await client.get("/v1/me")).status_code == 401
    assert (await client.get("/v1/me", headers={"Authorization": "Bearer nope"})).status_code == 401


async def test_body_profile_tiers_and_capability_framing(actor):
    a = await actor()
    r = await a.get("/me/body")
    assert r.json()["precision_tier"] == "estimated"
    assert r.json()["next_unlock"] and "incomplete" not in r.json()["next_unlock"].lower()

    r = await a.post("/me/onboarding/height-size", json={"height_cm": 170, "usual_size": "UK 14"})
    assert r.status_code == 200, r.text
    body = r.json()["body"]
    assert body["precision_tier"] == "estimated"
    assert body["inseam_cm"] is not None and body["source_per_field"]["inseam_cm"] == "picker"
    assert r.json()["slice"]["is_open"] is True  # midsize launch slice

    r = await a.post("/me/onboarding/body-picker", json={"round": 1, "choice": 2})
    assert r.status_code == 200
    assert r.json()["inseam_cm"] > body["inseam_cm"]  # "longer legs" nudges inseam up

    r = await a.put("/me/body", json={"inseam_cm": 79})
    assert r.status_code == 200, r.text
    assert r.json()["precision_tier"] == "measured"
    assert r.json()["source_per_field"]["inseam_cm"] == "typed"
    assert "fit_scores_bottoms" in r.json()["unlocked"]

    # a later picker round must not overwrite the typed number
    r = await a.post("/me/onboarding/body-picker", json={"round": 2, "choice": 0})
    assert r.json()["inseam_cm"] == 79


async def test_weight_is_rejected_everywhere(actor):
    a = await actor()
    r = await a.put("/me/body", json={"weight_kg": 70})
    assert r.status_code == 422
    r = await a.put("/me/body", json={"height_cm": 170, "weight": 70})
    assert r.status_code == 422


async def test_listing_publish_enforces_modelled_photo_and_required_measurements(actor):
    s = await actor()
    bad = dict(
        BOTTOMS_LISTING,
        photos=[{"url": "x", "is_modelled_fit": False}],
        measurements={"outseam_cm": 100},
    )
    r = await s.post("/listings", json=bad)
    assert r.status_code == 201
    lid = r.json()["id"]
    r = await s.post(f"/listings/{lid}/publish")
    assert r.status_code == 422
    errs = " ".join(r.json()["detail"])
    assert (
        "modelled fit" in errs
        and "inseam_cm" in errs
        and "rise_cm" in errs
        and "waist_flat_cm" in errs
    )

    r = await s.patch(
        f"/listings/{lid}",
        json={
            "photos": [{"url": "x", "is_modelled_fit": True}],
            "measurements": {
                "outseam_cm": 100,
                "inseam_cm": 75,
                "rise_cm": 25,
                "waist_flat_cm": 38,
            },
        },
    )
    assert r.status_code == 200
    r = await s.post(f"/listings/{lid}/publish")
    assert r.status_code == 200 and r.json()["status"] == "live"

    # tops need a different set
    top = dict(BOTTOMS_LISTING, category="tops", measurements={"length_cm": 60})
    lid = (await s.post("/listings", json=top)).json()["id"]
    r = await s.post(f"/listings/{lid}/publish")
    assert r.status_code == 422 and "pit_to_pit_cm" in " ".join(r.json()["detail"])


async def test_feed_ranks_matches_and_hard_filters_far_items(actor):
    seller = await actor()
    good = await make_live_listing(seller)
    far = await make_live_listing(
        seller,
        dict(
            BOTTOMS_LISTING,
            title="Very long jeans",
            measurements={"outseam_cm": 120, "inseam_cm": 95, "rise_cm": 25, "waist_flat_cm": 40},
        ),
    )

    buyer = await actor()
    await buyer.post("/me/onboarding/height-size", json={"height_cm": 170, "usual_size": "UK 14"})
    r = await buyer.put("/me/body", json=BUYER_BODY_MATCHING)
    assert r.json()["precision_tier"] == "measured"

    r = await buyer.get("/feed")
    assert r.status_code == 200, r.text
    ids = [c["listing"]["id"] for c in r.json()["items"]]
    assert good["id"] in ids and far["id"] not in ids
    card = r.json()["items"][0]
    assert card["fit_score"] >= 85 and card["fit_confidence"] == 1.0
    assert 0 <= card["style_score"] <= 100 and card["reason"] == "match"
    assert "combined" not in card  # two separate numbers, never blended

    # listing detail carries the same match block for this buyer
    r = await buyer.get(f"/listings/{good['id']}")
    assert r.json()["match"]["fit_score"] == card["fit_score"]

    # seller's own listing carries no match
    r = await seller.get(f"/listings/{good['id']}")
    assert r.json()["match"] is None


async def test_match_count_reacts_to_typed_measurements(actor):
    seller = await actor()
    await make_live_listing(seller)
    buyer = await actor()
    r = await buyer.get("/me/body/match-count")
    assert r.json()["match_count"] == 1  # nothing to filter on yet → everything matches
    r = await buyer.get("/me/body/match-count", params={"outseam_cm": 130})
    assert r.json()["match_count"] == 0
    r = await buyer.get("/me/body/match-count", params={"outseam_cm": 104})
    assert r.json()["match_count"] == 1


async def test_public_profile_never_exposes_measurements(actor):
    a = await actor()
    await a.put("/me/body", json={"inseam_cm": 79, "waist_cm": 80})
    handle = (await a.get("/me")).json()["handle"]
    r = await a.get(f"/users/{handle}")
    assert r.status_code == 200
    assert not any(k.endswith("_cm") for k in r.json())


async def _checkout(buyer, seller, client, listing):
    r = await buyer.post("/orders/quote", json={"listing_id": listing["id"]})
    assert r.status_code == 200, r.text
    q = r.json()
    assert (
        q["protection_fee_pence"] == 99 + 3500 * 3 // 100
        and q["total_pence"] == 3500 + q["protection_fee_pence"] + 399
    )
    r = await buyer.post("/orders", json={"listing_id": listing["id"]})
    assert r.status_code == 201, r.text
    order = r.json()["order"]
    assert order["status"] == "pending" and r.json()["payment"]["client_secret"]
    # Stripe tells us it was paid
    pi = None
    async with db.get_sessionmaker()() as s:
        pi = (await s.get(Order, __import__("uuid").UUID(order["id"]))).stripe_payment_intent_id
    r = await client.post(
        "/v1/webhooks/stripe",
        json={"type": "payment_intent.succeeded", "data": {"object": {"id": pi}}},
    )
    assert r.status_code == 200
    r = await buyer.get(f"/orders/{order['id']}")
    assert r.json()["status"] == "paid"
    assert (await buyer.get(f"/listings/{listing['id']}")).json()["status"] == "sold"
    return order


async def test_full_purchase_pass_releases_and_creates_symmetric_twins(actor, client, payments):
    seller = await actor()
    listing = await make_live_listing(seller)
    buyer = await actor()
    await buyer.put("/me/body", json=BUYER_BODY_MATCHING)
    order = await _checkout(buyer, seller, client, listing)

    # buyer cannot ship, seller cannot deliver
    assert (await buyer.post(f"/orders/{order['id']}/ship", json={})).status_code == 403
    assert (await seller.post(f"/orders/{order['id']}/deliver")).status_code == 403
    # can't rate before delivery
    assert (
        await buyer.post(f"/orders/{order['id']}/fit-rating", json={"fit_as_described": True})
    ).status_code == 409

    r = await seller.post(f"/orders/{order['id']}/ship", json={"tracking_ref": "RM123"})
    assert r.json()["status"] == "shipped"
    r = await buyer.post(f"/orders/{order['id']}/deliver")
    assert r.json()["status"] == "delivered" and r.json()["auto_release_at"]

    r = await buyer.post(f"/orders/{order['id']}/fit-rating", json={"fit_as_described": True})
    assert r.status_code == 201, r.text
    assert r.json()["became_twins"] is True

    r = await buyer.get(f"/orders/{order['id']}")
    assert r.json()["status"] == "released"
    assert (
        payments.transfers == []
    )  # seller has no Stripe account yet → no transfer, still released

    # symmetric twins
    async with db.get_sessionmaker()() as s:
        rows = (await s.scalars(select(Twin))).all()
    assert len(rows) == 2 and {(str(t.user_a_id), str(t.user_b_id)) for t in rows} == {
        (order["buyer_id"], order["seller_id"]),
        (order["seller_id"], order["buyer_id"]),
    }
    assert (await buyer.get("/me/twins")).json()["count"] == 1
    assert (await seller.get("/me/twins")).json()["count"] == 1

    # twin's next listing appears in the "twins" strip with reason=twin
    listing2 = await make_live_listing(seller)
    r = await buyer.get("/feed")
    assert [c["listing"]["id"] for c in r.json()["twins"]] == [listing2["id"]]
    assert r.json()["items"][0]["reason"] == "twin"

    # rating is private: never on the seller's public profile or the listing
    handle = (await seller.get("/me")).json()["handle"]
    prof = (await buyer.get(f"/users/{handle}")).json()
    assert "fit_rating" not in prof and "fit_ratings" not in prof
    assert (await seller.get("/me/accuracy")).json()["rated_sales"] == 1
    # can't rate twice
    assert (
        await buyer.post(f"/orders/{order['id']}/fit-rating", json={"fit_as_described": True})
    ).status_code == 409


async def test_failed_fit_holds_funds_then_refund(actor, client, payments):
    seller = await actor()
    listing = await make_live_listing(seller)
    buyer = await actor()
    order = await _checkout(buyer, seller, client, listing)
    await seller.post(f"/orders/{order['id']}/ship", json={})
    await buyer.post(f"/orders/{order['id']}/deliver")

    # refund not allowed before a failed rating
    assert (await buyer.post(f"/orders/{order['id']}/refund")).status_code == 409
    # issues only allowed on a fail
    r = await buyer.post(
        f"/orders/{order['id']}/fit-rating",
        json={"fit_as_described": True, "issues": ["too_short"]},
    )
    assert r.status_code == 422

    r = await buyer.post(
        f"/orders/{order['id']}/fit-rating",
        json={"fit_as_described": False, "issues": ["too_short", "waist_tight"]},
    )
    assert r.status_code == 201 and r.json()["became_twins"] is False
    assert (await buyer.get(f"/orders/{order['id']}")).json()["status"] == "delivered"  # held

    # the auto-release job must skip a failed-fit order
    async with db.get_sessionmaker()() as s:
        o = await s.get(Order, __import__("uuid").UUID(order["id"]))
        o.auto_release_at = datetime.now(UTC) - timedelta(minutes=1)
        await s.commit()
    assert await release_due_orders() == 0

    r = await buyer.post(f"/orders/{order['id']}/refund")
    assert r.status_code == 200 and r.json()["status"] == "refunded"
    assert len(payments.refunds) == 1
    assert (await buyer.get("/me/twins")).json()["count"] == 0


async def test_failed_fit_relist_clones_listing_and_releases(actor, client):
    seller = await actor()
    listing = await make_live_listing(seller)
    buyer = await actor()
    order = await _checkout(buyer, seller, client, listing)
    await seller.post(f"/orders/{order['id']}/ship", json={})
    await buyer.post(f"/orders/{order['id']}/deliver")
    await buyer.post(
        f"/orders/{order['id']}/fit-rating",
        json={"fit_as_described": False, "issues": ["hip_tight"]},
    )
    r = await buyer.post(f"/orders/{order['id']}/relist")
    assert r.status_code == 201, r.text
    clone = r.json()
    assert clone["status"] == "draft" and clone["measurements"]["outseam_cm"] == 104
    assert clone["seller"]["id"] == order["buyer_id"]
    assert (await buyer.get(f"/orders/{order['id']}")).json()["status"] == "released"


async def test_auto_release_job_releases_unrated_delivered_orders(actor, client):
    seller = await actor()
    listing = await make_live_listing(seller)
    buyer = await actor()
    order = await _checkout(buyer, seller, client, listing)
    await seller.post(f"/orders/{order['id']}/ship", json={})
    await buyer.post(f"/orders/{order['id']}/deliver")
    assert await release_due_orders() == 0  # timer not yet due
    async with db.get_sessionmaker()() as s:
        o = await s.get(Order, __import__("uuid").UUID(order["id"]))
        o.auto_release_at = datetime.now(UTC) - timedelta(minutes=1)
        await s.commit()
    assert await release_due_orders() == 1
    assert (await buyer.get(f"/orders/{order['id']}")).json()["status"] == "released"


async def test_cannot_buy_own_or_sold_listing_and_age_gate(actor, client):
    seller = await actor()
    listing = await make_live_listing(seller)
    assert (await seller.post("/orders", json={"listing_id": listing["id"]})).status_code == 400
    minor = await actor(adult=False)
    assert (await minor.post("/orders", json={"listing_id": listing["id"]})).status_code == 403
    buyer = await actor()
    await _checkout(buyer, seller, client, listing)
    other = await actor()
    assert (
        await other.post("/orders/quote", json={"listing_id": listing["id"]})
    ).status_code == 402


async def test_follow_boosts_reason(actor):
    seller = await actor()
    listing = await make_live_listing(seller)
    buyer = await actor()
    r = await buyer.post(f"/users/{listing['seller']['id']}/follow")
    assert r.status_code == 204
    assert (await buyer.get("/me/following")).json()[0]["id"] == listing["seller"]["id"]
    r = await buyer.get("/feed")
    assert r.json()["items"][0]["reason"] == "following"
    await buyer.delete(f"/users/{listing['seller']['id']}/follow")
    assert (await buyer.get("/me/following")).json() == []


async def test_slices_and_waitlist_referrals(client):
    r = await client.get("/v1/slices/resolve", params={"height_cm": 165, "usual_size": "UK 16"})
    assert r.json()["is_open"] is True  # midsize
    r = await client.get("/v1/slices/resolve", params={"height_cm": 180, "usual_size": "UK 10"})
    assert r.json()["is_open"] is True  # tall
    r = await client.get("/v1/slices/resolve", params={"height_cm": 160, "usual_size": "UK 8"})
    assert r.json()["is_open"] is False  # general, closed

    r = await client.post(
        "/v1/waitlist", json={"email": "a@example.com", "height_cm": 160, "usual_size": "UK 8"}
    )
    assert r.status_code == 201, r.text
    code = r.json()["referral_code"]
    assert r.json()["position"] == 1 and r.json()["slice"]["progress"] > 0
    # referral into a different slice does not count toward the referrer
    r = await client.post(
        "/v1/waitlist",
        json={
            "email": "b@example.com",
            "height_cm": 180,
            "usual_size": "UK 10",
            "referral_code": code,
        },
    )
    assert r.status_code == 201
    r = await client.post(
        "/v1/waitlist",
        json={
            "email": "c@example.com",
            "height_cm": 160,
            "usual_size": "UK 8",
            "referral_code": code,
        },
    )
    assert r.json()["position"] == 2
    async with db.get_sessionmaker()() as s:
        from app.models import WaitlistEntry

        rows = {e.email: e.referred_by_code for e in (await s.scalars(select(WaitlistEntry))).all()}
    assert rows["c@example.com"] == code and rows["b@example.com"] is None
    # idempotent on email
    r = await client.post(
        "/v1/waitlist", json={"email": "a@example.com", "height_cm": 160, "usual_size": "UK 8"}
    )
    assert r.status_code == 201 and r.json()["referral_code"] == code
