"""Regression tests for R002: voter source_type default preserved during creation.

The bug: using model_dump(exclude_unset=True) silently drops schema defaults
like source_type="manual", causing a NOT NULL violation on INSERT.
The fix: use model_dump(exclude_none=True) instead, which preserves defaults
that were set by the schema but not explicitly by the caller.
"""

from __future__ import annotations

from app.schemas.voter import VoterCreateRequest


def test_source_type_default_survives_model_dump():
    """R002 regression: model_dump(exclude_none=True) preserves the default
    source_type."""
    request = VoterCreateRequest(first_name="Jane", last_name="Doe")
    dumped = request.model_dump(exclude_none=True)
    assert "source_type" in dumped, "source_type must be present in model_dump output"
    assert dumped["source_type"] == "manual"


def test_source_type_explicit_preserved():
    """Explicit source_type='import' is preserved through model_dump."""
    request = VoterCreateRequest(
        first_name="Jane", last_name="Doe", source_type="import"
    )
    dumped = request.model_dump(exclude_none=True)
    assert dumped["source_type"] == "import"


def test_source_type_default_lost_with_exclude_unset():
    """Demonstrates the bug: exclude_unset=True drops the schema default.

    This proves WHY the fix (exclude_none instead of exclude_unset) matters.
    If this test ever fails, the schema default behavior has changed and
    the fix in voter.py:443 should be re-evaluated.
    """
    request = VoterCreateRequest(first_name="Jane", last_name="Doe")
    dumped = request.model_dump(exclude_unset=True)
    assert "source_type" not in dumped, (
        "exclude_unset=True should drop the default — "
        "if this fails, Pydantic behavior changed"
    )
