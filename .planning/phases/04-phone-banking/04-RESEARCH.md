# Phase 4: Phone Banking - Research

**Researched:** 2026-03-09
**Domain:** Phone banking operations API (call lists, sessions, DNC, call outcomes)
**Confidence:** HIGH

## Summary

Phase 4 builds phone banking on top of the same infrastructure patterns established in Phases 2-3. The core work involves five new database tables (call_lists, call_list_entries, phone_bank_sessions, session_callers, do_not_call), a new PhoneBankService with VoterInteractionService composition, and a PHONE_CALL InteractionType enum value. The survey engine (SurveyScript, SurveyQuestion, SurveyResponse) and SurveyService are reused without modification.

The architecture is a direct parallel to canvassing: call lists are frozen snapshots like walk lists, call outcomes follow the same VoterInteraction append-only pattern as door knocks, and session management uses the same draft/active/completed lifecycle. The main new complexity is claim-on-fetch entry assignment with timeout-based release (not present in canvassing), DNC management with auto-flagging, and multi-phone support per voter.

**Primary recommendation:** Structure implementation as three plans: (1) models + migration + RLS, (2) call list generation + DNC management services, (3) phone bank session + call recording + supervisor operations + API routes.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Frozen snapshot call lists generated once from voter universe criteria, voter set locked at creation
- Claim-on-fetch entry assignment: caller requests next batch, system marks "in_progress" with caller ID and timestamp; entries release back to pool after configurable timeout (e.g., 30 min)
- Voters ordered by priority score -- high-persuasion or fewer prior contact attempts first
- Auto-recycle with cooldown: no-answer/busy entries return to pool after cooldown period (e.g., 1 hour); manager-configurable max attempts per voter (e.g., 3); terminal outcomes never retried
- Multi-phone support: each call list entry includes all available phone numbers for a voter (ordered by priority -- primary first). Auto-advance to next number on wrong number/disconnected outcome
- Person-level terminal outcomes: "refused" or "deceased" stops trying all numbers; "wrong number" or "disconnected" only marks that specific phone number
- Basic phone format validation during call list generation -- filter out obviously invalid numbers
- PhoneBankSession entity wraps a group of callers working a call list during a time window
- Session has: name, scheduled start/end, call list reference, assigned callers
- One call list can span multiple sessions -- progress carries over
- Caller-level check-in/check-out timestamps via session_callers join table
- Status lifecycle: draft -> active -> completed
- Each call records start + end timestamps for duration metrics
- Optional free-text notes per call
- Supervisor view: per-caller progress, reassign entries, force-release, end caller session, pause/resume
- Separate campaign-scoped DNC table with RLS on campaign_id
- DNC entry tracks: phone_number, reason enum (refused, voter_request, registry_import, manual), added_by, added_at
- Four DNC sources: manual add, auto-flag on refused, bulk CSV import, caller-initiated during call
- Call list generation filters out all DNC numbers during creation
- Linear scripts only for v1 -- branched logic deferred to v2
- Reuse existing SurveyScript model as-is
- Call flow: outcome recorded first -> if "answered", proceed to survey -> non-contact outcomes skip survey
- Partial survey responses saved and marked as partial completion
- Survey responses emit SURVEY_RESPONSE interaction events; call outcomes emit PHONE_CALL interaction events

### Claude's Discretion
- Exact claim-on-fetch batch size and timeout defaults
- Call list entry table schema details (indexes, constraints)
- DNC bulk import CSV format and validation rules
- Session pause implementation (status field vs separate flag)
- Priority score calculation for call ordering
- Phone number format validation rules
- Entry release mechanism (background job vs on-fetch check)

### Deferred Ideas (OUT OF SCOPE)
- Branched survey logic (CANV-09) -- v2 enhancement
- Predictive dialer / telephony integration -- explicitly out of scope per REQUIREMENTS.md
- Real-time WebSocket for live session monitoring -- SSE sufficient per project constraints
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PHONE-01 | Campaign manager can generate call lists from voter universe criteria filtered by valid phone number and do-not-call status | Call list generation service reusing `build_voter_query()`, joining VoterPhone, filtering DNC table, frozen snapshot pattern from WalkListService |
| PHONE-02 | Phone banker can follow call scripts (linear and branched) during calls | Reuse existing SurveyScript/SurveyQuestion models and SurveyService -- linear scripts only for v1 (branched deferred) |
| PHONE-03 | Phone banker can record call outcomes (answered, no answer, busy, wrong number, voicemail, refused, deceased) | CallResultCode enum, PhoneBankService.record_call() composing VoterInteractionService with PHONE_CALL type |
| PHONE-04 | Phone banker can capture survey responses during calls using same survey engine as canvassing | SurveyService.record_responses() already handles batch response recording; compose into call recording flow |
| PHONE-05 | Call outcomes and survey responses sync to voter interaction history | PHONE_CALL and SURVEY_RESPONSE InteractionType events via VoterInteractionService composition |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | >=0.135.1 | API routes | Already in use, project standard |
| SQLAlchemy | >=2.0.48 | Async ORM, models | Already in use, project standard |
| Alembic | >=1.18.4 | Database migrations | Already in use, project standard |
| Pydantic | >=2.12.5 | Request/response schemas | Already in use, project standard |
| asyncpg | >=0.31.0 | PostgreSQL async driver | Already in use, project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| python-csv (stdlib) | 3.13 | DNC bulk CSV import parsing | When processing registry import files |
| re (stdlib) | 3.13 | Phone number format validation regex | During call list generation filtering |

### Alternatives Considered
No new libraries needed. Phase 4 is a pure application-layer feature using the existing stack. CSV parsing for DNC import uses stdlib.

## Architecture Patterns

### New Files Structure
```
app/
├── models/
│   ├── call_list.py         # CallList, CallListEntry, CallResultCode enums
│   ├── phone_bank.py        # PhoneBankSession, SessionCaller, SessionStatus
│   └── dnc.py               # DoNotCallEntry, DNCReason enum
├── schemas/
│   ├── call_list.py         # Create/Response schemas for call lists
│   ├── phone_bank.py        # Session, caller, call recording schemas
│   └── dnc.py               # DNC entry schemas, CSV import schema
├── services/
│   ├── call_list.py         # CallListService (generation, entry claiming)
│   ├── phone_bank.py        # PhoneBankService (sessions, call recording)
│   └── dnc.py               # DNCService (CRUD, bulk import, auto-flag)
├── api/v1/
│   ├── call_lists.py        # Call list CRUD + entry claiming endpoints
│   ├── phone_banks.py       # Session management + call recording endpoints
│   └── dnc.py               # DNC management endpoints
└── alembic/versions/
    └── 004_phone_banking.py  # Migration: tables, RLS, InteractionType
```

### Pattern 1: Frozen Snapshot Generation (from WalkListService)
**What:** Call list is generated once from criteria, voter set locked at creation
**When to use:** Call list creation
**Example:**
```python
# Mirrors WalkListService.generate_walk_list() pattern
class CallListService:
    async def generate_call_list(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        data: CallListCreate,
        user_id: str,
    ) -> CallList:
        # 1. Build voter query from filters (reuse build_voter_query)
        # 2. Join VoterPhone to get phone numbers
        # 3. LEFT JOIN do_not_call to exclude DNC numbers
        # 4. Basic phone format validation
        # 5. Create frozen CallList + CallListEntry records
        # 6. Order entries by priority score
        ...
```

### Pattern 2: Claim-on-Fetch Entry Assignment
**What:** Caller requests next batch of entries; system marks them in_progress with caller_id and claimed_at timestamp; stale claims auto-release
**When to use:** When callers fetch their next entries to call
**Example:**
```python
async def claim_entries(
    self,
    session: AsyncSession,
    call_list_id: uuid.UUID,
    caller_id: str,
    batch_size: int = 5,
) -> list[CallListEntry]:
    # Release stale claims first (on-fetch check, no background job needed)
    stale_cutoff = datetime.now(UTC) - timedelta(minutes=claim_timeout)
    await session.execute(
        update(CallListEntry)
        .where(
            CallListEntry.call_list_id == call_list_id,
            CallListEntry.status == EntryStatus.IN_PROGRESS,
            CallListEntry.claimed_at < stale_cutoff,
        )
        .values(status=EntryStatus.AVAILABLE, claimed_by=None, claimed_at=None)
    )
    # Then claim next batch ordered by priority
    ...
```

### Pattern 3: Service Composition with VoterInteractionService
**What:** PhoneBankService composes VoterInteractionService for event recording (same as CanvassService)
**When to use:** Recording call outcomes and survey responses
**Example:**
```python
class PhoneBankService:
    def __init__(self) -> None:
        self._interaction_service = VoterInteractionService()
        self._survey_service = SurveyService()

    async def record_call(
        self,
        session: AsyncSession,
        campaign_id: uuid.UUID,
        data: CallRecordCreate,
        user_id: str,
    ) -> CallRecordResponse:
        # 1. Record PHONE_CALL interaction via _interaction_service
        # 2. If outcome == ANSWERED and has survey responses:
        #    Record survey responses via _survey_service
        # 3. Update entry status based on outcome
        # 4. Auto-add to DNC if outcome == REFUSED
        ...
```

### Pattern 4: DNC Auto-Flag on Refused
**What:** When a call outcome is "refused", automatically add the phone number to the campaign DNC table
**When to use:** Inside PhoneBankService.record_call()
**Example:**
```python
# Inside record_call, after recording the interaction:
if data.result_code == CallResultCode.REFUSED:
    await self._dnc_service.add_entry(
        session, campaign_id,
        phone_number=data.phone_number_used,
        reason=DNCReason.REFUSED,
        added_by=user_id,
    )
```

### Anti-Patterns to Avoid
- **Background job for stale claim release:** Unnecessary complexity. Check-on-fetch is sufficient -- when any caller claims entries, first release stale claims. No need for TaskIQ background workers.
- **Storing attempt_number in payload:** Follow canvassing pattern -- compute attempt_number on read via COUNT query (established in CanvassService).
- **Modifying SurveyScript model for phone banking:** The model was intentionally designed without canvassing FKs. Do NOT add phone-specific fields.
- **Separate InteractionType per call outcome:** Use single PHONE_CALL type with result_code in JSONB payload (same as DOOR_KNOCK pattern).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Voter query filtering | Custom SQL builder | `build_voter_query()` from app/services/voter.py | Already handles all filter combinatorics |
| Survey response recording | New survey logic | Existing `SurveyService` | Intentionally decoupled for reuse |
| Interaction event logging | Direct INSERT | `VoterInteractionService.record_interaction()` | Ensures consistent payload structure |
| Phone format validation | Complex validation library | Simple regex (digits, length 10-15) | User decided "basic validation" -- no carrier lookups |
| CSV parsing | pandas/custom parser | stdlib `csv.DictReader` | Simple columnar data, no heavy deps needed |

**Key insight:** Phase 4's main value is wiring together existing infrastructure (survey engine, interaction logging, voter queries) with new session/claiming/DNC orchestration logic. Most of the heavy lifting is already built.

## Common Pitfalls

### Pitfall 1: Race Conditions in Entry Claiming
**What goes wrong:** Two callers claim the same entries simultaneously
**Why it happens:** No row-level locking during claim selection
**How to avoid:** Use `SELECT ... FOR UPDATE SKIP LOCKED` when claiming entries. This is PostgreSQL's built-in solution for work queue patterns -- it locks selected rows and skips already-locked ones.
**Warning signs:** Duplicate call outcomes for the same voter in the same session

### Pitfall 2: DNC Check Timing
**What goes wrong:** Voter added to DNC after call list generation but before being called
**Why it happens:** DNC filtering only happens at generation time (by design -- frozen snapshot)
**How to avoid:** This is accepted behavior per the frozen snapshot decision. Document it clearly. Campaigns can regenerate call lists if DNC list changes significantly. Optionally add a warning in the claim response if a number was DNC'd after generation.
**Warning signs:** Users confused about why DNC voters appear on call lists

### Pitfall 3: Multi-Phone Entry State Tracking
**What goes wrong:** Unclear which phone number was tried for a given entry
**Why it happens:** Entry has multiple phones but status is entry-level, not phone-level
**How to avoid:** Track phone-level outcomes in a JSONB column on CallListEntry (e.g., `phone_attempts: [{"phone_id": ..., "result": "wrong_number"}, ...]`). Or use a separate small table. The entry's overall status derives from the aggregate of phone attempts.
**Warning signs:** Caller doesn't know which number to try next

### Pitfall 4: Session Status vs Entry Progress Desync
**What goes wrong:** Session marked "completed" but entries still in_progress
**Why it happens:** Session completion doesn't clean up claimed entries
**How to avoid:** On session completion, force-release all in_progress entries back to available (or mark as incomplete). This is a state transition side effect.
**Warning signs:** Entries stuck in_progress after all sessions end

### Pitfall 5: RLS Policy Chain for Deeply Nested Tables
**What goes wrong:** session_callers RLS policy is slow due to multi-hop subquery
**Why it happens:** session_callers -> phone_bank_sessions -> call_lists -> campaign_id is three hops
**How to avoid:** Add campaign_id directly to phone_bank_sessions (direct RLS). session_callers uses one-hop subquery through phone_bank_sessions. For call_list_entries, one-hop through call_lists. This is consistent with how walk_list_entries uses one-hop through walk_lists.
**Warning signs:** Slow queries on session-related endpoints

## Code Examples

### New Model: CallList (following WalkList pattern)
```python
# Source: Derived from app/models/walk_list.py pattern
class CallListStatus(enum.StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    COMPLETED = "completed"

class CallList(Base):
    __tablename__ = "call_lists"
    __table_args__ = (
        Index("ix_call_lists_campaign_id", "campaign_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    voter_list_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("voter_lists.id"), nullable=True
    )
    script_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("survey_scripts.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[CallListStatus] = mapped_column(
        String(50), default=CallListStatus.DRAFT, nullable=False
    )
    total_entries: Mapped[int] = mapped_column(Integer, default=0)
    completed_entries: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    claim_timeout_minutes: Mapped[int] = mapped_column(Integer, default=30)
    cooldown_minutes: Mapped[int] = mapped_column(Integer, default=60)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

### New Model: CallListEntry (claim-on-fetch pattern)
```python
class EntryStatus(enum.StrEnum):
    AVAILABLE = "available"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    MAX_ATTEMPTS = "max_attempts"
    TERMINAL = "terminal"  # refused/deceased -- never retry

class CallListEntry(Base):
    __tablename__ = "call_list_entries"
    __table_args__ = (
        Index("ix_call_list_entries_list_status", "call_list_id", "status"),
        Index("ix_call_list_entries_list_priority", "call_list_id", "priority_score"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    call_list_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("call_lists.id"), nullable=False
    )
    voter_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("voters.id"), nullable=False
    )
    priority_score: Mapped[int] = mapped_column(Integer, default=0)
    phone_numbers: Mapped[dict] = mapped_column(JSONB, default=list)
    # e.g., [{"phone_id": "...", "value": "5551234567", "type": "cell", "is_primary": true}]
    status: Mapped[EntryStatus] = mapped_column(
        String(50), default=EntryStatus.AVAILABLE, nullable=False
    )
    attempt_count: Mapped[int] = mapped_column(Integer, default=0)
    claimed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    claimed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    last_attempt_at: Mapped[datetime | None] = mapped_column(nullable=True)
    phone_attempts: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # e.g., [{"phone_id": "...", "result": "wrong_number", "at": "..."}]
```

### New Model: PhoneBankSession
```python
class SessionStatus(enum.StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"     # Supervisor can pause (no new claims)
    COMPLETED = "completed"

class PhoneBankSession(Base):
    __tablename__ = "phone_bank_sessions"
    __table_args__ = (
        Index("ix_phone_bank_sessions_campaign", "campaign_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    call_list_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("call_lists.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[SessionStatus] = mapped_column(
        String(50), default=SessionStatus.DRAFT, nullable=False
    )
    scheduled_start: Mapped[datetime | None] = mapped_column(nullable=True)
    scheduled_end: Mapped[datetime | None] = mapped_column(nullable=True)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
```

### New Model: DoNotCallEntry
```python
class DNCReason(enum.StrEnum):
    REFUSED = "refused"
    VOTER_REQUEST = "voter_request"
    REGISTRY_IMPORT = "registry_import"
    MANUAL = "manual"

class DoNotCallEntry(Base):
    __tablename__ = "do_not_call"
    __table_args__ = (
        Index("ix_dnc_campaign_phone", "campaign_id", "phone_number", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    phone_number: Mapped[str] = mapped_column(String(50), nullable=False)
    reason: Mapped[DNCReason] = mapped_column(String(50), nullable=False)
    added_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    added_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

### PHONE_CALL Interaction Payload Structure
```python
# PHONE_CALL VoterInteraction payload (JSONB)
{
    "result_code": "answered",  # CallResultCode enum value
    "call_list_id": "uuid-string",
    "session_id": "uuid-string",
    "phone_number_used": "5551234567",
    "call_started_at": "2026-03-09T14:30:00Z",
    "call_ended_at": "2026-03-09T14:35:00Z",
    "notes": "Voter interested in yard sign",
}
```

### Call Result Codes
```python
class CallResultCode(enum.StrEnum):
    ANSWERED = "answered"
    NO_ANSWER = "no_answer"
    BUSY = "busy"
    WRONG_NUMBER = "wrong_number"
    VOICEMAIL = "voicemail"
    REFUSED = "refused"
    DECEASED = "deceased"
    DISCONNECTED = "disconnected"
```

### Priority Score Calculation
```python
def calculate_priority_score(voter, interaction_count: int) -> int:
    """Higher score = higher priority (called first).

    Factors:
    - Fewer prior contact attempts = higher priority
    - Primary phone available = slight boost
    """
    score = 100
    # Penalize for existing contacts (call those with fewer attempts first)
    score -= interaction_count * 20
    return max(score, 0)
```

### Claim-on-Fetch with FOR UPDATE SKIP LOCKED
```python
async def claim_entries(
    self,
    session: AsyncSession,
    call_list_id: uuid.UUID,
    caller_id: str,
    batch_size: int = 5,
    claim_timeout: int = 30,
) -> list[CallListEntry]:
    # 1. Release stale claims
    stale_cutoff = datetime.now(UTC) - timedelta(minutes=claim_timeout)
    await session.execute(
        update(CallListEntry)
        .where(
            CallListEntry.call_list_id == call_list_id,
            CallListEntry.status == EntryStatus.IN_PROGRESS,
            CallListEntry.claimed_at < stale_cutoff,
        )
        .values(status=EntryStatus.AVAILABLE, claimed_by=None, claimed_at=None)
    )

    # 2. Also release entries past cooldown period
    # (no_answer/busy that have waited long enough)

    # 3. Claim next batch with row locking
    subq = (
        select(CallListEntry.id)
        .where(
            CallListEntry.call_list_id == call_list_id,
            CallListEntry.status == EntryStatus.AVAILABLE,
        )
        .order_by(CallListEntry.priority_score.desc())
        .limit(batch_size)
        .with_for_update(skip_locked=True)
    ).subquery()

    now = datetime.now(UTC)
    await session.execute(
        update(CallListEntry)
        .where(CallListEntry.id.in_(select(subq.c.id)))
        .values(
            status=EntryStatus.IN_PROGRESS,
            claimed_by=caller_id,
            claimed_at=now,
        )
    )
    # 4. Fetch and return claimed entries
    ...
```

### RLS Migration Pattern
```python
# Direct campaign_id isolation (call_lists, phone_bank_sessions, do_not_call)
DIRECT_RLS_TABLES = ["call_lists", "phone_bank_sessions", "do_not_call"]
for table in DIRECT_RLS_TABLES:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY {table}_isolation ON {table} "
        f"USING (campaign_id = current_setting('app.current_campaign_id', true)::uuid)"
    )
    op.execute(f"GRANT SELECT, INSERT, UPDATE, DELETE ON {table} TO app_user")

# Subquery isolation for child tables
# call_list_entries via call_lists (one-hop)
# session_callers via phone_bank_sessions (one-hop)
```

### API Route Pattern (consistent with walk_lists.py)
```python
# Endpoints to implement:
# POST   /campaigns/{cid}/call-lists                        (manager+)
# GET    /campaigns/{cid}/call-lists                        (volunteer+)
# GET    /campaigns/{cid}/call-lists/{clid}                 (volunteer+)
# DELETE /campaigns/{cid}/call-lists/{clid}                 (manager+)
# POST   /campaigns/{cid}/call-lists/{clid}/claim           (volunteer+)

# POST   /campaigns/{cid}/phone-bank-sessions               (manager+)
# GET    /campaigns/{cid}/phone-bank-sessions               (volunteer+)
# GET    /campaigns/{cid}/phone-bank-sessions/{sid}         (volunteer+)
# PATCH  /campaigns/{cid}/phone-bank-sessions/{sid}         (manager+) -- status
# POST   /campaigns/{cid}/phone-bank-sessions/{sid}/callers (manager+)
# DELETE /campaigns/{cid}/phone-bank-sessions/{sid}/callers/{uid} (manager+)
# POST   /campaigns/{cid}/phone-bank-sessions/{sid}/check-in  (volunteer+)
# POST   /campaigns/{cid}/phone-bank-sessions/{sid}/check-out (volunteer+)

# POST   /campaigns/{cid}/phone-bank-sessions/{sid}/calls   (volunteer+) -- record call
# GET    /campaigns/{cid}/phone-bank-sessions/{sid}/progress (manager+) -- supervisor

# POST   /campaigns/{cid}/phone-bank-sessions/{sid}/entries/{eid}/reassign (manager+)
# POST   /campaigns/{cid}/phone-bank-sessions/{sid}/entries/{eid}/release  (manager+)

# GET    /campaigns/{cid}/dnc                               (manager+)
# POST   /campaigns/{cid}/dnc                               (manager+) -- single add
# POST   /campaigns/{cid}/dnc/import                        (manager+) -- CSV bulk
# DELETE /campaigns/{cid}/dnc/{dnc_id}                      (manager+)
# POST   /campaigns/{cid}/dnc/check                         (volunteer+) -- caller-initiated
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Round-robin call assignment | Claim-on-fetch with SKIP LOCKED | PostgreSQL 9.5+ | Eliminates coordinator bottleneck, callers self-serve |
| Background job for stale release | On-fetch stale release check | N/A | Simpler architecture, no additional infrastructure |
| Separate phone banking survey engine | Shared survey engine | Phase 3 design | Survey models intentionally decoupled from canvassing |

## Open Questions

1. **Partial Survey Completion Tracking**
   - What we know: User wants partial responses saved when voter hangs up mid-survey
   - What's unclear: How to mark a set of responses as "partial" vs "complete" -- there's no completion flag on SurveyResponse currently
   - Recommendation: Add an optional `is_complete` boolean to the PHONE_CALL interaction payload. The call recording endpoint accepts a `survey_complete: bool` field. Individual SurveyResponse records are saved regardless; the completeness is metadata on the call event.

2. **Priority Score Persistence vs Computation**
   - What we know: Entries should be ordered by priority score
   - What's unclear: Whether to compute priority at generation time (static) or at claim time (dynamic)
   - Recommendation: Compute at generation time and store on CallListEntry. Static priority is simpler, consistent with frozen snapshot philosophy. Recalculation would require re-sorting the entire list.

3. **DNC CSV Format**
   - What we know: Bulk CSV import needed for external DNC registries
   - What's unclear: Exact column expectations
   - Recommendation: Accept minimal CSV with `phone_number` column required, optional `reason` column (defaults to REGISTRY_IMPORT). Validate phone format, deduplicate against existing DNC entries, report stats (added/skipped/invalid).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 + pytest-asyncio 1.3.0 |
| Config file | pyproject.toml `[tool.pytest.ini_options]` |
| Quick run command | `uv run pytest tests/unit/ -x -q` |
| Full suite command | `uv run pytest tests/ -x` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PHONE-01 | Call list generation with phone/DNC filtering | unit | `uv run pytest tests/unit/test_call_lists.py -x` | No -- Wave 0 |
| PHONE-01 | Call list RLS isolation | integration | `uv run pytest tests/integration/test_phone_banking_rls.py -x` | No -- Wave 0 |
| PHONE-02 | Script attachment to session, question retrieval | unit | `uv run pytest tests/unit/test_phone_bank.py::test_session_with_script -x` | No -- Wave 0 |
| PHONE-03 | Call outcome recording with all result codes | unit | `uv run pytest tests/unit/test_phone_bank.py::test_record_call -x` | No -- Wave 0 |
| PHONE-03 | Entry status transitions (available -> in_progress -> completed/terminal) | unit | `uv run pytest tests/unit/test_call_lists.py::test_entry_status -x` | No -- Wave 0 |
| PHONE-04 | Survey responses recorded during answered calls | unit | `uv run pytest tests/unit/test_phone_bank.py::test_call_with_survey -x` | No -- Wave 0 |
| PHONE-05 | PHONE_CALL + SURVEY_RESPONSE interactions created | unit | `uv run pytest tests/unit/test_phone_bank.py::test_interaction_events -x` | No -- Wave 0 |
| PHONE-05 | DNC auto-flag on refused outcome | unit | `uv run pytest tests/unit/test_dnc.py::test_auto_flag_refused -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/ -x -q`
- **Per wave merge:** `uv run pytest tests/ -x`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/test_call_lists.py` -- covers PHONE-01, entry claiming, priority ordering
- [ ] `tests/unit/test_phone_bank.py` -- covers PHONE-02/03/04/05, session lifecycle, call recording
- [ ] `tests/unit/test_dnc.py` -- covers DNC CRUD, bulk import, auto-flag
- [ ] `tests/integration/test_phone_banking_rls.py` -- covers RLS on all new tables

## Sources

### Primary (HIGH confidence)
- Existing codebase: `app/models/walk_list.py`, `app/models/survey.py`, `app/models/voter_interaction.py` -- established patterns
- Existing codebase: `app/services/canvass.py`, `app/services/walk_list.py` -- service composition and frozen snapshot patterns
- Existing codebase: `alembic/versions/003_canvassing_operations.py` -- RLS policy patterns
- Existing codebase: `app/models/voter_contact.py` -- VoterPhone model for multi-phone queries
- Phase 4 CONTEXT.md -- locked user decisions

### Secondary (MEDIUM confidence)
- PostgreSQL FOR UPDATE SKIP LOCKED -- well-documented PostgreSQL feature for work queue patterns

### Tertiary (LOW confidence)
- Priority score calculation -- Claude's discretion area, reasonable defaults proposed but may need tuning

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new libraries, all existing project dependencies
- Architecture: HIGH - direct parallel to established canvassing patterns (walk lists, door knocks)
- Pitfalls: HIGH - race conditions and RLS patterns are well-understood from prior phases
- Models: HIGH - derived from working WalkList/WalkListEntry/WalkListCanvasser patterns
- Claim-on-fetch: MEDIUM - PostgreSQL SKIP LOCKED is well-documented but implementation details (batch size, timeouts) are Claude's discretion

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable domain, no external dependencies changing)
