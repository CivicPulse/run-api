# Phase 5: Volunteer Management - Research

**Researched:** 2026-03-09
**Domain:** Volunteer scheduling, assignment, and hours tracking for campaign field operations
**Confidence:** HIGH

## Summary

Phase 5 adds volunteer management to the existing campaign operations API. The domain involves six new database tables (volunteers, volunteer_skill_tags, volunteer_availability, shifts, shift_volunteers, volunteer_tags), service-layer business logic for scheduling and assignment, and API endpoints for both self-service volunteer actions and manager operations. The critical integration point is shift check-in creating WalkListCanvasser and SessionCaller records as side effects, bridging volunteer scheduling with Phase 3/4 operational models.

The codebase has well-established patterns from four prior phases: SQLAlchemy models with StrEnum status columns (native_enum=False), service classes with composition, Pydantic schemas inheriting BaseSchema, FastAPI routes with require_role() dependencies, RLS policies via campaign_id, and Alembic migrations with explicit RLS setup. Phase 5 follows these patterns exactly -- no new libraries or architectural decisions are needed.

**Primary recommendation:** Follow the existing model/service/schema/route pattern exactly. The main complexity is the shift check-in side-effect logic (creating WalkListCanvasser/SessionCaller records) and the waitlist auto-promotion mechanism.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Standalone `volunteers` table with optional `user_id` FK to users (supports walk-in volunteers without accounts)
- Profile fields: first_name, last_name, phone, email, address (street, city, state, zip), emergency_contact_name, emergency_contact_phone, notes (free text)
- Emergency contact is required before assignment to field shifts (canvassing/phone banking)
- Status lifecycle: pending -> active -> inactive
- Both registration paths: logged-in volunteers self-register (auto-linked to user account), managers create profiles for walk-in volunteers (no user link)
- Dual skill system: predefined StrEnum categories + free-form campaign-scoped tags via many-to-many join table
- Calendar-style availability slots: volunteer_id, start_at, end_at
- Typed shifts via type enum: canvassing, phone_banking, general
- Canvassing shifts optionally link to turf_id; phone banking shifts optionally link to phone_bank_session_id
- One-off shifts only (no recurrence)
- Hard capacity cap: max_volunteers field, self-signup blocked when full, managers can override
- Location: free text location_name + optional structured address + optional lat/long
- Shift status lifecycle: scheduled -> active -> completed, plus cancelled
- Shift-centric assignment: all volunteer assignment goes through shifts
- Check-in to canvassing shift creates WalkListCanvasser record; check-in to phone banking shift creates SessionCaller record
- Self-signup: only active-status volunteers can sign up; pending volunteers blocked
- Self-cancel: before shift start only; after start, only managers can remove
- Auto-waitlist when shift at capacity; auto-promote when cancellation opens slot
- API-driven check-in/check-out on shift_volunteers join table (check_in_at, check_out_at)
- Shift check-in/out is single source of truth for ALL volunteer hours
- Manager adjustments: adjusted_hours, adjustment_reason, adjusted_by, adjusted_at (originals preserved)
- Cumulative stats computed on-read via queries (no denormalized counters)

### Claude's Discretion
- Exact predefined skill categories list
- Waitlist promotion mechanism (immediate vs batched)
- Shift-to-walk-list resolution when a turf has multiple walk lists
- Database indexing strategy for availability slot queries
- Volunteer search/filter query builder design
- Shift signup join table schema details

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VOL-01 | Volunteer can register with profile information (name, contact, skills, availability) | Volunteer model + VolunteerSkill enum + VolunteerTag join table + VolunteerAvailability table; self-register endpoint + manager-create endpoint |
| VOL-02 | Campaign manager can assign volunteers to canvassing turfs, phone bank sessions, and tasks | Shift-centric assignment model; ShiftVolunteer join table; check-in side-effect creates WalkListCanvasser/SessionCaller |
| VOL-03 | Campaign manager can create shifts with date, time, location, and capacity limits | Shift model with type enum, location fields, max_volunteers, status lifecycle |
| VOL-04 | Volunteer can self-sign up for available shifts | Self-signup endpoint with capacity check, waitlist auto-enqueue, active-status gate |
| VOL-05 | System tracks volunteer hours via check-in/check-out timestamps | check_in_at/check_out_at on ShiftVolunteer join table, manager adjustment fields |
| VOL-06 | System auto-calculates hours from canvassing and phone banking session durations | Hours derived from shift check-in/out (single source of truth); no separate calculation needed |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SQLAlchemy | 2.0.48 | Async ORM models | Already in use; Mapped[] column style |
| FastAPI | 0.135.1+ | API routes | Already in use; Depends() pattern |
| Pydantic | 2.12.5+ | Request/response schemas | Already in use; BaseSchema with from_attributes |
| Alembic | 1.18.4 | Database migrations | Already in use; sequential numbered revisions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| fastapi-problem-details | 0.1.4 | RFC 9457 error responses | All error responses via ProblemResponse |
| pytest / pytest-asyncio | 9.0.2 / 1.3.0 | Testing | Unit tests with AsyncMock, integration with real DB |

### Alternatives Considered
None -- this phase uses the exact same stack as phases 1-4. No new libraries needed.

**Installation:**
No new dependencies required.

## Architecture Patterns

### Recommended Project Structure
```
app/
  models/
    volunteer.py         # Volunteer, VolunteerSkill(StrEnum), VolunteerTag, VolunteerTagMember, VolunteerAvailability
    shift.py             # Shift, ShiftType(StrEnum), ShiftStatus(StrEnum), ShiftVolunteer, WaitlistPosition
  schemas/
    volunteer.py         # Create/Update/Response schemas for volunteers, skills, availability
    shift.py             # Create/Update/Response schemas for shifts, signups, hours
  services/
    volunteer.py         # VolunteerService -- profile CRUD, skills, availability, search
    shift.py             # ShiftService -- shift CRUD, signup/cancel, check-in/out, waitlist, hours
  api/v1/
    volunteers.py        # Volunteer management endpoints
    shifts.py            # Shift management and signup endpoints
alembic/versions/
    005_volunteer_management.py  # Tables + RLS policies
tests/
  unit/
    test_volunteers.py   # Volunteer service unit tests
    test_shifts.py       # Shift service unit tests
  integration/
    test_volunteer_rls.py  # RLS isolation tests
```

### Pattern 1: Status Lifecycle with StrEnum (native_enum=False)
**What:** All status fields use Python StrEnum stored as VARCHAR(50)
**When to use:** Every status column (volunteer status, shift status, shift type)
**Example:**
```python
# Source: Established codebase pattern (walk_list.py, phone_bank.py)
class VolunteerStatus(enum.StrEnum):
    PENDING = "pending"
    ACTIVE = "active"
    INACTIVE = "inactive"

class ShiftType(enum.StrEnum):
    CANVASSING = "canvassing"
    PHONE_BANKING = "phone_banking"
    GENERAL = "general"

class ShiftStatus(enum.StrEnum):
    SCHEDULED = "scheduled"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
```

### Pattern 2: Service Composition for Side Effects
**What:** ShiftService composes existing services to create operational records on check-in
**When to use:** Shift check-in that creates WalkListCanvasser or SessionCaller records
**Example:**
```python
# Source: PhoneBankService composition pattern (app/services/phone_bank.py)
class ShiftService:
    def __init__(self) -> None:
        self._walk_list_service = WalkListService()
        self._phone_bank_service = PhoneBankService()

    async def check_in(self, session, shift_id, volunteer_id):
        # Record check-in timestamp
        shift_vol = await self._get_shift_volunteer(session, shift_id, volunteer_id)
        shift_vol.check_in_at = datetime.now(UTC)

        # Side effect: create operational record
        shift = await self.get_shift(session, shift_id)
        if shift.type == ShiftType.CANVASSING and shift.turf_id:
            # Resolve walk list for the turf, create WalkListCanvasser
            ...
        elif shift.type == ShiftType.PHONE_BANKING and shift.phone_bank_session_id:
            # Create SessionCaller record
            ...
```

### Pattern 3: Join Table with Rich Fields (ShiftVolunteer)
**What:** The shift_volunteers join table carries check-in/out timestamps, status, waitlist position, and manager adjustments
**When to use:** The core assignment/hours-tracking join between shifts and volunteers
**Example:**
```python
# Source: SessionCaller pattern (app/models/phone_bank.py) + CONTEXT.md decisions
class ShiftVolunteer(Base):
    __tablename__ = "shift_volunteers"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    shift_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("shifts.id"), nullable=False)
    volunteer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("volunteers.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False)  # signed_up, waitlisted, confirmed, checked_in, checked_out, cancelled, no_show
    waitlist_position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    check_in_at: Mapped[datetime | None] = mapped_column(nullable=True)
    check_out_at: Mapped[datetime | None] = mapped_column(nullable=True)
    adjusted_hours: Mapped[float | None] = mapped_column(nullable=True)
    adjustment_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    adjusted_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    adjusted_at: Mapped[datetime | None] = mapped_column(nullable=True)
    signed_up_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

### Pattern 4: RLS on Parent + Subquery Isolation on Children
**What:** Tables with direct campaign_id get direct RLS; child tables use subquery through parent
**When to use:** volunteers, shifts get direct RLS; volunteer_tags, volunteer_tag_members, volunteer_availability, shift_volunteers get subquery RLS
**Example:**
```sql
-- Source: Migration 004 (phone banking) RLS pattern
-- Direct: volunteers has campaign_id
CREATE POLICY volunteers_isolation ON volunteers
  USING (campaign_id = current_setting('app.current_campaign_id', true)::uuid);

-- Subquery: shift_volunteers via shifts
CREATE POLICY shift_volunteers_isolation ON shift_volunteers
  USING (shift_id IN (
    SELECT id FROM shifts
    WHERE campaign_id = current_setting('app.current_campaign_id', true)::uuid
  ));
```

### Anti-Patterns to Avoid
- **Separate hours tracking table:** Do NOT create a separate hours/timesheet table. Check-in/check-out on shift_volunteers IS the hours record. Hours are computed on read.
- **Denormalized counters:** Do NOT add total_hours or shifts_worked columns to the volunteer table. Compute on read via aggregation queries.
- **Direct WalkListCanvasser/SessionCaller creation:** Do NOT expose direct assignment to operational models. All assignment flows through shifts. Operational records are side effects of check-in.
- **Recurrence rules on shifts:** Do NOT build recurrence (iCal RRULE, etc.). Managers create individual shifts. This is explicitly a locked decision.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Waitlist ordering | Custom linked list | Integer waitlist_position on shift_volunteers | Simple increment on signup, decrement on cancel; gaps are fine |
| Hours calculation | Stored procedure / trigger | Python computation in service layer | `(check_out_at - check_in_at)` or `adjusted_hours` -- trivial math, keep in service |
| Availability matching | Custom interval tree | SQL overlap query with `&&` on tsrange | PostgreSQL range overlap is optimized and standard |
| Volunteer search | Custom query builder | Reuse build_voter_query pattern | Same filter-building approach as voter search (Phase 2) |

**Key insight:** This phase is almost entirely CRUD + business rules in the service layer. No complex algorithms, no external integrations, no new infrastructure. The main engineering challenge is getting the shift check-in side effects correct.

## Common Pitfalls

### Pitfall 1: Circular Import with WalkListService/PhoneBankService
**What goes wrong:** ShiftService needs to create WalkListCanvasser and SessionCaller records, but importing those services at module level causes circular dependencies.
**Why it happens:** Service composition with cross-phase dependencies.
**How to avoid:** Use late imports inside methods (same pattern as PhoneBankService importing CallListService inside claim_entries_for_session).
**Warning signs:** ImportError at startup.

### Pitfall 2: Waitlist Race Condition on Auto-Promotion
**What goes wrong:** Two cancellations happening simultaneously both try to promote the same waitlisted volunteer.
**Why it happens:** Concurrent requests without locking.
**How to avoid:** Use SELECT ... FOR UPDATE on the shift_volunteers row being promoted, or use a unique constraint on (shift_id, waitlist_position) to prevent double-promotion. Immediate promotion (not batched) is simpler and sufficient for campaign-scale concurrency.
**Warning signs:** Duplicate signed_up entries for the same volunteer on the same shift.

### Pitfall 3: Emergency Contact Gate on Field Shift Signup
**What goes wrong:** Volunteer signs up for a canvassing shift without emergency contact info, then checks in and gets assigned to a walk list with voter PII.
**Why it happens:** Forgetting to validate emergency contact at signup time for canvassing/phone_banking shift types.
**How to avoid:** Enforce emergency contact check in the signup/assign service method: if shift.type in (CANVASSING, PHONE_BANKING), volunteer must have emergency_contact_name and emergency_contact_phone.
**Warning signs:** Volunteers in the field without emergency contacts on file.

### Pitfall 4: Walk List Resolution for Canvassing Shifts
**What goes wrong:** A turf may have multiple walk lists. Which one does the canvasser get assigned to on check-in?
**Why it happens:** The CONTEXT.md left this as Claude's discretion.
**How to avoid:** Use the most recently created active walk list for the turf. If none exists, raise an error (shift check-in blocked until a walk list is created for the turf). Document this resolution strategy clearly.
**Warning signs:** Canvasser assigned to wrong walk list or check-in fails silently.

### Pitfall 5: Volunteer user_id vs Volunteer id Confusion
**What goes wrong:** Code mixes up the volunteer's optional user_id (ZITADEL user link) with the volunteer's own UUID id.
**Why it happens:** Two ID systems for the same person -- one for auth, one for the volunteer record.
**How to avoid:** Self-registration endpoint resolves authenticated user -> volunteer record via user_id FK. All subsequent volunteer operations use volunteer.id (UUID). Keep the mapping clean in the service layer.
**Warning signs:** 404 errors when looking up volunteers by the wrong ID type.

### Pitfall 6: Self-Cancel Window Enforcement
**What goes wrong:** Volunteer cancels after shift has started, losing hours tracking data.
**Why it happens:** Missing temporal check on cancel endpoint.
**How to avoid:** In cancel_signup: if shift.start_at <= now, reject unless requester is manager+. Use the same require_role pattern already in the codebase.
**Warning signs:** Checked-in volunteers disappearing from shift records.

## Code Examples

### Volunteer Model (volunteers table)
```python
# Source: VoterTag pattern (app/models/voter.py) + CONTEXT.md decisions
class Volunteer(Base):
    __tablename__ = "volunteers"
    __table_args__ = (
        Index("ix_volunteers_campaign_id", "campaign_id"),
        Index("ix_volunteers_user_id", "user_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    first_name: Mapped[str] = mapped_column(String(255), nullable=False)
    last_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # Address
    street: Mapped[str | None] = mapped_column(String(500), nullable=True)
    city: Mapped[str | None] = mapped_column(String(255), nullable=True)
    state: Mapped[str | None] = mapped_column(String(2), nullable=True)
    zip_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    # Emergency contact
    emergency_contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    # Notes
    notes: Mapped[str | None] = mapped_column(nullable=True)
    # Status
    status: Mapped[str] = mapped_column(
        String(50), default=VolunteerStatus.PENDING, nullable=False
    )
    # Skills (predefined categories stored as comma-separated or ARRAY)
    skills: Mapped[list | None] = mapped_column(ARRAY(String), default=list)
    # Metadata
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
```

### Predefined Skill Categories (Claude's Discretion)
```python
class VolunteerSkill(enum.StrEnum):
    """Predefined volunteer skill categories."""
    CANVASSING = "canvassing"
    PHONE_BANKING = "phone_banking"
    DATA_ENTRY = "data_entry"
    EVENT_SETUP = "event_setup"
    SOCIAL_MEDIA = "social_media"
    TRANSLATION = "translation"
    DRIVING = "driving"
    VOTER_REGISTRATION = "voter_registration"
    FUNDRAISING = "fundraising"
    GRAPHIC_DESIGN = "graphic_design"
```

### Shift Model
```python
class Shift(Base):
    __tablename__ = "shifts"
    __table_args__ = (
        Index("ix_shifts_campaign_id", "campaign_id"),
        Index("ix_shifts_campaign_start", "campaign_id", "start_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(nullable=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)  # ShiftType enum
    status: Mapped[str] = mapped_column(
        String(50), default=ShiftStatus.SCHEDULED, nullable=False
    )
    start_at: Mapped[datetime] = mapped_column(nullable=False)
    end_at: Mapped[datetime] = mapped_column(nullable=False)
    max_volunteers: Mapped[int] = mapped_column(Integer, nullable=False)
    # Location
    location_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    street: Mapped[str | None] = mapped_column(String(500), nullable=True)
    city: Mapped[str | None] = mapped_column(String(255), nullable=True)
    state: Mapped[str | None] = mapped_column(String(2), nullable=True)
    zip_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    latitude: Mapped[float | None] = mapped_column(nullable=True)
    longitude: Mapped[float | None] = mapped_column(nullable=True)
    # Operational links
    turf_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("turfs.id"), nullable=True
    )
    phone_bank_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("phone_bank_sessions.id"), nullable=True
    )
    # Metadata
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
```

### Availability Overlap Query
```python
# Find volunteers available during a shift's time window
# Source: PostgreSQL range overlap pattern
stmt = (
    select(Volunteer)
    .join(VolunteerAvailability, VolunteerAvailability.volunteer_id == Volunteer.id)
    .where(
        Volunteer.campaign_id == campaign_id,
        Volunteer.status == VolunteerStatus.ACTIVE,
        VolunteerAvailability.start_at <= shift_start,
        VolunteerAvailability.end_at >= shift_end,
    )
)
```

### Hours Computation Query
```python
# Compute volunteer hours from shift check-in/out
# Source: CONTEXT.md "cumulative stats computed on-read"
from sqlalchemy import case, func, extract

hours_query = (
    select(
        ShiftVolunteer.volunteer_id,
        func.sum(
            case(
                (ShiftVolunteer.adjusted_hours.isnot(None), ShiftVolunteer.adjusted_hours),
                else_=extract("epoch", ShiftVolunteer.check_out_at - ShiftVolunteer.check_in_at) / 3600.0,
            )
        ).label("total_hours"),
        func.count(ShiftVolunteer.id).label("shifts_worked"),
    )
    .where(
        ShiftVolunteer.check_in_at.isnot(None),
        ShiftVolunteer.check_out_at.isnot(None),
    )
    .group_by(ShiftVolunteer.volunteer_id)
)
```

### Waitlist Auto-Promotion (Claude's Discretion: Immediate)
```python
# Immediate promotion: when a volunteer cancels, next waitlisted is auto-promoted
async def _promote_from_waitlist(self, session: AsyncSession, shift_id: uuid.UUID) -> ShiftVolunteer | None:
    """Promote next waitlisted volunteer to signed_up status."""
    result = await session.execute(
        select(ShiftVolunteer)
        .where(
            ShiftVolunteer.shift_id == shift_id,
            ShiftVolunteer.status == SignupStatus.WAITLISTED,
        )
        .order_by(ShiftVolunteer.waitlist_position)
        .limit(1)
        .with_for_update()  # Prevent race conditions
    )
    next_vol = result.scalar_one_or_none()
    if next_vol:
        next_vol.status = SignupStatus.SIGNED_UP
        next_vol.waitlist_position = None
    return next_vol
```

### Walk List Resolution for Canvassing Shifts (Claude's Discretion)
```python
# When checking in to a canvassing shift, resolve the walk list for the turf
# Use most recently created active walk list
async def _resolve_walk_list(self, session: AsyncSession, turf_id: uuid.UUID) -> uuid.UUID:
    """Find the most recent active walk list for a turf."""
    result = await session.execute(
        select(WalkList.id)
        .where(WalkList.turf_id == turf_id)
        .order_by(WalkList.created_at.desc())
        .limit(1)
    )
    walk_list_id = result.scalar_one_or_none()
    if walk_list_id is None:
        raise ValueError(f"No walk list found for turf {turf_id}")
    return walk_list_id
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| native_enum for status | native_enum=False (VARCHAR) | Phase 1 decision | StrEnum values can be added without migration |
| Separate hours table | Check-in/out on join table | Phase 5 design decision | Single source of truth, simpler schema |
| Direct operational assignment | Shift-centric assignment | Phase 5 design decision | Unified workflow, WalkListCanvasser/SessionCaller are side effects |

## Open Questions

1. **Walk list resolution when turf has multiple active walk lists**
   - What we know: CONTEXT.md defers to Claude's discretion
   - Recommendation: Use most recently created walk list for the turf. If no walk list exists, block check-in with clear error message. This is simple, deterministic, and a manager can create the right walk list before the shift.

2. **Volunteer search/filter query builder**
   - What we know: Phase 2's build_voter_query is the reference pattern (standalone function)
   - Recommendation: Create a build_volunteer_query standalone function following the same pattern. Filter by status, skills (predefined + tags), availability window, name search.

3. **Indexing for availability overlap queries**
   - What we know: Availability slots are date+time ranges queried for shift matching
   - Recommendation: Composite index on (volunteer_id, start_at, end_at) for the VolunteerAvailability table. GiST index on tsrange not needed at campaign scale.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 + pytest-asyncio 1.3.0 |
| Config file | pyproject.toml [tool.pytest.ini_options] |
| Quick run command | `uv run pytest tests/unit/ -x -q` |
| Full suite command | `uv run pytest tests/ -x -q` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VOL-01 | Volunteer registration with profile, skills, availability | unit | `uv run pytest tests/unit/test_volunteers.py -x` | No -- Wave 0 |
| VOL-02 | Manager assigns volunteers to turfs/sessions via shifts | unit | `uv run pytest tests/unit/test_shifts.py::TestShiftAssignment -x` | No -- Wave 0 |
| VOL-03 | Manager creates shifts with date/time/location/capacity | unit | `uv run pytest tests/unit/test_shifts.py::TestShiftCRUD -x` | No -- Wave 0 |
| VOL-04 | Volunteer self-signup with capacity check and waitlist | unit | `uv run pytest tests/unit/test_shifts.py::TestShiftSignup -x` | No -- Wave 0 |
| VOL-05 | Check-in/check-out timestamps tracking | unit | `uv run pytest tests/unit/test_shifts.py::TestCheckInOut -x` | No -- Wave 0 |
| VOL-06 | Hours auto-calculation from shift durations | unit | `uv run pytest tests/unit/test_shifts.py::TestHoursCalculation -x` | No -- Wave 0 |
| RLS | Cross-campaign volunteer/shift data isolation | integration | `uv run pytest tests/integration/test_volunteer_rls.py -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/ -x -q`
- **Per wave merge:** `uv run pytest tests/ -x -q`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/test_volunteers.py` -- covers VOL-01 (volunteer CRUD, skills, availability)
- [ ] `tests/unit/test_shifts.py` -- covers VOL-02 through VOL-06 (shift CRUD, signup, check-in, hours)
- [ ] `tests/integration/test_volunteer_rls.py` -- covers RLS isolation for all new tables

## Sources

### Primary (HIGH confidence)
- Existing codebase: app/models/phone_bank.py, app/models/walk_list.py, app/models/voter.py -- established model patterns
- Existing codebase: app/services/phone_bank.py -- service composition and check-in/out pattern
- Existing codebase: alembic/versions/004_phone_banking.py -- RLS migration pattern
- Existing codebase: app/api/v1/phone_banks.py -- route pattern with require_role, ensure_user_synced, set_campaign_context
- Existing codebase: tests/unit/test_phone_bank.py -- unit test pattern with MagicMock/AsyncMock

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions -- locked design choices from user discussion

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - identical to phases 1-4, no new dependencies
- Architecture: HIGH - follows established patterns exactly, models/services/routes all templated
- Pitfalls: HIGH - identified from actual codebase patterns and CONTEXT.md edge cases
- Validation: HIGH - test patterns well-established from prior phases

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable -- no external dependency changes)
