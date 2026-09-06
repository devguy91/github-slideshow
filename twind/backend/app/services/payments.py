"""Payments provider abstraction. Stripe Connect with Express seller accounts and destination
charges; funds held (manual capture is not needed — we hold the transfer, not the charge) until
delivery confirmation or the auto-release timer. `FakeProvider` is used in dev/test.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Protocol

from app.config import Settings


@dataclass(frozen=True)
class PaymentIntent:
    id: str
    client_secret: str
    publishable_key: str | None


class PaymentsProvider(Protocol):
    async def create_payment_intent(
        self, *, amount_pence: int, seller_account_id: str | None, order_id: uuid.UUID
    ) -> PaymentIntent: ...

    async def transfer_to_seller(
        self, *, amount_pence: int, seller_account_id: str, order_id: uuid.UUID
    ) -> str: ...

    async def refund(self, *, payment_intent_id: str, amount_pence: int | None) -> str: ...

    async def create_express_account(self, *, email: str | None, user_id: uuid.UUID) -> str: ...

    async def account_onboarding_link(self, *, account_id: str, return_url: str) -> str: ...


class FakeProvider:
    def __init__(self) -> None:
        self.intents: dict[str, int] = {}
        self.transfers: list[tuple[str, int]] = []
        self.refunds: list[tuple[str, int | None]] = []

    async def create_payment_intent(self, *, amount_pence, seller_account_id, order_id):
        pid = f"pi_fake_{uuid.uuid4().hex[:16]}"
        self.intents[pid] = amount_pence
        return PaymentIntent(id=pid, client_secret=f"{pid}_secret", publishable_key="pk_test_fake")

    async def transfer_to_seller(self, *, amount_pence, seller_account_id, order_id):
        self.transfers.append((seller_account_id, amount_pence))
        return f"tr_fake_{uuid.uuid4().hex[:12]}"

    async def refund(self, *, payment_intent_id, amount_pence):
        self.refunds.append((payment_intent_id, amount_pence))
        return f"re_fake_{uuid.uuid4().hex[:12]}"

    async def create_express_account(self, *, email, user_id):
        return f"acct_fake_{uuid.uuid4().hex[:12]}"

    async def account_onboarding_link(self, *, account_id, return_url):
        return f"https://connect.stripe.com/fake/{account_id}?return={return_url}"


class StripeProvider:
    def __init__(self, settings: Settings) -> None:
        import stripe

        stripe.api_key = settings.stripe_secret_key
        self._stripe = stripe
        self._pk = settings.stripe_publishable_key

    async def create_payment_intent(self, *, amount_pence, seller_account_id, order_id):
        # Destination charge: platform is the merchant of record; transfer happens on release.
        # `transfer_group` ties the later transfer to this charge.
        pi = self._stripe.PaymentIntent.create(
            amount=amount_pence,
            currency="gbp",
            automatic_payment_methods={"enabled": True},
            transfer_group=str(order_id),
            metadata={"order_id": str(order_id)},
        )
        return PaymentIntent(id=pi.id, client_secret=pi.client_secret, publishable_key=self._pk)

    async def transfer_to_seller(self, *, amount_pence, seller_account_id, order_id):
        tr = self._stripe.Transfer.create(
            amount=amount_pence,
            currency="gbp",
            destination=seller_account_id,
            transfer_group=str(order_id),
            metadata={"order_id": str(order_id)},
        )
        return tr.id

    async def refund(self, *, payment_intent_id, amount_pence):
        kwargs = {"payment_intent": payment_intent_id}
        if amount_pence is not None:
            kwargs["amount"] = amount_pence
        return self._stripe.Refund.create(**kwargs).id

    async def create_express_account(self, *, email, user_id):
        acct = self._stripe.Account.create(
            type="express",
            email=email,
            capabilities={"transfers": {"requested": True}},
            metadata={"user_id": str(user_id)},
        )
        return acct.id

    async def account_onboarding_link(self, *, account_id, return_url):
        link = self._stripe.AccountLink.create(
            account=account_id,
            refresh_url=return_url,
            return_url=return_url,
            type="account_onboarding",
        )
        return link.url


_provider: PaymentsProvider | None = None


def get_payments(settings: Settings) -> PaymentsProvider:
    global _provider
    if _provider is None:
        _provider = (
            StripeProvider(settings) if settings.payments_provider == "stripe" else FakeProvider()
        )
    return _provider


def reset_payments() -> None:
    global _provider
    _provider = None
