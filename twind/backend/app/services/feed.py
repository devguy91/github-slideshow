"""Ranked feed: SQL prefilter on the buyer's slice/category, then in-Python scoring.

Cached per user in Redis (falls back to an in-process dict when Redis is unavailable) and
invalidated whenever a listing goes live in the user's slice.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.models import BodyProfile, Follow, Listing, ListingStatus, PrecisionTier, User
from app.services import matching
from app.services.measurements import BODY_FIELDS, GARMENT_FIELDS
from app.services.serializers import seller_accuracy
from app.services.twins import twin_ids

_memory_cache: dict[str, tuple[float, Any]] = {}


class FeedCache:
    def __init__(self, settings: Settings) -> None:
        self._ttl = settings.feed_cache_ttl_seconds
        self._redis = None
        if settings.env != "test":
            try:
                import redis.asyncio as aioredis

                self._redis = aioredis.from_url(settings.redis_url, socket_connect_timeout=0.5)
            except Exception:  # pragma: no cover - redis optional in dev
                self._redis = None

    @staticmethod
    def key(user_id: uuid.UUID) -> str:
        return f"feed:v1:{user_id}"

    async def get(self, user_id: uuid.UUID) -> list[dict] | None:
        k = self.key(user_id)
        if self._redis is not None:
            try:
                raw = await self._redis.get(k)
                return json.loads(raw) if raw else None
            except Exception:
                self._redis = None
        hit = _memory_cache.get(k)
        if hit and hit[0] > datetime.now(UTC).timestamp():
            return hit[1]
        return None

    async def set(self, user_id: uuid.UUID, value: list[dict]) -> None:
        k = self.key(user_id)
        if self._redis is not None:
            try:
                await self._redis.set(k, json.dumps(value), ex=self._ttl)
                return
            except Exception:
                self._redis = None
        _memory_cache[k] = (datetime.now(UTC).timestamp() + self._ttl, value)

    async def invalidate_user(self, user_id: uuid.UUID) -> None:
        k = self.key(user_id)
        _memory_cache.pop(k, None)
        if self._redis is not None:
            try:
                await self._redis.delete(k)
            except Exception:
                self._redis = None

    async def invalidate_slice(self, session: AsyncSession, slice_id: uuid.UUID | None) -> None:
        q = select(User.id)
        if slice_id is not None:
            q = q.where(User.slice_id == slice_id)
        ids = (await session.scalars(q)).all()
        for uid in ids:
            k = self.key(uid)
            _memory_cache.pop(k, None)
            if self._redis is not None:
                try:
                    await self._redis.delete(k)
                except Exception:
                    self._redis = None


def body_dict(profile: BodyProfile | None) -> dict[str, float | None]:
    if profile is None:
        return {}
    return {f: getattr(profile, f) for f in BODY_FIELDS}


def garment_dict(listing: Listing) -> dict[str, float | None]:
    m = listing.measurements
    return {f: getattr(m, f) if m else None for f in GARMENT_FIELDS}


def _created_ts(listing: Listing) -> datetime:
    ts = listing.created_at
    return ts if ts.tzinfo else ts.replace(tzinfo=UTC)


async def score_listings_for(
    session: AsyncSession,
    user: User,
    listings: list[Listing],
    *,
    tier: PrecisionTier,
    apply_hard_filter: bool = True,
) -> list[matching.ScoredListing]:
    body = body_dict(user.body_profile)
    twins = await twin_ids(session, user.id)
    follows = set(
        (
            await session.scalars(select(Follow.followee_id).where(Follow.follower_id == user.id))
        ).all()
    )
    boosts: dict[uuid.UUID, float] = {}
    out: list[matching.ScoredListing] = []
    for listing in listings:
        garment = garment_dict(listing)
        fit = matching.fit_score(listing.category, body, garment, tier)
        if apply_hard_filter and not fit.passed_filter:
            continue
        if listing.seller_id not in boosts:
            boosts[listing.seller_id] = (
                await seller_accuracy(session, listing.seller_id)
            ).ranking_boost
        style = matching.style_score(
            user.style_vector,
            matching.listing_style_vector(listing.brand, listing.category, listing.title),
        )
        if listing.seller_id in twins:
            reason = matching.REASON_TWIN
        elif listing.seller_id in follows:
            reason = matching.REASON_FOLLOWING
        else:
            reason = matching.REASON_MATCH
        out.append(
            matching.ScoredListing(
                listing=listing,
                fit=fit,
                style=style,
                reason=reason,
                seller_boost=boosts[listing.seller_id],
                created_at=_created_ts(listing),
            )
        )
    return matching.rank(out)


async def live_listings_for(session: AsyncSession, user: User) -> list[Listing]:
    """SQL prefilter: live, not the user's own. Slice scoping is by seller slice when known."""
    q = select(Listing).where(Listing.status == ListingStatus.live, Listing.seller_id != user.id)
    if user.slice_id is not None:
        q = q.join(User, User.id == Listing.seller_id).where(
            (User.slice_id == user.slice_id) | (User.slice_id.is_(None))
        )
    q = q.order_by(Listing.created_at.desc()).limit(2000)
    return list((await session.scalars(q)).all())


async def match_count(
    session: AsyncSession, user: User, body: dict[str, float | None], tier: PrecisionTier
) -> int:
    """How many live listings pass the hard filter for a hypothetical body — powers the
    live counter on the measurement form."""
    listings = await live_listings_for(session, user)
    return sum(
        1
        for listing in listings
        if matching.passes_hard_filter(listing.category, body, garment_dict(listing), tier)
    )
