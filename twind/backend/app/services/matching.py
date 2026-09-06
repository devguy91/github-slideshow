"""Matching: hard filter + fit score + style score + feed ranking.

Plain numeric comparison, no vector DB. Fit and style are two independent numbers and are
never blended into one — `rank_key` orders by both but the API always returns both.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.models import Category, PrecisionTier
from app.services.measurements import BODY_TO_GARMENT_SCALE, WEIGHTS_BY_CATEGORY

# Hard-filter tolerance (cm) per garment field. Widened for `estimated`, narrowed for `confirmed`.
BASE_TOLERANCE_CM: dict[str, float] = {
    "outseam_cm": 6.0,
    "inseam_cm": 5.0,
    "rise_cm": 4.0,
    "waist_flat_cm": 4.0,
    "hip_flat_cm": 5.0,
    "pit_to_pit_cm": 5.0,
    "shoulder_flat_cm": 3.0,
    "length_cm": 6.0,
}

TIER_TOLERANCE_MULTIPLIER: dict[PrecisionTier, float] = {
    PrecisionTier.estimated: 1.6,
    PrecisionTier.measured: 1.0,
    PrecisionTier.confirmed: 0.75,
}

# Distance (cm) at which a single field's contribution hits zero.
FIELD_ZERO_DISTANCE_CM: dict[str, float] = {
    "outseam_cm": 8.0,
    "inseam_cm": 7.0,
    "rise_cm": 5.0,
    "waist_flat_cm": 5.0,
    "hip_flat_cm": 6.0,
    "pit_to_pit_cm": 6.0,
    "shoulder_flat_cm": 4.0,
    "length_cm": 8.0,
}

# Fit is only trustworthy when enough of the category's weight was actually compared.
MIN_COVERAGE_FOR_FIT = 0.4


@dataclass(frozen=True)
class FitResult:
    score: int  # 0–100
    confidence: float  # 0..1 — share of category weight covered by fields both sides had
    fields_used: tuple[str, ...] = ()
    passed_filter: bool = True


def _body_as_garment(body: dict[str, float | None], body_field: str) -> float | None:
    v = body.get(body_field)
    if v is None:
        return None
    return v * BODY_TO_GARMENT_SCALE.get(body_field, 1.0)


def tolerance_for(field_name: str, tier: PrecisionTier) -> float:
    return BASE_TOLERANCE_CM[field_name] * TIER_TOLERANCE_MULTIPLIER[tier]


def passes_hard_filter(
    category: Category,
    body: dict[str, float | None],
    garment: dict[str, float | None],
    tier: PrecisionTier,
) -> bool:
    """Exclude if any field both parties have data for is outside the tolerance band."""
    for garment_field, body_field, _w in WEIGHTS_BY_CATEGORY[category]:
        g = garment.get(garment_field)
        b = _body_as_garment(body, body_field)
        if g is None or b is None:
            continue
        if abs(g - b) > tolerance_for(garment_field, tier):
            return False
    return True


def fit_score(
    category: Category,
    body: dict[str, float | None],
    garment: dict[str, float | None],
    tier: PrecisionTier = PrecisionTier.measured,
) -> FitResult:
    """Weighted inverse distance. Missing fields dropped, remaining weights renormalised.

    Confidence = covered weight / total weight, so it falls as coverage falls. Surface it.
    """
    weights = WEIGHTS_BY_CATEGORY[category]
    total_w = sum(w for _, _, w in weights)
    covered_w = 0.0
    acc = 0.0
    used: list[str] = []
    for garment_field, body_field, w in weights:
        g = garment.get(garment_field)
        b = _body_as_garment(body, body_field)
        if g is None or b is None:
            continue
        dist = abs(g - b)
        zero_at = FIELD_ZERO_DISTANCE_CM[garment_field]
        contribution = max(0.0, 1.0 - dist / zero_at)
        acc += w * contribution
        covered_w += w
        if garment_field not in used:
            used.append(garment_field)

    passed = passes_hard_filter(category, body, garment, tier)
    if covered_w == 0:
        return FitResult(score=0, confidence=0.0, fields_used=(), passed_filter=passed)
    score = round(100 * acc / covered_w)
    confidence = round(covered_w / total_w, 2)
    return FitResult(
        score=score, confidence=confidence, fields_used=tuple(used), passed_filter=passed
    )


# --- style ---------------------------------------------------------------------------------

STYLE_DIMENSIONS = 6  # e.g. minimal, vintage, sporty, tailored, boho, streetwear


def style_score(user_vector: list[float] | None, listing_vector: list[float] | None) -> int:
    """Cosine similarity → 0–100. Neutral 50 when either side is unknown.

    Kept in its own function, module-level, so nothing can accidentally fold it into fit.
    """
    if not user_vector or not listing_vector:
        return 50
    n = min(len(user_vector), len(listing_vector))
    dot = sum(user_vector[i] * listing_vector[i] for i in range(n))
    nu = sum(x * x for x in user_vector[:n]) ** 0.5
    nl = sum(x * x for x in listing_vector[:n]) ** 0.5
    if nu == 0 or nl == 0:
        return 50
    cos = dot / (nu * nl)
    return int(round(50 + 50 * cos))


def listing_style_vector(brand: str | None, category: Category, title: str) -> list[float]:
    """Cheap keyword-derived style vector for a listing; replaced by behaviour data later."""
    text = f"{brand or ''} {title}".lower()
    v = [0.0] * STYLE_DIMENSIONS
    keywords = (
        ("minimal", ("cos", "arket", "uniqlo", "plain", "basic")),
        ("vintage", ("vintage", "retro", "90s", "80s", "levi")),
        ("sporty", ("nike", "adidas", "sport", "track", "gym")),
        ("tailored", ("blazer", "tailored", "suit", "trouser", "reiss")),
        ("boho", ("floral", "boho", "linen", "free people")),
        ("street", ("cargo", "hoodie", "street", "oversized", "carhartt")),
    )
    for i, (_name, words) in enumerate(keywords):
        if any(w in text for w in words):
            v[i] = 1.0
    if sum(v) == 0:
        v[0] = 0.5  # weakly "minimal" by default
    return v


# --- ranking -------------------------------------------------------------------------------

REASON_TWIN = "twin"
REASON_FOLLOWING = "following"
REASON_MATCH = "match"

REASON_RANK = {REASON_TWIN: 0, REASON_FOLLOWING: 1, REASON_MATCH: 2}


@dataclass
class ScoredListing:
    listing: Any
    fit: FitResult
    style: int
    reason: str
    seller_boost: float = 0.0  # 0..1 from seller accuracy; high accuracy ranks higher
    created_at: datetime = field(default_factory=datetime.utcnow)

    def rank_key(self) -> tuple:
        # Twins first, then follows, then everything else by fit and style with recency tiebreak.
        # Fit and style are ordered lexicographically here — they are NOT summed.
        return (
            REASON_RANK[self.reason],
            -(self.fit.score * self.fit.confidence + 20 * self.seller_boost),
            -self.style,
            -self.created_at.timestamp(),
        )


def rank(scored: list[ScoredListing]) -> list[ScoredListing]:
    return sorted(scored, key=lambda s: s.rank_key())
