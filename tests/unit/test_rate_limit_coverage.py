"""Verify all API endpoints have rate limiting decorators (OBS-03, OBS-04).

This test introspects all route files in app/api/v1/ using AST parsing to
ensure every endpoint decorated with @router.{get,post,put,patch,delete}
also has a @limiter.limit() decorator, and that authenticated endpoints
use get_user_or_ip_key as key_func.

If this test fails, a new endpoint was added without rate limiting.
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

ROUTE_DIR = Path(__file__).parent.parent.parent / "app" / "api" / "v1"
SKIP_FILES = {"__init__.py", "router.py"}

# Endpoints explicitly exempted from the per-user key requirement.
# join.py POST /register uses get_current_user but intentionally uses
# IP-only rate limiting per D-04 (brand-new users have no campaign role).
USER_KEY_EXCEPTIONS = {
    ("join.py", "register_volunteer"),
}


def _get_route_files() -> list[Path]:
    """Return sorted list of route module files."""
    return sorted(f for f in ROUTE_DIR.glob("*.py") if f.name not in SKIP_FILES)


def _extract_decorator_name(dec: ast.expr) -> str:
    """Flatten a decorator AST node to a dotted string for matching."""
    return ast.dump(dec)


def _has_router_decorator(decorators: list[ast.expr]) -> bool:
    """Check if any decorator is router.{get,post,put,patch,delete}(...)."""
    http_methods = {"get", "post", "put", "patch", "delete"}
    for dec in decorators:
        # @router.get(...) → Call(func=Attribute(value=Name, attr))
        if isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute):
            attr = dec.func
            if (
                isinstance(attr.value, ast.Name)
                and attr.value.id == "router"
                and attr.attr in http_methods
            ):
                return True
    return False


def _has_limiter_decorator(decorators: list[ast.expr]) -> bool:
    """Check if any decorator is limiter.limit(...)."""
    for dec in decorators:
        if isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute):
            attr = dec.func
            if (
                isinstance(attr.value, ast.Name)
                and attr.value.id == "limiter"
                and attr.attr == "limit"
            ):
                return True
    return False


def _has_user_or_ip_key(decorators: list[ast.expr]) -> bool:
    """Check if any limiter.limit() decorator has key_func=get_user_or_ip_key."""
    for dec in decorators:
        if isinstance(dec, ast.Call) and isinstance(dec.func, ast.Attribute):
            attr = dec.func
            if (
                isinstance(attr.value, ast.Name)
                and attr.value.id == "limiter"
                and attr.attr == "limit"
            ):
                for kw in dec.keywords:
                    if (
                        kw.arg == "key_func"
                        and isinstance(kw.value, ast.Name)
                        and kw.value.id == "get_user_or_ip_key"
                    ):
                        return True
    return False


def _is_authenticated_endpoint(source: str, node: ast.AsyncFunctionDef) -> bool:
    """Check if endpoint uses require_role or get_current_user (authenticated)."""
    func_source = ast.get_source_segment(source, node) or ""
    return "require_role" in func_source or "get_current_user" in func_source


def _parse_endpoints(filepath: Path) -> list[tuple[str, bool, bool, bool]]:
    """Parse a route file and return endpoint info tuples.

    Returns list of (function_name, has_limiter, has_user_key, is_authenticated).
    """
    source = filepath.read_text()
    tree = ast.parse(source, filename=str(filepath))
    results = []

    for node in ast.walk(tree):
        if not isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)):
            continue
        if not _has_router_decorator(node.decorator_list):
            continue

        has_limiter = _has_limiter_decorator(node.decorator_list)
        has_user_key = _has_user_or_ip_key(node.decorator_list)
        is_authenticated = _is_authenticated_endpoint(source, node)

        results.append((node.name, has_limiter, has_user_key, is_authenticated))

    return results


class TestRateLimitCoverage:
    """Verify rate limit decorators on all API endpoints."""

    def test_route_files_discovered(self) -> None:
        """Sanity check: we find the expected number of route files."""
        route_files = _get_route_files()
        # As of this writing there are 22 route files (24 total minus
        # __init__.py and router.py). Allow for growth but fail if
        # the directory moved or glob is broken.
        assert len(route_files) >= 20, (
            f"Expected at least 20 route files, found {len(route_files)}. "
            f"Did the route directory move? ROUTE_DIR={ROUTE_DIR}"
        )

    def test_all_endpoints_have_rate_limit_decorator(self) -> None:
        """Every @router endpoint must have @limiter.limit decorator (OBS-03)."""
        missing: list[str] = []
        total_endpoints = 0

        for filepath in _get_route_files():
            endpoints = _parse_endpoints(filepath)
            for name, has_limiter, _has_user_key, _is_auth in endpoints:
                total_endpoints += 1
                if not has_limiter:
                    missing.append(f"{filepath.name}::{name}")

        assert total_endpoints > 0, "No endpoints found -- AST parsing may be broken"
        assert not missing, f"Endpoints missing @limiter.limit decorator: {missing}"

    def test_authenticated_endpoints_use_user_key(self) -> None:
        """Authenticated endpoints must use get_user_or_ip_key (OBS-04).

        Exceptions: join.py register_volunteer uses IP-only key per D-04.
        """
        missing: list[str] = []

        for filepath in _get_route_files():
            endpoints = _parse_endpoints(filepath)
            for name, has_limiter, has_user_key, is_authenticated in endpoints:
                if (filepath.name, name) in USER_KEY_EXCEPTIONS:
                    continue
                if is_authenticated and has_limiter and not has_user_key:
                    missing.append(f"{filepath.name}::{name}")

        assert not missing, (
            f"Authenticated endpoints missing key_func=get_user_or_ip_key: {missing}"
        )

    @pytest.mark.parametrize("filepath", _get_route_files(), ids=lambda p: p.name)
    def test_per_file_rate_limit_coverage(self, filepath: Path) -> None:
        """Per-file parametrized check for clearer failure messages."""
        endpoints = _parse_endpoints(filepath)
        missing = [name for name, has_limiter, _, _ in endpoints if not has_limiter]
        assert not missing, (
            f"{filepath.name}: endpoints missing @limiter.limit: {missing}"
        )
