from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.auth import CurrentUser, Session
from app.routers.body import ensure_profile, recompute_tier
from app.schemas import (
    BodyProfileOut,
    HeightSizeIn,
    HeightSizeOut,
    PickerChoiceIn,
    PickerOptionOut,
    PickerRoundOut,
    StyleVectorOut,
)
from app.services import pickers
from app.services.serializers import body_out, slice_out
from app.services.slices import resolve_slice, status_for

router = APIRouter()


def _round_out(r: pickers.PickerRound) -> PickerRoundOut:
    return PickerRoundOut(
        round=r.round,
        prompt=r.prompt,
        options=[PickerOptionOut(**o.__dict__) for o in r.options],
    )


@router.get("/onboarding/body-picker/{round}", response_model=PickerRoundOut)
async def body_picker_round(round: int) -> PickerRoundOut:
    if round not in pickers.BODY_ROUNDS:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return _round_out(pickers.BODY_ROUNDS[round])


@router.get("/onboarding/style-picker/{round}", response_model=PickerRoundOut)
async def style_picker_round(round: int) -> PickerRoundOut:
    if round not in pickers.STYLE_ROUNDS:
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    return _round_out(pickers.STYLE_ROUNDS[round])


def _apply_estimates(profile, *, overwrite_typed: bool = False) -> None:
    if profile.height_cm is None:
        return
    est = pickers.estimate_body(profile.height_cm, profile.usual_size, profile.picker_choices)
    sources = dict(profile.source_per_field or {})
    for field, value in est.items():
        if sources.get(field) in ("typed", "garment") and not overwrite_typed:
            continue  # never overwrite a real measurement with an estimate
        setattr(profile, field, value)
        sources[field] = "picker"
    profile.source_per_field = sources


@router.post("/me/onboarding/height-size", response_model=HeightSizeOut)
async def height_size(body: HeightSizeIn, user: CurrentUser, session: Session) -> HeightSizeOut:
    profile = await ensure_profile(session, user)
    profile.height_cm = body.height_cm
    profile.usual_size = body.usual_size
    sources = dict(profile.source_per_field or {})
    sources["height_cm"] = sources.get("height_cm", "typed")
    profile.source_per_field = sources
    _apply_estimates(profile)
    s = await resolve_slice(session, body.height_cm, body.usual_size)
    user.slice_id = s.id if s else None
    tier = await recompute_tier(session, user, profile)
    await session.commit()
    await session.refresh(profile)
    return HeightSizeOut(
        body=body_out(profile, tier), slice=slice_out(await status_for(session, s))
    )


@router.post("/me/onboarding/body-picker", response_model=BodyProfileOut)
async def body_picker(body: PickerChoiceIn, user: CurrentUser, session: Session):
    if body.round not in pickers.BODY_ROUNDS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "body picker has 3 rounds")
    profile = await ensure_profile(session, user)
    if profile.height_cm is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "set height and size first")
    choices = dict(profile.picker_choices or {})
    choices[str(body.round)] = body.choice
    profile.picker_choices = choices
    _apply_estimates(profile)
    tier = await recompute_tier(session, user, profile)
    await session.commit()
    await session.refresh(profile)
    return body_out(profile, tier)


@router.post("/me/onboarding/style-picker", response_model=StyleVectorOut)
async def style_picker(body: PickerChoiceIn, user: CurrentUser, session: Session) -> StyleVectorOut:
    profile = await ensure_profile(session, user)
    choices = dict(profile.picker_choices or {})
    choices[f"style_{body.round}"] = body.choice
    profile.picker_choices = choices
    vectors = [
        pickers.style_vector_for_choice(int(k.split("_")[1]), v)
        for k, v in choices.items()
        if k.startswith("style_")
    ]
    user.style_vector = pickers.merge_style_vectors(vectors)
    await session.commit()
    return StyleVectorOut(style_vector=user.style_vector)
