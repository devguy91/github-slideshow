"""Stripe webhooks. `payment_intent.succeeded` moves an order pending → paid and marks the
listing sold. Signature is verified when a webhook secret is configured."""

from __future__ import annotations

import json

from fastapi import APIRouter, Header, HTTPException, Request, status
from sqlalchemy import select

from app.auth import Session, SettingsDep
from app.models import Listing, Order, OrderStatus
from app.services import escrow

router = APIRouter()


async def apply_payment_succeeded(session, payment_intent_id: str) -> Order | None:
    order = await session.scalar(
        select(Order).where(Order.stripe_payment_intent_id == payment_intent_id)
    )
    if order is None or order.status != OrderStatus.pending:
        return order
    listing = await session.get(Listing, order.listing_id)
    escrow.mark_paid(order, listing)
    await session.commit()
    return order


@router.post("/webhooks/stripe", status_code=200)
async def stripe_webhook(
    request: Request,
    session: Session,
    settings: SettingsDep,
    stripe_signature: str | None = Header(default=None),
) -> dict:
    payload = await request.body()
    if settings.stripe_webhook_secret:
        import stripe

        try:
            event = stripe.Webhook.construct_event(
                payload, stripe_signature, settings.stripe_webhook_secret
            )
        except Exception as e:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"bad signature: {e}") from e
        event = event.to_dict()
    elif settings.env == "prod":
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "webhook secret not configured")
    else:
        event = json.loads(payload or b"{}")

    if event.get("type") == "payment_intent.succeeded":
        pi = event["data"]["object"]["id"]
        await apply_payment_succeeded(session, pi)
    return {"received": True}
