import pytest

from app.config import Settings
from app.services import accuracy, fees


def settings(**kw):
    return Settings(_env_file=None, **kw)


def test_protection_fee_fixed_plus_percentage():
    s = settings(protection_fee_fixed_pence=99, protection_fee_bps=300, shipping_flat_pence=399)
    q = fees.quote(3500, s, seller_high_accuracy=False)
    assert q.protection_fee_pence == 99 + 105
    assert q.total_pence == 3500 + 204 + 399
    assert q.seller_fee_pence == 0  # 0% seller fee
    assert q.seller_payout_pence == 3500


def test_seller_fee_logic_exists_even_at_zero():
    s = settings(seller_fee_bps=500)
    q = fees.quote(10_000, s, seller_high_accuracy=False)
    assert q.seller_fee_pence == 500
    assert q.seller_payout_pence == 9_500


def test_high_accuracy_waives_protection_fee():
    q = fees.quote(3500, settings(), seller_high_accuracy=True)
    assert q.protection_fee_pence == 0
    assert q.protection_fee_waived and q.waived_reason


def test_quote_rejects_non_positive():
    with pytest.raises(ValueError):
        fees.quote(0, settings(), seller_high_accuracy=False)


def test_accuracy_new_seller_has_no_score():
    a = accuracy.compute(0, 0)
    assert a.score is None and a.tier == "new" and not a.is_high
    assert a.ranking_boost == 0.5


def test_accuracy_shrinks_toward_prior_below_ten_sales():
    perfect_3 = accuracy.compute(3, 3)
    assert perfect_3.score < 1.0  # conservative
    assert perfect_3.score == pytest.approx((3 + 8) / 13, abs=1e-4)
    assert not perfect_3.is_high  # too few rated sales for the badge
    perfect_30 = accuracy.compute(30, 30)
    assert perfect_30.score > perfect_3.score
    assert perfect_30.is_high and perfect_30.tier == "high"


def test_accuracy_needs_attention_is_private_prompt_only():
    poor = accuracy.compute(2, 12)
    assert poor.tier == "needs_attention"
    assert poor.private_prompt
    assert poor.ranking_boost < 0.5  # silent demotion


def test_accuracy_rejects_bad_counts():
    with pytest.raises(ValueError):
        accuracy.compute(5, 3)
