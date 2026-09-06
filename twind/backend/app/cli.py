"""Small management CLI: `python -m app.cli seed-slices | seed-demo | release-due | create-tables`."""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import select

from app.db import Base, get_engine, get_sessionmaker
from app.models import Slice
from app.services.slices import LAUNCH_SLICES


async def create_tables() -> None:
    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def seed_slices() -> None:
    async with get_sessionmaker()() as session:
        existing = {s.name for s in (await session.scalars(select(Slice))).all()}
        for spec in LAUNCH_SLICES:
            if spec["name"] not in existing:
                session.add(Slice(**spec))
        await session.commit()


DEMO_SELLERS = [
    {
        "email": "demo-seller-midsize@twind.test",
        "handle": "maya_sells",
        "display_name": "Maya",
        "body": {"height_cm": 168, "usual_size": "UK 16"},
        "listings": [
            ("Levi's 501 straight jeans", "bottoms", "Levi's", "UK 16", 3500,
             {"outseam_cm": 104, "inseam_cm": 78, "rise_cm": 27, "waist_flat_cm": 43, "hip_flat_cm": 55}),
            ("Arket wide-leg trousers", "bottoms", "Arket", "UK 16", 2800,
             {"outseam_cm": 108, "inseam_cm": 80, "rise_cm": 30, "waist_flat_cm": 42, "hip_flat_cm": 56}),
            ("COS boxy linen shirt", "tops", "COS", "L", 2200,
             {"pit_to_pit_cm": 58, "shoulder_flat_cm": 46, "length_cm": 66}),
            ("Vintage floral midi dress", "dresses", "Vintage", "UK 16", 4200,
             {"shoulder_flat_cm": 41, "length_cm": 118, "waist_flat_cm": 44, "hip_flat_cm": 56}),
        ],
    },
    {
        "email": "demo-seller-tall@twind.test",
        "handle": "jo_tall",
        "display_name": "Jo",
        "body": {"height_cm": 181, "usual_size": "UK 12"},
        "listings": [
            ("Reiss tailored trousers, long", "bottoms", "Reiss", "UK 12 Long", 3900,
             {"outseam_cm": 112, "inseam_cm": 86, "rise_cm": 27, "waist_flat_cm": 38, "hip_flat_cm": 50}),
            ("Nike track pants", "bottoms", "Nike", "M Tall", 1800,
             {"outseam_cm": 110, "inseam_cm": 84, "rise_cm": 28, "waist_flat_cm": 37, "hip_flat_cm": 51}),
            ("Uniqlo long-sleeve tee", "tops", "Uniqlo", "M", 900,
             {"pit_to_pit_cm": 50, "shoulder_flat_cm": 41, "length_cm": 68}),
        ],
    },
]


async def seed_demo() -> None:
    """Two sellers (one per launch slice) with live listings so a fresh buyer sees a feed."""
    from app.auth import get_or_create_user
    from app.models import BodyProfile, Category, GarmentMeasurements, Listing, ListingStatus
    from app.services.slices import resolve_slice

    async with get_sessionmaker()() as session:
        for spec in DEMO_SELLERS:
            user = await get_or_create_user(session, f"dev|{spec['email']}", spec["email"])
            user.handle = spec["handle"]
            user.display_name = spec["display_name"]
            user.is_founding_seller = True
            if user.body_profile is None:
                user.body_profile = BodyProfile(user_id=user.id, source_per_field={}, picker_choices={})
            user.body_profile.height_cm = spec["body"]["height_cm"]
            user.body_profile.usual_size = spec["body"]["usual_size"]
            s = await resolve_slice(session, spec["body"]["height_cm"], spec["body"]["usual_size"])
            user.slice_id = s.id if s else None
            existing = {
                row.title
                for row in (await session.scalars(select(Listing).where(Listing.seller_id == user.id))).all()
            }
            for title, cat, brand, size, price, meas in spec["listings"]:
                if title in existing:
                    continue
                listing = Listing(
                    seller_id=user.id,
                    title=title,
                    description="Demo listing seeded by `python -m app.cli seed-demo`.",
                    category=Category(cat),
                    brand=brand,
                    size_label=size,
                    price_pence=price,
                    photos=[{"url": f"https://picsum.photos/seed/{abs(hash(title)) % 1000}/900/1200", "is_modelled_fit": True}],
                    status=ListingStatus.live,
                )
                listing.measurements = GarmentMeasurements(**meas)
                session.add(listing)
        await session.commit()
    print(f"seeded {len(DEMO_SELLERS)} sellers, {sum(len(s['listings']) for s in DEMO_SELLERS)} listings")


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "create-tables":
        asyncio.run(create_tables())
    elif cmd == "seed-slices":
        asyncio.run(seed_slices())
    elif cmd == "seed-demo":
        asyncio.run(seed_demo())
    elif cmd == "release-due":
        from app.jobs.payouts import release_due_orders

        print(asyncio.run(release_due_orders()))
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
