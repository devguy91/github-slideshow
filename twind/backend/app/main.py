from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import (
    body,
    feed,
    health,
    listings,
    me,
    onboarding,
    orders,
    slices,
    users,
    webhooks,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    if settings.sentry_dsn:  # pragma: no cover
        import sentry_sdk

        sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.env, traces_sample_rate=0.1)
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Twind API", version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    for r in (health, me, users, body, onboarding, listings, feed, orders, slices, webhooks):
        app.include_router(r.router, prefix="/v1")
    return app


app = create_app()
