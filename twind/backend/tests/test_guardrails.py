"""Constraints from the spec that must hold across the codebase."""

import pathlib
import re

import app.models  # noqa: F401
from app import schemas
from app.db import Base

ROOT = pathlib.Path(__file__).resolve().parents[1]


def test_no_weight_column_anywhere():
    for table in Base.metadata.tables.values():
        for col in table.columns:
            assert "weight" not in col.name.lower(), f"{table.name}.{col.name}"


def test_no_weight_in_schemas():
    for name in dir(schemas):
        obj = getattr(schemas, name)
        fields = getattr(obj, "model_fields", None)
        if isinstance(fields, dict):
            assert not any("weight" in f for f in fields), name


def test_public_profile_has_no_measurements():
    assert not any(f.endswith("_cm") for f in schemas.PublicProfile.model_fields)


def test_fit_rating_never_in_public_schemas():
    for name in ("PublicProfile", "ListingOut", "FeedCardOut"):
        assert "fit_rating" not in getattr(schemas, name).model_fields


def test_no_combined_fit_style_field():
    src = "".join(p.read_text() for p in (ROOT / "app").rglob("*.py"))
    assert not re.search(r"(combined|overall)_score", src)
    assert "fit_score" in src and "style_score" in src


def test_bust_optional_in_all_body_inputs():
    assert schemas.BodyProfileInput.model_fields["bust_cm"].default is None


def test_launch_slices_are_data_not_code():
    from app.services.slices import LAUNCH_SLICES

    names = {s["name"] for s in LAUNCH_SLICES}
    assert {"midsize", "tall"} <= names
    src = (ROOT / "app" / "services" / "slices.py").read_text()
    assert "resolve_slice" in src and "select(Slice)" in src  # ranges come from the table
