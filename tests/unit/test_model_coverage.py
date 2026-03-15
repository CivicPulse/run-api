"""Regression test: all model files are imported in app/db/base.py."""

from __future__ import annotations

from pathlib import Path


def test_all_models_imported_in_base():
    """Every .py file in app/models/ (except __init__.py) has
    a matching import in base.py."""
    models_dir = Path("app/models")
    base_path = Path("app/db/base.py")
    base_content = base_path.read_text()

    model_files = sorted(
        p.stem
        for p in models_dir.glob("*.py")
        if p.name != "__init__.py" and not p.name.startswith("_")
    )

    missing = [
        name for name in model_files if f"import app.models.{name}" not in base_content
    ]

    assert not missing, f"Models not imported in app/db/base.py: {missing}"
