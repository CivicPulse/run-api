"""Unit tests for org login policy automation in create-e2e-users script."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from unittest.mock import MagicMock

import httpx
import pytest


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


def _response(
    method: str, path: str, status_code: int, payload: dict
) -> httpx.Response:
    request = httpx.Request(method, f"http://zitadel:8080{path}")
    return httpx.Response(status_code, json=payload, request=request)


def test_policy_helper_noop_when_compliant():
    module = _load_module()
    client = MagicMock(spec=httpx.Client)
    client.request.side_effect = [
        _response(
            "POST",
            module.LOGIN_POLICY_SEARCH_PATH,
            200,
            {
                "result": [
                    {
                        "id": "policy-1",
                        "allowUsernamePassword": True,
                        "forceMfa": False,
                        "secondFactors": [],
                        "multiFactors": [],
                    }
                ]
            },
        )
    ]

    module.ensure_org_login_policy(client, "pat-token", "org-1", strict=True)

    assert client.request.call_count == 1
    sent_path = client.request.call_args.kwargs["json"]["queries"][0]["orgId"]
    assert sent_path == "org-1"


def test_policy_helper_creates_policy_when_missing_and_verifies():
    module = _load_module()
    client = MagicMock(spec=httpx.Client)
    client.request.side_effect = [
        _response("POST", module.LOGIN_POLICY_SEARCH_PATH, 200, {"result": []}),
        _response("POST", module.LOGIN_POLICY_PATH, 200, {"id": "policy-new"}),
        _response(
            "POST",
            module.LOGIN_POLICY_SEARCH_PATH,
            200,
            {
                "result": [
                    {
                        "id": "policy-new",
                        "allowUsernamePassword": True,
                        "forceMfa": False,
                        "secondFactors": [],
                        "multiFactors": [],
                    }
                ]
            },
        ),
    ]

    module.ensure_org_login_policy(client, "pat-token", "org-1", strict=True)

    assert client.request.call_count == 3
    create_call = client.request.call_args_list[1]
    assert create_call.args[0] == "POST"
    assert create_call.args[1].endswith(module.LOGIN_POLICY_PATH)
    payload = create_call.kwargs["json"]
    assert payload["orgId"] == "org-1"
    assert payload["forceMfa"] is False
    assert payload["secondFactors"] == []
    assert payload["multiFactors"] == []


def test_strict_verify_failure_includes_endpoint_and_status():
    module = _load_module()
    client = MagicMock(spec=httpx.Client)
    client.request.side_effect = [
        _response("POST", module.LOGIN_POLICY_SEARCH_PATH, 500, {"message": "boom"})
    ]

    with pytest.raises(SystemExit) as exc_info:
        module.verify_org_login_policy(client, "pat-token", "org-1", strict=True)

    message = str(exc_info.value)
    assert module.LOGIN_POLICY_SEARCH_PATH in message
    assert "status=500" in message
