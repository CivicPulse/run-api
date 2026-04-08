from __future__ import annotations

from app.models.phone_validation import PhoneValidation


def test_phone_validation_model_has_expected_columns():
    table = PhoneValidation.__table__
    columns = table.c.keys()

    assert "campaign_id" in columns
    assert "normalized_phone_number" in columns
    assert "status" in columns
    assert "is_valid" in columns
    assert "carrier_name" in columns
    assert "line_type" in columns
    assert "sms_capable" in columns
    assert "lookup_data" in columns
    assert "validated_at" in columns
    assert "last_lookup_attempt_at" in columns


def test_phone_validation_unique_constraint_is_campaign_scoped():
    constraint_columns = {
        tuple(constraint.columns.keys())
        for constraint in PhoneValidation.__table__.constraints
        if getattr(constraint, "columns", None) is not None
    }

    assert ("campaign_id", "normalized_phone_number") in constraint_columns


def test_phone_validation_stores_lookup_fields_separately_from_contact_source():
    columns = set(PhoneValidation.__table__.c.keys())

    assert "type" not in columns
    assert "source" not in columns
    assert "value" not in columns
