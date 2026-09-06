"""ARQ worker. Run with: arq app.jobs.worker.WorkerSettings"""

from __future__ import annotations

from arq import cron
from arq.connections import RedisSettings

from app.config import get_settings
from app.jobs.payouts import release_due_orders


async def release_due_orders_job(ctx: dict) -> int:
    return await release_due_orders()


class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    functions = [release_due_orders_job]
    cron_jobs = [cron(release_due_orders_job, minute={0, 15, 30, 45})]
