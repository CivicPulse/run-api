"""REL-06 (H11): Assert Settings class has no duplicate field declarations.

This test SHOULD FAIL on current main — app/core/config.py declares
`trusted_proxy_cidrs` and `rate_limit_unauthenticated` twice each, which
is brittle: whichever declaration comes last silently wins. Plan 76-02
will remove the stale earlier declarations.
"""

from __future__ import annotations

from pathlib import Path

from app.core.config import Settings

CONFIG_SOURCE = Path("app/core/config.py")


def test_trusted_proxy_cidrs_default_is_cloudflare_list() -> None:
    """Fresh Settings() must default trusted_proxy_cidrs to the Cloudflare CIDRs."""
    settings = Settings()
    assert len(settings.trusted_proxy_cidrs) >= 22, (
        "trusted_proxy_cidrs default must contain the full Cloudflare CIDR "
        f"list (>= 22 entries), got {len(settings.trusted_proxy_cidrs)}."
    )
    assert "173.245.48.0/20" in settings.trusted_proxy_cidrs, (
        "trusted_proxy_cidrs default must include Cloudflare CIDR "
        "173.245.48.0/20."
    )


def test_rate_limit_unauthenticated_default_is_60_per_minute() -> None:
    """Fresh Settings() must default rate_limit_unauthenticated to '60/minute'."""
    settings = Settings()
    assert settings.rate_limit_unauthenticated == "60/minute", (
        "rate_limit_unauthenticated default must be '60/minute', got "
        f"'{settings.rate_limit_unauthenticated}'."
    )


def test_settings_file_has_no_duplicate_trusted_proxy_cidrs_declaration() -> None:
    """trusted_proxy_cidrs must be declared EXACTLY ONCE in config.py."""
    text = CONFIG_SOURCE.read_text()
    count = text.count("trusted_proxy_cidrs: list[str]")
    assert count == 1, (
        "app/core/config.py must declare trusted_proxy_cidrs: list[str] "
        f"exactly once; found {count} declarations."
    )


def test_settings_file_has_no_duplicate_rate_limit_declaration() -> None:
    """rate_limit_unauthenticated must be declared EXACTLY ONCE in config.py."""
    text = CONFIG_SOURCE.read_text()
    count = text.count("rate_limit_unauthenticated: str = ")
    assert count == 1, (
        "app/core/config.py must declare rate_limit_unauthenticated: str "
        f"exactly once; found {count} declarations."
    )
