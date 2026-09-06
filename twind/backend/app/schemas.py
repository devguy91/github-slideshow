"""Pydantic v2 request/response schemas. Mirrors docs/api-contract.md."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.models import Category, ListingStatus, OrderStatus, PrecisionTier

Source = Literal["picker", "garment", "typed"]
Issue = Literal[
    "too_short",
    "too_long",
    "waist_tight",
    "waist_loose",
    "hip_tight",
    "hip_loose",
    "shoulders_tight",
    "shoulders_loose",
    "chest_tight",
    "chest_loose",
    "other",
]
Reason = Literal["twin", "following", "match"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- users -------------------------------------------------------------------------------


class AccuracyOut(BaseModel):
    score: float | None
    rated_sales: int
    badge: bool


class UserOut(ORM):
    id: uuid.UUID
    handle: str
    display_name: str
    avatar_url: str | None
    bio: str | None
    is_founding_seller: bool
    has_stripe_account: bool
    slice_id: uuid.UUID | None
    created_at: datetime
    accuracy: AccuracyOut
    age_confirmed: bool


class UserPatch(BaseModel):
    handle: str | None = Field(default=None, min_length=3, max_length=40, pattern=r"^[a-z0-9_]+$")
    display_name: str | None = Field(default=None, max_length=80)
    bio: str | None = Field(default=None, max_length=500)
    avatar_url: str | None = None
    confirm_age_18_plus: bool | None = None


class PublicProfile(BaseModel):
    """Public. Never carries measurements."""

    id: uuid.UUID
    handle: str
    display_name: str
    avatar_url: str | None
    bio: str | None
    twin_count: int
    listing_count: int
    accuracy_badge: bool


# --- body profile ------------------------------------------------------------------------


class BodyProfileInput(BaseModel):
    model_config = ConfigDict(extra="forbid")  # rejects unknown fields such as weight

    height_cm: float | None = Field(default=None, ge=120, le=230)
    usual_size: str | None = Field(default=None, max_length=20)
    outseam_cm: float | None = Field(default=None, ge=50, le=140)
    inseam_cm: float | None = Field(default=None, ge=40, le=110)
    rise_cm: float | None = Field(default=None, ge=10, le=50)
    waist_cm: float | None = Field(default=None, ge=45, le=180)
    hip_cm: float | None = Field(default=None, ge=60, le=200)
    shoulder_cm: float | None = Field(default=None, ge=25, le=70)
    torso_length_cm: float | None = Field(default=None, ge=30, le=90)
    bust_cm: float | None = Field(default=None, ge=60, le=200)
    source_per_field: dict[str, Source] | None = None

    def measurement_fields_set(self) -> dict[str, float]:
        return {
            k: v
            for k, v in self.model_dump(exclude_unset=True).items()
            if k not in ("usual_size", "source_per_field") and v is not None
        }


class BodyProfileOut(BaseModel):
    height_cm: float | None
    usual_size: str | None
    outseam_cm: float | None
    inseam_cm: float | None
    rise_cm: float | None
    waist_cm: float | None
    hip_cm: float | None
    shoulder_cm: float | None
    torso_length_cm: float | None
    bust_cm: float | None
    source_per_field: dict[str, str]
    precision_tier: PrecisionTier
    unlocked: list[str]
    next_unlock: str | None
    updated_at: datetime


class MatchCountOut(BaseModel):
    match_count: int


# --- onboarding --------------------------------------------------------------------------


class HeightSizeIn(BaseModel):
    height_cm: float = Field(ge=120, le=230)
    usual_size: str = Field(max_length=20)


class PickerChoiceIn(BaseModel):
    round: int = Field(ge=1, le=4)
    choice: int = Field(ge=0, le=2)


class PickerOptionOut(BaseModel):
    index: int
    image_url: str
    consent_id: str
    label: str


class PickerRoundOut(BaseModel):
    round: int
    prompt: str
    options: list[PickerOptionOut]


class StyleVectorOut(BaseModel):
    style_vector: list[float]


# --- slices ------------------------------------------------------------------------------


class SliceStatusOut(BaseModel):
    slice_id: uuid.UUID | None
    is_open: bool
    progress: float
    member_count: int
    member_target: int


class HeightSizeOut(BaseModel):
    body: BodyProfileOut
    slice: SliceStatusOut


class WaitlistIn(BaseModel):
    email: EmailStr
    height_cm: float = Field(ge=120, le=230)
    usual_size: str = Field(max_length=20)
    referral_code: str | None = Field(default=None, max_length=16)


class WaitlistOut(BaseModel):
    position: int
    slice: SliceStatusOut
    referral_code: str


# --- listings ----------------------------------------------------------------------------


class PhotoIn(BaseModel):
    url: str = Field(max_length=1024)
    is_modelled_fit: bool = False


class GarmentMeasurementsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    outseam_cm: float | None = Field(default=None, ge=30, le=150)
    inseam_cm: float | None = Field(default=None, ge=20, le=120)
    rise_cm: float | None = Field(default=None, ge=10, le=50)
    waist_flat_cm: float | None = Field(default=None, ge=20, le=100)
    hip_flat_cm: float | None = Field(default=None, ge=25, le=110)
    pit_to_pit_cm: float | None = Field(default=None, ge=25, le=100)
    shoulder_flat_cm: float | None = Field(default=None, ge=25, le=70)
    length_cm: float | None = Field(default=None, ge=30, le=200)


class GarmentMeasurementsOut(GarmentMeasurementsIn):
    model_config = ConfigDict(from_attributes=True)


class ListingIn(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    category: Category
    brand: str | None = Field(default=None, max_length=80)
    size_label: str = Field(min_length=1, max_length=20)
    price_pence: int = Field(ge=100, le=10_000_00)
    photos: list[PhotoIn] = Field(default_factory=list, max_length=10)
    measurements: GarmentMeasurementsIn = Field(default_factory=GarmentMeasurementsIn)


class ListingPatch(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    category: Category | None = None
    brand: str | None = Field(default=None, max_length=80)
    size_label: str | None = Field(default=None, min_length=1, max_length=20)
    price_pence: int | None = Field(default=None, ge=100, le=10_000_00)
    photos: list[PhotoIn] | None = Field(default=None, max_length=10)
    measurements: GarmentMeasurementsIn | None = None


class FitMatchOut(BaseModel):
    fit_score: int
    fit_confidence: float
    style_score: int
    fields_used: list[str]
    reason: Reason


class ListingOut(BaseModel):
    id: uuid.UUID
    seller: PublicProfile
    title: str
    description: str | None
    category: Category
    brand: str | None
    size_label: str
    price_pence: int
    status: ListingStatus
    photos: list[PhotoIn]
    measurements: GarmentMeasurementsOut
    created_at: datetime
    match: FitMatchOut | None = None


class FeedCardOut(BaseModel):
    listing: ListingOut
    fit_score: int
    fit_confidence: float
    style_score: int
    reason: Reason


class FeedOut(BaseModel):
    twins: list[FeedCardOut]
    items: list[FeedCardOut]
    next_cursor: str | None


class SignUploadIn(BaseModel):
    content_type: Literal["image/jpeg", "image/png", "image/webp"]


class SignUploadOut(BaseModel):
    upload_url: str
    public_url: str


# --- orders ------------------------------------------------------------------------------


class QuoteIn(BaseModel):
    listing_id: uuid.UUID


class QuoteOut(BaseModel):
    item_pence: int
    protection_fee_pence: int
    shipping_pence: int
    total_pence: int
    protection_fee_waived: bool
    waived_reason: str | None


class FitRatingIn(BaseModel):
    fit_as_described: bool
    issues: list[Issue] = Field(default_factory=list)

    @model_validator(mode="after")
    def _issues_only_when_failed(self):
        if self.fit_as_described and self.issues:
            raise ValueError("issues only apply when fit_as_described is false")
        return self


class FitRatingOut(BaseModel):
    order_id: uuid.UUID
    fit_as_described: bool
    issues: list[str]
    created_at: datetime
    became_twins: bool


class OrderOut(BaseModel):
    id: uuid.UUID
    listing: ListingOut
    buyer_id: uuid.UUID
    seller_id: uuid.UUID
    amount_pence: int
    protection_fee_pence: int
    shipping_pence: int
    total_pence: int
    status: OrderStatus
    tracking_ref: str | None
    auto_release_at: datetime | None
    created_at: datetime
    fit_rating: FitRatingOut | None  # only populated for the buyer/seller of this order


class PaymentOut(BaseModel):
    client_secret: str
    publishable_key: str | None


class OrderCreateOut(BaseModel):
    order: OrderOut
    payment: PaymentOut


class ShipIn(BaseModel):
    tracking_ref: str | None = Field(default=None, max_length=120)


class SellerAccuracyOut(BaseModel):
    score: float | None
    rated_sales: int
    badge: bool
    tier: Literal["new", "good", "high", "needs_attention"]
    private_prompt: str | None


class TwinsOut(BaseModel):
    twins: list[PublicProfile]
    count: int


class StripeOnboardOut(BaseModel):
    url: str


class DevTokenOut(BaseModel):
    token: str
    sub: str
