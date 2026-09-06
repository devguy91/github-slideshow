"""Checkout, escrow transitions, fit rating, refund/relist."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import or_, select

from app.auth import CurrentUser, Session, SettingsDep
from app.models import (
    FitRating,
    GarmentMeasurements,
    Listing,
    ListingStatus,
    Order,
    OrderStatus,
    User,
)
from app.routers.body import ensure_profile, recompute_tier
from app.schemas import (
    FitRatingIn,
    FitRatingOut,
    ListingOut,
    OrderCreateOut,
    OrderOut,
    PaymentOut,
    QuoteIn,
    QuoteOut,
    ShipIn,
)
from app.services import escrow, fees
from app.services.payments import get_payments
from app.services.serializers import (
    fit_rating_out,
    listing_out,
    order_out,
    seller_accuracy,
)
from app.services.twins import confirm_twins

router = APIRouter()


async def _purchasable(session, listing_id: uuid.UUID, buyer: User) -> Listing:
    listing = await session.get(Listing, listing_id)
    if not listing or listing.status == ListingStatus.removed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "listing not found")
    if listing.status != ListingStatus.live:
        raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, "listing is no longer available")
    if listing.seller_id == buyer.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "you cannot buy your own listing")
    return listing


async def _quote(session, listing: Listing, settings) -> fees.Quote:
    acc = await seller_accuracy(session, listing.seller_id)
    return fees.quote(listing.price_pence, settings, seller_high_accuracy=acc.is_high)


def _quote_out(q: fees.Quote) -> QuoteOut:
    return QuoteOut(
        item_pence=q.item_pence,
        protection_fee_pence=q.protection_fee_pence,
        shipping_pence=q.shipping_pence,
        total_pence=q.total_pence,
        protection_fee_waived=q.protection_fee_waived,
        waived_reason=q.waived_reason,
    )


@router.post("/orders/quote", response_model=QuoteOut)
async def quote(
    body: QuoteIn, user: CurrentUser, session: Session, settings: SettingsDep
) -> QuoteOut:
    listing = await _purchasable(session, body.listing_id, user)
    return _quote_out(await _quote(session, listing, settings))


@router.post("/orders", response_model=OrderCreateOut, status_code=201)
async def create_order(
    body: QuoteIn, user: CurrentUser, session: Session, settings: SettingsDep
) -> OrderCreateOut:
    if user.age_confirmed_at is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "confirm you are 18 or over before buying")
    listing = await _purchasable(session, body.listing_id, user)
    seller = await session.get(User, listing.seller_id)
    q = await _quote(session, listing, settings)
    order = Order(
        listing_id=listing.id,
        buyer_id=user.id,
        seller_id=listing.seller_id,
        amount_pence=q.item_pence,
        protection_fee_pence=q.protection_fee_pence,
        shipping_pence=q.shipping_pence,
        seller_fee_pence=q.seller_fee_pence,
        status=OrderStatus.pending,
    )
    session.add(order)
    await session.flush()
    intent = await get_payments(settings).create_payment_intent(
        amount_pence=q.total_pence,
        seller_account_id=seller.stripe_account_id if seller else None,
        order_id=order.id,
    )
    order.stripe_payment_intent_id = intent.id
    await session.commit()
    await session.refresh(order)
    return OrderCreateOut(
        order=await order_out(session, order),
        payment=PaymentOut(
            client_secret=intent.client_secret, publishable_key=intent.publishable_key
        ),
    )


@router.get("/me/orders", response_model=list[OrderOut])
async def my_orders(
    user: CurrentUser,
    session: Session,
    role: str = Query(default="buyer", pattern="^(buyer|seller)$"),
) -> list[OrderOut]:
    col = Order.buyer_id if role == "buyer" else Order.seller_id
    rows = await session.scalars(
        select(Order).where(col == user.id).order_by(Order.created_at.desc())
    )
    return [await order_out(session, o) for o in rows]


async def _party(session, order_id: uuid.UUID, user: User) -> Order:
    order = await session.get(Order, order_id)
    if not order or user.id not in (order.buyer_id, order.seller_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "order not found")
    return order


@router.get("/orders/{order_id}", response_model=OrderOut)
async def get_order(order_id: uuid.UUID, user: CurrentUser, session: Session) -> OrderOut:
    return await order_out(session, await _party(session, order_id, user))


def _transition(fn, *args, **kwargs):
    try:
        fn(*args, **kwargs)
    except escrow.InvalidTransition as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e


@router.post("/orders/{order_id}/ship", response_model=OrderOut)
async def ship(order_id: uuid.UUID, body: ShipIn, user: CurrentUser, session: Session) -> OrderOut:
    order = await _party(session, order_id, user)
    if order.seller_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only the seller can mark shipped")
    _transition(escrow.mark_shipped, order, body.tracking_ref)
    await session.commit()
    await session.refresh(order)
    return await order_out(session, order)


@router.post("/orders/{order_id}/deliver", response_model=OrderOut)
async def deliver(
    order_id: uuid.UUID, user: CurrentUser, session: Session, settings: SettingsDep
) -> OrderOut:
    order = await _party(session, order_id, user)
    if order.buyer_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only the buyer can confirm delivery")
    acc = await seller_accuracy(session, order.seller_id)
    _transition(escrow.mark_delivered, order, settings, seller_high_accuracy=acc.is_high)
    await session.commit()
    await session.refresh(order)
    return await order_out(session, order)


@router.post("/orders/{order_id}/fit-rating", response_model=FitRatingOut, status_code=201)
async def rate_fit(
    order_id: uuid.UUID,
    body: FitRatingIn,
    user: CurrentUser,
    session: Session,
    settings: SettingsDep,
) -> FitRatingOut:
    """Private. A pass releases funds immediately and makes buyer+seller twins (both directions).
    A fail keeps funds held so the buyer can choose refund or relist."""
    order = await _party(session, order_id, user)
    if order.buyer_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only the buyer can rate fit")
    if order.status != OrderStatus.delivered:
        raise HTTPException(status.HTTP_409_CONFLICT, "rate fit after delivery")
    if order.fit_rating is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "already rated")
    rating = FitRating(
        order_id=order.id,
        buyer_id=user.id,
        seller_id=order.seller_id,
        fit_as_described=body.fit_as_described,
        issues=list(body.issues),
    )
    session.add(rating)
    became_twins = False
    if body.fit_as_described:
        became_twins = await confirm_twins(session, user.id, order.seller_id, order.id)
        seller = await session.get(User, order.seller_id)
        await escrow.release(
            session, order, seller, get_payments(settings), note="fit confirmed by buyer"
        )
        # A confirmed fit is evidence the buyer's own numbers are right → may reach `confirmed`.
        profile = await ensure_profile(session, user)
        await session.flush()
        await recompute_tier(session, user, profile)
    await session.commit()
    await session.refresh(rating)
    return fit_rating_out(rating, became_twins)


@router.post("/orders/{order_id}/refund", response_model=OrderOut)
async def refund(
    order_id: uuid.UUID, user: CurrentUser, session: Session, settings: SettingsDep
) -> OrderOut:
    """Buyer protection: refund when the item didn't fit as described."""
    order = await _party(session, order_id, user)
    if order.buyer_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only the buyer can request a refund")
    if order.fit_rating is None or order.fit_rating.fit_as_described:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "refund is only available after a failed fit rating"
        )
    try:
        await escrow.refund(
            session, order, get_payments(settings), note="didn't fit — buyer protection"
        )
    except escrow.InvalidTransition as e:
        raise HTTPException(status.HTTP_409_CONFLICT, str(e)) from e
    await session.commit()
    await session.refresh(order)
    return await order_out(session, order)


@router.post("/orders/{order_id}/relist", response_model=ListingOut, status_code=201)
async def relist(
    order_id: uuid.UUID, user: CurrentUser, session: Session, settings: SettingsDep
) -> ListingOut:
    """One-tap relist after a failed fit: clones the listing (measurements + photos) as the
    buyer's draft so it routes to a better-matched twin. Funds are released to the original
    seller since the buyer is keeping the garment to resell."""
    order = await _party(session, order_id, user)
    if order.buyer_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "only the buyer can relist")
    if order.fit_rating is None or order.fit_rating.fit_as_described:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "relist is only available after a failed fit rating"
        )
    src = order.listing
    clone = Listing(
        seller_id=user.id,
        title=src.title,
        description=src.description,
        category=src.category,
        brand=src.brand,
        size_label=src.size_label,
        price_pence=src.price_pence,
        photos=list(src.photos or []),
        status=ListingStatus.draft,
        relisted_from_order_id=order.id,
    )
    if src.measurements:
        cols = {
            k: getattr(src.measurements, k)
            for k in GarmentMeasurements.__table__.columns.keys()
            if k != "listing_id"
        }
        clone.measurements = GarmentMeasurements(**cols)
    session.add(clone)
    if order.status == OrderStatus.delivered:
        seller = await session.get(User, order.seller_id)
        await escrow.release(
            session, order, seller, get_payments(settings), note="buyer chose relist"
        )
    await session.commit()
    await session.refresh(clone)
    return await listing_out(session, clone)


_ = or_
