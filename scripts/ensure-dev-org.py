"""Seed a default dev org and smoke campaign rows.

Runs once at API startup (via dev-entrypoint.sh) after Alembic migrations.
Reads DEV_ORG_ZITADEL_ID and DEV_ADMIN_ZITADEL_ID from the environment
(written by bootstrap-zitadel.py into .env.zitadel).

Idempotent — all INSERTs use ON CONFLICT DO NOTHING so repeated runs are safe.
This ensures the dev admin can create and access campaigns without running
additional seed scripts first.
"""

from __future__ import annotations

import os
import sys
import uuid
from datetime import UTC, datetime

import psycopg2

DEV_ORG_ZITADEL_ID = os.environ.get("DEV_ORG_ZITADEL_ID", "")
DEV_ADMIN_ZITADEL_ID = os.environ.get("DEV_ADMIN_ZITADEL_ID", "")
DEV_ORG_NAME = "CivicPulse Dev Org"
ADMIN_SMOKE_CAMPAIGN_NAME = "Admin Smoke Test Campaign"
DATABASE_URL_SYNC = os.environ.get(
    "DATABASE_URL_SYNC",
    "postgresql+psycopg2://postgres:postgres@postgres:5432/run_api",
)

# Strip the SQLAlchemy dialect prefix — psycopg2 wants a plain DSN
_DSN = DATABASE_URL_SYNC.replace("postgresql+psycopg2://", "postgresql://")


def main() -> None:
    if not DEV_ORG_ZITADEL_ID or not DEV_ADMIN_ZITADEL_ID:
        print("ensure-dev-org: env vars not set, skipping")
        return

    now = datetime.now(UTC)
    org_id = str(uuid.uuid4())

    try:
        conn = psycopg2.connect(_DSN)
        conn.autocommit = False
        cur = conn.cursor()

        # 1. Ensure the admin user row exists (placeholder — real values filled
        #    by ensure_user_synced on first login).
        cur.execute(
            """
            INSERT INTO users (id, display_name, email, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING
            """,
            (DEV_ADMIN_ZITADEL_ID, "Admin", "admin@localhost", now, now),
        )
        if cur.rowcount:
            print(f"ensure-dev-org: created placeholder user {DEV_ADMIN_ZITADEL_ID}")
        else:
            print(f"ensure-dev-org: user {DEV_ADMIN_ZITADEL_ID} already exists")

        # 2. Look up existing org by zitadel_org_id (idempotent by ZITADEL ID).
        cur.execute(
            "SELECT id FROM organizations WHERE zitadel_org_id = %s",
            (DEV_ORG_ZITADEL_ID,),
        )
        row = cur.fetchone()
        if row:
            org_id = str(row[0])
            print(f"ensure-dev-org: org already exists ({org_id})")
        else:
            cur.execute(
                """
                INSERT INTO organizations
                    (id, zitadel_org_id, name, created_by, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (zitadel_org_id) DO NOTHING
                """,
                (
                    org_id,
                    DEV_ORG_ZITADEL_ID,
                    DEV_ORG_NAME,
                    DEV_ADMIN_ZITADEL_ID,
                    now,
                    now,
                ),
            )
            print(f"ensure-dev-org: created org {org_id}")

        # 3. Ensure org_owner membership for admin.
        cur.execute(
            """
            INSERT INTO organization_members
                (id, user_id, organization_id, role, joined_at, created_at, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (user_id, organization_id) DO NOTHING
            """,
            (
                str(uuid.uuid4()),
                DEV_ADMIN_ZITADEL_ID,
                org_id,
                "org_owner",
                now,
                now,
                now,
            ),
        )
        if cur.rowcount:
            print(f"ensure-dev-org: added admin as org_owner of {org_id}")
        else:
            print("ensure-dev-org: org membership already exists")

        # 4. Ensure the default smoke campaign exists for admin-side dev checks.
        cur.execute(
            """
            SELECT id FROM campaigns
            WHERE organization_id = %s AND name = %s
            LIMIT 1
            """,
            (org_id, ADMIN_SMOKE_CAMPAIGN_NAME),
        )
        campaign_row = cur.fetchone()
        campaign_id = str(campaign_row[0]) if campaign_row else str(uuid.uuid4())
        if campaign_row:
            print(f"ensure-dev-org: smoke campaign already exists ({campaign_id})")
        else:
            cur.execute(
                """
                INSERT INTO campaigns (
                    id, zitadel_org_id, organization_id, name, slug, type,
                    status, created_by, created_at, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    campaign_id,
                    DEV_ORG_ZITADEL_ID,
                    org_id,
                    ADMIN_SMOKE_CAMPAIGN_NAME,
                    "admin-smoke-test-campaign",
                    "LOCAL",
                    "ACTIVE",
                    DEV_ADMIN_ZITADEL_ID,
                    now,
                    now,
                ),
            )
            print(f"ensure-dev-org: created smoke campaign {campaign_id}")

        cur.execute(
            """
            UPDATE campaigns
            SET type = 'LOCAL', status = 'ACTIVE', updated_at = %s
            WHERE id = %s AND (type <> 'LOCAL' OR status <> 'ACTIVE')
            """,
            (now, campaign_id),
        )
        if cur.rowcount:
            print(
                f"ensure-dev-org: normalized smoke campaign enum values for {campaign_id}"
            )

        # 5. Ensure the dev admin has owner rights on the smoke campaign.
        cur.execute(
            """
            INSERT INTO campaign_members (id, user_id, campaign_id, synced_at, role)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (user_id, campaign_id) DO UPDATE
            SET role = EXCLUDED.role,
                synced_at = EXCLUDED.synced_at
            """,
            (
                str(uuid.uuid4()),
                DEV_ADMIN_ZITADEL_ID,
                campaign_id,
                now,
                "owner",
            ),
        )
        print(f"ensure-dev-org: ensured admin owner membership on {campaign_id}")

        conn.commit()
        cur.close()
        conn.close()
        print("ensure-dev-org: done")

    except Exception as exc:
        print(f"ensure-dev-org: ERROR — {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
