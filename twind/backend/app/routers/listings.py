from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser, Session, SettingsDep
from app.db import get_session
from app.models import GarmentMeasurements, Listing, ListingStatus, User
from app.schemas import (
    FitMatchOut,
    ListingIn,
    ListingOut,
    ListingPatch,
    SignUploadIn,
    SignUploadOut,
)
from app.services.feed import FeedCache, score_listings_for
from app.services.measurements import missing_required
from app.services.serializers import listing_out

router = APIRouter()


async def _owned(session: AsyncSession, listing_id: uuid.UUID, user: User) -> Listing:
    listing = await session.get(Listing, listing_id)
    if not listing or listing.status == ListingStatus.removed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "listing not found")
    if listing.seller_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "not your listing")
    return listing


async def _with_match(session: AsyncSession, listing: Listing, user: User | None) -> ListingOut:
    match = None
    if user and user.body_profile and listing.seller_id != user.id:
        scored = await score_listings_for(
            session, user, [listing], tier=user.body_profile.precision_tier, apply_hard_filter=False
        )
        if scored:
            s = scored[0]
            match = FitMatchOut(
                fit_score=s.fit.score,
                fit_confidence=s.fit.confidence,
                style_score=s.style,
                fields_used=list(s.fit.fields_used),
                reason=s.reason,
            )
    return await listing_out(session, listing, match)


@router.get("/listings/{listing_id}", response_model=ListingOut)
async def get_listing(listing_id: uuid.UUID, session: Session, user: CurrentUser) -> ListingOut:
    listing = await session.get(Listing, listing_id)
    if not listing or listing.status == ListingStatus.removed:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "listing not found")
    if listing.status == ListingStatus.draft and listing.seller_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "listing not found")
    return await _with_match(session, listing, user)


@router.post("/listings", response_model=ListingOut, status_code=201)
async def create_listing(body: ListingIn, user: CurrentUser, session: Session) -> ListingOut:
    listing = Listing(
        seller_id=user.id,
        title=body.title,
        description=body.description,
        category=body.category,
        brand=body.brand,
        size_label=body.size_label,
        price_pence=body.price_pence,
        photos=[p.model_dump() for p in body.photos],
        status=ListingStatus.draft,
    )
    listing.measurements = GarmentMeasurements(**body.measurements.model_dump())
    session.add(listing)
    await session.commit()
    await session.refresh(listing)
    return await listing_out(session, listing)


@router.patch("/listings/{listing_id}", response_model=ListingOut)
async def patch_listing(
    listing_id: uuid.UUID, body: ListingPatch, user: CurrentUser, session: Session
) -> ListingOut:
    listing = await _owned(session, listing_id, user)
    if listing.status == ListingStatus.sold:
        raise HTTPException(status.HTTP_409_CONFLICT, "sold listings cannot be edited")
    data = body.model_dump(exclude_unset=True)
    if "photos" in data:
        listing.photos = data.pop("photos")
    if "measurements" in data:
        m = data.pop("measurements") or {}
        if listing.measurements is None:
            listing.measurements = GarmentMeasurements()
        for k, v in m.items():
            setattr(listing.measurements, k, v)
    for k, v in data.items():
        setattr(listing, k, v)
    await session.commit()
    await session.refresh(listing)
    return await listing_out(session, listing)


def publish_errors(listing: Listing) -> list[str]:
    errors: list[str] = []
    photos = listing.photos or []
    if not photos:
        errors.append("at least one photo is required")
    elif not photos[0].get("is_modelled_fit"):
        errors.append("the first photo must be a modelled fit photo (item worn)")
    m = listing.measurements
    values = (
        {k: getattr(m, k) for k in m.__table__.columns.keys() if k != "listing_id"} if m else {}
    )
    for f in missing_required(listing.category, values):
        errors.append(f"{f} is required for {listing.category.value}")
    return errors


@router.post("/listings/{listing_id}/publish", response_model=ListingOut)
async def publish(
    listing_id: uuid.UUID, user: CurrentUser, session: Session, settings: SettingsDep
) -> ListingOut:
    listing = await _owned(session, listing_id, user)
    if listing.status == ListingStatus.sold:
        raise HTTPException(status.HTTP_409_CONFLICT, "listing already sold")
    errors = publish_errors(listing)
    if errors:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, errors)
    listing.status = ListingStatus.live
    await session.commit()
    await FeedCache(settings).invalidate_slice(session, user.slice_id)
    await session.refresh(listing)
    return await listing_out(session, listing)


@router.delete("/listings/{listing_id}", status_code=204)
async def remove_listing(listing_id: uuid.UUID, user: CurrentUser, session: Session) -> None:
    listing = await _owned(session, listing_id, user)
    if listing.status == ListingStatus.sold:
        raise HTTPException(status.HTTP_409_CONFLICT, "sold listings cannot be removed")
    listing.status = ListingStatus.removed
    await session.commit()


@router.post("/uploads/sign", response_model=SignUploadOut)
async def sign_upload(
    body: SignUploadIn, user: CurrentUser, settings: SettingsDep
) -> SignUploadOut:
    """Presigned PUT to R2/S3. Falls back to a local dev path when no bucket is configured."""
    ext = body.content_type.split("/")[1]
    key = f"listings/{user.id}/{uuid.uuid4().hex}.{ext}"
    public_url = f"{settings.r2_public_base_url}/{key}"
    if not settings.r2_bucket:
        return SignUploadOut(
            upload_url=f"http://localhost:8000/v1/dev/upload/{key}", public_url=public_url
        )
    import boto3  # optional dependency in prod

    s3 = boto3.client(
        "s3",
        endpoint_url=settings.r2_endpoint,
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
    )
    url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": settings.r2_bucket, "Key": key, "ContentType": body.content_type},
        ExpiresIn=600,
    )
    return SignUploadOut(upload_url=url, public_url=public_url)


_ = get_session  # keep import for type checkers
