from __future__ import annotations

import importlib.util
from pathlib import Path
from unittest.mock import MagicMock


def _load_module():
    script_path = (
        Path(__file__).resolve().parents[2] / "scripts" / "create-e2e-users.py"
    )
    spec = importlib.util.spec_from_file_location("create_e2e_users", script_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_find_target_campaigns_prefers_seeded_campaign_names():
    module = _load_module()
    cur = MagicMock()
    cur.fetchall.return_value = [
        ("camp-1", "Admin Smoke Test Campaign"),
        ("camp-2", "Macon-Bibb Demo Campaign"),
    ]

    campaigns = module._find_target_campaigns(cur)

    assert campaigns == [
        ("camp-1", "Admin Smoke Test Campaign"),
        ("camp-2", "Macon-Bibb Demo Campaign"),
    ]
    first_query = cur.execute.call_args_list[0].args[0]
    first_params = cur.execute.call_args_list[0].args[1]
    assert "WHERE name = ANY" in first_query
    assert list(module.TARGET_CAMPAIGN_NAMES) == first_params[0]


def test_find_target_campaigns_falls_back_to_first_campaign_when_named_targets_missing():
    module = _load_module()
    cur = MagicMock()
    cur.fetchall.return_value = []
    cur.fetchone.return_value = ("fallback-campaign", "Some Other Campaign")

    campaigns = module._find_target_campaigns(cur)

    assert campaigns == [("fallback-campaign", "Some Other Campaign")]
    assert cur.execute.call_count == 2
    assert (
        "SELECT id::text, name FROM campaigns LIMIT 1"
        in cur.execute.call_args_list[1].args[0]
    )
