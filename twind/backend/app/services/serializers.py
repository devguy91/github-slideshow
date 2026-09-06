"""Build response schemas from ORM rows. Centralised so public views can never leak
private fields (measurements, fit ratings, weight — which does not exist)."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FitRating, Listing, ListingStatus, Order, User
from app.schemas import (
    AccuracyOut,
    BodyProfileOut,
    FitMatchOut,
    FitRatingOut,
    GarmentMeasurementsOut,
    ListingOut,
    OrderOut,
    PhotoIn,
    PublicProfile,
    SliceStatusOut,
    UserOut,
)
from app.services import accuracy as acc
from app.services import precision
from app.services.slices import SliceStatus
from app.services.twins import twin_count


async def seller_accuracy(session: AsyncSession, seller_id: uuid.UUID) -> acc.Accuracy:
    total = await session.scalar(
        select(func.count()).select_from(FitRating).where(FitRating.seller_id == seller_id)
    )
    passes = await session.scalar(
        select(func.count())
        .select_from(FitRating)
        .where(FitRating.seller_id == seller_id, FitRating.fit_as_described.is_(True))
    )
    return acc.compute(passes or 0, total or 0)


async def buyer_passing_ratings(session: AsyncSession, buyer_id: uuid.UUID) -> int:
    n = await session.scalar(
        select(func.count())
        .select_from(FitRating)
        .where(FitRating.buyer_id == buyer_id, FitRating.fit_as_described.is_(True))
    )
    return n or 0


async def public_profile(session: AsyncSession, user: User) -> PublicProfile:
    listings = await session.scalar(
        select(func.count())
        .select_from(Listing)
        .where(Listing.seller_id == user.id, Listing.status == ListingStatus.live)
    )
    a = await seller_accuracy(session, user.id)
    return PublicProfile(
        id=user.id,
        handle=user.handle,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        bio=user.bio,
        twin_count=await twin_count(session, user.id),
        listing_count=listings or 0,
        accuracy_badge=a.is_high,
    )


async def user_out(session: AsyncSession, user: User) -> UserOut:
    a = await seller_accuracy(session, user.id)
    return UserOut(
        id=user.id,
        handle=user.handle,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        bio=user.bio,
        is_founding_seller=user.is_founding_seller,
        has_stripe_account=user.stripe_account_id is not None,
        slice_id=user.slice_id,
        created_at=user.created_at,
        accuracy=AccuracyOut(score=a.score, rated_sales=a.rated_sales, badge=a.is_high),
        age_confirmed=user.age_confirmed_at is not None,
    )


def body_out(profile, tier) -> BodyProfileOut:
    unlocked, next_unlock = precision.unlocked_and_next(profile)
    return BodyProfileOut(
        height_cm=profile.height_cm,
        usual_size=profile.usual_size,
        outseam_cm=profile.outseam_cm,
        inseam_cm=profile.inseam_cm,
        rise_cm=profile.rise_cm,
        waist_cm=profile.waist_cm,
        hip_cm=profile.hip_cm,
        shoulder_cm=profile.shoulder_cm,
        torso_length_cm=profile.torso_length_cm,
        bust_cm=profile.bust_cm,
        source_per_field=profile.source_per_field or {},
        precision_tier=tier,
        unlocked=unlocked,
        next_unlock=next_unlock,
        updated_at=profile.updated_at,
    )


def slice_out(s: SliceStatus) -> SliceStatusOut:
    return SliceStatusOut(
        slice_id=s.slice_id,
        is_open=s.is_open,
        progress=s.progress,
        member_count=s.member_count,
        member_target=s.member_target,
    )


async def listing_out(
    session: AsyncSession, listing: Listing, match: FitMatchOut | None = None
) -> ListingOut:
    m = listing.measurements
    return ListingOut(
        id=listing.id,
        seller=await public_profile(session, listing.seller),
        title=listing.title,
        description=listing.description,
        category=listing.category,
        brand=listing.brand,
        size_label=listing.size_label,
        price_pence=listing.price_pence,
        status=listing.status,
        photos=[PhotoIn(**p) for p in (listing.photos or [])],
        measurements=GarmentMeasurementsOut.model_validate(m) if m else GarmentMeasurementsOut(),
        created_at=listing.created_at,
        match=match,
    )


def fit_rating_out(r: FitRating, became_twins: bool = False) -> FitRatingOut:
    return FitRatingOut(
        order_id=r.order_id,
        fit_as_described=r.fit_as_described,
        issues=list(r.issues or []),
        created_at=r.created_at,
        became_twins=became_twins,
    )


async def order_out(session: AsyncSession, order: Order) -> OrderOut:
    return OrderOut(
        id=order.id,
        listing=await listing_out(session, order.listing),
        buyer_id=order.buyer_id,
        seller_id=order.seller_id,
        amount_pence=order.amount_pence,
        protection_fee_pence=order.protection_fee_pence,
        shipping_pence=order.shipping_pence,
        total_pence=order.amount_pence + order.protection_fee_pence + order.shipping_pence,
        status=order.status,
        tracking_ref=order.tracking_ref,
        auto_release_at=order.auto_release_at,
        created_at=order.created_at,
        fit_rating=fit_rating_out(order.fit_rating) if order.fit_rating else None,
    )
