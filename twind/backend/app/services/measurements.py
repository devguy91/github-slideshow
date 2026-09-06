"""Category rules: which garment fields are required, and how body fields map to garment fields.

Body fields are what the buyer entered (from their best-fitting garments or the picker).
Garment fields are the seller's flat measurements. The two are compared field-for-field via
the map below; `waist_cm` (body) vs `waist_flat_cm` (garment) etc.
"""

from __future__ import annotations

from app.models import Category

GARMENT_FIELDS = (
    "outseam_cm",
    "inseam_cm",
    "rise_cm",
    "waist_flat_cm",
    "hip_flat_cm",
    "pit_to_pit_cm",
    "shoulder_flat_cm",
    "length_cm",
)

BODY_FIELDS = (
    "height_cm",
    "outseam_cm",
    "inseam_cm",
    "rise_cm",
    "waist_cm",
    "hip_cm",
    "shoulder_cm",
    "torso_length_cm",
    "bust_cm",
)

# Garment fields that must be present before a listing can go live.
REQUIRED_BY_CATEGORY: dict[Category, tuple[str, ...]] = {
    Category.bottoms: ("outseam_cm", "inseam_cm", "rise_cm", "waist_flat_cm"),
    Category.tops: ("pit_to_pit_cm", "shoulder_flat_cm", "length_cm"),
    Category.dresses: ("shoulder_flat_cm", "length_cm", "waist_flat_cm"),
}

# Per-category weights, keyed by garment field, mapped to the body field it is compared with.
# (garment_field, body_field, weight)
WEIGHTS_BY_CATEGORY: dict[Category, tuple[tuple[str, str, float], ...]] = {
    Category.bottoms: (
        ("outseam_cm", "outseam_cm", 0.35),
        ("inseam_cm", "inseam_cm", 0.25),
        ("rise_cm", "rise_cm", 0.20),
        ("waist_flat_cm", "waist_cm", 0.15),
        ("hip_flat_cm", "hip_cm", 0.05),
    ),
    Category.tops: (
        ("shoulder_flat_cm", "shoulder_cm", 0.35),
        ("pit_to_pit_cm", "bust_cm", 0.30),
        # Spec lists length 0.25 + torso 0.10; both compare garment length against the
        # buyer's torso length, so they collapse into one 0.35 term.
        ("length_cm", "torso_length_cm", 0.35),
    ),
    Category.dresses: (
        ("shoulder_flat_cm", "shoulder_cm", 0.25),
        ("length_cm", "torso_length_cm", 0.30),
        ("waist_flat_cm", "waist_cm", 0.25),
        ("hip_flat_cm", "hip_cm", 0.20),
    ),
}

# Body measurements are around the body; flat garment measurements are half circumference.
# These factors convert a body field into the garment-flat scale before comparison.
BODY_TO_GARMENT_SCALE: dict[str, float] = {
    "waist_cm": 0.5,
    "hip_cm": 0.5,
    "bust_cm": 0.5,
}


def missing_required(category: Category, values: dict[str, float | None]) -> list[str]:
    return [f for f in REQUIRED_BY_CATEGORY[category] if values.get(f) is None]
