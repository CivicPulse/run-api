"""Unit tests for Phase 112 Plan 01 pre-commit bootstrap.

Asserts the pre-commit config, ruff DTZ rule, web husky+lint-staged wiring,
bootstrap-dev.sh tail, and a <5s smoke that ruff rejects a deliberate
format violation via `pre-commit run --files`.
"""

from __future__ import annotations

import contextlib
import json
import subprocess
import time
import tomllib
from pathlib import Path

import pytest
import yaml

REPO_ROOT = Path(__file__).resolve().parents[2]
PRECOMMIT_CONFIG = REPO_ROOT / ".pre-commit-config.yaml"
PYPROJECT = REPO_ROOT / "pyproject.toml"
WEB_PACKAGE_JSON = REPO_ROOT / "web" / "package.json"
BOOTSTRAP_DEV = REPO_ROOT / "scripts" / "bootstrap-dev.sh"


# ---------------------------------------------------------------------------
# Task 1: .pre-commit-config.yaml + pyproject ruff DTZ
# ---------------------------------------------------------------------------


def _load_precommit() -> dict:
    assert PRECOMMIT_CONFIG.exists(), ".pre-commit-config.yaml missing at repo root"
    return yaml.safe_load(PRECOMMIT_CONFIG.read_text())


def test_precommit_config_is_valid_yaml() -> None:
    cfg = _load_precommit()
    assert isinstance(cfg, dict)
    assert "repos" in cfg and isinstance(cfg["repos"], list)
    assert cfg["repos"], "pre-commit config has no repos"


def test_precommit_declares_ruff_check_and_format() -> None:
    cfg = _load_precommit()
    hook_ids: list[str] = []
    for repo in cfg["repos"]:
        for hook in repo.get("hooks", []):
            hook_ids.append(hook["id"])
    assert "ruff-check" in hook_ids or "ruff" in hook_ids, (
        f"ruff check hook not found; hooks: {hook_ids}"
    )
    assert "ruff-format" in hook_ids, f"ruff-format hook not found; hooks: {hook_ids}"


def test_precommit_declares_prettier_scoped_to_web() -> None:
    cfg = _load_precommit()
    for repo in cfg["repos"]:
        for hook in repo.get("hooks", []):
            if hook["id"] == "prettier":
                files_pattern = hook.get("files", "")
                assert "web" in files_pattern, (
                    f"prettier hook not scoped to web/: files={files_pattern!r}"
                )
                return
    pytest.fail("prettier hook not declared")


def test_precommit_declares_uv_lock_check() -> None:
    cfg = _load_precommit()
    for repo in cfg["repos"]:
        for hook in repo.get("hooks", []):
            if hook["id"] == "uv-lock-check":
                entry = hook.get("entry", "")
                assert "uv lock" in entry, f"uv-lock-check entry wrong: {entry!r}"
                return
    pytest.fail("uv-lock-check hook not declared")


def test_precommit_declares_lint_staged_local_hook() -> None:
    cfg = _load_precommit()
    for repo in cfg["repos"]:
        for hook in repo.get("hooks", []):
            if hook["id"] == "lint-staged":
                entry = hook.get("entry", "")
                assert "lint-staged" in entry
                assert "cd web" in entry or "web" in entry, (
                    f"lint-staged hook not pointed at web/: {entry!r}"
                )
                return
    pytest.fail("lint-staged local hook not declared")


def test_pyproject_ruff_select_includes_dtz() -> None:
    data = tomllib.loads(PYPROJECT.read_text())
    select = data["tool"]["ruff"]["lint"]["select"]
    assert "DTZ" in select, f"ruff select missing DTZ: {select}"


# ---------------------------------------------------------------------------
# Task 2: husky + lint-staged in web/ + bootstrap-dev.sh wiring
# ---------------------------------------------------------------------------


def _load_web_package() -> dict:
    assert WEB_PACKAGE_JSON.exists()
    return json.loads(WEB_PACKAGE_JSON.read_text())


def test_web_package_has_husky_and_lint_staged_devdeps() -> None:
    pkg = _load_web_package()
    dev = pkg.get("devDependencies", {})
    assert "husky" in dev, "husky missing from web devDependencies"
    assert "lint-staged" in dev, "lint-staged missing from web devDependencies"
    assert dev["husky"].startswith("^9."), f"husky not pinned to ^9.x: {dev['husky']}"
    assert dev["lint-staged"].startswith("^16."), (
        f"lint-staged not pinned to ^16.x: {dev['lint-staged']}"
    )


def test_web_package_has_prepare_husky_script() -> None:
    pkg = _load_web_package()
    scripts = pkg.get("scripts", {})
    assert scripts.get("prepare") == "husky", (
        f"prepare script must be 'husky' (v9 style), got {scripts.get('prepare')!r}"
    )


def test_web_package_has_lint_staged_config() -> None:
    pkg = _load_web_package()
    ls = pkg.get("lint-staged")
    assert ls, "lint-staged config block missing from web/package.json"
    # Expect at least one TS pattern mapping to vitest related and prettier.
    ts_patterns = [k for k in ls if "ts" in k]
    assert ts_patterns, f"no ts pattern in lint-staged: {list(ls.keys())}"
    flat = json.dumps(ls)
    assert "vitest related" in flat, f"vitest related --run missing: {ls}"
    assert "prettier" in flat, f"prettier missing from lint-staged: {ls}"


def test_bootstrap_dev_tail_installs_hooks_and_deps() -> None:
    body = BOOTSTRAP_DEV.read_text()
    assert "pre-commit install" in body, "bootstrap-dev.sh missing `pre-commit install`"
    assert "cd web && npm install" in body or "(cd web && npm install)" in body, (
        "bootstrap-dev.sh missing `cd web && npm install`"
    )
    assert "scripts/doctor.sh" in body, "bootstrap-dev.sh missing doctor.sh invocation"


# ---------------------------------------------------------------------------
# Smoke: pre-commit hook rejects a deliberate ruff violation in <5s
# ---------------------------------------------------------------------------


def test_precommit_rejects_ruff_violation_under_5s(tmp_path: Path) -> None:
    """Create a deliberately-broken Python file and prove the ruff hook
    fires on it via `pre-commit run --files`. Asserts non-zero exit and
    total wall-time under 5 seconds.
    """
    # Place the tmp file inside the repo so pre-commit picks up config + env.
    scratch = REPO_ROOT / ".precommit-smoke-scratch"
    scratch.mkdir(exist_ok=True)
    bad_file = scratch / "bad.py"
    # Naive datetime use (DTZ) + format violation (`x = 1 ; y=2`).
    bad_file.write_text(
        "from datetime import datetime\n\nx = 1 ; y=2\nz = datetime.utcnow()\n"
    )
    try:
        start = time.monotonic()
        proc = subprocess.run(
            [
                "uv",
                "run",
                "pre-commit",
                "run",
                "--files",
                str(bad_file),
                "--config",
                str(PRECOMMIT_CONFIG),
            ],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=30,
        )
        elapsed = time.monotonic() - start
        assert proc.returncode != 0, (
            f"pre-commit did not reject bad file:\nstdout={proc.stdout}\n"
            f"stderr={proc.stderr}"
        )
        combined = proc.stdout + proc.stderr
        assert "ruff" in combined.lower(), f"ruff not cited in output: {combined}"
        assert elapsed < 5.0, f"pre-commit took {elapsed:.2f}s, exceeds 5s budget"
    finally:
        # Clean up scratch dir so it never ends up tracked.
        with contextlib.suppress(FileNotFoundError):
            bad_file.unlink()
        with contextlib.suppress(OSError):
            scratch.rmdir()
