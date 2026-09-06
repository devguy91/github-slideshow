from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.auth import Session
from app.models import WaitlistEntry
from app.schemas import SliceStatusOut, WaitlistIn, WaitlistOut
from app.services.serializers import slice_out
from app.services.slices import new_referral_code, resolve_slice, status_for

router = APIRouter()


@router.get("/slices/resolve", response_model=SliceStatusOut)
async def resolve(
    session: Session, height_cm: float = Query(ge=120, le=230), usual_size: str = Query()
) -> SliceStatusOut:
    s = await resolve_slice(session, height_cm, usual_size)
    return slice_out(await status_for(session, s))


@router.post("/waitlist", response_model=WaitlistOut, status_code=201)
async def join_waitlist(body: WaitlistIn, session: Session) -> WaitlistOut:
    s = await resolve_slice(session, body.height_cm, body.usual_size)
    existing = await session.scalar(
        select(WaitlistEntry).where(WaitlistEntry.email == body.email.lower())
    )
    if existing:
        entry = existing
    else:
        referred_by = None
        if body.referral_code:
            referrer = await session.scalar(
                select(WaitlistEntry).where(WaitlistEntry.referral_code == body.referral_code)
            )
            # Referrals only count toward the referrer's own slice.
            if referrer and s is not None and referrer.slice_id == s.id:
                referred_by = referrer.referral_code
        entry = WaitlistEntry(
            email=body.email.lower(),
            height_cm=body.height_cm,
            usual_size=body.usual_size,
            slice_id=s.id if s else None,
            referral_code=new_referral_code(),
            referred_by_code=referred_by,
        )
        session.add(entry)
        await session.commit()
        await session.refresh(entry)
    position = await session.scalar(
        select(func.count())
        .select_from(WaitlistEntry)
        .where(
            WaitlistEntry.slice_id == entry.slice_id, WaitlistEntry.created_at <= entry.created_at
        )
    )
    if position is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR)
    return WaitlistOut(
        position=position,
        slice=slice_out(await status_for(session, s)),
        referral_code=entry.referral_code,
    )
