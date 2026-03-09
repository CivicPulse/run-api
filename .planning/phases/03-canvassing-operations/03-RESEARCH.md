# Phase 3: Canvassing Operations - Research

**Researched:** 2026-03-09
**Domain:** PostGIS spatial operations, walk list generation, survey engine, door-knock recording
**Confidence:** HIGH

## Summary

Phase 3 introduces geographic turf management via PostGIS, walk list generation with household clustering, door-knock outcome recording, and a reusable survey engine. The existing codebase already uses `postgis/postgis:17-3.5` as the database image, so PostGIS is available without infrastructure changes. The key new dependencies are geoalchemy2 (SQLAlchemy PostGIS integration) and shapely (Python geometry library for GeoJSON validation).

The architecture follows established project patterns: async SQLAlchemy models with `mapped_column`, service classes for business logic, RFC 9457 error responses, cursor-based pagination, and RLS on all new tables. The survey engine must be decoupled from canvassing because Phase 4 (phone banking) reuses it via PHONE-04.

**Primary recommendation:** Use geoalchemy2 0.18+ with `Mapped[WKBElement]` for spatial columns, shapely for GeoJSON-to-WKB conversion and validation, and `ST_Contains` for voter-in-turf spatial queries. Walk lists are frozen snapshots with street-address sorting and exact-address household clustering.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Turfs defined as GeoJSON polygons stored as PostGIS `GEOMETRY(Polygon, 4326)` column on a `turfs` table
- Add PostGIS `GEOMETRY(Point, 4326)` column to `voters` table, populated from existing `latitude`/`longitude` on import and via migration backfill
- Spatial index (GiST) on both voter points and turf polygons for fast `ST_Contains` queries
- Voters can belong to multiple turfs (overlapping allowed) -- membership determined by spatial query, not FK
- Turf metadata: name (required), optional description, status enum (draft/active/completed)
- geoalchemy2 dependency for SQLAlchemy PostGIS integration
- Walk lists are frozen snapshots -- generated once, voter set does not change
- Generation input: turf_id (required) + optional voter_list_id. No filter = all voters in turf
- Voters ordered by street address sort (street name, then house number). Household clustering groups same-address voters as single stop
- Walk list entries with per-entry status: pending/visited/skipped. Door-knock auto-updates to visited
- Walk list tracks completion stats (X of Y entries visited)
- Walk list can be assigned to multiple canvassers -- shared walk list model, no per-entry locking
- Result codes enum: not_home, refused, supporter, undecided, opposed, moved, deceased, come_back_later, inaccessible
- Each door knock recorded as VoterInteraction event with type DOOR_KNOCK extending existing append-only log
- JSONB payload: result_code, walk_list_id, notes (optional), attempt_number (derived from event count)
- Unlimited contact attempts per voter
- Canvasser assignment is via walk list, not turf
- Survey scripts are campaign-level reusable entities not tied to specific turf or walk list
- Walk lists reference optional script_id. Same script reusable across walk lists and Phase 4 phone banking
- Separate `survey_questions` table: script_id, position, question_text, question_type enum (multiple_choice/scale/free_text), options JSONB
- Linear scripts only in v1 -- questions in position order. Branched logic deferred to v2 (CANV-09)
- Script lifecycle: draft (editable, not assignable) -> active (locked, assignable) -> archived (historical, not assignable)
- Responses stored in `survey_responses` table: voter_id, question_id, script_id, answer_value, answered_by, answered_at
- Each survey completion emits SURVEY_RESPONSE interaction event (dual storage: queryable + audit trail)

### Claude's Discretion
- Exact GeoJSON validation approach and error handling for invalid polygons
- Walk list splitting strategy when a turf has too many voters for one canvasser
- Household clustering algorithm (exact address matching vs fuzzy)
- Survey question validation rules (min/max options for MC, scale bounds)
- Database indexing strategy beyond spatial indexes
- Walk list entry ordering tiebreakers within same street

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CANV-01 | Campaign manager can define geographic turfs by drawing polygons (PostGIS) | geoalchemy2 Geometry column, shapely GeoJSON validation, ST_IsValid, GiST spatial index |
| CANV-02 | Campaign manager can generate walk lists from turf and target universe criteria | ST_Contains spatial query + optional voter_list_id filter, build_voter_query reuse, frozen snapshot pattern |
| CANV-03 | Walk lists cluster voters by household so multiple voters at one address appear as single stop | Exact address matching (address_line1 normalization), household grouping in walk_list_entries |
| CANV-04 | Canvasser can record door-knock outcomes using standard result codes | DoorKnockResult StrEnum, VoterInteraction with DOOR_KNOCK type, JSONB payload pattern |
| CANV-05 | System tracks contact attempts per voter with timestamps | Append-only VoterInteraction model already exists, attempt_number derived from COUNT query |
| CANV-06 | Campaign manager can assign canvassers to specific turfs | Walk list assignment model (walk_list_canvassers join table), require_role("manager") |
| CANV-07 | Canvasser can follow linear survey scripts and record responses per question | SurveyScript + SurveyQuestion models, script lifecycle enum, position ordering |
| CANV-08 | Survey responses captured per voter with MC, scale, free text | SurveyResponse model, QuestionType enum, answer validation per type |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| geoalchemy2 | 0.18+ | SQLAlchemy PostGIS integration | Only maintained SQLAlchemy-PostGIS bridge; provides Geometry types, spatial functions, Alembic helpers |
| shapely | 2.1+ | Python geometry library | GeoJSON parsing/validation, `shape()` and `mapping()` for GeoJSON dicts, `is_valid` checks |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| geojson-pydantic | 1.1+ | Pydantic models for GeoJSON types | Request/response schema validation for GeoJSON polygon input |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| geojson-pydantic | Raw dict validation | geojson-pydantic gives typed Pydantic models for Polygon, but raw dict + shapely validation is simpler and avoids a dependency |

**Recommendation on geojson-pydantic:** Skip it. Use a plain Pydantic model with a `coordinates` field that matches GeoJSON Polygon structure, then validate with shapely. One fewer dependency, and the project pattern is to keep schemas in `app/schemas/`.

**Installation:**
```bash
uv add geoalchemy2 shapely
```

## Architecture Patterns

### Recommended Project Structure
```
app/
├── models/
│   ├── turf.py              # Turf model with Geometry(Polygon)
│   ├── walk_list.py          # WalkList, WalkListEntry, WalkListCanvasser
│   ├── survey.py             # SurveyScript, SurveyQuestion, SurveyResponse
│   └── voter.py              # (modified) add geom Point column
├── schemas/
│   ├── turf.py               # TurfCreate, TurfResponse, GeoJSON input
│   ├── walk_list.py          # WalkListCreate, WalkListResponse, EntryResponse
│   ├── survey.py             # ScriptCreate, QuestionCreate, ResponseCreate
│   └── canvass.py            # DoorKnockCreate (or inline in walk_list.py)
├── services/
│   ├── turf.py               # TurfService: CRUD, voter containment queries
│   ├── walk_list.py          # WalkListService: generation, entry management
│   ├── survey.py             # SurveyService: scripts, questions, responses
│   └── canvass.py            # CanvassService: door-knock recording (or in walk_list)
├── api/v1/
│   ├── turfs.py              # Turf endpoints
│   ├── walk_lists.py         # Walk list + entry endpoints
│   └── surveys.py            # Survey script + response endpoints
└── db/
    └── base.py               # (modified) add turf/walk_list/survey model imports
```

### Pattern 1: Geometry Column with mapped_column (SQLAlchemy 2.0)
**What:** Define PostGIS geometry columns using modern SQLAlchemy annotation style
**When to use:** All new spatial columns
**Example:**
```python
# Source: geoalchemy2 docs - ORM mapped v2 gallery
from geoalchemy2 import Geometry, WKBElement
from sqlalchemy.orm import Mapped, mapped_column

class Turf(Base):
    __tablename__ = "turfs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    boundary: Mapped[WKBElement] = mapped_column(
        Geometry(geometry_type="POLYGON", srid=4326, spatial_index=True)
    )
```

### Pattern 2: GeoJSON Input Validation with Shapely
**What:** Validate incoming GeoJSON polygon and convert to WKBElement for storage
**When to use:** Turf creation/update endpoints
**Example:**
```python
# Source: shapely docs + geoalchemy2 shape module
from shapely.geometry import shape, mapping
from shapely.validation import explain_validity
from geoalchemy2.shape import from_shape

def validate_geojson_polygon(geojson: dict) -> WKBElement:
    """Convert GeoJSON geometry dict to WKBElement, with validation."""
    geom = shape(geojson)
    if geom.geom_type != "Polygon":
        raise ValueError(f"Expected Polygon, got {geom.geom_type}")
    if not geom.is_valid:
        raise ValueError(f"Invalid polygon: {explain_validity(geom)}")
    return from_shape(geom, srid=4326)
```

### Pattern 3: Spatial Query (Voters in Turf)
**What:** Find all voters whose point geometry falls within a turf polygon
**When to use:** Walk list generation, turf voter count
**Example:**
```python
# Source: geoalchemy2 spatial functions docs
from geoalchemy2 import func as geo_func
from sqlalchemy import func, select

# Find voters in a turf
stmt = (
    select(Voter)
    .join(Turf, func.ST_Contains(Turf.boundary, Voter.geom))
    .where(Turf.id == turf_id)
)
```

### Pattern 4: Frozen Walk List Snapshot
**What:** Walk lists capture voter set at generation time; changes to turf/voters do not affect existing lists
**When to use:** Walk list generation
**Example:**
```python
# Generate walk list entries from spatial query + optional list filter
async def generate_walk_list(
    session: AsyncSession,
    turf_id: uuid.UUID,
    voter_list_id: uuid.UUID | None,
    campaign_id: uuid.UUID,
) -> list[WalkListEntry]:
    # Base: voters in turf
    stmt = (
        select(Voter)
        .where(func.ST_Contains(
            select(Turf.boundary).where(Turf.id == turf_id).scalar_subquery(),
            Voter.geom,
        ))
    )
    # Optional: intersect with voter list
    if voter_list_id:
        stmt = stmt.join(
            VoterListMember,
            VoterListMember.voter_id == Voter.id,
        ).where(VoterListMember.voter_list_id == voter_list_id)

    # Order by street for walking efficiency
    stmt = stmt.order_by(
        Voter.address_line1,  # street name + number (see sorting discussion)
    )
    # ... create WalkListEntry rows as frozen snapshot
```

### Pattern 5: Household Clustering
**What:** Group voters at the same physical address into a single walk list "stop"
**When to use:** Walk list entry creation
**Recommendation:** Use **exact address matching** -- normalize and match on `(address_line1, city, zip_code)`. Fuzzy matching adds complexity with little value since voter file addresses are already standardized.
**Example:**
```python
# Group voters by normalized address for household clustering
from itertools import groupby

def household_key(voter):
    """Normalize address for exact-match household grouping."""
    addr = (voter.address_line1 or "").strip().upper()
    city = (voter.city or "").strip().upper()
    zip_code = (voter.zip_code or "").strip()[:5]
    return (addr, city, zip_code)

# After fetching voters sorted by address:
# Each walk list entry = one household (one or more voters)
```

### Pattern 6: Walk List Entry Ordering (Street Sort)
**What:** Order entries by street name then house number for efficient walking
**When to use:** Walk list generation
**Recommendation for tiebreakers:** Sort by `(street_name_extracted, house_number_extracted, last_name)`. Extract street name and house number from `address_line1` using a simple regex split. If parsing fails, fall back to raw `address_line1` string sort.
```python
import re

def parse_address_sort_key(address: str) -> tuple[str, int, str]:
    """Extract (street_name, house_number) for walk order sorting."""
    match = re.match(r"^(\d+)\s+(.+)$", (address or "").strip())
    if match:
        return (match.group(2).upper(), int(match.group(1)), "")
    return (address or "", 0, "")
```

### Anti-Patterns to Avoid
- **Materializing turf membership as FK:** Do NOT create a `turf_voters` join table. Turf membership is determined by spatial query at walk list generation time. A join table would go stale as voters are imported/updated.
- **Mutable walk lists:** Walk lists are frozen snapshots. Never add/remove voters from an existing list -- generate a new one instead.
- **Canvassing-specific FKs on survey tables:** Survey scripts/questions/responses must NOT reference turfs or walk lists. Phase 4 phone banking reuses the same survey engine.
- **PostgreSQL native enum for new enums:** Continue using `native_enum=False` pattern (StrEnum + VARCHAR storage) for all new enums (TurfStatus, DoorKnockResult, QuestionType, ScriptStatus, WalkListEntryStatus).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Point-in-polygon queries | Custom Python geometry checks | PostGIS `ST_Contains` with GiST index | PostGIS uses R-tree spatial index; Python would require loading all voters into memory |
| GeoJSON parsing | Manual coordinate array parsing | `shapely.geometry.shape()` | Handles all GeoJSON geometry types, validates ring closure, handles holes |
| Polygon validity checking | Custom ring intersection checks | `shapely.is_valid` + `explain_validity()` | OGC-compliant validation covering self-intersection, ring orientation, etc. |
| WKB/WKT conversion | Manual binary encoding | `geoalchemy2.shape.from_shape()` / `to_shape()` | Handles SRID, byte order, coordinate precision correctly |
| Spatial indexing | Application-level bounding box filtering | PostGIS GiST index (automatic with `spatial_index=True`) | Database-level R-tree index; orders of magnitude faster |
| GeoJSON output | Manual coordinate serialization | PostGIS `ST_AsGeoJSON()` or `shapely.mapping()` | Handles precision, CRS, and spec compliance |

**Key insight:** PostGIS + geoalchemy2 handle all spatial operations at the database level where they belong. The only Python-side geometry work should be input validation (shapely) and GeoJSON conversion.

## Common Pitfalls

### Pitfall 1: PostGIS Extension Not Enabled
**What goes wrong:** Geometry columns fail to create; spatial functions return "function does not exist"
**Why it happens:** PostGIS extension must be explicitly enabled per database
**How to avoid:** The migration that adds geometry columns must run `CREATE EXTENSION IF NOT EXISTS postgis` first. The `postgis/postgis:17-3.5` Docker image has PostGIS installed but the extension still needs activation per database.
**Warning signs:** "type geometry does not exist" errors in migration

### Pitfall 2: Missing Alembic Helpers for GeoAlchemy2
**What goes wrong:** Autogenerated migrations miss geoalchemy2 imports, create duplicate spatial indexes, or generate incorrect DDL
**Why it happens:** Alembic does not natively understand geoalchemy2 types
**How to avoid:** Add geoalchemy2 alembic helpers to `env.py`:
```python
from geoalchemy2 import alembic_helpers

# In both offline and online migration functions, add to context.configure():
context.configure(
    include_object=alembic_helpers.include_object,
    process_revision_directives=alembic_helpers.writer,
    render_item=alembic_helpers.render_item,
)
```
**Warning signs:** Migration scripts with raw `Column(Geometry(...))` instead of `add_geospatial_column`, missing `import geoalchemy2`

### Pitfall 3: NULL Geometry on Existing Voters
**What goes wrong:** Walk list generation returns zero voters because `geom` column is NULL for voters imported before the migration
**Why it happens:** Adding a geometry column does not backfill from existing lat/long
**How to avoid:** Migration must include a backfill step:
```sql
UPDATE voters SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND geom IS NULL;
```
**Warning signs:** Turfs showing zero voters despite having voters with lat/long in the polygon area

### Pitfall 4: SRID Mismatch
**What goes wrong:** `ST_Contains` returns false for points that are clearly inside the polygon
**Why it happens:** Point and polygon have different SRIDs, or SRID is not set (defaults to 0)
**How to avoid:** Always specify `srid=4326` on both Geometry columns. Validate incoming GeoJSON uses WGS84 (EPSG:4326). The backfill query must use `ST_SetSRID()`.
**Warning signs:** Spatial queries return empty results even with visually correct data

### Pitfall 5: Survey Script Lifecycle Enforcement
**What goes wrong:** Questions are modified on an active script, corrupting existing response data
**Why it happens:** No lifecycle gate on question CRUD operations
**How to avoid:** Service layer must enforce: only draft scripts allow question add/edit/delete/reorder. Active and archived scripts are locked.
**Warning signs:** Survey responses referencing questions that no longer exist or have changed meaning

### Pitfall 6: Walk List Entry Status vs Interaction Mismatch
**What goes wrong:** A door knock is recorded but the walk list entry still shows "pending"
**Why it happens:** Door-knock recording and entry status update are in separate transactions
**How to avoid:** Recording a door knock must atomically update the walk list entry status to "visited" in the same transaction. Use service composition (CanvassService calls both operations within one session commit).
**Warning signs:** Walk list completion stats don't match actual door-knock count

### Pitfall 7: attempt_number Race Condition
**What goes wrong:** Two canvassers recording simultaneously get the same attempt_number
**Why it happens:** attempt_number derived from COUNT query without locking
**How to avoid:** Since the CONTEXT.md says attempt_number is "derived from event count" and walk lists have no per-entry locking, accept that attempt_number is approximate. Calculate it on read (COUNT of prior DOOR_KNOCK interactions for that voter) rather than storing it. For the JSONB payload, omit attempt_number at write time and compute on read.
**Warning signs:** Duplicate attempt numbers in interaction history

## Code Examples

### Model: Turf with Geometry Column
```python
# Source: geoalchemy2 ORM mapped v2 docs + project patterns
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from geoalchemy2 import Geometry, WKBElement
from sqlalchemy import Enum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TurfStatus(enum.StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    COMPLETED = "completed"


class Turf(Base):
    __tablename__ = "turfs"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[TurfStatus] = mapped_column(
        Enum(TurfStatus, name="turf_status", native_enum=False),
        default=TurfStatus.DRAFT,
    )
    boundary: Mapped[WKBElement] = mapped_column(
        Geometry(geometry_type="POLYGON", srid=4326, spatial_index=True)
    )
    created_by: Mapped[str] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )
```

### Model: Walk List with Entries
```python
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WalkListEntryStatus(enum.StrEnum):
    PENDING = "pending"
    VISITED = "visited"
    SKIPPED = "skipped"


class WalkList(Base):
    __tablename__ = "walk_lists"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    turf_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("turfs.id"), nullable=False
    )
    voter_list_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("voter_lists.id"), nullable=True
    )
    script_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("survey_scripts.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    total_entries: Mapped[int] = mapped_column(Integer, default=0)
    visited_entries: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[str] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())


class WalkListEntry(Base):
    __tablename__ = "walk_list_entries"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    walk_list_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("walk_lists.id"), nullable=False
    )
    voter_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("voters.id"), nullable=False
    )
    household_key: Mapped[str | None] = mapped_column(String(500))
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[WalkListEntryStatus] = mapped_column(
        Enum(WalkListEntryStatus, name="walk_list_entry_status", native_enum=False),
        default=WalkListEntryStatus.PENDING,
    )


class WalkListCanvasser(Base):
    """Join table: which canvassers are assigned to which walk lists."""
    __tablename__ = "walk_list_canvassers"

    walk_list_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("walk_lists.id"), primary_key=True
    )
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id"), primary_key=True
    )
    assigned_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

### Model: Survey Engine (Decoupled from Canvassing)
```python
from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ScriptStatus(enum.StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"


class QuestionType(enum.StrEnum):
    MULTIPLE_CHOICE = "multiple_choice"
    SCALE = "scale"
    FREE_TEXT = "free_text"


class SurveyScript(Base):
    __tablename__ = "survey_scripts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ScriptStatus] = mapped_column(
        Enum(ScriptStatus, name="script_status", native_enum=False),
        default=ScriptStatus.DRAFT,
    )
    created_by: Mapped[str] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=func.now()
    )


class SurveyQuestion(Base):
    __tablename__ = "survey_questions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    script_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("survey_scripts.id"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    question_type: Mapped[QuestionType] = mapped_column(
        Enum(QuestionType, name="question_type", native_enum=False),
        nullable=False,
    )
    options: Mapped[dict | None] = mapped_column(JSONB)
    # MC: {"choices": ["Yes", "No", "Maybe"]}
    # Scale: {"min": 1, "max": 10, "labels": {"1": "Unlikely", "10": "Very likely"}}
    # Free text: null


class SurveyResponse(Base):
    __tablename__ = "survey_responses"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("campaigns.id"), nullable=False
    )
    script_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("survey_scripts.id"), nullable=False
    )
    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("survey_questions.id"), nullable=False
    )
    voter_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("voters.id"), nullable=False
    )
    answer_value: Mapped[str] = mapped_column(Text, nullable=False)
    answered_by: Mapped[str] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    answered_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

### Door-Knock Recording Pattern
```python
# Source: existing VoterInteractionService composition pattern
class DoorKnockResult(enum.StrEnum):
    NOT_HOME = "not_home"
    REFUSED = "refused"
    SUPPORTER = "supporter"
    UNDECIDED = "undecided"
    OPPOSED = "opposed"
    MOVED = "moved"
    DECEASED = "deceased"
    COME_BACK_LATER = "come_back_later"
    INACCESSIBLE = "inaccessible"

# Recording a door knock (service layer):
# 1. Validate walk_list_id, voter_id, result_code
# 2. Create VoterInteraction(type=DOOR_KNOCK, payload={...})
# 3. Update WalkListEntry.status = VISITED
# 4. Increment WalkList.visited_entries
# All in one transaction (single session.commit())
```

### Alembic Migration Pattern for PostGIS
```python
# Migration: enable PostGIS + add geometry columns
from alembic import op
import sqlalchemy as sa
from geoalchemy2 import Geometry

def upgrade():
    # Enable PostGIS extension
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    # Add geometry column to voters
    op.add_column("voters", sa.Column(
        "geom", Geometry(geometry_type="POINT", srid=4326), nullable=True
    ))
    op.create_index("ix_voters_geom", "voters", ["geom"], postgresql_using="gist")

    # Backfill from existing lat/long
    op.execute("""
        UPDATE voters SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
        WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND geom IS NULL
    """)

    # Create turfs table with boundary geometry
    # ... (standard create_table with Geometry column)
```

### GeoJSON Response Conversion
```python
# Convert WKBElement to GeoJSON for API responses
from geoalchemy2.shape import to_shape
from shapely.geometry import mapping

def wkb_to_geojson(wkb_element: WKBElement) -> dict:
    """Convert a WKBElement to a GeoJSON geometry dict."""
    geom = to_shape(wkb_element)
    return mapping(geom)
```

## Discretion Recommendations

### GeoJSON Validation Approach
**Recommendation:** Validate with shapely in the Pydantic schema or service layer. Accept GeoJSON geometry dict (`{"type": "Polygon", "coordinates": [...]}`), convert via `shape()`, check `is_valid`, and reject with `explain_validity()` message. Also reject polygons with area of 0 (degenerate). No need for PostGIS-side `ST_IsValid` since shapely catches the same issues before hitting the DB.

### Walk List Splitting
**Recommendation:** Do not auto-split. Let campaign managers generate multiple walk lists from the same turf with different voter list filters. If a turf has 500 voters, the manager creates 2-3 walk lists targeting different voter segments (e.g., Democrats, Independents). This matches real campaign workflows.

### Household Clustering Algorithm
**Recommendation:** Exact address matching on normalized `(address_line1.upper().strip(), zip_code[:5])`. Voter files from L2 and similar vendors already have standardized addresses, so fuzzy matching adds complexity without value. The `household_id` field on voters could also be used when available (populated from vendor data), falling back to address matching.

### Survey Question Validation
**Recommendation:**
- Multiple choice: require 2-10 options in `choices` array, each non-empty string
- Scale: require `min` < `max`, both integers, max range of 1-100
- Free text: no `options` needed (ignore if provided)
- Validate on question creation, not on response recording

### Indexing Beyond Spatial
**Recommendation:** Add these indexes for common query patterns:
- `(campaign_id, walk_list_id)` on walk_list_entries -- entry lookup by list
- `(walk_list_id, sequence)` on walk_list_entries -- ordered entry traversal
- `(campaign_id, status)` on turfs -- list active turfs
- `(script_id, position)` on survey_questions -- ordered question fetch
- `(campaign_id, voter_id, script_id)` on survey_responses -- response lookup per voter per script

### Walk List Entry Ordering Tiebreakers
**Recommendation:** Within same street name: sort by house number (ascending, even/odd interleaving is unnecessary for v1). Within same address: sort by last_name. This gives a natural walking order.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| geoalchemy2 Column() style | mapped_column with Mapped[WKBElement] | geoalchemy2 0.14+ / SQLAlchemy 2.0 | Type annotations, IDE support |
| Manual Alembic spatial DDL | geoalchemy2.alembic_helpers | geoalchemy2 0.12+ | Auto-handles spatial indexes and imports in migrations |
| Shapely 1.x (GEOS C lib) | Shapely 2.x (vectorized, faster) | 2023 | 10-100x faster for bulk operations, new API |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest + pytest-asyncio |
| Config file | pyproject.toml `[tool.pytest.ini_options]` |
| Quick run command | `uv run pytest tests/unit/ -x -q` |
| Full suite command | `uv run pytest tests/ -x` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CANV-01 | Turf CRUD with GeoJSON polygon input/output | unit | `uv run pytest tests/unit/test_turfs.py -x` | No -- Wave 0 |
| CANV-02 | Walk list generation from turf + optional filter | unit | `uv run pytest tests/unit/test_walk_lists.py -x` | No -- Wave 0 |
| CANV-03 | Household clustering groups same-address voters | unit | `uv run pytest tests/unit/test_walk_lists.py::test_household_clustering -x` | No -- Wave 0 |
| CANV-04 | Door-knock outcome recording with result codes | unit | `uv run pytest tests/unit/test_canvassing.py -x` | No -- Wave 0 |
| CANV-05 | Contact attempts tracked with timestamps | unit | `uv run pytest tests/unit/test_canvassing.py::test_contact_attempts -x` | No -- Wave 0 |
| CANV-06 | Canvasser assignment to walk lists | unit | `uv run pytest tests/unit/test_walk_lists.py::test_canvasser_assignment -x` | No -- Wave 0 |
| CANV-07 | Survey script CRUD with lifecycle enforcement | unit | `uv run pytest tests/unit/test_surveys.py -x` | No -- Wave 0 |
| CANV-08 | Survey response capture with type validation | unit | `uv run pytest tests/unit/test_surveys.py::test_survey_responses -x` | No -- Wave 0 |
| CANV-01 | Spatial queries with real PostGIS | integration | `uv run pytest tests/integration/test_spatial.py -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/ -x -q`
- **Per wave merge:** `uv run pytest tests/ -x`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/test_turfs.py` -- covers CANV-01 (turf CRUD, GeoJSON validation)
- [ ] `tests/unit/test_walk_lists.py` -- covers CANV-02, CANV-03, CANV-06 (generation, clustering, assignment)
- [ ] `tests/unit/test_canvassing.py` -- covers CANV-04, CANV-05 (door-knock recording, contact tracking)
- [ ] `tests/unit/test_surveys.py` -- covers CANV-07, CANV-08 (scripts, questions, responses)
- [ ] `tests/integration/test_spatial.py` -- covers CANV-01 PostGIS integration (ST_Contains, GiST index)

## Open Questions

1. **Voter geom column nullability and walk list behavior**
   - What we know: Voters without lat/long will have NULL geom and won't appear in spatial queries
   - What's unclear: Should walk list generation warn about voters in the voter list that have no geom?
   - Recommendation: Log a warning count but proceed. API response should include `voters_excluded_no_geom: N` in generation results.

2. **Walk list deletion cascade**
   - What we know: Walk lists have entries and canvasser assignments
   - What's unclear: Should deleting a walk list cascade to entries and responses, or should walk lists be "archivable" only?
   - Recommendation: Allow deletion with CASCADE on entries and canvasser assignments. Survey responses and door-knock interactions are on the voter, not the walk list, so they survive walk list deletion.

## Sources

### Primary (HIGH confidence)
- [GeoAlchemy2 0.18 docs](https://geoalchemy-2.readthedocs.io/) -- ORM tutorial, spatial functions, Alembic helpers, mapped_column v2 gallery
- [GeoAlchemy2 ORM mapped v2](https://geoalchemy-2.readthedocs.io/en/latest/gallery/test_orm_mapped_v2.html) -- SQLAlchemy 2.0 mapped_column with Geometry
- [GeoAlchemy2 Alembic guide](https://geoalchemy-2.readthedocs.io/en/latest/alembic.html) -- alembic_helpers setup
- [Shapely 2.1 docs](https://shapely.readthedocs.io/en/stable/) -- Polygon validation, is_valid, shape/mapping
- [PostGIS ST_Contains](https://postgis.net/docs/ST_Contains.html) -- Spatial containment function
- Existing codebase: `app/models/voter_interaction.py`, `app/services/voter_interaction.py`, `app/services/voter_list.py`

### Secondary (MEDIUM confidence)
- [PostGIS spatial indexing](http://postgis.net/workshops/postgis-intro/indexing.html) -- GiST index best practices
- [GeoAlchemy2 spatial functions](https://geoalchemy-2.readthedocs.io/en/latest/spatial_functions.html) -- ST_Contains, ST_AsGeoJSON usage

### Tertiary (LOW confidence)
- Walk list splitting strategy (based on campaign operations domain knowledge, not verified against specific software)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- geoalchemy2 and shapely are the established Python-PostGIS libraries, verified via official docs
- Architecture: HIGH -- follows existing project patterns exactly (models, services, schemas, routes), verified against codebase
- Pitfalls: HIGH -- PostGIS extension activation, SRID mismatch, and Alembic helpers are well-documented issues
- Survey engine: HIGH -- straightforward CRUD with lifecycle state machine, existing interaction composition pattern
- Household clustering: MEDIUM -- exact address matching is standard practice but edge cases exist (apartment numbers, P.O. boxes)

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable libraries, 30-day validity)
