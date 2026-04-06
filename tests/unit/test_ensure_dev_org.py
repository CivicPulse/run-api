from __future__ import annotations

import importlib.util
from pathlib import Path
from unittest.mock import MagicMock, patch


def _load_module():
    script_path = Path(__file__).resolve().parents[2] / "scripts" / "ensure-dev-org.py"
    spec = importlib.util.spec_from_file_location("ensure_dev_org", script_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@patch.dict(
    "os.environ",
    {
        "DEV_ORG_ZITADEL_ID": "org-dev-123",
        "DEV_ADMIN_ZITADEL_ID": "admin-dev-123",
        "DATABASE_URL_SYNC": "postgresql+psycopg2://postgres:postgres@localhost:5432/run_api",
    },
    clear=False,
)
def test_ensure_dev_org_creates_smoke_campaign_and_owner_membership():
    module = _load_module()

    mock_cur = MagicMock()
    # user exists? org missing? org membership missing? campaign missing?
    mock_cur.fetchone.side_effect = [None, None]
    mock_conn = MagicMock()
    mock_conn.cursor.return_value = mock_cur

    with patch.object(module.psycopg2, "connect", return_value=mock_conn):
        module.main()

    executed_calls = mock_cur.execute.call_args_list
    executed_sql = [call.args[0] for call in executed_calls]
    assert any("INSERT INTO campaigns" in sql for sql in executed_sql)
    assert any("INSERT INTO campaign_members" in sql for sql in executed_sql)

    campaign_call = next(
        call for call in executed_calls if "INSERT INTO campaigns" in call.args[0]
    )
    membership_call = next(
        call
        for call in executed_calls
        if "INSERT INTO campaign_members" in call.args[0]
    )

    assert module.ADMIN_SMOKE_CAMPAIGN_NAME in campaign_call.args[1]
    assert "admin-smoke-test-campaign" in campaign_call.args[1]
    assert "owner" in membership_call.args[1]
    mock_conn.commit.assert_called_once()
