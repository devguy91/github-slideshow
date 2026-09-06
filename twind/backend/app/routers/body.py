"""Body profile + numeric measurement form. All fields optional; bust optional at every tier."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.auth import CurrentUser, Session
from app.models import BodyProfile, PrecisionTier
from app.schemas import BodyProfileInput, BodyProfileOut, MatchCountOut
from app.services import precision
from app.services.feed import body_dict, match_count
from app.services.serializers import body_out, buyer_passing_ratings

router = APIRouter()


async def ensure_profile(session, user) -> BodyProfile:
    if user.body_profile is None:
        profile = BodyProfile(user_id=user.id, source_per_field={}, picker_choices={})
        session.add(profile)
        await session.flush()
        user.body_profile = profile
    return user.body_profile


async def recompute_tier(session, user, profile: BodyProfile) -> PrecisionTier:
    passing = await buyer_passing_ratings(session, user.id)
    profile.precision_tier = precision.tier_for(profile, passing)
    return profile.precision_tier


@router.get("/me/body", response_model=BodyProfileOut)
async def get_body(user: CurrentUser, session: Session) -> BodyProfileOut:
    profile = await ensure_profile(session, user)
    tier = await recompute_tier(session, user, profile)
    await session.commit()
    return body_out(profile, tier)


@router.put("/me/body", response_model=BodyProfileOut)
async def put_body(body: BodyProfileInput, user: CurrentUser, session: Session) -> BodyProfileOut:
    """Partial upsert. Fields typed by the user default to source "typed" (garment-derived),
    which is what moves the tier from `estimated` to `measured`."""
    profile = await ensure_profile(session, user)
    data = body.model_dump(exclude_unset=True)
    sources = dict(profile.source_per_field or {})
    declared = data.pop("source_per_field", None) or {}
    for field, value in data.items():
        setattr(profile, field, value)
        if field == "usual_size":
            continue
        if value is None:
            sources.pop(field, None)
        else:
            sources[field] = declared.get(field, "typed")
    profile.source_per_field = sources
    tier = await recompute_tier(session, user, profile)
    await session.commit()
    await session.refresh(profile)
    return body_out(profile, tier)


@router.get("/me/body/match-count", response_model=MatchCountOut)
async def body_match_count(
    user: CurrentUser, session: Session, query: BodyProfileInput = Depends()
) -> MatchCountOut:
    """Live match count for the measurement form: current profile overlaid with query fields."""
    profile = await ensure_profile(session, user)
    body = body_dict(profile)
    body.update(query.measurement_fields_set())
    tier = profile.precision_tier
    if any(k in query.model_dump(exclude_unset=True) for k in body if k != "height_cm"):
        tier = PrecisionTier.measured if tier == PrecisionTier.estimated else tier
    return MatchCountOut(match_count=await match_count(session, user, body, tier))
