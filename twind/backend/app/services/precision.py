"""Precision tiers and the capability-unlock framing.

estimated = derived from onboarding pickers only.
measured  = user entered at least one garment-derived number.
confirmed = validated against >=2 passing fit ratings.

Bust is optional at every tier; tiers are reachable without it.
"""

from __future__ import annotations

from app.models import BodyProfile, PrecisionTier

GARMENT_DERIVED_SOURCES = {"garment", "typed"}

UNLOCKS: list[tuple[str, tuple[str, ...], str]] = [
    # (capability, fields needed (any one), user-facing prompt)
    (
        "fit_scores_bottoms",
        ("inseam_cm", "outseam_cm"),
        "Add your inseam to unlock exact fit scores on trousers",
    ),
    (
        "fit_scores_tops",
        ("shoulder_cm",),
        "Add your shoulder width to unlock exact fit scores on tops",
    ),
    ("narrow_matching", ("waist_cm", "hip_cm"), "Add waist or hip to tighten your matches"),
]


def measured_fields(profile: BodyProfile) -> list[str]:
    # Height is a body number from the onboarding picker, not a garment measurement,
    # so it never moves the tier on its own.
    return [
        f
        for f, src in (profile.source_per_field or {}).items()
        if f != "height_cm"
        and src in GARMENT_DERIVED_SOURCES
        and getattr(profile, f, None) is not None
    ]


def tier_for(profile: BodyProfile, passing_fit_ratings: int) -> PrecisionTier:
    if passing_fit_ratings >= 2 and measured_fields(profile):
        return PrecisionTier.confirmed
    if measured_fields(profile):
        return PrecisionTier.measured
    return PrecisionTier.estimated


def unlocked_and_next(profile: BodyProfile) -> tuple[list[str], str | None]:
    unlocked: list[str] = []
    next_prompt: str | None = None
    for cap, fields, prompt in UNLOCKS:
        if any(getattr(profile, f, None) is not None for f in fields):
            unlocked.append(cap)
        elif next_prompt is None:
            next_prompt = prompt
    return unlocked, next_prompt
