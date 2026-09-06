from __future__ import annotations

import base64
import uuid

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.auth import CurrentUser, Session, SettingsDep
from app.models import Listing
from app.schemas import FeedCardOut, FeedOut
from app.services.feed import FeedCache, live_listings_for, score_listings_for
from app.services.matching import REASON_TWIN
from app.services.serializers import listing_out

router = APIRouter()


def _encode_cursor(offset: int) -> str:
    return base64.urlsafe_b64encode(str(offset).encode()).decode()


def _decode_cursor(cursor: str | None) -> int:
    if not cursor:
        return 0
    try:
        return max(0, int(base64.urlsafe_b64decode(cursor.encode()).decode()))
    except Exception:
        return 0


@router.get("/feed", response_model=FeedOut)
async def feed(
    user: CurrentUser,
    session: Session,
    settings: SettingsDep,
    cursor: str | None = None,
    limit: int = Query(default=30, ge=1, le=100),
) -> FeedOut:
    cache = FeedCache(settings)
    ranked = await cache.get(user.id)
    if ranked is None:
        tier = user.body_profile.precision_tier if user.body_profile else None
        listings = await live_listings_for(session, user)
        if tier is None:
            # No body data yet: everything passes, fit is 0/confidence 0, style + recency rank.
            from app.models import PrecisionTier

            scored = await score_listings_for(
                session, user, listings, tier=PrecisionTier.estimated, apply_hard_filter=False
            )
        else:
            scored = await score_listings_for(session, user, listings, tier=tier)
        ranked = [
            {
                "listing_id": str(s.listing.id),
                "fit_score": s.fit.score,
                "fit_confidence": s.fit.confidence,
                "style_score": s.style,
                "reason": s.reason,
            }
            for s in scored
        ]
        await cache.set(user.id, ranked)

    twins_rows = [r for r in ranked if r["reason"] == REASON_TWIN][:10]
    offset = _decode_cursor(cursor)
    page = ranked[offset : offset + limit]
    next_cursor = _encode_cursor(offset + limit) if offset + limit < len(ranked) else None

    ids = {uuid.UUID(r["listing_id"]) for r in page + twins_rows}
    rows = (await session.scalars(select(Listing).where(Listing.id.in_(ids)))).all()
    by_id = {row.id: row for row in rows}

    async def card(r: dict) -> FeedCardOut | None:
        listing = by_id.get(uuid.UUID(r["listing_id"]))
        if listing is None or listing.status.value != "live":
            return None
        return FeedCardOut(
            listing=await listing_out(session, listing),
            fit_score=r["fit_score"],
            fit_confidence=r["fit_confidence"],
            style_score=r["style_score"],
            reason=r["reason"],
        )

    twins = [c for c in [await card(r) for r in twins_rows] if c]
    items = [c for c in [await card(r) for r in page] if c]
    return FeedOut(twins=twins, items=items, next_cursor=next_cursor)
