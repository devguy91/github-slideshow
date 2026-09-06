"""Onboarding pickers.

Body picker: 3 rounds x 3 photos of people at the user's height and size, only proportion
varying. Each choice nudges estimated measurements derived from height + size anthropometric
baselines. All output fields get source "picker" → precision tier `estimated`.

Style picker: 4 rounds x 3 outfits; each option carries a style vector; the user's vector is
the mean of chosen options. No body data required.

Images are served from a consent-tracked asset table; onboarding consent is distinct from
listing consent. In the MVP the asset list is static config with a consent_id per image.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.services.matching import STYLE_DIMENSIONS
from app.services.sizes import parse_uk_size


@dataclass(frozen=True)
class PickerOption:
    index: int
    image_url: str
    consent_id: str
    label: str


@dataclass(frozen=True)
class PickerRound:
    round: int
    prompt: str
    options: tuple[PickerOption, ...]


BODY_ROUNDS: dict[int, PickerRound] = {
    1: PickerRound(
        1,
        "Which looks most like your leg-to-torso balance?",
        tuple(
            PickerOption(i, "", f"consent-body-1-{i}", lbl)
            for i, lbl in enumerate(("shorter legs", "balanced", "longer legs"))
        ),
    ),
    2: PickerRound(
        2,
        "Which looks most like your waist-to-hip shape?",
        tuple(
            PickerOption(i, "", f"consent-body-2-{i}", lbl)
            for i, lbl in enumerate(("straighter", "moderate", "curvier"))
        ),
    ),
    3: PickerRound(
        3,
        "Which looks most like your shoulder-to-hip balance?",
        tuple(
            PickerOption(i, "", f"consent-body-3-{i}", lbl)
            for i, lbl in enumerate(("narrower shoulders", "balanced", "broader shoulders"))
        ),
    ),
}

_STYLE_LABELS = (
    ("minimal", [1, 0, 0, 0.3, 0, 0]),
    ("vintage", [0, 1, 0, 0, 0.3, 0]),
    ("sporty", [0, 0, 1, 0, 0, 0.4]),
    ("tailored", [0.3, 0, 0, 1, 0, 0]),
    ("boho", [0, 0.3, 0, 0, 1, 0]),
    ("street", [0, 0, 0.4, 0, 0, 1]),
)

STYLE_ROUNDS: dict[int, PickerRound] = {
    r: PickerRound(
        r,
        "Which would you wear?",
        tuple(
            PickerOption(i, "", f"consent-style-{r}-{i}", _STYLE_LABELS[(r * 3 + i) % 6][0])
            for i in range(3)
        ),
    )
    for r in (1, 2, 3, 4)
}


def style_vector_for_choice(round_: int, choice: int) -> list[float]:
    return list(_STYLE_LABELS[(round_ * 3 + choice) % 6][1])


def merge_style_vectors(vectors: list[list[float]]) -> list[float]:
    if not vectors:
        return [0.0] * STYLE_DIMENSIONS
    return [round(sum(v[i] for v in vectors) / len(vectors), 3) for i in range(STYLE_DIMENSIONS)]


# --- body estimation -----------------------------------------------------------------------


def _size_offset(usual_size: str | None) -> float:
    """cm delta from a UK 12 baseline: roughly +2.5cm waist per size."""
    size = parse_uk_size(usual_size) or 12
    return (size - 12) * 2.5


def estimate_body(
    height_cm: float, usual_size: str | None, choices: dict[str, int] | None = None
) -> dict[str, float]:
    """Anthropometric baselines scaled by height, adjusted by size and picker choices.

    Choices: {"1": 0|1|2, "2": 0|1|2, "3": 0|1|2}. Middle option = baseline.
    """
    choices = choices or {}
    c1 = choices.get("1", 1) - 1  # leg/torso
    c2 = choices.get("2", 1) - 1  # waist/hip
    c3 = choices.get("3", 1) - 1  # shoulder/hip
    so = _size_offset(usual_size)

    outseam = height_cm * 0.60 + c1 * 3.0
    inseam = height_cm * 0.45 + c1 * 3.0
    rise = outseam - inseam
    torso = height_cm * 0.27 - c1 * 2.0
    waist = 72 + so - c2 * 2.0
    hip = 98 + so * 1.1 + c2 * 3.0
    shoulder = 38 + so * 0.3 + c3 * 1.5

    return {
        "outseam_cm": round(outseam, 1),
        "inseam_cm": round(inseam, 1),
        "rise_cm": round(rise, 1),
        "torso_length_cm": round(torso, 1),
        "waist_cm": round(waist, 1),
        "hip_cm": round(hip, 1),
        "shoulder_cm": round(shoulder, 1),
    }
