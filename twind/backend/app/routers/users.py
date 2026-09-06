import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.auth import CurrentUser, Session
from app.models import Follow, Listing, ListingStatus, User
from app.schemas import ListingOut, PublicProfile
from app.services.serializers import listing_out, public_profile

router = APIRouter()


async def _by_handle(session, handle: str) -> User:
    user = await session.scalar(select(User).where(User.handle == handle))
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")
    return user


@router.get("/users/{handle}", response_model=PublicProfile)
async def get_profile(handle: str, session: Session) -> PublicProfile:
    # Public and shareable. Carries no measurements — there is no browse-by-body surface.
    return await public_profile(session, await _by_handle(session, handle))


@router.get("/users/{handle}/listings", response_model=list[ListingOut])
async def user_listings(handle: str, session: Session) -> list[ListingOut]:
    user = await _by_handle(session, handle)
    rows = await session.scalars(
        select(Listing)
        .where(Listing.seller_id == user.id, Listing.status == ListingStatus.live)
        .order_by(Listing.created_at.desc())
    )
    return [await listing_out(session, row) for row in rows]


@router.post("/users/{user_id}/follow", status_code=204)
async def follow(user_id: uuid.UUID, user: CurrentUser, session: Session) -> None:
    if user_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "cannot follow yourself")
    if not await session.get(User, user_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "user not found")
    exists = await session.get(Follow, (user.id, user_id))
    if not exists:
        session.add(Follow(follower_id=user.id, followee_id=user_id))
        await session.commit()


@router.delete("/users/{user_id}/follow", status_code=204)
async def unfollow(user_id: uuid.UUID, user: CurrentUser, session: Session) -> None:
    row = await session.get(Follow, (user.id, user_id))
    if row:
        await session.delete(row)
        await session.commit()
