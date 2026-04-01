"""Application configuration via pydantic-settings."""

from __future__ import annotations

from pydantic import ConfigDict
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = ConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Application
    app_name: str = "CivicPulse Run API"
    debug: bool = False

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/run_api"
    database_url_sync: str = (
        "postgresql+psycopg2://postgres:postgres@localhost:5432/run_api"
    )

    # ZITADEL (service account for backend API calls)
    zitadel_issuer: str = "https://auth.civpulse.org"
    zitadel_base_url: str = ""  # Internal URL for in-cluster calls; defaults to issuer
    zitadel_project_id: str = ""
    zitadel_service_client_id: str = ""
    zitadel_service_client_secret: str = ""

    # ZITADEL SPA (public OIDC client for browser)
    zitadel_spa_client_id: str = ""

    # CORS
    cors_allowed_origins: list[str] = [
        "http://localhost:5173",
        "https://dev.tailb56d83.ts.net:5173",
        "https://dev.tailb56d83.ts.net:8000",
    ]

    # Rate limiting
    disable_rate_limit: bool = False
    trusted_proxy_cidrs: list[str] = []
    rate_limit_unauthenticated: str = "30/minute"

    # S3-compatible object storage (MinIO local, Cloudflare R2 production)
    s3_endpoint_url: str = "http://localhost:9000"
    s3_presign_endpoint_url: str | None = None
    s3_access_key_id: str = "minioadmin"
    s3_secret_access_key: str = "minioadmin"
    s3_bucket: str = "voter-imports"
    s3_region: str = "us-east-1"

    # Import processing
    import_batch_size: int = 1000

    # Observability
    sentry_dsn: str = ""
    sentry_traces_sample_rate: float = 0.1
    environment: str = "development"

    # Rate limiting
    trusted_proxy_cidrs: list[str] = [
        "173.245.48.0/20",
        "103.21.244.0/22",
        "103.22.200.0/22",
        "103.31.4.0/22",
        "141.101.64.0/18",
        "108.162.192.0/18",
        "190.93.240.0/20",
        "188.114.96.0/20",
        "197.234.240.0/22",
        "198.41.128.0/17",
        "162.158.0.0/15",
        "104.16.0.0/13",
        "104.24.0.0/14",
        "172.64.0.0/13",
        "131.0.72.0/22",
        "2400:cb00::/32",
        "2606:4700::/32",
        "2803:f800::/32",
        "2405:b500::/32",
        "2405:8100::/32",
        "2a06:98c0::/29",
        "2c0f:f248::/32",
    ]
    rate_limit_unauthenticated: str = "60/minute"
    rate_limit_authenticated_per_user: str = "300/minute"
    rate_limit_authenticated_per_ip: str = "600/minute"


settings = Settings()
