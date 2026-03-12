"""Idempotent seed data script for Macon-Bibb County GA demo dataset.

Populates the database with a complete, interconnected demo dataset including
campaigns, voters, turfs, walk lists, surveys, volunteers, shifts, phone bank
sessions, voter interactions, tags, DNC entries, invites, and addresses.

Usage: docker compose exec api uv run python scripts/seed.py
"""

from __future__ import annotations

import asyncio
import os
import random
import uuid
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.time import utcnow

# Model imports
from app.models.call_list import CallList, CallListEntry
from app.models.campaign import Campaign, CampaignStatus, CampaignType
from app.models.campaign_member import CampaignMember
from app.models.dnc import DoNotCallEntry
from app.models.invite import Invite
from app.models.phone_bank import PhoneBankSession, SessionCaller
from app.models.shift import Shift, ShiftVolunteer
from app.models.survey import SurveyQuestion, SurveyResponse, SurveyScript
from app.models.turf import Turf
from app.models.user import User
from app.models.volunteer import (
    Volunteer,
    VolunteerAvailability,
    VolunteerTag,
    VolunteerTagMember,
)
from app.models.voter import Voter, VoterTag, VoterTagMember
from app.models.voter_contact import VoterAddress, VoterEmail, VoterPhone
from app.models.voter_interaction import InteractionType, VoterInteraction
from app.models.voter_list import VoterList
from app.models.walk_list import WalkList, WalkListCanvasser, WalkListEntry

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SEED_CAMPAIGN_NAME = "Macon-Bibb Demo Campaign"
NOW = utcnow()

# Macon-Bibb County GA neighborhood center coordinates
NEIGHBORHOODS = {
    "Ingleside": (32.845, -83.635),
    "Vineville": (32.843, -83.648),
    "Pleasant Hill": (32.835, -83.620),
    "Downtown": (32.840, -83.632),
    "Bellevue": (32.830, -83.645),
}

# Fabricated voter first/last names
FIRST_NAMES = [
    "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael",
    "Linda", "David", "Elizabeth", "William", "Barbara", "Richard", "Susan",
    "Joseph", "Jessica", "Thomas", "Sarah", "Charles", "Karen", "Daniel",
    "Lisa", "Matthew", "Nancy", "Anthony", "Betty", "Mark", "Margaret",
    "Donald", "Sandra", "Steven", "Ashley", "Paul", "Dorothy", "Andrew",
    "Kimberly", "Joshua", "Emily", "Kenneth", "Donna", "Kevin", "Michelle",
    "Brian", "Carol", "George", "Amanda", "Timothy", "Melissa", "Ronald",
    "Deborah",
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
    "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
    "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
    "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark",
    "Ramirez", "Lewis", "Robinson", "Walker", "Young", "Allen", "King",
    "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores", "Green",
    "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell",
    "Carter", "Roberts",
]

STREET_NAMES = [
    "Walnut St", "Poplar St", "Cherry St", "Mulberry St", "College St",
    "Vineville Ave", "Forsyth St", "Broadway", "Riverside Dr", "Ingleside Ave",
    "Pio Nono Ave", "Napier Ave", "Montpelier Ave", "Buford Pl", "Adams St",
    "Spring St", "Pine St", "Hardeman Ave", "Craft St", "Anthony Rd",
]

PARTIES = ["DEM", "REP", "NPA", "LIB"]
PARTY_WEIGHTS = [0.45, 0.35, 0.15, 0.05]
VOTER_STATUSES = ["active", "active", "active", "active", "inactive"]  # 80/20 split
PRECINCTS = ["MBB-01", "MBB-02", "MBB-03", "MBB-04", "MBB-05"]

# Door knock result distribution (weighted choices)
DOOR_KNOCK_RESULTS = [
    "supporter", "supporter", "supporter", "supporter", "supporter",          # 25%
    "not_home", "not_home", "not_home", "not_home", "not_home",              # 25%
    "undecided", "undecided", "undecided",                                    # 15%
    "refused", "refused",                                                     # 10%
    "opposed", "opposed",                                                     # ~8%
    "come_back_later",                                                        # ~7%
    "moved",                                                                  # ~5%
    "inaccessible",                                                           # ~3%
    "deceased",                                                               # ~2%
]

# Phone call result distribution (weighted choices)
PHONE_CALL_RESULTS = [
    "answered", "answered", "answered", "answered", "answered", "answered",  # 30%
    "no_answer", "no_answer", "no_answer", "no_answer", "no_answer",        # 25%
    "voicemail", "voicemail", "voicemail", "voicemail",                      # 20%
    "busy", "busy",                                                          # ~8%
    "wrong_number",                                                          # ~7%
    "refused",                                                               # ~5%
    "disconnected",                                                          # ~3%
    "deceased",                                                              # ~2%
]


def _jitter(center: float, spread: float = 0.005) -> float:
    """Add small random offset to a coordinate."""
    return center + random.uniform(-spread, spread)


async def main() -> None:  # noqa: C901, PLR0915
    """Create the complete Macon-Bibb County demo dataset."""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL environment variable not set")
        raise SystemExit(1)

    engine = create_async_engine(database_url)
    session_factory = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with session_factory() as session, session.begin():
            # ----------------------------------------------------------
            # Idempotency check
            # ----------------------------------------------------------
            existing = await session.execute(
                select(Campaign).where(Campaign.name == SEED_CAMPAIGN_NAME)
            )
            if existing.scalar_one_or_none() is not None:
                print("Seed data already exists, skipping.")
                return

            print("Creating Macon-Bibb County demo seed data...")

            # ----------------------------------------------------------
            # 1. Users (8 fabricated users with ZITADEL-style IDs)
            # ----------------------------------------------------------
            user_owner_id = f"seed-owner-{uuid.uuid4().hex[:12]}"
            user_manager_id = f"seed-manager-{uuid.uuid4().hex[:12]}"
            user_volunteer_id = f"seed-volunteer-{uuid.uuid4().hex[:12]}"
            user_canvasser1_id = f"seed-canvasser1-{uuid.uuid4().hex[:12]}"
            user_canvasser2_id = f"seed-canvasser2-{uuid.uuid4().hex[:12]}"
            user_caller1_id = f"seed-caller1-{uuid.uuid4().hex[:12]}"
            user_caller2_id = f"seed-caller2-{uuid.uuid4().hex[:12]}"
            user_invited_id = f"seed-invited-{uuid.uuid4().hex[:12]}"

            users = [
                User(
                    id=user_owner_id,
                    display_name="Dana Whitfield",
                    email="dana.whitfield@example.com",
                    created_at=NOW,
                    updated_at=NOW,
                ),
                User(
                    id=user_manager_id,
                    display_name="Marcus Chen",
                    email="marcus.chen@example.com",
                    created_at=NOW,
                    updated_at=NOW,
                ),
                User(
                    id=user_volunteer_id,
                    display_name="Priya Patel",
                    email="priya.patel@example.com",
                    created_at=NOW,
                    updated_at=NOW,
                ),
                User(
                    id=user_canvasser1_id,
                    display_name="Jordan Hayes",
                    email="jordan.hayes@example.com",
                    created_at=NOW,
                    updated_at=NOW,
                ),
                User(
                    id=user_canvasser2_id,
                    display_name="Sofia Ramirez",
                    email="sofia.ramirez@example.com",
                    created_at=NOW,
                    updated_at=NOW,
                ),
                User(
                    id=user_caller1_id,
                    display_name="Leon Brooks",
                    email="leon.brooks@example.com",
                    created_at=NOW,
                    updated_at=NOW,
                ),
                User(
                    id=user_caller2_id,
                    display_name="Nina Washington",
                    email="nina.washington@example.com",
                    created_at=NOW,
                    updated_at=NOW,
                ),
                User(
                    id=user_invited_id,
                    display_name="Terrence Moore",
                    email="terrence.moore@example.com",
                    created_at=NOW,
                    updated_at=NOW,
                ),
            ]
            session.add_all(users)
            await session.flush()
            print(f"  Created {len(users)} users")

            # Convenient groupings for later use
            canvasser_user_ids = [
                user_volunteer_id, user_canvasser1_id,
                user_canvasser2_id, user_manager_id,
            ]
            caller_user_ids = [
                user_volunteer_id, user_caller1_id,
                user_caller2_id, user_manager_id,
            ]

            # ----------------------------------------------------------
            # 2. Campaign
            # ----------------------------------------------------------
            campaign_id = uuid.uuid4()
            campaign = Campaign(
                id=campaign_id,
                zitadel_org_id=f"seed-org-{uuid.uuid4().hex[:16]}",
                name=SEED_CAMPAIGN_NAME,
                type=CampaignType.LOCAL,
                status=CampaignStatus.ACTIVE,
                jurisdiction_fips="13021",
                jurisdiction_name="Bibb County, GA",
                candidate_name="Dana Whitfield",
                party_affiliation="DEM",
                created_by=user_owner_id,
                created_at=NOW,
                updated_at=NOW,
            )
            session.add(campaign)
            await session.flush()
            print(f"  Created campaign: {SEED_CAMPAIGN_NAME}")

            # ----------------------------------------------------------
            # 3. Campaign members (all 8 users)
            # ----------------------------------------------------------
            all_user_ids = [
                user_owner_id, user_manager_id, user_volunteer_id,
                user_canvasser1_id, user_canvasser2_id,
                user_caller1_id, user_caller2_id, user_invited_id,
            ]
            members = [
                CampaignMember(
                    id=uuid.uuid4(),
                    user_id=uid,
                    campaign_id=campaign_id,
                    synced_at=NOW,
                )
                for uid in all_user_ids
            ]
            session.add_all(members)
            await session.flush()
            print(f"  Created {len(members)} campaign members")

            # ----------------------------------------------------------
            # 4. Voters (~50) with Macon-Bibb County coordinates
            # ----------------------------------------------------------
            voter_records: list[Voter] = []
            neighborhood_names = list(NEIGHBORHOODS.keys())

            for i in range(50):
                neighborhood = neighborhood_names[i % len(neighborhood_names)]
                lat_center, lng_center = NEIGHBORHOODS[neighborhood]
                lat = _jitter(lat_center)
                lng = _jitter(lng_center)
                party = random.choices(PARTIES, weights=PARTY_WEIGHTS, k=1)[0]

                voter = Voter(
                    id=uuid.uuid4(),
                    campaign_id=campaign_id,
                    source_type="seed",
                    source_id=f"SEED-{i + 1:04d}",
                    first_name=FIRST_NAMES[i],
                    last_name=LAST_NAMES[i],
                    gender=random.choice(["M", "F"]),
                    address_line1=(
                        f"{random.randint(100, 9999)}"
                        f" {random.choice(STREET_NAMES)}"
                    ),
                    city="Macon",
                    state="GA",
                    zip_code=random.choice(
                        ["31201", "31204", "31206", "31210", "31211"]
                    ),
                    county="Bibb",
                    party=party,
                    precinct=PRECINCTS[i % len(PRECINCTS)],
                    congressional_district="02",
                    state_senate_district="26",
                    state_house_district="142",
                    registration_date=(
                        NOW.date() - timedelta(days=random.randint(365, 3650))
                    ),
                    age=random.randint(18, 85),
                    latitude=lat,
                    longitude=lng,
                    geom=func.ST_SetSRID(func.ST_MakePoint(lng, lat), 4326),
                    extra_data={"neighborhood": neighborhood},
                    created_at=NOW,
                    updated_at=NOW,
                )
                voter_records.append(voter)

            session.add_all(voter_records)
            await session.flush()
            print(f"  Created {len(voter_records)} voters")

            # ----------------------------------------------------------
            # 4b. Voter contact records (phone + email for each voter)
            # ----------------------------------------------------------
            phones: list[VoterPhone] = []
            emails: list[VoterEmail] = []

            for v in voter_records:
                phones.append(
                    VoterPhone(
                        id=uuid.uuid4(),
                        campaign_id=campaign_id,
                        voter_id=v.id,
                        value=f"478-555-{random.randint(1000, 9999)}",
                        type="cell",
                        is_primary=True,
                        source="seed",
                        created_at=NOW,
                        updated_at=NOW,
                    )
                )
                emails.append(
                    VoterEmail(
                        id=uuid.uuid4(),
                        campaign_id=campaign_id,
                        voter_id=v.id,
                        value=f"{v.first_name.lower()}.{v.last_name.lower()}@example.com",
                        type="home",
                        is_primary=True,
                        source="seed",
                        created_at=NOW,
                        updated_at=NOW,
                    )
                )

            session.add_all(phones)
            session.add_all(emails)
            await session.flush()
            print(f"  Created {len(phones)} phone + {len(emails)} email contacts")

            # ----------------------------------------------------------
            # 5. Turfs (5 neighborhoods with polygon boundaries)
            # ----------------------------------------------------------
            turf_defs = [
                (
                    "Ingleside Turf",
                    NEIGHBORHOODS["Ingleside"],
                    "Ingleside neighborhood canvassing area",
                ),
                (
                    "Vineville Turf",
                    NEIGHBORHOODS["Vineville"],
                    "Vineville neighborhood canvassing area",
                ),
                (
                    "Pleasant Hill Turf",
                    NEIGHBORHOODS["Pleasant Hill"],
                    "Pleasant Hill neighborhood canvassing area",
                ),
                (
                    "Downtown Turf",
                    NEIGHBORHOODS["Downtown"],
                    "Downtown district canvassing area",
                ),
                (
                    "Bellevue Turf",
                    NEIGHBORHOODS["Bellevue"],
                    "Bellevue neighborhood canvassing area",
                ),
            ]

            turf_records: list[Turf] = []
            for turf_name, (lat_c, lng_c), desc in turf_defs:
                # ~0.01 degree rectangle around center (~1km)
                half = 0.008
                wkt = (
                    f"POLYGON(("
                    f"{lng_c - half} {lat_c - half}, "
                    f"{lng_c + half} {lat_c - half}, "
                    f"{lng_c + half} {lat_c + half}, "
                    f"{lng_c - half} {lat_c + half}, "
                    f"{lng_c - half} {lat_c - half}"
                    f"))"
                )
                turf = Turf(
                    id=uuid.uuid4(),
                    campaign_id=campaign_id,
                    name=turf_name,
                    description=desc,
                    status="active",
                    boundary=func.ST_GeomFromText(wkt, 4326),
                    created_by=user_owner_id,
                    created_at=NOW,
                    updated_at=NOW,
                )
                turf_records.append(turf)

            session.add_all(turf_records)
            await session.flush()
            print(f"  Created {len(turf_records)} turfs")

            # ----------------------------------------------------------
            # 6. Survey script with questions
            # ----------------------------------------------------------
            survey_id = uuid.uuid4()
            survey = SurveyScript(
                id=survey_id,
                campaign_id=campaign_id,
                title="Voter Outreach Survey",
                description=(
                    "Standard door-to-door and phone bank"
                    " survey for voter engagement"
                ),
                status="active",
                created_by=user_owner_id,
                created_at=NOW,
                updated_at=NOW,
            )
            session.add(survey)
            await session.flush()

            questions_data = [
                (
                    "Who do you plan to support in the upcoming local election?",
                    "multiple_choice",
                    {
                        "choices": [
                            "Dana Whitfield", "Other candidate",
                            "Undecided", "Prefer not to say",
                        ]
                    },
                ),
                (
                    "What is the most important issue facing Macon-Bibb County?",
                    "multiple_choice",
                    {
                        "choices": [
                            "Public safety", "Infrastructure",
                            "Education", "Economy",
                            "Healthcare", "Other",
                        ]
                    },
                ),
                (
                    "On a scale of 1-10, how likely are you"
                    " to vote in the next election?",
                    "scale",
                    {"min": 1, "max": 10},
                ),
                (
                    "Would you be interested in volunteering for the campaign?",
                    "multiple_choice",
                    {"choices": ["Yes", "No", "Maybe later"]},
                ),
            ]

            question_records: list[SurveyQuestion] = []
            for pos, (q_text, q_type, options) in enumerate(questions_data, start=1):
                q = SurveyQuestion(
                    id=uuid.uuid4(),
                    script_id=survey_id,
                    position=pos,
                    question_text=q_text,
                    question_type=q_type,
                    options=options,
                )
                question_records.append(q)

            session.add_all(question_records)
            await session.flush()
            print(f"  Created survey with {len(question_records)} questions")

            # ----------------------------------------------------------
            # 7. Voter list (needed for walk list / call list FKs)
            # ----------------------------------------------------------
            voter_list_id = uuid.uuid4()
            voter_list = VoterList(
                id=voter_list_id,
                campaign_id=campaign_id,
                name="Seed Voter List",
                description="All seeded voters",
                list_type="static",
                created_by=user_owner_id,
                created_at=NOW,
                updated_at=NOW,
            )
            session.add(voter_list)
            await session.flush()

            # ----------------------------------------------------------
            # 8. Walk lists (4 across turfs, mix of statuses)
            # ----------------------------------------------------------
            wl_ids = [uuid.uuid4() for _ in range(4)]

            walk_lists = [
                WalkList(
                    id=wl_ids[0],
                    campaign_id=campaign_id,
                    turf_id=turf_records[0].id,
                    voter_list_id=voter_list_id,
                    script_id=survey_id,
                    name="Ingleside Walk - Active",
                    total_entries=10,
                    visited_entries=3,
                    created_by=user_owner_id,
                    created_at=NOW,
                ),
                WalkList(
                    id=wl_ids[1],
                    campaign_id=campaign_id,
                    turf_id=turf_records[1].id,
                    voter_list_id=voter_list_id,
                    script_id=survey_id,
                    name="Vineville Walk - Completed",
                    total_entries=12,
                    visited_entries=12,
                    created_by=user_manager_id,
                    created_at=NOW - timedelta(days=7),
                ),
                WalkList(
                    id=wl_ids[2],
                    campaign_id=campaign_id,
                    turf_id=turf_records[3].id,  # Downtown
                    voter_list_id=voter_list_id,
                    script_id=survey_id,
                    name="Downtown Walk - Active",
                    total_entries=10,
                    visited_entries=6,
                    created_by=user_canvasser1_id,
                    created_at=NOW - timedelta(days=3),
                ),
                WalkList(
                    id=wl_ids[3],
                    campaign_id=campaign_id,
                    turf_id=turf_records[4].id,  # Bellevue
                    voter_list_id=voter_list_id,
                    script_id=survey_id,
                    name="Bellevue Walk - Active",
                    total_entries=10,
                    visited_entries=4,
                    created_by=user_canvasser2_id,
                    created_at=NOW - timedelta(days=2),
                ),
            ]
            session.add_all(walk_lists)
            await session.flush()

            # Assign canvassers to walk lists
            wl_canvassers = [
                WalkListCanvasser(
                    walk_list_id=wl_ids[0],
                    user_id=user_volunteer_id,
                    assigned_at=NOW,
                ),
                WalkListCanvasser(
                    walk_list_id=wl_ids[1],
                    user_id=user_volunteer_id,
                    assigned_at=NOW - timedelta(days=7),
                ),
                WalkListCanvasser(
                    walk_list_id=wl_ids[2],
                    user_id=user_canvasser1_id,
                    assigned_at=NOW - timedelta(days=3),
                ),
                WalkListCanvasser(
                    walk_list_id=wl_ids[3],
                    user_id=user_canvasser2_id,
                    assigned_at=NOW - timedelta(days=2),
                ),
            ]
            session.add_all(wl_canvassers)
            await session.flush()

            # Walk list entries across all 4 lists
            wl_entries: list[WalkListEntry] = []

            # Helper: get voters by neighborhood
            def _voters_for(nb: str) -> list[Voter]:
                return [
                    v for v in voter_records
                    if v.extra_data.get("neighborhood") == nb
                ]

            ingleside_voters = _voters_for("Ingleside")[:10]
            vineville_voters = _voters_for("Vineville")
            downtown_voters = _voters_for("Downtown")[:10]
            bellevue_voters = _voters_for("Bellevue")[:10]

            # Ingleside (active, 3 visited)
            for seq, v in enumerate(ingleside_voters, start=1):
                status = "visited" if seq <= 3 else "pending"
                wl_entries.append(
                    WalkListEntry(
                        id=uuid.uuid4(),
                        walk_list_id=wl_ids[0],
                        voter_id=v.id,
                        sequence=seq,
                        status=status,
                    )
                )

            # Vineville (completed, all visited)
            remaining = [
                v for v in voter_records
                if v not in ingleside_voters
                and v not in vineville_voters
            ]
            vineville_for_list = (
                vineville_voters
                + remaining[: max(0, 12 - len(vineville_voters))]
            )
            for seq, v in enumerate(vineville_for_list[:12], start=1):
                wl_entries.append(
                    WalkListEntry(
                        id=uuid.uuid4(),
                        walk_list_id=wl_ids[1],
                        voter_id=v.id,
                        sequence=seq,
                        status="visited",
                    )
                )

            # Downtown (active, 6 visited, 1 skipped, rest pending)
            for seq, v in enumerate(downtown_voters, start=1):
                if seq <= 6:
                    status = "visited"
                elif seq == 7:
                    status = "skipped"
                else:
                    status = "pending"
                wl_entries.append(
                    WalkListEntry(
                        id=uuid.uuid4(),
                        walk_list_id=wl_ids[2],
                        voter_id=v.id,
                        sequence=seq,
                        status=status,
                    )
                )

            # Bellevue (active, 4 visited, 2 skipped, rest pending)
            for seq, v in enumerate(bellevue_voters, start=1):
                if seq <= 4:
                    status = "visited"
                elif seq <= 6:
                    status = "skipped"
                else:
                    status = "pending"
                wl_entries.append(
                    WalkListEntry(
                        id=uuid.uuid4(),
                        walk_list_id=wl_ids[3],
                        voter_id=v.id,
                        sequence=seq,
                        status=status,
                    )
                )

            session.add_all(wl_entries)
            await session.flush()
            print(
                f"  Created {len(walk_lists)} walk lists"
                f" with {len(wl_entries)} entries"
            )

            # ----------------------------------------------------------
            # 9. Volunteers (20: 12 active, 4 inactive, 4 pending)
            # ----------------------------------------------------------
            # (first, last, status, skills, user_id)
            vol_data = [
                ("Aisha", "Brooks", "active",
                 ["canvassing", "voter_registration"], None),
                ("Carlos", "Hernandez", "active",
                 ["phone_banking", "data_entry"], None),
                ("Destiny", "Washington", "active",
                 ["canvassing", "event_setup", "driving"], None),
                ("Enrique", "Morales", "active",
                 ["social_media", "graphic_design"], None),
                ("Fatima", "Ali", "active",
                 ["translation", "canvassing", "phone_banking"], None),
                ("Grace", "Kim", "active",
                 ["phone_banking", "fundraising"], user_caller1_id),
                ("Hector", "Reyes", "active",
                 ["canvassing", "driving"], user_canvasser1_id),
                ("Isabella", "Osei", "active",
                 ["data_entry", "voter_registration"], None),
                ("Jamal", "Patterson", "active",
                 ["canvassing", "event_setup"], user_canvasser2_id),
                ("Keisha", "Turner", "active",
                 ["phone_banking", "social_media"], user_caller2_id),
                ("Liam", "O'Brien", "active",
                 ["canvassing", "phone_banking", "driving"], None),
                ("Maya", "Pham", "active",
                 ["translation", "data_entry", "phone_banking"], None),
                ("Noah", "Cooper", "inactive",
                 ["canvassing"], None),
                ("Olivia", "Reed", "inactive",
                 ["phone_banking", "data_entry"], None),
                ("Pedro", "Santos", "inactive",
                 ["event_setup"], None),
                ("Quinn", "Barrett", "inactive",
                 ["social_media", "graphic_design"], None),
                ("Rosa", "Delgado", "pending",
                 ["canvassing", "translation"], None),
                ("Samuel", "Foster", "pending",
                 ["phone_banking"], None),
                ("Tanya", "Griffin", "pending",
                 ["voter_registration"], None),
                ("Victor", "Huang", "pending",
                 ["data_entry", "fundraising"], None),
            ]

            # Emergency contact names pool — 95% of volunteers get both
            # name and phone so field shift assignment works in dev.
            ec_names = [
                "Maria Brooks", "Jorge Hernandez", "Diane Washington",
                "Luis Morales", "Amina Ali", "David Kim",
                "Elena Reyes", "Frank Osei", "Brenda Patterson",
                "Tony Turner", "Colleen O'Brien", "Huy Pham",
                "Janet Cooper", "Ricardo Reed", "Ana Santos",
                "Robert Barrett", "Carmen Delgado", "Gloria Foster",
                "Pat Griffin", "Linda Huang",
            ]

            volunteer_records: list[Volunteer] = []
            for idx, (first, last, status, skills, uid) in enumerate(
                vol_data
            ):
                # ~95% get emergency contacts; leave last active without
                # to verify the UI warning for missing contacts.
                has_ec = idx != 11  # Maya Pham left without
                vol = Volunteer(
                    id=uuid.uuid4(),
                    campaign_id=campaign_id,
                    user_id=uid,
                    first_name=first,
                    last_name=last,
                    phone=f"478-555-{random.randint(1000, 9999)}",
                    email=f"{first.lower()}.{last.lower()}@example.com",
                    city="Macon",
                    state="GA",
                    zip_code=random.choice(["31201", "31204", "31206"]),
                    status=status,
                    skills=skills,
                    emergency_contact_name=(
                        ec_names[idx % len(ec_names)] if has_ec else None
                    ),
                    emergency_contact_phone=(
                        f"478-555-{random.randint(1000, 9999)}"
                        if has_ec
                        else None
                    ),
                    created_by=user_owner_id,
                    created_at=NOW - timedelta(days=random.randint(1, 60)),
                    updated_at=NOW,
                )
                volunteer_records.append(vol)

            session.add_all(volunteer_records)
            await session.flush()
            active_vols = [
                v for v in volunteer_records if v.status == "active"
            ]
            print(
                f"  Created {len(volunteer_records)} volunteers"
                f" ({len(active_vols)} active)"
            )

            # ----------------------------------------------------------
            # 10. Call lists (3: active, completed, draft)
            # ----------------------------------------------------------
            cl_ids = [uuid.uuid4() for _ in range(3)]

            call_lists = [
                CallList(
                    id=cl_ids[0],
                    campaign_id=campaign_id,
                    voter_list_id=voter_list_id,
                    script_id=survey_id,
                    name="Evening Phone Bank List",
                    status="active",
                    total_entries=15,
                    completed_entries=5,
                    created_by=user_manager_id,
                    created_at=NOW,
                    updated_at=NOW,
                ),
                CallList(
                    id=cl_ids[1],
                    campaign_id=campaign_id,
                    voter_list_id=voter_list_id,
                    script_id=survey_id,
                    name="Morning Outreach List",
                    status="completed",
                    total_entries=15,
                    completed_entries=13,
                    created_by=user_owner_id,
                    created_at=NOW - timedelta(days=10),
                    updated_at=NOW - timedelta(days=3),
                ),
                CallList(
                    id=cl_ids[2],
                    campaign_id=campaign_id,
                    voter_list_id=voter_list_id,
                    script_id=survey_id,
                    name="Weekend Follow-up List",
                    status="draft",
                    total_entries=10,
                    completed_entries=0,
                    created_by=user_manager_id,
                    created_at=NOW - timedelta(days=1),
                    updated_at=NOW - timedelta(days=1),
                ),
            ]
            session.add_all(call_lists)
            await session.flush()

            # Call list entries
            cl_entries: list[CallListEntry] = []

            # Evening list (active): 5 completed, 2 in_progress, 8 available
            evening_voters = voter_records[20:35]
            for i, v in enumerate(evening_voters):
                if i < 5:
                    status = "completed"
                elif i < 7:
                    status = "in_progress"
                else:
                    status = "available"
                phone_val = phones[20 + i].value
                cl_entries.append(
                    CallListEntry(
                        id=uuid.uuid4(),
                        call_list_id=cl_ids[0],
                        voter_id=v.id,
                        priority_score=random.randint(1, 100),
                        phone_numbers=[
                            {"number": phone_val, "type": "cell"}
                        ],
                        status=status,
                        attempt_count=(
                            random.randint(1, 3)
                            if status in ("completed", "in_progress")
                            else 0
                        ),
                        claimed_by=(
                            user_volunteer_id
                            if status != "available" else None
                        ),
                        claimed_at=(
                            NOW - timedelta(hours=2)
                            if status != "available" else None
                        ),
                        last_attempt_at=(
                            NOW - timedelta(hours=1)
                            if status != "available" else None
                        ),
                    )
                )

            # Morning list (completed): 13 completed, 1 max_attempts, 1 terminal
            morning_voters = voter_records[0:15]
            for i, v in enumerate(morning_voters):
                if i < 13:
                    status = "completed"
                elif i == 13:
                    status = "max_attempts"
                else:
                    status = "terminal"
                phone_val = phones[i].value
                cl_entries.append(
                    CallListEntry(
                        id=uuid.uuid4(),
                        call_list_id=cl_ids[1],
                        voter_id=v.id,
                        priority_score=random.randint(1, 100),
                        phone_numbers=[
                            {"number": phone_val, "type": "cell"}
                        ],
                        status=status,
                        attempt_count=random.randint(1, 4),
                        claimed_by=random.choice(caller_user_ids),
                        claimed_at=NOW - timedelta(
                            days=random.randint(3, 10)
                        ),
                        last_attempt_at=NOW - timedelta(
                            days=random.randint(3, 7)
                        ),
                    )
                )

            # Weekend list (draft): all available
            weekend_voters = voter_records[35:45]
            for i, v in enumerate(weekend_voters):
                phone_val = phones[35 + i].value
                cl_entries.append(
                    CallListEntry(
                        id=uuid.uuid4(),
                        call_list_id=cl_ids[2],
                        voter_id=v.id,
                        priority_score=random.randint(1, 100),
                        phone_numbers=[
                            {"number": phone_val, "type": "cell"}
                        ],
                        status="available",
                        attempt_count=0,
                    )
                )

            session.add_all(cl_entries)
            await session.flush()
            print(
                f"  Created {len(call_lists)} call lists"
                f" with {len(cl_entries)} entries"
            )

            # ----------------------------------------------------------
            # 11. Phone bank sessions (3: completed, active, draft)
            # ----------------------------------------------------------
            pb_ids = [uuid.uuid4() for _ in range(3)]

            pb_sessions = [
                PhoneBankSession(
                    id=pb_ids[0],
                    campaign_id=campaign_id,
                    call_list_id=cl_ids[0],
                    name="Tuesday Evening Phone Bank",
                    status="completed",
                    scheduled_start=NOW - timedelta(hours=4),
                    scheduled_end=NOW - timedelta(hours=1),
                    created_by=user_manager_id,
                    created_at=NOW - timedelta(days=1),
                    updated_at=NOW,
                ),
                PhoneBankSession(
                    id=pb_ids[1],
                    campaign_id=campaign_id,
                    call_list_id=cl_ids[1],
                    name="Morning Outreach Session",
                    status="active",
                    scheduled_start=NOW - timedelta(hours=2),
                    scheduled_end=NOW + timedelta(hours=2),
                    created_by=user_owner_id,
                    created_at=NOW - timedelta(days=5),
                    updated_at=NOW,
                ),
                PhoneBankSession(
                    id=pb_ids[2],
                    campaign_id=campaign_id,
                    call_list_id=cl_ids[2],
                    name="Weekend Follow-up Session",
                    status="draft",
                    scheduled_start=NOW + timedelta(days=5),
                    scheduled_end=NOW + timedelta(days=5, hours=3),
                    created_by=user_manager_id,
                    created_at=NOW,
                    updated_at=NOW,
                ),
            ]
            session.add_all(pb_sessions)
            await session.flush()

            # Session callers
            session_callers = [
                # Tuesday Evening (completed)
                SessionCaller(
                    id=uuid.uuid4(),
                    session_id=pb_ids[0],
                    user_id=user_volunteer_id,
                    check_in_at=NOW - timedelta(hours=4),
                    check_out_at=NOW - timedelta(hours=1),
                    created_at=NOW - timedelta(hours=4),
                ),
                SessionCaller(
                    id=uuid.uuid4(),
                    session_id=pb_ids[0],
                    user_id=user_manager_id,
                    check_in_at=NOW - timedelta(hours=4),
                    check_out_at=NOW - timedelta(hours=2),
                    created_at=NOW - timedelta(hours=4),
                ),
                SessionCaller(
                    id=uuid.uuid4(),
                    session_id=pb_ids[0],
                    user_id=user_caller1_id,
                    check_in_at=NOW - timedelta(hours=3),
                    check_out_at=NOW - timedelta(hours=1),
                    created_at=NOW - timedelta(hours=3),
                ),
                # Morning Outreach (active)
                SessionCaller(
                    id=uuid.uuid4(),
                    session_id=pb_ids[1],
                    user_id=user_caller1_id,
                    check_in_at=NOW - timedelta(hours=2),
                    created_at=NOW - timedelta(hours=2),
                ),
                SessionCaller(
                    id=uuid.uuid4(),
                    session_id=pb_ids[1],
                    user_id=user_caller2_id,
                    check_in_at=NOW - timedelta(hours=2),
                    created_at=NOW - timedelta(hours=2),
                ),
                SessionCaller(
                    id=uuid.uuid4(),
                    session_id=pb_ids[1],
                    user_id=user_volunteer_id,
                    check_in_at=NOW - timedelta(hours=1),
                    created_at=NOW - timedelta(hours=1),
                ),
            ]
            session.add_all(session_callers)
            await session.flush()
            print(
                f"  Created {len(pb_sessions)} phone bank sessions"
                f" with {len(session_callers)} callers"
            )

            # ----------------------------------------------------------
            # 12. Shifts (10: spanning -14d to +5d, all statuses/types)
            # ----------------------------------------------------------
            # (name, type, status, offset_days, hrs, max, turf)
            shift_defs = [
                ("Sat Canvass - Ingleside", "canvassing",
                 "completed", -14, 4, 8, 0),
                ("Sat Canvass - Vineville", "canvassing",
                 "completed", -12, 4, 6, 1),
                ("Wed Phone Bank - Evening", "phone_banking",
                 "completed", -10, 3, 10, None),
                ("Sat Canvass - Pleasant Hill", "canvassing",
                 "completed", -7, 4, 8, 2),
                ("Sat Canvass - Downtown", "canvassing",
                 "completed", -5, 4, 6, 3),
                ("Volunteer Orientation", "general",
                 "completed", -3, 2, 15, None),
                ("Tue Canvass - Bellevue", "canvassing",
                 "active", 0, 4, 8, 4),
                ("Thu Phone Bank - Morning", "phone_banking",
                 "scheduled", 2, 3, 10, None),
                ("Sat Canvass Blitz", "canvassing",
                 "scheduled", 4, 6, 20, 0),
                ("Cancelled Rain Date", "canvassing",
                 "cancelled", -1, 4, 8, 2),
            ]

            shift_records: list[Shift] = []
            for (
                name, stype, status,
                start_offset, duration, max_vol, turf_idx,
            ) in shift_defs:
                sid = uuid.uuid4()
                start = NOW + timedelta(days=start_offset, hours=9)
                shift = Shift(
                    id=sid,
                    campaign_id=campaign_id,
                    name=name,
                    description=f"{name} shift",
                    type=stype,
                    status=status,
                    start_at=start,
                    end_at=start + timedelta(hours=duration),
                    max_volunteers=max_vol,
                    location_name=(
                        "Campaign HQ"
                        if turf_idx is None
                        else f"{neighborhood_names[turf_idx]} Center"
                    ),
                    street=(
                        f"{random.randint(100, 999)}"
                        f" {random.choice(STREET_NAMES)}"
                    ),
                    city="Macon",
                    state="GA",
                    zip_code="31201",
                    latitude=32.840 + random.uniform(-0.01, 0.01),
                    longitude=-83.635 + random.uniform(-0.01, 0.01),
                    turf_id=(
                        turf_records[turf_idx].id
                        if turf_idx is not None else None
                    ),
                    phone_bank_session_id=(
                        pb_ids[0]
                        if stype == "phone_banking"
                        and status == "completed"
                        else None
                    ),
                    created_by=random.choice(
                        [user_owner_id, user_manager_id]
                    ),
                    created_at=NOW + timedelta(days=start_offset - 7),
                    updated_at=NOW + timedelta(days=start_offset),
                )
                shift_records.append(shift)

            session.add_all(shift_records)
            await session.flush()
            print(f"  Created {len(shift_records)} shifts")

            # ----------------------------------------------------------
            # 12b. Shift volunteers (~50 across all shifts)
            # ----------------------------------------------------------
            sv_records: list[ShiftVolunteer] = []

            # All 6 SignupStatus values: signed_up, waitlisted, checked_in,
            # checked_out, cancelled, no_show
            for shift_idx, shift in enumerate(shift_records):
                # Pick a subset of volunteers for each shift
                num_signups = min(
                    shift.max_volunteers, random.randint(3, 8)
                )
                chosen_vols = random.sample(
                    active_vols, min(num_signups, len(active_vols))
                )

                for vi, vol in enumerate(chosen_vols):
                    if shift.status == "completed":
                        # Completed shifts: mostly checked_out, some no_show/cancelled
                        if vi == 0 and shift_idx % 3 == 0:
                            sv_status = "no_show"
                        elif vi == 1 and shift_idx % 4 == 0:
                            sv_status = "cancelled"
                        else:
                            sv_status = "checked_out"
                    elif shift.status == "active":
                        sv_status = (
                            "checked_in"
                            if vi < len(chosen_vols) - 1
                            else "signed_up"
                        )
                    elif shift.status == "cancelled":
                        sv_status = "cancelled"
                    else:
                        # Scheduled: signed_up + some waitlisted
                        sv_status = (
                            "waitlisted"
                            if vi >= shift.max_volunteers - 2
                            else "signed_up"
                        )

                    check_in = None
                    check_out = None
                    if sv_status == "checked_out":
                        check_in = shift.start_at
                        check_out = shift.end_at - timedelta(
                            minutes=random.randint(0, 30)
                        )
                    elif sv_status == "checked_in":
                        check_in = shift.start_at + timedelta(
                            minutes=random.randint(0, 15)
                        )

                    sv_records.append(
                        ShiftVolunteer(
                            id=uuid.uuid4(),
                            shift_id=shift.id,
                            volunteer_id=vol.id,
                            status=sv_status,
                            check_in_at=check_in,
                            check_out_at=check_out,
                            signed_up_at=shift.start_at - timedelta(
                                days=random.randint(1, 5)
                            ),
                        )
                    )

            session.add_all(sv_records)
            await session.flush()
            print(f"  Created {len(sv_records)} shift volunteer signups")

            # ----------------------------------------------------------
            # 13. Voter interactions (150+: ~85 door knocks, ~65 calls)
            # ----------------------------------------------------------
            interactions: list[VoterInteraction] = []

            # --- ~85 DOOR_KNOCK interactions ---
            # Spread across 4 canvassers, 4 walk lists, 28-day date range
            door_knock_count = 0
            for dk_i in range(85):
                voter = voter_records[dk_i % len(voter_records)]
                canvasser = canvasser_user_ids[dk_i % len(canvasser_user_ids)]
                wl_id = wl_ids[dk_i % len(wl_ids)]
                result = random.choice(DOOR_KNOCK_RESULTS)
                days_ago = random.randint(0, 27)

                interactions.append(
                    VoterInteraction(
                        id=uuid.uuid4(),
                        campaign_id=campaign_id,
                        voter_id=voter.id,
                        type=InteractionType.DOOR_KNOCK,
                        payload={
                            "result_code": result,
                            "walk_list_id": str(wl_id),
                            "notes": (
                                f"Knocked on door at"
                                f" {voter.address_line1}"
                            ),
                        },
                        created_by=canvasser,
                        created_at=NOW - timedelta(
                            days=days_ago,
                            hours=random.randint(9, 17),
                        ),
                    )
                )
                door_knock_count += 1

            # --- ~65 PHONE_CALL interactions ---
            # Spread across 4 callers, 3 sessions, 3 call lists
            phone_call_count = 0
            for pc_i in range(65):
                voter = voter_records[(pc_i + 15) % len(voter_records)]
                caller = caller_user_ids[pc_i % len(caller_user_ids)]
                pb_id = pb_ids[pc_i % 2]  # Only completed and active sessions
                cl_id = cl_ids[pc_i % 2]
                result = random.choice(PHONE_CALL_RESULTS)
                days_ago = random.randint(0, 20)

                interactions.append(
                    VoterInteraction(
                        id=uuid.uuid4(),
                        campaign_id=campaign_id,
                        voter_id=voter.id,
                        type=InteractionType.PHONE_CALL,
                        payload={
                            "result_code": result,
                            "session_id": str(pb_id),
                            "call_list_id": str(cl_id),
                            "duration_seconds": (
                                random.randint(30, 300)
                                if result == "answered"
                                else 0
                            ),
                        },
                        created_by=caller,
                        created_at=NOW - timedelta(
                            days=days_ago,
                            hours=random.randint(9, 20),
                        ),
                    )
                )
                phone_call_count += 1

            # --- Survey response interactions (for voters who had door knocks) ---
            survey_answers_ext = [
                ("Dana Whitfield", "Public safety", "8", "Maybe later"),
                ("Other candidate", "Education", "6", "No"),
                ("Undecided", "Infrastructure", "9", "Yes"),
                ("Dana Whitfield", "Economy", "7", "Yes"),
                ("Prefer not to say", "Healthcare", "5", "No"),
                ("Dana Whitfield", "Public safety", "9", "Yes"),
                ("Undecided", "Education", "4", "No"),
                ("Dana Whitfield", "Infrastructure", "10", "Maybe later"),
                ("Other candidate", "Economy", "3", "No"),
                ("Dana Whitfield", "Healthcare", "8", "Yes"),
            ]
            survey_respondents = [user_volunteer_id, user_canvasser1_id,
                                  user_canvasser2_id, user_caller1_id, user_caller2_id]
            for i, answers in enumerate(survey_answers_ext):
                voter = voter_records[i]
                answerer = survey_respondents[i % len(survey_respondents)]
                for q_idx, answer in enumerate(answers):
                    interactions.append(
                        VoterInteraction(
                            id=uuid.uuid4(),
                            campaign_id=campaign_id,
                            voter_id=voter.id,
                            type=InteractionType.SURVEY_RESPONSE,
                            payload={
                                "script_id": str(survey_id),
                                "question_id": str(question_records[q_idx].id),
                                "answer": answer,
                            },
                            created_by=answerer,
                            created_at=NOW - timedelta(days=random.randint(1, 14)),
                        )
                    )

            session.add_all(interactions)
            await session.flush()
            print(
                f"  Created {len(interactions)} voter interactions "
                f"({door_knock_count} door knocks, {phone_call_count} phone calls)"
            )

            # ----------------------------------------------------------
            # 14. Survey responses (formal SurveyResponse records, ~50)
            # ----------------------------------------------------------
            sr_records: list[SurveyResponse] = []
            for i, answers in enumerate(survey_answers_ext):
                voter = voter_records[i]
                answerer = survey_respondents[i % len(survey_respondents)]
                for q_idx, answer in enumerate(answers):
                    sr_records.append(
                        SurveyResponse(
                            id=uuid.uuid4(),
                            campaign_id=campaign_id,
                            script_id=survey_id,
                            question_id=question_records[q_idx].id,
                            voter_id=voter.id,
                            answer_value=answer,
                            answered_by=answerer,
                            answered_at=NOW - timedelta(days=random.randint(1, 14)),
                        )
                    )

            session.add_all(sr_records)
            await session.flush()
            print(f"  Created {len(sr_records)} survey responses")

            # ----------------------------------------------------------
            # 15. Voter tags + assignments (~60 members)
            # ----------------------------------------------------------
            voter_tag_names = [
                "Strong Supporter", "Leaning Supporter", "Undecided",
                "Opposed", "Needs Follow-up", "Spanish Speaker",
                "Senior (65+)", "New Registrant",
            ]
            voter_tag_records: list[VoterTag] = []
            for tag_name in voter_tag_names:
                voter_tag_records.append(
                    VoterTag(
                        id=uuid.uuid4(),
                        campaign_id=campaign_id,
                        name=tag_name,
                    )
                )
            session.add_all(voter_tag_records)
            await session.flush()

            # Assign tags based on semi-realistic voter attributes
            vtm_records: list[VoterTagMember] = []
            assigned_pairs: set[tuple[uuid.UUID, uuid.UUID]] = set()

            def _add_vtm(vid, tag_idx):
                """Add voter-tag if not duplicate."""
                tid = voter_tag_records[tag_idx].id
                pair = (vid, tid)
                if pair not in assigned_pairs:
                    vtm_records.append(
                        VoterTagMember(voter_id=vid, tag_id=tid)
                    )
                    assigned_pairs.add(pair)

            for v in voter_records:
                # Strong Supporter: DEM voters
                if v.party == "DEM" and random.random() < 0.35:
                    _add_vtm(v.id, 0)
                # Leaning Supporter: DEM voters
                elif v.party == "DEM" and random.random() < 0.3:
                    _add_vtm(v.id, 1)
                # Undecided: NPA voters
                if v.party == "NPA" and random.random() < 0.6:
                    _add_vtm(v.id, 2)
                # Opposed: REP voters
                if v.party == "REP" and random.random() < 0.3:
                    _add_vtm(v.id, 3)
                # Needs Follow-up: random 15%
                if random.random() < 0.15:
                    _add_vtm(v.id, 4)
                # Spanish Speaker: random ~10%
                if random.random() < 0.10:
                    _add_vtm(v.id, 5)
                # Senior (65+): voters aged 65+
                if v.age and v.age >= 65:
                    _add_vtm(v.id, 6)
                # New Registrant: recent registration
                reg_years = (
                    (NOW.date() - v.registration_date).days / 365
                    if v.registration_date
                    else 99
                )
                if reg_years < 2:
                    _add_vtm(v.id, 7)

            session.add_all(vtm_records)
            await session.flush()
            print(
                f"  Created {len(voter_tag_records)} voter tags"
                f" with {len(vtm_records)} assignments"
            )

            # ----------------------------------------------------------
            # 16. Volunteer tags + assignments (~30 members)
            # ----------------------------------------------------------
            vol_tag_names = [
                "Experienced", "New Recruit", "Team Lead", "Bilingual", "Weekend Only",
            ]
            vol_tag_records: list[VolunteerTag] = []
            for tag_name in vol_tag_names:
                vol_tag_records.append(
                    VolunteerTag(
                        id=uuid.uuid4(),
                        campaign_id=campaign_id,
                        name=tag_name,
                        created_at=NOW,
                    )
                )
            session.add_all(vol_tag_records)
            await session.flush()

            vol_tm_records: list[VolunteerTagMember] = []
            for vol in volunteer_records:
                # Experienced: active with canvassing + phone_banking
                if (
                    vol.status == "active"
                    and len(vol.skills) >= 2
                    and random.random() < 0.5
                ):
                        vol_tm_records.append(VolunteerTagMember(
                            volunteer_id=vol.id,
                            tag_id=vol_tag_records[0].id,
                        ))
                # New Recruit: pending
                if vol.status == "pending":
                    vol_tm_records.append(VolunteerTagMember(
                        volunteer_id=vol.id,
                        tag_id=vol_tag_records[1].id,
                    ))
                # Team Lead: user-linked active volunteers
                if vol.user_id and vol.status == "active":
                    vol_tm_records.append(VolunteerTagMember(
                        volunteer_id=vol.id,
                        tag_id=vol_tag_records[2].id,
                    ))
                # Bilingual: translation skill
                if "translation" in (vol.skills or []):
                    vol_tm_records.append(VolunteerTagMember(
                        volunteer_id=vol.id,
                        tag_id=vol_tag_records[3].id,
                    ))
                # Weekend Only: random 20%
                if random.random() < 0.2:
                    vol_tm_records.append(VolunteerTagMember(
                        volunteer_id=vol.id,
                        tag_id=vol_tag_records[4].id,
                    ))

            session.add_all(vol_tm_records)
            await session.flush()
            print(
                f"  Created {len(vol_tag_records)} volunteer tags"
                f" with {len(vol_tm_records)} assignments"
            )

            # ----------------------------------------------------------
            # 17. Volunteer availability (~30 records)
            # ----------------------------------------------------------
            avail_records: list[VolunteerAvailability] = []
            sat_offset = (5 - NOW.weekday()) % 7
            tue_offset = (1 - NOW.weekday()) % 7
            sun_offset = (6 - NOW.weekday()) % 7

            for vol in active_vols:
                # Weekend morning (Sat 9am-12pm)
                avail_records.append(
                    VolunteerAvailability(
                        id=uuid.uuid4(),
                        volunteer_id=vol.id,
                        start_at=NOW + timedelta(
                            days=sat_offset, hours=9 - NOW.hour
                        ),
                        end_at=NOW + timedelta(
                            days=sat_offset, hours=12 - NOW.hour
                        ),
                    )
                )
                # Weekday evening (Tue 5pm-8pm) for half
                if random.random() < 0.5:
                    avail_records.append(
                        VolunteerAvailability(
                            id=uuid.uuid4(),
                            volunteer_id=vol.id,
                            start_at=NOW + timedelta(
                                days=tue_offset,
                                hours=17 - NOW.hour,
                            ),
                            end_at=NOW + timedelta(
                                days=tue_offset,
                                hours=20 - NOW.hour,
                            ),
                        )
                    )
                # Sunday afternoon for some
                if random.random() < 0.3:
                    avail_records.append(
                        VolunteerAvailability(
                            id=uuid.uuid4(),
                            volunteer_id=vol.id,
                            start_at=NOW + timedelta(
                                days=sun_offset,
                                hours=13 - NOW.hour,
                            ),
                            end_at=NOW + timedelta(
                                days=sun_offset,
                                hours=17 - NOW.hour,
                            ),
                        )
                    )

            session.add_all(avail_records)
            await session.flush()
            print(
                f"  Created {len(avail_records)}"
                " volunteer availability windows"
            )

            # ----------------------------------------------------------
            # 18. DNC entries (20 records)
            # ----------------------------------------------------------
            dnc_reasons = [
                "refused", "voter_request",
                "registry_import", "manual",
            ]
            dnc_records: list[DoNotCallEntry] = []
            # Use phone numbers from various voters
            dnc_phone_set: set[str] = set()
            for i in range(20):
                phone_num = f"478-555-{1000 + i}"
                if phone_num in dnc_phone_set:
                    continue
                dnc_phone_set.add(phone_num)
                dnc_records.append(
                    DoNotCallEntry(
                        id=uuid.uuid4(),
                        campaign_id=campaign_id,
                        phone_number=phone_num,
                        reason=dnc_reasons[i % len(dnc_reasons)],
                        added_by=random.choice(
                            [user_owner_id, user_manager_id]
                        ),
                        added_at=NOW - timedelta(
                            days=random.randint(1, 30)
                        ),
                    )
                )

            session.add_all(dnc_records)
            await session.flush()
            print(f"  Created {len(dnc_records)} DNC entries")

            # ----------------------------------------------------------
            # 19. Invites (7 records: 3 pending, 1 accepted, 1 revoked,
            #     1 expired, 1 pending manager)
            # ----------------------------------------------------------
            invite_records: list[Invite] = []

            # 3 pending
            for email, role in [
                ("alex.newman@example.com", "volunteer"),
                ("brenda.ortiz@example.com", "volunteer"),
                ("chris.dunn@example.com", "volunteer"),
            ]:
                invite_records.append(
                    Invite(
                        id=uuid.uuid4(),
                        campaign_id=campaign_id,
                        email=email,
                        role=role,
                        token=uuid.uuid4(),
                        expires_at=NOW + timedelta(days=7),
                        created_by=user_owner_id,
                        created_at=NOW - timedelta(days=1),
                    )
                )

            # 1 accepted
            invite_records.append(
                Invite(
                    id=uuid.uuid4(),
                    campaign_id=campaign_id,
                    email="terrence.moore@example.com",
                    role="volunteer",
                    token=uuid.uuid4(),
                    expires_at=NOW + timedelta(days=5),
                    accepted_at=NOW - timedelta(hours=12),
                    created_by=user_owner_id,
                    created_at=NOW - timedelta(days=2),
                )
            )

            # 1 revoked
            invite_records.append(
                Invite(
                    id=uuid.uuid4(),
                    campaign_id=campaign_id,
                    email="dave.kemp@example.com",
                    role="volunteer",
                    token=uuid.uuid4(),
                    expires_at=NOW + timedelta(days=3),
                    revoked_at=NOW - timedelta(days=1),
                    created_by=user_manager_id,
                    created_at=NOW - timedelta(days=4),
                )
            )

            # 1 expired
            invite_records.append(
                Invite(
                    id=uuid.uuid4(),
                    campaign_id=campaign_id,
                    email="eve.chang@example.com",
                    role="volunteer",
                    token=uuid.uuid4(),
                    expires_at=NOW - timedelta(days=1),
                    created_by=user_manager_id,
                    created_at=NOW - timedelta(days=10),
                )
            )

            # 1 pending manager
            invite_records.append(
                Invite(
                    id=uuid.uuid4(),
                    campaign_id=campaign_id,
                    email="frank.torres@example.com",
                    role="manager",
                    token=uuid.uuid4(),
                    expires_at=NOW + timedelta(days=7),
                    created_by=user_owner_id,
                    created_at=NOW,
                )
            )

            session.add_all(invite_records)
            await session.flush()
            print(f"  Created {len(invite_records)} invites")

            # ----------------------------------------------------------
            # 20. Voter addresses (~30 records)
            # ----------------------------------------------------------
            addr_records: list[VoterAddress] = []
            # Give addresses to voters who had interactions (first 30)
            for i, v in enumerate(voter_records[:30]):
                # Primary home address
                addr_records.append(
                    VoterAddress(
                        id=uuid.uuid4(),
                        campaign_id=campaign_id,
                        voter_id=v.id,
                        address_line1=v.address_line1,
                        city="Macon",
                        state="GA",
                        zip_code=v.zip_code,
                        type="home",
                        is_primary=True,
                        source="import",
                        created_at=NOW,
                        updated_at=NOW,
                    )
                )
                # Some get a mailing address too
                if i % 5 == 0:
                    addr_records.append(
                        VoterAddress(
                            id=uuid.uuid4(),
                            campaign_id=campaign_id,
                            voter_id=v.id,
                            address_line1=f"PO Box {random.randint(100, 9999)}",
                            city="Macon",
                            state="GA",
                            zip_code=v.zip_code,
                            type="mailing",
                            is_primary=False,
                            source="manual",
                            created_at=NOW,
                            updated_at=NOW,
                        )
                    )

            session.add_all(addr_records)
            await session.flush()
            print(f"  Created {len(addr_records)} voter addresses")

    await engine.dispose()
    print("\nSeed data creation complete!")
    print(f"  Campaign: {SEED_CAMPAIGN_NAME}")
    print(f"  Users: {len(users)}")
    print(f"  Campaign members: {len(members)}")
    print(f"  Voters: {len(voter_records)}")
    print(f"  Turfs: {len(turf_records)}")
    print(f"  Walk lists: {len(walk_lists)} ({len(wl_entries)} entries)")
    print(f"  Volunteers: {len(volunteer_records)}")
    print(f"  Call lists: {len(call_lists)} ({len(cl_entries)} entries)")
    print(f"  Phone bank sessions: {len(pb_sessions)}")
    print(f"  Shifts: {len(shift_records)} ({len(sv_records)} volunteer signups)")
    print(f"  Interactions: {len(interactions)}")
    print(f"  Survey responses: {len(sr_records)}")
    print(f"  Voter tags: {len(voter_tag_records)} ({len(vtm_records)} assignments)")
    print(
        f"  Volunteer tags: {len(vol_tag_records)}"
        f" ({len(vol_tm_records)} assignments)"
    )
    print(f"  Volunteer availability: {len(avail_records)}")
    print(f"  DNC entries: {len(dnc_records)}")
    print(f"  Invites: {len(invite_records)}")
    print(f"  Voter addresses: {len(addr_records)}")


if __name__ == "__main__":
    asyncio.run(main())
