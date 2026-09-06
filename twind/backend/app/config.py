"""Runtime configuration. Everything comes from the environment (see .env.example)."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="TWIND_", extra="ignore")

    env: str = "dev"  # dev | test | prod
    database_url: str = "sqlite+aiosqlite:///./twind.db"
    redis_url: str = "redis://localhost:6379/0"

    # Auth. Supabase Auth issues HS256 JWTs signed with the project JWT secret;
    # Clerk issues RS256 JWTs — set jwt_jwks_url for that. Either path verifies `sub`.
    jwt_secret: str = "dev-secret-change-me-this-is-not-for-production!"
    jwt_algorithms: list[str] = Field(default_factory=lambda: ["HS256"])
    jwt_audience: str | None = "authenticated"
    jwt_jwks_url: str | None = None
    dev_token_endpoint: bool = True  # exposes /v1/dev/token in dev/test only

    # Payments
    payments_provider: str = "fake"  # fake | stripe
    stripe_secret_key: str | None = None
    stripe_publishable_key: str | None = None
    stripe_webhook_secret: str | None = None

    # Business rules (pence / basis points). Fee logic exists from day one even at 0%.
    seller_fee_bps: int = 0
    protection_fee_fixed_pence: int = 99
    protection_fee_bps: int = 300  # 3%
    shipping_flat_pence: int = 399
    auto_release_days: int = 3
    auto_release_days_high_accuracy: int = 1

    # Matching
    feed_cache_ttl_seconds: int = 300

    # Images
    r2_public_base_url: str = "https://img.twind.app"
    r2_bucket: str | None = None
    r2_endpoint: str | None = None
    r2_access_key_id: str | None = None
    r2_secret_access_key: str | None = None

    sentry_dsn: str | None = None
    posthog_api_key: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
