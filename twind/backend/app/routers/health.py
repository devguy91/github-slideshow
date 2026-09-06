from fastapi import APIRouter, HTTPException, Query

from app.auth import SettingsDep, mint_dev_token
from app.schemas import DevTokenOut

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/dev/token", response_model=DevTokenOut, tags=["dev"])
async def dev_token(settings: SettingsDep, email: str = Query(...)) -> DevTokenOut:
    """Dev/test only. Mints a token for any email so the app can run without an auth provider."""
    if settings.env == "prod" or not settings.dev_token_endpoint:
        raise HTTPException(404)
    sub = f"dev|{email.lower()}"
    return DevTokenOut(token=mint_dev_token(sub, email.lower(), settings), sub=sub)
