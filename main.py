"""Thin wrapper for uvicorn -- imports from app package."""

from app.main import create_app

app = create_app()
