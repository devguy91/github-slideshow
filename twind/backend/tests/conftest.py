import os
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

os.environ["TWIND_ENV"] = "test"
os.environ["TWIND_DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["TWIND_PAYMENTS_PROVIDER"] = "fake"

from app import db  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import Slice  # noqa: E402
from app.services import feed as feed_service  # noqa: E402
from app.services.payments import get_payments, reset_payments  # noqa: E402
from app.services.slices import LAUNCH_SLICES  # noqa: E402


@pytest.fixture(autouse=True)
async def fresh_db():
    get_settings.cache_clear()
    db.reset_engine()
    reset_payments()
    feed_service._memory_cache.clear()
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import StaticPool

    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    db._engine = engine
    db._sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(db.Base.metadata.create_all)
    async with db._sessionmaker() as session:
        for spec in LAUNCH_SLICES:
            session.add(Slice(**spec))
        await session.commit()
    yield
    await engine.dispose()


@pytest.fixture
async def client():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
def payments():
    return get_payments(get_settings())


class Actor:
    """A signed-in user for tests."""

    def __init__(self, client: AsyncClient, token: str, email: str):
        self.client = client
        self.email = email
        self.headers = {"Authorization": f"Bearer {token}"}

    async def get(self, path, **kw):
        return await self.client.get(f"/v1{path}", headers=self.headers, **kw)

    async def post(self, path, **kw):
        return await self.client.post(f"/v1{path}", headers=self.headers, **kw)

    async def put(self, path, **kw):
        return await self.client.put(f"/v1{path}", headers=self.headers, **kw)

    async def patch(self, path, **kw):
        return await self.client.patch(f"/v1{path}", headers=self.headers, **kw)

    async def delete(self, path, **kw):
        return await self.client.delete(f"/v1{path}", headers=self.headers, **kw)


@pytest.fixture
def actor(client):
    async def make(email: str | None = None, *, adult: bool = True) -> Actor:
        email = email or f"{uuid.uuid4().hex[:8]}@example.com"
        r = await client.get("/v1/dev/token", params={"email": email})
        assert r.status_code == 200, r.text
        a = Actor(client, r.json()["token"], email)
        me = await a.get("/me")
        assert me.status_code == 200, me.text
        if adult:
            r = await a.patch("/me", json={"confirm_age_18_plus": True})
            assert r.status_code == 200, r.text
        return a

    return make


BOTTOMS_LISTING = {
    "title": "Levi's 501 straight jeans",
    "category": "bottoms",
    "brand": "Levi's",
    "size_label": "UK 14",
    "price_pence": 3500,
    "photos": [
        {"url": "https://img.test/1.jpg", "is_modelled_fit": True},
        {"url": "https://img.test/2.jpg"},
    ],
    "measurements": {
        "outseam_cm": 104,
        "inseam_cm": 78,
        "rise_cm": 26,
        "waist_flat_cm": 40,
        "hip_flat_cm": 52,
    },
}

BUYER_BODY_MATCHING = {
    "height_cm": 170,
    "usual_size": "UK 14",
    "outseam_cm": 103,
    "inseam_cm": 77,
    "rise_cm": 26,
    "waist_cm": 80,
    "hip_cm": 104,
}


async def make_live_listing(seller: Actor, payload: dict | None = None) -> dict:
    r = await seller.post("/listings", json=payload or BOTTOMS_LISTING)
    assert r.status_code == 201, r.text
    lid = r.json()["id"]
    r = await seller.post(f"/listings/{lid}/publish")
    assert r.status_code == 200, r.text
    return r.json()
