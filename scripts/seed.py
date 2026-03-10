"""Idempotent seed data script for Macon-Bibb County GA demo dataset.

Populates the database with a complete, interconnected demo dataset including
campaigns, voters, turfs, walk lists, surveys, volunteers, shifts, phone bank
sessions, and voter interactions.

Usage: docker compose exec api python scripts/seed.py
"""

from __future__ import annotations

import asyncio
import os
import random
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Model imports
from app.models.call_list import CallList, CallListEntry
from app.models.campaign import Campaign, CampaignStatus, CampaignType
from app.models.campaign_member import CampaignMember
from app.models.phone_bank import PhoneBankSession, SessionCaller
from app.models.shift import Shift, ShiftVolunteer
from app.models.survey import SurveyQuestion, SurveyResponse, SurveyScript
from app.models.turf import Turf
from app.models.user import User
from app.models.voter import Voter
from app.models.voter_contact import VoterEmail, VoterPhone
from app.models.voter_interaction import InteractionType, VoterInteraction
from app.models.voter_list import VoterList
from app.models.volunteer import Volunteer
from app.models.walk_list import WalkList, WalkListCanvasser, WalkListEntry

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SEED_CAMPAIGN_NAME = "Macon-Bibb Demo Campaign"
NOW = datetime.now(UTC)

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


def _jitter(center: float, spread: float = 0.005) -> float:
    """Add small random offset to a coordinate."""
    return center + random.uniform(-spread, spread)


async def main() -> None:
    """Create the complete Macon-Bibb County demo dataset."""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL environment variable not set")
        raise SystemExit(1)

    engine = create_async_engine(database_url)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        async with session.begin():
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
            # 1. Users (3 fabricated users with ZITADEL-style IDs)
            # ----------------------------------------------------------
            user_owner_id = f"seed-owner-{uuid.uuid4().hex[:12]}"
            user_manager_id = f"seed-manager-{uuid.uuid4().hex[:12]}"
            user_volunteer_id = f"seed-volunteer-{uuid.uuid4().hex[:12]}"

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
            ]
            session.add_all(users)
            await session.flush()
            print(f"  Created {len(users)} users")

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
            # 3. Campaign members (no role column -- role comes from JWT)
            # ----------------------------------------------------------
            members = [
                CampaignMember(
                    id=uuid.uuid4(),
                    user_id=user_owner_id,
                    campaign_id=campaign_id,
                    synced_at=NOW,
                ),
                CampaignMember(
                    id=uuid.uuid4(),
                    user_id=user_manager_id,
                    campaign_id=campaign_id,
                    synced_at=NOW,
                ),
                CampaignMember(
                    id=uuid.uuid4(),
                    user_id=user_volunteer_id,
                    campaign_id=campaign_id,
                    synced_at=NOW,
                ),
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
                    address_line1=f"{random.randint(100, 9999)} {random.choice(STREET_NAMES)}",
                    city="Macon",
                    state="GA",
                    zip_code=random.choice(["31201", "31204", "31206", "31210", "31211"]),
                    county="Bibb",
                    party=party,
                    precinct=PRECINCTS[i % len(PRECINCTS)],
                    congressional_district="02",
                    state_senate_district="26",
                    state_house_district="142",
                    registration_date=NOW.date() - timedelta(days=random.randint(365, 3650)),
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
            # 5. Turfs (3 neighborhoods with polygon boundaries)
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
                description="Standard door-to-door and phone bank survey for voter engagement",
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
                    {"choices": ["Dana Whitfield", "Other candidate", "Undecided", "Prefer not to say"]},
                ),
                (
                    "What is the most important issue facing Macon-Bibb County?",
                    "multiple_choice",
                    {"choices": ["Public safety", "Infrastructure", "Education", "Economy", "Healthcare", "Other"]},
                ),
                (
                    "On a scale of 1-10, how likely are you to vote in the next election?",
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
            # 8. Walk lists (2: one active, one completed)
            # ----------------------------------------------------------
            wl_active_id = uuid.uuid4()
            wl_completed_id = uuid.uuid4()

            walk_lists = [
                WalkList(
                    id=wl_active_id,
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
                    id=wl_completed_id,
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
            ]
            session.add_all(walk_lists)
            await session.flush()

            # Assign canvassers
            canvassers = [
                WalkListCanvasser(
                    walk_list_id=wl_active_id,
                    user_id=user_volunteer_id,
                    assigned_at=NOW,
                ),
                WalkListCanvasser(
                    walk_list_id=wl_completed_id,
                    user_id=user_volunteer_id,
                    assigned_at=NOW - timedelta(days=7),
                ),
            ]
            session.add_all(canvassers)
            await session.flush()

            # Walk list entries -- Ingleside voters for active list
            ingleside_voters = [v for v in voter_records if v.extra_data.get("neighborhood") == "Ingleside"][:10]
            wl_entries: list[WalkListEntry] = []
            for seq, v in enumerate(ingleside_voters, start=1):
                status = "visited" if seq <= 3 else "pending"
                wl_entries.append(
                    WalkListEntry(
                        id=uuid.uuid4(),
                        walk_list_id=wl_active_id,
                        voter_id=v.id,
                        sequence=seq,
                        status=status,
                    )
                )

            # Vineville voters for completed list
            vineville_voters = [v for v in voter_records if v.extra_data.get("neighborhood") == "Vineville"][:12]
            # Pad with other voters if not enough
            remaining = [v for v in voter_records if v not in ingleside_voters and v not in vineville_voters]
            vineville_for_list = vineville_voters + remaining[: max(0, 12 - len(vineville_voters))]
            for seq, v in enumerate(vineville_for_list[:12], start=1):
                wl_entries.append(
                    WalkListEntry(
                        id=uuid.uuid4(),
                        walk_list_id=wl_completed_id,
                        voter_id=v.id,
                        sequence=seq,
                        status="visited",
                    )
                )

            session.add_all(wl_entries)
            await session.flush()
            print(f"  Created {len(walk_lists)} walk lists with {len(wl_entries)} entries")

            # ----------------------------------------------------------
            # 9. Volunteers (5)
            # ----------------------------------------------------------
            vol_first_names = ["Aisha", "Carlos", "Destiny", "Enrique", "Fatima"]
            vol_last_names = ["Brooks", "Hernandez", "Washington", "Morales", "Ali"]
            vol_skills = [
                ["canvassing", "voter_registration"],
                ["phone_banking", "data_entry"],
                ["canvassing", "event_setup", "driving"],
                ["social_media", "graphic_design"],
                ["translation", "canvassing", "phone_banking"],
            ]

            volunteer_records: list[Volunteer] = []
            for i in range(5):
                vol = Volunteer(
                    id=uuid.uuid4(),
                    campaign_id=campaign_id,
                    user_id=None,  # Walk-in volunteers
                    first_name=vol_first_names[i],
                    last_name=vol_last_names[i],
                    phone=f"478-555-{random.randint(1000, 9999)}",
                    email=f"{vol_first_names[i].lower()}.{vol_last_names[i].lower()}@example.com",
                    city="Macon",
                    state="GA",
                    zip_code="31201",
                    status="active",
                    skills=vol_skills[i],
                    created_by=user_owner_id,
                    created_at=NOW,
                    updated_at=NOW,
                )
                volunteer_records.append(vol)

            session.add_all(volunteer_records)
            await session.flush()
            print(f"  Created {len(volunteer_records)} volunteers")

            # ----------------------------------------------------------
            # 10. Call list + entries
            # ----------------------------------------------------------
            call_list_id = uuid.uuid4()
            call_list = CallList(
                id=call_list_id,
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
            )
            session.add(call_list)
            await session.flush()

            # Phone bank call list entries (15 voters)
            call_voters = voter_records[20:35]
            cl_entries: list[CallListEntry] = []
            for i, v in enumerate(call_voters):
                status = "completed" if i < 5 else "available"
                phone_val = phones[20 + i].value if 20 + i < len(phones) else "478-555-0000"
                cl_entries.append(
                    CallListEntry(
                        id=uuid.uuid4(),
                        call_list_id=call_list_id,
                        voter_id=v.id,
                        priority_score=random.randint(1, 100),
                        phone_numbers=[{"number": phone_val, "type": "cell"}],
                        status=status,
                        attempt_count=random.randint(1, 3) if status == "completed" else 0,
                        claimed_by=user_volunteer_id if status == "completed" else None,
                        claimed_at=NOW - timedelta(hours=2) if status == "completed" else None,
                        last_attempt_at=NOW - timedelta(hours=1) if status == "completed" else None,
                    )
                )

            session.add_all(cl_entries)
            await session.flush()
            print(f"  Created call list with {len(cl_entries)} entries")

            # ----------------------------------------------------------
            # 11. Phone bank session
            # ----------------------------------------------------------
            pb_session_id = uuid.uuid4()
            pb_session = PhoneBankSession(
                id=pb_session_id,
                campaign_id=campaign_id,
                call_list_id=call_list_id,
                name="Tuesday Evening Phone Bank",
                status="completed",
                scheduled_start=NOW - timedelta(hours=4),
                scheduled_end=NOW - timedelta(hours=1),
                created_by=user_manager_id,
                created_at=NOW - timedelta(days=1),
                updated_at=NOW,
            )
            session.add(pb_session)
            await session.flush()

            # Session callers
            callers = [
                SessionCaller(
                    id=uuid.uuid4(),
                    session_id=pb_session_id,
                    user_id=user_volunteer_id,
                    check_in_at=NOW - timedelta(hours=4),
                    check_out_at=NOW - timedelta(hours=1),
                    created_at=NOW - timedelta(hours=4),
                ),
                SessionCaller(
                    id=uuid.uuid4(),
                    session_id=pb_session_id,
                    user_id=user_manager_id,
                    check_in_at=NOW - timedelta(hours=4),
                    check_out_at=NOW - timedelta(hours=2),
                    created_at=NOW - timedelta(hours=4),
                ),
            ]
            session.add_all(callers)
            await session.flush()
            print(f"  Created phone bank session with {len(callers)} callers")

            # ----------------------------------------------------------
            # 12. Shifts (2: one past completed, one upcoming)
            # ----------------------------------------------------------
            shift_past_id = uuid.uuid4()
            shift_future_id = uuid.uuid4()

            shifts = [
                Shift(
                    id=shift_past_id,
                    campaign_id=campaign_id,
                    name="Saturday Canvassing - Ingleside",
                    description="Door-to-door canvassing in the Ingleside neighborhood",
                    type="canvassing",
                    status="completed",
                    start_at=NOW - timedelta(days=3, hours=5),
                    end_at=NOW - timedelta(days=3, hours=1),
                    max_volunteers=8,
                    location_name="Ingleside Community Center",
                    street="1234 Ingleside Ave",
                    city="Macon",
                    state="GA",
                    zip_code="31204",
                    latitude=32.845,
                    longitude=-83.635,
                    turf_id=turf_records[0].id,
                    created_by=user_owner_id,
                    created_at=NOW - timedelta(days=10),
                    updated_at=NOW - timedelta(days=3),
                ),
                Shift(
                    id=shift_future_id,
                    campaign_id=campaign_id,
                    name="Weekend Phone Bank",
                    description="Phone banking session for voter outreach",
                    type="phone_banking",
                    status="scheduled",
                    start_at=NOW + timedelta(days=4, hours=3),
                    end_at=NOW + timedelta(days=4, hours=7),
                    max_volunteers=10,
                    location_name="Campaign HQ",
                    street="456 Cherry St",
                    city="Macon",
                    state="GA",
                    zip_code="31201",
                    latitude=32.840,
                    longitude=-83.632,
                    phone_bank_session_id=None,
                    created_by=user_manager_id,
                    created_at=NOW,
                    updated_at=NOW,
                ),
            ]
            session.add_all(shifts)
            await session.flush()

            # Shift volunteers for past shift
            sv_records: list[ShiftVolunteer] = []
            for i, vol in enumerate(volunteer_records[:3]):
                sv = ShiftVolunteer(
                    id=uuid.uuid4(),
                    shift_id=shift_past_id,
                    volunteer_id=vol.id,
                    status="checked_out",
                    check_in_at=NOW - timedelta(days=3, hours=5),
                    check_out_at=NOW - timedelta(days=3, hours=1),
                    signed_up_at=NOW - timedelta(days=5),
                )
                sv_records.append(sv)

            # Future shift signups
            for vol in volunteer_records[2:5]:
                sv_records.append(
                    ShiftVolunteer(
                        id=uuid.uuid4(),
                        shift_id=shift_future_id,
                        volunteer_id=vol.id,
                        status="signed_up",
                        signed_up_at=NOW - timedelta(days=1),
                    )
                )

            session.add_all(sv_records)
            await session.flush()
            print(f"  Created {len(shifts)} shifts with {len(sv_records)} volunteer signups")

            # ----------------------------------------------------------
            # 13. Voter interactions (~20 across types)
            # ----------------------------------------------------------
            interactions: list[VoterInteraction] = []

            # Door knock results from walk list activity
            door_results = ["supporter", "not_home", "refused", "undecided", "supporter",
                            "not_home", "supporter", "opposed"]
            for i, result in enumerate(door_results):
                voter = voter_records[i]
                interactions.append(
                    VoterInteraction(
                        id=uuid.uuid4(),
                        campaign_id=campaign_id,
                        voter_id=voter.id,
                        type=InteractionType.DOOR_KNOCK,
                        payload={
                            "result": result,
                            "walk_list_id": str(wl_completed_id),
                            "notes": f"Knocked on door at {voter.address_line1}",
                        },
                        created_by=user_volunteer_id,
                        created_at=NOW - timedelta(days=random.randint(1, 7)),
                    )
                )

            # Phone call results from phone bank activity
            call_results = ["answered", "no_answer", "voicemail", "answered", "no_answer",
                            "answered", "busy"]
            for i, result in enumerate(call_results):
                voter = voter_records[20 + i]
                interactions.append(
                    VoterInteraction(
                        id=uuid.uuid4(),
                        campaign_id=campaign_id,
                        voter_id=voter.id,
                        type=InteractionType.PHONE_CALL,
                        payload={
                            "result": result,
                            "phone_bank_session_id": str(pb_session_id),
                            "call_list_id": str(call_list_id),
                            "duration_seconds": random.randint(30, 300) if result == "answered" else 0,
                        },
                        created_by=user_volunteer_id,
                        created_at=NOW - timedelta(hours=random.randint(1, 48)),
                    )
                )

            # Survey responses for some voters
            survey_answers = [
                ("Dana Whitfield", "Public safety", "8", "Maybe later"),
                ("Other candidate", "Education", "6", "No"),
                ("Undecided", "Infrastructure", "9", "Yes"),
                ("Dana Whitfield", "Economy", "7", "Yes"),
                ("Prefer not to say", "Healthcare", "5", "No"),
            ]
            for i, answers in enumerate(survey_answers):
                voter = voter_records[i]
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
                            created_by=user_volunteer_id,
                            created_at=NOW - timedelta(days=random.randint(1, 5)),
                        )
                    )

            session.add_all(interactions)
            await session.flush()
            print(f"  Created {len(interactions)} voter interactions")

            # ----------------------------------------------------------
            # 14. Survey responses (formal SurveyResponse records)
            # ----------------------------------------------------------
            sr_records: list[SurveyResponse] = []
            for i, answers in enumerate(survey_answers):
                voter = voter_records[i]
                for q_idx, answer in enumerate(answers):
                    sr_records.append(
                        SurveyResponse(
                            id=uuid.uuid4(),
                            campaign_id=campaign_id,
                            script_id=survey_id,
                            question_id=question_records[q_idx].id,
                            voter_id=voter.id,
                            answer_value=answer,
                            answered_by=user_volunteer_id,
                            answered_at=NOW - timedelta(days=random.randint(1, 5)),
                        )
                    )

            session.add_all(sr_records)
            await session.flush()
            print(f"  Created {len(sr_records)} survey responses")

    await engine.dispose()
    print("\nSeed data creation complete!")
    print(f"  Campaign: {SEED_CAMPAIGN_NAME}")
    print(f"  Voters: {len(voter_records)}")
    print(f"  Turfs: {len(turf_records)}")
    print(f"  Walk lists: {len(walk_lists)} ({len(wl_entries)} entries)")
    print(f"  Volunteers: {len(volunteer_records)}")
    print(f"  Shifts: {len(shifts)}")
    print(f"  Interactions: {len(interactions)}")
    print(f"  Survey responses: {len(sr_records)}")


if __name__ == "__main__":
    asyncio.run(main())
