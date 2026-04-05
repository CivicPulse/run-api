"""REL-04: Assert every httpx.AsyncClient in zitadel.py has timeout=10.0.

This test SHOULD FAIL on current main — no timeouts are set on any
AsyncClient instantiation in app/services/zitadel.py. Plan 76-02 will
add timeouts and flip this green.
"""

from __future__ import annotations

import re
from pathlib import Path

ZITADEL_SOURCE = Path("app/services/zitadel.py")


def _extract_async_client_calls(text: str) -> list[str]:
    """Return each httpx.AsyncClient(...) call's argument span.

    Handles multi-line calls by bracket-matching from the opening paren.
    """
    calls: list[str] = []
    pattern = re.compile(r"httpx\.AsyncClient\(")
    for match in pattern.finditer(text):
        start = match.end()  # position just after the '('
        depth = 1
        i = start
        while i < len(text) and depth > 0:
            ch = text[i]
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
            i += 1
        # text[start:i-1] is the content between parens
        calls.append(text[start : i - 1])
    return calls


def test_zitadel_source_has_async_client_calls() -> None:
    """Guard: ensure the file still contains AsyncClient calls (file not renamed)."""
    text = ZITADEL_SOURCE.read_text()
    calls = _extract_async_client_calls(text)
    assert len(calls) >= 1, (
        "Expected at least one httpx.AsyncClient(...) call in "
        "app/services/zitadel.py — has the file been refactored?"
    )


def test_every_async_client_has_10s_timeout() -> None:
    """Every httpx.AsyncClient(...) must declare timeout=10.0 (or Timeout(10...))."""
    text = ZITADEL_SOURCE.read_text()
    calls = _extract_async_client_calls(text)

    missing: list[str] = []
    for call in calls:
        if "timeout=10.0" in call or "timeout=httpx.Timeout(10" in call:
            continue
        missing.append(call.strip().replace("\n", " ")[:120])

    assert not missing, (
        f"{len(missing)} httpx.AsyncClient call(s) in "
        f"app/services/zitadel.py are missing timeout=10.0:\n"
        + "\n".join(f"  - httpx.AsyncClient({c})" for c in missing)
    )
