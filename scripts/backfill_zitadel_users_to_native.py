"""One-time backfill: issue password-reset tokens for legacy ZITADEL users.

Run this once after deploying Step 4 and before cutting over the frontend
(Step 5). For every user row whose ``hashed_password`` is NULL (i.e. a legacy
ZITADEL-only account), dispatch a ``forgot_password`` flow. Each affected user
gets an email saying "we're upgrading login -- click here to set a password".

The script is idempotent: users who already have a native password are left
untouched, so it is safe to re-run after a partial run or a dev crash.

Usage::

    # Dry run -- counts affected users without sending anything.
    docker compose exec api bash -c \\
        "PYTHONPATH=/home/app python \\
         /home/app/scripts/backfill_zitadel_users_to_native.py --dry-run"

    # Real run -- sends email (or logs the link in dev).
    docker compose exec api bash -c \\
        "PYTHONPATH=/home/app python \\
         /home/app/scripts/backfill_zitadel_users_to_native.py"

Notes:
    - Delivery goes through the same ``UserManager.on_after_forgot_password``
      hook that the public ``/auth/forgot-password`` endpoint uses, so if the
      email provider is ``disabled`` in dev the tokens are logged at INFO level
      instead of emailed.
    - The script does NOT modify the ``users`` table directly. Users remain
      password-less until they click their reset link; the dual-auth
      ``current_user_dual`` dependency keeps them logged in via ZITADEL JWT in
      the meantime.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

from fastapi_users_db_sqlalchemy import SQLAlchemyUserDatabase
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.auth.manager import UserManager
from app.models.user import User


async def _run(dry_run: bool) -> int:
    """Issue reset tokens for every user without a hashed_password.

    Returns:
        Process exit code (0 on success, 1 on misconfiguration).
    """
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL not set", file=sys.stderr)
        return 1

    engine = create_async_engine(database_url)
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    try:
        async with session_factory() as session:
            rows = (
                (
                    await session.execute(
                        select(User).where(User.hashed_password.is_(None))
                    )
                )
                .scalars()
                .all()
            )

            total = len(rows)
            logger.info(
                "Backfill: found {} user(s) without hashed_password (dry_run={})",
                total,
                dry_run,
            )

            if dry_run:
                for u in rows:
                    logger.info(
                        "  [dry-run] would issue reset: id={} email={}",
                        u.id,
                        u.email,
                    )
                print(f"[dry-run] {total} user(s) would be emailed a reset link.")
                return 0

            # Real run -- use the live UserManager so the policy, hook chain,
            # and email provider all match what the production /auth flow does.
            user_db = SQLAlchemyUserDatabase(session, User)
            manager = UserManager(user_db)  # type: ignore[arg-type]

            processed = 0
            failed = 0
            for u in rows:
                try:
                    await manager.forgot_password(u)
                    processed += 1
                except Exception as exc:  # noqa: BLE001 -- log & continue
                    failed += 1
                    logger.error(
                        "Backfill failed for id={} email={} err={}",
                        u.id,
                        u.email,
                        exc,
                    )

            print(
                f"Backfill complete: processed={processed} failed={failed} "
                f"total={total}"
            )
    finally:
        await engine.dispose()

    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Count affected users without sending email.",
    )
    args = parser.parse_args()
    exit_code = asyncio.run(_run(dry_run=args.dry_run))
    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()
