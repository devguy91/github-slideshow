from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.auth import CurrentUser, Session, SettingsDep
from app.db import utcnow
from app.models import Follow, Listing, ListingStatus, Twin, User
from app.schemas import (
    ListingOut,
    PublicProfile,
    SellerAccuracyOut,
    StripeOnboardOut,
    TwinsOut,
    UserOut,
    UserPatch,
)
from app.services.payments import get_payments
from app.services.serializers import listing_out, public_profile, seller_accuracy, user_out

router = APIRouter()


@router.get("/me", response_model=UserOut)
async def get_me(user: CurrentUser, session: Session) -> UserOut:
    return await user_out(session, user)


@router.patch("/me", response_model=UserOut)
async def patch_me(body: UserPatch, user: CurrentUser, session: Session) -> UserOut:
    data = body.model_dump(exclude_unset=True)
    if "handle" in data and data["handle"] != user.handle:
        taken = await session.scalar(select(User.id).where(User.handle == data["handle"]))
        if taken:
            raise HTTPException(status.HTTP_409_CONFLICT, "handle taken")
    if data.pop("confirm_age_18_plus", None):
        user.age_confirmed_at = utcnow()
    for k, v in data.items():
        setattr(user, k, v)
    await session.commit()
    await session.refresh(user)
    return await user_out(session, user)


@router.get("/me/accuracy", response_model=SellerAccuracyOut)
async def my_accuracy(user: CurrentUser, session: Session) -> SellerAccuracyOut:
    a = await seller_accuracy(session, user.id)
    return SellerAccuracyOut(
        score=a.score,
        rated_sales=a.rated_sales,
        badge=a.is_high,
        tier=a.tier,
        private_prompt=a.private_prompt,
    )


@router.get("/me/listings", response_model=list[ListingOut])
async def my_listings(user: CurrentUser, session: Session) -> list[ListingOut]:
    rows = await session.scalars(
        select(Listing)
        .where(Listing.seller_id == user.id, Listing.status != ListingStatus.removed)
        .order_by(Listing.created_at.desc())
    )
    return [await listing_out(session, row) for row in rows]


@router.get("/me/following", response_model=list[PublicProfile])
async def my_following(user: CurrentUser, session: Session) -> list[PublicProfile]:
    rows = await session.scalars(
        select(User)
        .join(Follow, Follow.followee_id == User.id)
        .where(Follow.follower_id == user.id)
    )
    return [await public_profile(session, u) for u in rows]


@router.get("/me/twins", response_model=TwinsOut)
async def my_twins(user: CurrentUser, session: Session) -> TwinsOut:
    rows = (
        await session.scalars(
            select(User).join(Twin, Twin.user_b_id == User.id).where(Twin.user_a_id == user.id)
        )
    ).all()
    return TwinsOut(twins=[await public_profile(session, u) for u in rows], count=len(rows))


@router.post("/me/stripe/onboard", response_model=StripeOnboardOut)
async def stripe_onboard(
    user: CurrentUser,
    session: Session,
    settings: SettingsDep,
    return_url: str = "twind://stripe-return",
) -> StripeOnboardOut:
    payments = get_payments(settings)
    if not user.stripe_account_id:
        user.stripe_account_id = await payments.create_express_account(
            email=user.email, user_id=user.id
        )
        await session.commit()
    url = await payments.account_onboarding_link(
        account_id=user.stripe_account_id, return_url=return_url
    )
    return StripeOnboardOut(url=url)
