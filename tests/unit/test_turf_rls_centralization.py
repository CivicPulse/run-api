"""Verify turf overlap and voter endpoints use centralized get_campaign_db."""

import inspect

from app.api.deps import get_campaign_db
from app.api.v1.turfs import get_turf_overlaps, get_turf_voters


def test_get_turf_overlaps_uses_get_campaign_db():
    sig = inspect.signature(get_turf_overlaps)
    db_param = sig.parameters["db"]
    assert db_param.default.dependency is get_campaign_db


def test_get_turf_voters_uses_get_campaign_db():
    sig = inspect.signature(get_turf_voters)
    db_param = sig.parameters["db"]
    assert db_param.default.dependency is get_campaign_db


def test_get_turf_overlaps_no_inline_set_campaign_context():
    source = inspect.getsource(get_turf_overlaps)
    assert "set_campaign_context" not in source


def test_get_turf_voters_no_inline_set_campaign_context():
    source = inspect.getsource(get_turf_voters)
    assert "set_campaign_context" not in source
