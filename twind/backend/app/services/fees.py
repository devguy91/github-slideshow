"""Fee logic. Exists from day one even at a zero rate.

Seller fee: 0% (configurable in bps). Buyer protection fee: small fixed + percentage, shown at
checkout, waived when the seller has a high accuracy score.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.config import Settings


@dataclass(frozen=True)
class Quote:
    item_pence: int
    protection_fee_pence: int
    shipping_pence: int
    seller_fee_pence: int
    protection_fee_waived: bool
    waived_reason: str | None

    @property
    def total_pence(self) -> int:
        return self.item_pence + self.protection_fee_pence + self.shipping_pence

    @property
    def seller_payout_pence(self) -> int:
        return self.item_pence - self.seller_fee_pence


def protection_fee(item_pence: int, settings: Settings) -> int:
    return (
        settings.protection_fee_fixed_pence + (item_pence * settings.protection_fee_bps) // 10_000
    )


def seller_fee(item_pence: int, settings: Settings) -> int:
    return (item_pence * settings.seller_fee_bps) // 10_000


def quote(item_pence: int, settings: Settings, *, seller_high_accuracy: bool) -> Quote:
    if item_pence <= 0:
        raise ValueError("item_pence must be positive")
    fee = protection_fee(item_pence, settings)
    waived = seller_high_accuracy
    return Quote(
        item_pence=item_pence,
        protection_fee_pence=0 if waived else fee,
        shipping_pence=settings.shipping_flat_pence,
        seller_fee_pence=seller_fee(item_pence, settings),
        protection_fee_waived=waived,
        waived_reason="Seller has a verified fit-accuracy record" if waived else None,
    )
