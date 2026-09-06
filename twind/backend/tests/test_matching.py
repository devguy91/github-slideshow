from datetime import UTC, datetime

from app.models import Category, PrecisionTier
from app.services import matching
from app.services.matching import ScoredListing, fit_score, passes_hard_filter, rank, style_score


def body(**kw):
    return {"outseam_cm": 103, "inseam_cm": 77, "rise_cm": 26, "waist_cm": 80, "hip_cm": 104, **kw}


def garment(**kw):
    return {
        "outseam_cm": 104,
        "inseam_cm": 78,
        "rise_cm": 26,
        "waist_flat_cm": 40,
        "hip_flat_cm": 52,
        **kw,
    }


def test_perfect_match_scores_high_with_full_confidence():
    r = fit_score(Category.bottoms, body(), garment())
    assert r.score >= 85
    assert r.confidence == 1.0
    assert set(r.fields_used) == {
        "outseam_cm",
        "inseam_cm",
        "rise_cm",
        "waist_flat_cm",
        "hip_flat_cm",
    }


def test_missing_fields_drop_and_renormalise_and_lower_confidence():
    partial = body()
    partial.pop("hip_cm")
    partial.pop("waist_cm")
    r = fit_score(Category.bottoms, partial, garment())
    assert r.confidence == 0.8  # 0.35+0.25+0.20 of 1.0
    assert "hip_flat_cm" not in r.fields_used
    assert r.score >= 85  # renormalised, still good on the fields we have


def test_no_overlap_gives_zero_confidence():
    r = fit_score(Category.bottoms, {}, garment())
    assert r.score == 0 and r.confidence == 0.0


def test_hard_filter_excludes_far_outseam_for_measured_but_not_estimated():
    far = garment(outseam_cm=103 + 8)  # 8cm off
    assert not passes_hard_filter(Category.bottoms, body(), far, PrecisionTier.measured)
    assert passes_hard_filter(Category.bottoms, body(), far, PrecisionTier.estimated)  # 6*1.6=9.6
    assert not passes_hard_filter(Category.bottoms, body(), far, PrecisionTier.confirmed)


def test_body_circumference_compared_against_flat_half():
    # waist 80cm body ↔ 40cm flat is an exact match; 48 flat is 16cm body-scale off
    assert passes_hard_filter(
        Category.bottoms, body(waist_cm=80), garment(waist_flat_cm=40), PrecisionTier.measured
    )
    assert not passes_hard_filter(
        Category.bottoms, body(waist_cm=80), garment(waist_flat_cm=48), PrecisionTier.measured
    )


def test_tops_reachable_without_bust():
    b = {"shoulder_cm": 40, "torso_length_cm": 60}
    g = {"shoulder_flat_cm": 40, "length_cm": 62, "pit_to_pit_cm": 50}
    r = fit_score(Category.tops, b, g)
    assert r.score > 70
    assert "pit_to_pit_cm" not in r.fields_used
    assert 0 < r.confidence < 1


def test_style_score_is_independent_and_neutral_when_unknown():
    assert style_score(None, [1, 0, 0, 0, 0, 0]) == 50
    assert style_score([1, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0]) == 100
    assert style_score([1, 0, 0, 0, 0, 0], [0, 1, 0, 0, 0, 0]) == 50


def test_style_never_blended_into_fit():
    """Fit score must not depend on style inputs. Guards the architectural rule."""
    r1 = fit_score(Category.bottoms, body(), garment())
    r2 = fit_score(Category.bottoms, body(), garment())
    assert r1 == r2
    assert "style" not in matching.fit_score.__code__.co_names


def _scored(reason, fit, style, boost=0.5, ts=0):
    return ScoredListing(
        listing=None,
        fit=matching.FitResult(score=fit, confidence=1.0),
        style=style,
        reason=reason,
        seller_boost=boost,
        created_at=datetime.fromtimestamp(ts, UTC),
    )


def test_ranking_twins_then_follows_then_fit_with_recency_tiebreak():
    items = [
        _scored("match", 95, 90, ts=10),
        _scored("following", 60, 10, ts=5),
        _scored("twin", 40, 0, ts=1),
        _scored("match", 95, 90, ts=20),
    ]
    ranked = rank(items)
    assert [r.reason for r in ranked] == ["twin", "following", "match", "match"]
    assert ranked[2].created_at > ranked[3].created_at  # newer first on tie


def test_high_accuracy_seller_boosted_and_low_demoted():
    hi = _scored("match", 80, 50, boost=1.0)
    lo = _scored("match", 80, 50, boost=0.0)
    assert rank([lo, hi])[0] is hi
