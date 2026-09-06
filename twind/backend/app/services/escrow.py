"""Order state machine + escrow. Funds are held until the buyer confirms delivery and rates
fit, or the auto-release timer fires. High-accuracy sellers get faster release.

pending → paid → shipped → delivered → released
                                     ↘ refunded (only after a failed fit rating)
"""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.db import utcnow
from app.models import Listing, ListingStatus, Order, OrderStatus, PayoutEvent, User
from app.services.payments import PaymentsProvider


class InvalidTransition(Exception):
    pass


def _require(order: Order, *allowed: OrderStatus) -> None:
    if order.status not in allowed:
        raise InvalidTransition(
            f"order is {order.status.value}, expected {[a.value for a in allowed]}"
        )


def mark_paid(order: Order, listing: Listing) -> None:
    _require(order, OrderStatus.pending)
    order.status = OrderStatus.paid
    listing.status = ListingStatus.sold


def mark_shipped(order: Order, tracking_ref: str | None) -> None:
    _require(order, OrderStatus.paid)
    order.status = OrderStatus.shipped
    order.tracking_ref = tracking_ref
    order.shipped_at = utcnow()


def mark_delivered(order: Order, settings: Settings, *, seller_high_accuracy: bool) -> None:
    _require(order, OrderStatus.shipped, OrderStatus.paid)
    order.status = OrderStatus.delivered
    order.delivered_at = utcnow()
    days = (
        settings.auto_release_days_high_accuracy
        if seller_high_accuracy
        else settings.auto_release_days
    )
    order.auto_release_at = order.delivered_at + timedelta(days=days)


async def release(
    session: AsyncSession, order: Order, seller: User, payments: PaymentsProvider, note: str
) -> None:
    _require(order, OrderStatus.delivered)
    payout = order.amount_pence - order.seller_fee_pence
    ref = None
    if seller.stripe_account_id:
        ref = await payments.transfer_to_seller(
            amount_pence=payout, seller_account_id=seller.stripe_account_id, order_id=order.id
        )
    order.stripe_transfer_id = ref
    order.status = OrderStatus.released
    order.released_at = utcnow()
    session.add(
        PayoutEvent(
            order_id=order.id, kind="release", amount_pence=payout, provider_ref=ref, note=note
        )
    )


async def refund(
    session: AsyncSession, order: Order, payments: PaymentsProvider, note: str
) -> None:
    _require(
        order, OrderStatus.pending, OrderStatus.paid, OrderStatus.shipped, OrderStatus.delivered
    )
    total = order.amount_pence + order.protection_fee_pence + order.shipping_pence
    ref = None
    if order.stripe_payment_intent_id:
        ref = await payments.refund(
            payment_intent_id=order.stripe_payment_intent_id, amount_pence=None
        )
    order.status = OrderStatus.refunded
    order.refunded_at = utcnow()
    session.add(
        PayoutEvent(
            order_id=order.id, kind="refund", amount_pence=total, provider_ref=ref, note=note
        )
    )
