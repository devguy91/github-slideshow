"""Background job: release escrow for delivered orders whose auto-release timer has passed
and that were never rated (rated passes release immediately; rated fails hold for refund).
"""

from __future__ import annotations

from sqlalchemy import select

from app.config import get_settings
from app.db import get_sessionmaker, utcnow
from app.models import Order, OrderStatus, User
from app.services import escrow
from app.services.payments import get_payments


async def release_due_orders() -> int:
    settings = get_settings()
    payments = get_payments(settings)
    released = 0
    async with get_sessionmaker()() as session:
        due = (
            await session.scalars(
                select(Order).where(
                    Order.status == OrderStatus.delivered,
                    Order.auto_release_at.is_not(None),
                    Order.auto_release_at <= utcnow(),
                )
            )
        ).all()
        for order in due:
            if order.fit_rating is not None and not order.fit_rating.fit_as_described:
                continue  # buyer said it didn't fit — leave held for refund/relist
            seller = await session.get(User, order.seller_id)
            await escrow.release(session, order, seller, payments, note="auto-release timer")
            released += 1
        await session.commit()
    return released
