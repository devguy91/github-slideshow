"""Small management CLI: `python -m app.cli seed-slices | release-due | create-tables`."""

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


def main() -> None:
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "create-tables":
        asyncio.run(create_tables())
    elif cmd == "seed-slices":
        asyncio.run(seed_slices())
    elif cmd == "release-due":
        from app.jobs.payouts import release_due_orders

        print(asyncio.run(release_due_orders()))
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
