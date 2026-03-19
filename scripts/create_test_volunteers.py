"""Create ZITADEL user accounts for test volunteers and link them.

Creates 5 volunteer users in ZITADEL with the 'volunteer' role, then
links them to existing volunteer records in the database by setting
user_id on each volunteer row.

Usage: docker compose exec api uv run python scripts/create_test_volunteers.py
   Or: uv run python scripts/create_test_volunteers.py
"""

from __future__ import annotations

import asyncio
import os
import sys

import httpx
from dotenv import load_dotenv
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

load_dotenv()

# ZITADEL config
ISSUER = os.environ["ZITADEL_ISSUER"]
CLIENT_ID = os.environ["ZITADEL_SERVICE_CLIENT_ID"]
CLIENT_SECRET = os.environ["ZITADEL_SERVICE_CLIENT_SECRET"]
PROJECT_ID = os.environ["ZITADEL_PROJECT_ID"]
DATABASE_URL = os.environ["DATABASE_URL"]

# Campaign to link volunteers to
CAMPAIGN_ID = os.environ.get("TEST_CAMPAIGN_ID", "e7098cfd-7978-4a20-892a-679ab4172840")

# Shared password for all test volunteers (generate random if not set)
VOLUNTEER_PASSWORD = os.environ.get("TEST_VOLUNTEER_PASSWORD", "Volunteer-Test-2026!")

# Test volunteer data: (email_on_volunteer_record, zitadel_username, display_name)
VOLUNTEERS = [
    ("maria.rodriguez@example.com", "maria.rodriguez", "Maria Rodriguez"),
    ("james.washington@example.com", "james.washington", "James Washington"),
    ("aisha.patel@example.com", "aisha.patel", "Aisha Patel"),
    ("deshawn.thompson@example.com", "deshawn.thompson", "DeShawn Thompson"),
    ("sarah.chen@example.com", "sarah.chen", "Sarah Chen"),
]


async def get_service_token() -> str:
    """Get a ZITADEL service account token."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{ISSUER}/oauth/v2/token",
            data={
                "grant_type": "client_credentials",
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "scope": "openid urn:zitadel:iam:org:project:id:zitadel:aud",
            },
        )
        resp.raise_for_status()
        return resp.json()["access_token"]


async def get_campaign_org_id(session: AsyncSession) -> str:
    """Get the ZITADEL org_id for the campaign."""
    from app.models.campaign import Campaign

    result = await session.execute(
        select(Campaign.zitadel_org_id).where(Campaign.id == CAMPAIGN_ID)
    )
    org_id = result.scalar_one_or_none()
    if not org_id:
        print(f"ERROR: Campaign {CAMPAIGN_ID} not found")
        sys.exit(1)
    return org_id


async def create_zitadel_user(
    token: str,
    org_id: str,
    username: str,
    display_name: str,
    email: str,
) -> str | None:
    """Create a human user in ZITADEL and return their user ID."""
    first_name, last_name = display_name.split(" ", 1)

    async with httpx.AsyncClient() as client:
        # Use v2 user API
        resp = await client.post(
            f"{ISSUER}/v2/users/human",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "x-zitadel-orgid": org_id,
            },
            json={
                "username": username,
                "profile": {
                    "givenName": first_name,
                    "familyName": last_name,
                    "displayName": display_name,
                },
                "email": {
                    "email": email,
                    "isVerified": True,
                },
                "password": {
                    "password": VOLUNTEER_PASSWORD,
                    "changeRequired": False,
                },
            },
        )

        if resp.status_code == 409:
            print(f"  SKIP: {username} already exists, looking up ID...")
            # Search for existing user
            search_resp = await client.post(
                f"{ISSUER}/v2/users",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "x-zitadel-orgid": org_id,
                },
                json={
                    "queries": [
                        {
                            "userNameQuery": {
                                "userName": username,
                                "method": "TEXT_QUERY_METHOD_EQUALS",
                            }
                        }
                    ]
                },
            )
            search_resp.raise_for_status()
            results = search_resp.json().get("result", [])
            if results:
                user_id = results[0]["userId"]
                print(f"    Found existing user: {user_id}")
                return user_id
            print(f"    Could not find existing user for {username}")
            return None

        if resp.status_code >= 400:
            print(f"  ERROR creating {username}: {resp.status_code} {resp.text}")
            return None

        user_id = resp.json().get("userId")
        print(f"  CREATED: {username} -> {user_id}")
        return user_id


async def ensure_project_grant(token: str, org_id: str) -> str | None:
    """Ensure a project grant exists for the campaign org, return its ID."""
    async with httpx.AsyncClient() as client:
        # Search for existing project grants
        resp = await client.post(
            f"{ISSUER}/management/v1/projectgrants/_search",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={
                "queries": [
                    {"projectIdQuery": {"projectId": PROJECT_ID}},
                ]
            },
        )
        if resp.status_code >= 400:
            print(
                f"    Could not search project grants: {resp.status_code} {resp.text}"
            )
        else:
            grants = resp.json().get("result", [])
            for g in grants:
                if g.get("grantedOrgId") == org_id:
                    print(f"    Project grant already exists: {g['grantId']}")
                    return g["grantId"]

        # Create project grant for this org
        resp = await client.post(
            f"{ISSUER}/management/v1/projects/{PROJECT_ID}/grants",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={
                "grantedOrgId": org_id,
                "roleKeys": ["owner", "admin", "manager", "volunteer", "viewer"],
            },
        )
        if resp.status_code >= 400:
            print(f"    ERROR creating project grant: {resp.status_code} {resp.text}")
            return None
        grant_id = resp.json().get("grantId")
        print(f"    Created project grant: {grant_id}")
        return grant_id


async def assign_volunteer_role(
    token: str, org_id: str, user_id: str, username: str, project_grant_id: str | None
) -> bool:
    """Assign the 'volunteer' project role to a user. Returns True on success."""
    async with httpx.AsyncClient() as client:
        body: dict = {
            "projectId": PROJECT_ID,
            "roleKeys": ["volunteer"],
        }
        if project_grant_id:
            body["projectGrantId"] = project_grant_id

        resp = await client.post(
            f"{ISSUER}/management/v1/users/{user_id}/grants",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "x-zitadel-orgid": org_id,
            },
            json=body,
        )
        if resp.status_code == 409:
            print(f"    Role already assigned for {username}")
            return True
        elif resp.status_code >= 400:
            err = f"{resp.status_code} {resp.text}"
            print(f"    ERROR assigning role to {username}: {err}")
            return False
        else:
            print(f"    Assigned 'volunteer' role to {username}")
            return True


async def link_volunteer_record(
    session: AsyncSession, email: str, zitadel_user_id: str
) -> None:
    """Link volunteer record to ZITADEL user by setting user_id."""
    from app.models.volunteer import Volunteer

    result = await session.execute(
        update(Volunteer)
        .where(
            Volunteer.email == email,
            Volunteer.campaign_id == CAMPAIGN_ID,
            Volunteer.user_id.is_(None),
        )
        .values(user_id=zitadel_user_id)
    )
    if result.rowcount:
        print(
            f"    Linked volunteer record (email={email}) -> user_id={zitadel_user_id}"
        )
    else:
        # Check if already linked to a different user
        existing = await session.execute(
            select(Volunteer.user_id).where(
                Volunteer.email == email,
                Volunteer.campaign_id == CAMPAIGN_ID,
            )
        )
        row = existing.scalar_one_or_none()
        if row and row != zitadel_user_id:
            print(
                f"    WARNING: Volunteer {email} already linked to user {row}, skipping"
            )
        elif row == zitadel_user_id:
            print(f"    Volunteer {email} already linked to {zitadel_user_id}")
        else:
            print(f"    WARNING: No volunteer record found for {email}")


async def create_local_user(
    session: AsyncSession, zitadel_user_id: str, display_name: str, email: str
) -> None:
    """Create a local User record so the volunteer appears in the system."""
    from app.core.time import utcnow
    from app.models.user import User

    existing = await session.execute(select(User).where(User.id == zitadel_user_id))
    if existing.scalar_one_or_none():
        print(f"    Local user record already exists for {zitadel_user_id}")
        return

    now = utcnow()
    session.add(
        User(
            id=zitadel_user_id,
            display_name=display_name,
            email=email,
            created_at=now,
            updated_at=now,
        )
    )
    print(f"    Created local user record for {display_name}")


async def create_campaign_member(
    session: AsyncSession, zitadel_user_id: str, display_name: str
) -> None:
    """Ensure a CampaignMember record exists."""
    from app.models.campaign_member import CampaignMember

    existing = await session.execute(
        select(CampaignMember).where(
            CampaignMember.user_id == zitadel_user_id,
            CampaignMember.campaign_id == CAMPAIGN_ID,
        )
    )
    if existing.scalar_one_or_none():
        print(f"    Campaign member already exists for {display_name}")
        return

    session.add(CampaignMember(user_id=zitadel_user_id, campaign_id=CAMPAIGN_ID))
    print(f"    Created campaign member for {display_name}")


async def main() -> None:
    print("=== Creating Test Volunteer Users ===\n")

    # DB setup
    engine = create_async_engine(DATABASE_URL)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async with session_factory() as session:
        # Get campaign org_id
        org_id = await get_campaign_org_id(session)
        print(f"Campaign org_id: {org_id}\n")

        # Get service token
        token = await get_service_token()
        print("Got ZITADEL service token\n")

        # Ensure project grant exists for this org
        project_grant_id = await ensure_project_grant(token, org_id)
        if not project_grant_id:
            raise RuntimeError(
                "Failed to create or find project grant for org "
                f"{org_id} — cannot proceed without a grant"
            )

        for email, username, display_name in VOLUNTEERS:
            print(f"Processing {display_name} ({username})...")

            # 1. Create ZITADEL user
            user_id = await create_zitadel_user(
                token, org_id, username, display_name, email
            )
            if not user_id:
                print(f"  Skipping {username} - no user ID\n")
                continue

            # 2. Assign volunteer role
            role_ok = await assign_volunteer_role(
                token, org_id, user_id, username, project_grant_id
            )
            if not role_ok:
                print(
                    f"  Skipping local provisioning for {username}"
                    " - role assignment failed\n"
                )
                continue

            # 3. Create local user record
            await create_local_user(session, user_id, display_name, email)

            # 4. Create campaign member
            await create_campaign_member(session, user_id, display_name)

            # 5. Link volunteer record
            await link_volunteer_record(session, email, user_id)

            print()

        await session.commit()

    await engine.dispose()

    print("=== Done ===")
    print(f"\nUsernames: {', '.join(u for _, u, _ in VOLUNTEERS)}")
    print("Password: (set via TEST_VOLUNTEER_PASSWORD env var)")


if __name__ == "__main__":
    asyncio.run(main())
