"""Seller accuracy: rolling pass rate on private fit ratings, shrunk toward a prior for
sellers with fewer than 10 rated sales. Poor accuracy is never shown publicly — it only
demotes ranking and produces a private prompt to the seller.
"""

from __future__ import annotations

from dataclasses import dataclass

PRIOR_PASS_RATE = 0.80
PRIOR_STRENGTH = 10  # pseudo-observations; below 10 real ratings the prior dominates
HIGH_THRESHOLD = 0.92
HIGH_MIN_RATED = 5
GOOD_THRESHOLD = 0.80
NEEDS_ATTENTION_THRESHOLD = 0.65
NEEDS_ATTENTION_MIN_RATED = 3


@dataclass(frozen=True)
class Accuracy:
    score: float | None  # None when no ratings yet
    rated_sales: int
    passes: int

    @property
    def is_high(self) -> bool:
        return (
            self.score is not None
            and self.rated_sales >= HIGH_MIN_RATED
            and self.score >= HIGH_THRESHOLD
        )

    @property
    def tier(self) -> str:
        if self.score is None or self.rated_sales == 0:
            return "new"
        if self.is_high:
            return "high"
        if self.rated_sales >= NEEDS_ATTENTION_MIN_RATED and self.score < NEEDS_ATTENTION_THRESHOLD:
            return "needs_attention"
        return "good"

    @property
    def ranking_boost(self) -> float:
        """0..1 multiplier used by feed ranking. Silent demotion below the prior."""
        if self.score is None:
            return 0.5
        return max(0.0, min(1.0, (self.score - 0.5) / 0.5))

    @property
    def private_prompt(self) -> str | None:
        if self.tier == "needs_attention":
            return (
                "A few buyers said recent items didn't fit as described. Double-check your "
                "flat measurements with the tape laid flat, and make sure the first photo "
                "shows the item worn."
            )
        return None


def compute(passes: int, rated_sales: int) -> Accuracy:
    if rated_sales < 0 or passes < 0 or passes > rated_sales:
        raise ValueError("invalid counts")
    if rated_sales == 0:
        return Accuracy(score=None, rated_sales=0, passes=0)
    shrunk = (passes + PRIOR_PASS_RATE * PRIOR_STRENGTH) / (rated_sales + PRIOR_STRENGTH)
    return Accuracy(score=round(shrunk, 4), rated_sales=rated_sales, passes=passes)
