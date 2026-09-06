"""Twins are created when a fit rating passes. Symmetric — both directions are written."""

from __future__ import annotations

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Twin


async def are_twins(session: AsyncSession, a: uuid.UUID, b: uuid.UUID) -> bool:
    row = await session.scalar(select(Twin.id).where(Twin.user_a_id == a, Twin.user_b_id == b))
    return row is not None


async def confirm_twins(
    session: AsyncSession, a: uuid.UUID, b: uuid.UUID, order_id: uuid.UUID
) -> bool:
    """Returns True if a new twin pair was created."""
    if a == b or await are_twins(session, a, b):
        return False
    session.add(Twin(user_a_id=a, user_b_id=b, order_id=order_id))
    session.add(Twin(user_a_id=b, user_b_id=a, order_id=order_id))
    return True


async def twin_ids(session: AsyncSession, user_id: uuid.UUID) -> set[uuid.UUID]:
    rows = await session.scalars(select(Twin.user_b_id).where(Twin.user_a_id == user_id))
    return set(rows.all())


async def twin_count(session: AsyncSession, user_id: uuid.UUID) -> int:
    n = await session.scalar(
        select(func.count()).select_from(Twin).where(Twin.user_a_id == user_id)
    )
    return n or 0


async def remove_pair(session: AsyncSession, a: uuid.UUID, b: uuid.UUID) -> None:
    rows = await session.scalars(
        select(Twin).where(
            or_(
                (Twin.user_a_id == a) & (Twin.user_b_id == b),
                (Twin.user_a_id == b) & (Twin.user_b_id == a),
            )
        )
    )
    for r in rows:
        await session.delete(r)
