"""Slice assignment from height + size. Ranges live in the `slices` table, not code."""

from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Slice, User, WaitlistEntry
from app.services.sizes import parse_uk_size


@dataclass(frozen=True)
class SliceStatus:
    slice_id: uuid.UUID | None
    is_open: bool
    member_count: int
    member_target: int

    @property
    def progress(self) -> float:
        if self.member_target <= 0:
            return 1.0
        return min(1.0, round(self.member_count / self.member_target, 3))


def _matches(s: Slice, height_cm: float | None, size: int | None) -> bool:
    if s.height_min_cm is not None and (height_cm is None or height_cm < s.height_min_cm):
        return False
    if s.height_max_cm is not None and (height_cm is None or height_cm > s.height_max_cm):
        return False
    if s.size_min is not None and (size is None or size < s.size_min):
        return False
    if s.size_max is not None and (size is None or size > s.size_max):
        return False
    return True


async def resolve_slice(
    session: AsyncSession, height_cm: float | None, usual_size: str | None
) -> Slice | None:
    size = parse_uk_size(usual_size)
    slices = (await session.scalars(select(Slice).order_by(Slice.priority.desc()))).all()
    for s in slices:
        if _matches(s, height_cm, size):
            return s
    return None


async def status_for(session: AsyncSession, s: Slice | None) -> SliceStatus:
    if s is None:
        return SliceStatus(None, False, 0, 0)
    members = await session.scalar(
        select(func.count()).select_from(User).where(User.slice_id == s.id)
    )
    waiting = await session.scalar(
        select(func.count()).select_from(WaitlistEntry).where(WaitlistEntry.slice_id == s.id)
    )
    return SliceStatus(s.id, s.is_open, (members or 0) + (waiting or 0), s.member_target)


def new_referral_code() -> str:
    return secrets.token_urlsafe(6)[:8]


LAUNCH_SLICES = [
    # Configurable seed data; edit the table in prod, not this list.
    dict(name="midsize", size_min=14, size_max=18, is_open=True, member_target=200, priority=10),
    dict(
        name="tall",
        height_min_cm=175,
        size_min=10,
        size_max=14,
        is_open=True,
        member_target=200,
        priority=20,
    ),
    dict(name="general", is_open=False, member_target=500, priority=0),
]
