"""Verify TaskIQ is fully removed from the codebase."""

from __future__ import annotations

import ast
from pathlib import Path


def test_no_taskiq_imports():
    """No Python file under app/ imports from taskiq or app.tasks.broker."""
    app_dir = Path(__file__).resolve().parent.parent.parent / "app"
    violations = []
    for py_file in app_dir.rglob("*.py"):
        source = py_file.read_text()
        try:
            tree = ast.parse(source)
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if "taskiq" in alias.name or alias.name == "app.tasks.broker":
                        violations.append(f"{py_file}: import {alias.name}")
            elif isinstance(node, ast.ImportFrom):
                module = node.module or ""
                if "taskiq" in module or module == "app.tasks.broker":
                    violations.append(f"{py_file}: from {module} import ...")
    assert not violations, "TaskIQ references found:\n" + "\n".join(violations)
