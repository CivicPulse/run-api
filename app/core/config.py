"""Application configuration via pydantic-settings."""

from __future__ import annotations

from pydantic import ConfigDict
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = ConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Application
    app_name: str = "CivicPulse Run API"
    debug: bool = False

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/run_api"
    database_url_sync: str = (
        "postgresql+psycopg2://postgres:postgres@localhost:5432/run_api"
    )

    # ZITADEL
    zitadel_issuer: str = "https://auth.civpulse.org"
    zitadel_project_id: str = ""
    zitadel_service_client_id: str = ""
    zitadel_service_client_secret: str = ""


settings = Settings()
