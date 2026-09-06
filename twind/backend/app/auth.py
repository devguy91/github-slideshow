"""Auth: verify the provider's JWT (Supabase HS256 or Clerk/JWKS RS256) and upsert the user.

Only `sub` is trusted for identity. Handles are generated on first sight and editable later.
"""

from __future__ import annotations

import re
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_session
from app.models import User
from app.services.slices import new_referral_code

_jwks_client: jwt.PyJWKClient | None = None


def _decode(token: str, settings: Settings) -> dict:
    global _jwks_client
    options = {"verify_aud": settings.jwt_audience is not None}
    try:
        if settings.jwt_jwks_url:
            if _jwks_client is None:
                _jwks_client = jwt.PyJWKClient(settings.jwt_jwks_url)
            key = _jwks_client.get_signing_key_from_jwt(token).key
            return jwt.decode(
                token, key, algorithms=["RS256"], audience=settings.jwt_audience, options=options
            )
        return jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=settings.jwt_algorithms,
            audience=settings.jwt_audience,
            options=options,
        )
    except jwt.PyJWTError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"invalid token: {e}") from e


def mint_dev_token(sub: str, email: str | None, settings: Settings) -> str:
    """Dev/test only: mints a token shaped like a Supabase access token."""
    now = datetime.now(UTC)
    claims = {
        "sub": sub,
        "email": email,
        "aud": settings.jwt_audience or "authenticated",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=7)).timestamp()),
    }
    return jwt.encode(claims, settings.jwt_secret, algorithm="HS256")


def _handle_from(email: str | None, sub: str) -> str:
    base = (email or "").split("@")[0].lower()
    base = re.sub(r"[^a-z0-9_]", "", base)[:20] or f"user{sub[:6].lower()}"
    return f"{base}_{secrets.token_hex(2)}"


async def get_or_create_user(session: AsyncSession, sub: str, email: str | None) -> User:
    user = await session.scalar(select(User).where(User.auth_subject == sub))
    if user:
        return user
    if email:
        existing = await session.scalar(select(User).where(User.email == email))
        if existing:
            email = None  # don't collide on a unique email from a different provider
    user = User(
        auth_subject=sub,
        email=email,
        handle=_handle_from(email, sub),
        display_name=(email or "").split("@")[0][:80] or "New user",
        referral_code=new_referral_code(),
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


async def current_user(
    authorization: Annotated[str | None, Header()] = None,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing bearer token")
    claims = _decode(authorization.split(" ", 1)[1].strip(), settings)
    sub = claims.get("sub")
    if not sub:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "token has no subject")
    return await get_or_create_user(session, sub, claims.get("email"))


CurrentUser = Annotated[User, Depends(current_user)]
Session = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]
