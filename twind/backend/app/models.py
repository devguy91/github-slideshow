"""SQLAlchemy models. Deliberately no weight column anywhere — see tests/test_guardrails.py."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, CreatedAt, UUIDPk, utcnow

JSONType = JSON().with_variant(JSONB(), "postgresql")


class PrecisionTier(str, enum.Enum):
    estimated = "estimated"
    measured = "measured"
    confirmed = "confirmed"


class Category(str, enum.Enum):
    bottoms = "bottoms"
    tops = "tops"
    dresses = "dresses"


class ListingStatus(str, enum.Enum):
    draft = "draft"
    live = "live"
    sold = "sold"
    removed = "removed"


class OrderStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"
    shipped = "shipped"
    delivered = "delivered"
    released = "released"
    refunded = "refunded"


class User(UUIDPk, CreatedAt, Base):
    __tablename__ = "users"

    auth_subject: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(320), unique=True)
    handle: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(80), default="")
    avatar_url: Mapped[str | None] = mapped_column(String(1024))
    bio: Mapped[str | None] = mapped_column(Text)
    is_founding_seller: Mapped[bool] = mapped_column(Boolean, default=False)
    age_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    stripe_account_id: Mapped[str | None] = mapped_column(String(255))
    slice_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("slices.id"))
    style_vector: Mapped[list[float] | None] = mapped_column(JSONType)
    referral_code: Mapped[str | None] = mapped_column(String(16), unique=True)

    body_profile: Mapped[BodyProfile | None] = relationship(
        back_populates="user", uselist=False, lazy="selectin"
    )


class BodyProfile(Base):
    __tablename__ = "body_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), primary_key=True)
    height_cm: Mapped[float | None] = mapped_column(Float)
    usual_size: Mapped[str | None] = mapped_column(String(20))
    outseam_cm: Mapped[float | None] = mapped_column(Float)
    inseam_cm: Mapped[float | None] = mapped_column(Float)
    rise_cm: Mapped[float | None] = mapped_column(Float)
    waist_cm: Mapped[float | None] = mapped_column(Float)
    hip_cm: Mapped[float | None] = mapped_column(Float)
    shoulder_cm: Mapped[float | None] = mapped_column(Float)
    torso_length_cm: Mapped[float | None] = mapped_column(Float)
    bust_cm: Mapped[float | None] = mapped_column(Float)  # optional at every tier
    precision_tier: Mapped[PrecisionTier] = mapped_column(
        Enum(PrecisionTier, name="precision_tier"), default=PrecisionTier.estimated
    )
    source_per_field: Mapped[dict[str, str]] = mapped_column(JSONType, default=dict)
    picker_choices: Mapped[dict[str, int]] = mapped_column(JSONType, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    user: Mapped[User] = relationship(back_populates="body_profile")


class Listing(UUIDPk, CreatedAt, Base):
    __tablename__ = "listings"

    seller_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[Category] = mapped_column(Enum(Category, name="category"), index=True)
    brand: Mapped[str | None] = mapped_column(String(80))
    size_label: Mapped[str] = mapped_column(String(20))
    price_pence: Mapped[int] = mapped_column(Integer)
    status: Mapped[ListingStatus] = mapped_column(
        Enum(ListingStatus, name="listing_status"), default=ListingStatus.draft, index=True
    )
    # ordered array of {"url": str, "is_modelled_fit": bool}; first must be the modelled fit photo
    photos: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, default=list)
    relisted_from_order_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)

    seller: Mapped[User] = relationship(lazy="selectin")
    measurements: Mapped[GarmentMeasurements | None] = relationship(
        back_populates="listing", uselist=False, lazy="selectin", cascade="all, delete-orphan"
    )


class GarmentMeasurements(Base):
    __tablename__ = "garment_measurements"

    listing_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("listings.id"), primary_key=True)
    outseam_cm: Mapped[float | None] = mapped_column(Float)
    inseam_cm: Mapped[float | None] = mapped_column(Float)
    rise_cm: Mapped[float | None] = mapped_column(Float)
    waist_flat_cm: Mapped[float | None] = mapped_column(Float)
    hip_flat_cm: Mapped[float | None] = mapped_column(Float)
    pit_to_pit_cm: Mapped[float | None] = mapped_column(Float)
    shoulder_flat_cm: Mapped[float | None] = mapped_column(Float)
    length_cm: Mapped[float | None] = mapped_column(Float)

    listing: Mapped[Listing] = relationship(back_populates="measurements")


class Order(UUIDPk, CreatedAt, Base):
    __tablename__ = "orders"

    listing_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("listings.id"), index=True)
    buyer_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    seller_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    amount_pence: Mapped[int] = mapped_column(Integer)
    protection_fee_pence: Mapped[int] = mapped_column(Integer)
    shipping_pence: Mapped[int] = mapped_column(Integer, default=0)
    seller_fee_pence: Mapped[int] = mapped_column(Integer, default=0)
    stripe_payment_intent_id: Mapped[str | None] = mapped_column(String(255), index=True)
    stripe_transfer_id: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="order_status"), default=OrderStatus.pending, index=True
    )
    tracking_ref: Mapped[str | None] = mapped_column(String(120))
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    auto_release_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    listing: Mapped[Listing] = relationship(lazy="selectin")
    fit_rating: Mapped[FitRating | None] = relationship(
        back_populates="order", uselist=False, lazy="selectin"
    )


class FitRating(CreatedAt, Base):
    """Private. Never rendered as a public review — no public endpoint reads this table."""

    __tablename__ = "fit_ratings"

    order_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orders.id"), primary_key=True)
    buyer_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    seller_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    fit_as_described: Mapped[bool] = mapped_column(Boolean)
    issues: Mapped[list[str]] = mapped_column(JSONType, default=list)

    order: Mapped[Order] = relationship(back_populates="fit_rating")


class Follow(CreatedAt, Base):
    __tablename__ = "follows"

    follower_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), primary_key=True)
    followee_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), primary_key=True)


class Twin(Base):
    """Symmetric: every confirmed twin pair is written in both directions."""

    __tablename__ = "twins"
    __table_args__ = (Index("ix_twins_pair", "user_a_id", "user_b_id", unique=True),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_a_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    user_b_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id"), index=True)
    order_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orders.id"))
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Slice(UUIDPk, Base):
    __tablename__ = "slices"

    name: Mapped[str] = mapped_column(String(60))  # internal only, never shown to users
    height_min_cm: Mapped[float | None] = mapped_column(Float)
    height_max_cm: Mapped[float | None] = mapped_column(Float)
    size_min: Mapped[int | None] = mapped_column(Integer)  # UK numeric size
    size_max: Mapped[int | None] = mapped_column(Integer)
    is_open: Mapped[bool] = mapped_column(Boolean, default=False)
    member_target: Mapped[int] = mapped_column(Integer, default=200)
    priority: Mapped[int] = mapped_column(Integer, default=0)  # higher wins when ranges overlap


class WaitlistEntry(UUIDPk, CreatedAt, Base):
    __tablename__ = "waitlist_entries"
    __table_args__ = (UniqueConstraint("email", name="uq_waitlist_email"),)

    email: Mapped[str] = mapped_column(String(320))
    height_cm: Mapped[float] = mapped_column(Float)
    usual_size: Mapped[str] = mapped_column(String(20))
    slice_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("slices.id"), index=True)
    referral_code: Mapped[str] = mapped_column(String(16), unique=True)
    referred_by_code: Mapped[str | None] = mapped_column(String(16), index=True)
    invited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PayoutEvent(UUIDPk, CreatedAt, Base):
    """Audit log for escrow releases/refunds — one row per money movement."""

    __tablename__ = "payout_events"

    order_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("orders.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20))  # release | refund
    amount_pence: Mapped[int] = mapped_column(Integer)
    provider_ref: Mapped[str | None] = mapped_column(String(255))
    note: Mapped[str | None] = mapped_column(Text)
