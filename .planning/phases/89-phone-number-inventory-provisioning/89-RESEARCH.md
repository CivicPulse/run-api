# Phase 89: Phone Number Inventory & Provisioning - Research

**Researched:** 2026-04-07
**Domain:** Twilio phone number management, SQLAlchemy circular FKs, FastAPI sub-routers
**Confidence:** HIGH

## Summary

Phase 89 adds an `org_phone_numbers` table where org admins register their existing Twilio phone numbers, inspect voice/SMS/MMS capabilities, and designate default numbers for voice and SMS flows. The phase builds on Phase 88's encrypted Twilio credentials by using them to instantiate a `twilio.rest.Client` that validates and fetches capabilities from the Twilio IncomingPhoneNumbers API at registration time.

The primary technical challenges are: (1) the circular foreign key between `organizations` and `org_phone_numbers` (org owns numbers, but also points to default numbers), which requires SQLAlchemy `use_alter` and a two-step Alembic migration; (2) correctly handling the Twilio REST API for number lookup with proper error mapping; and (3) extending the existing org settings UI with a phone numbers card that follows established TanStack Query + shadcn/ui patterns.

**Primary recommendation:** Install `twilio>=9.10.4`, add `get_twilio_client()` to `TwilioConfigService`, create the `OrgPhoneNumber` model with `use_alter=True` FKs, mount a `numbers_router` on the existing org router, and extend `settings.tsx` with a `PhoneNumbersCard` component.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Separate `org_phone_numbers` table (many-to-one from org) rather than adding columns to `organizations`.
- Each row stores: phone_number, friendly_name, phone_type (local/toll-free/mobile), voice_capable, sms_capable, mms_capable, twilio_sid, capabilities_synced_at, created_at.
- The org row holds two FK references: `default_voice_number_id` and `default_sms_number_id` to `org_phone_numbers.id`.
- BYO-only: admins register numbers that already exist in their Twilio account.
- Platform does a Twilio API lookup at registration to validate the number exists and fetch its capabilities.
- Provisioning new numbers via Twilio API (search/purchase) is v2 scope.
- Two FK columns on the `Organization` model: `default_voice_number_id` and `default_sms_number_id`.
- PATCH `/api/v1/org/numbers/{id}/set-default` with a `capability` field (`voice` | `sms`) sets the correct FK.
- DB: nullable FKs with SET NULL on delete so removing a number safely clears defaults.
- API surface: GET, POST, DELETE /{id}, POST /{id}/sync, PATCH /{id}/set-default under `/api/v1/org/numbers`.
- Role gates: read = org_admin; write/delete = org_owner.
- Frontend: extend `/org/settings` with Phone Numbers card below Twilio credentials card.
- Reuse existing `useOrg` hook pattern; add `useOrgNumbers` hook.

### Claude's Discretion
- Specific Twilio API call shape for IncomingPhoneNumber lookup (`PhoneNumbers.get()` vs `IncomingPhoneNumbers.list()`) is at the agent's discretion.
- Exact migration numbering (030_xxx) and column ordering are at the agent's discretion.
- UI layout details within the settings card are at the agent's discretion provided they follow the existing settings card pattern.

### Deferred Ideas (OUT OF SCOPE)
- Twilio API number search and purchase (provisioning new numbers) -- v2 or future phase.
- A2P 10DLC campaign registration tracking per number -- out of scope for this milestone.
- Number-level webhook URL display -- Phase 90 responsibility.
- Background capability sync schedule -- not needed for this phase; on-demand only.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ORG-02 | Org admins can register BYO Twilio numbers and manage platform-provisioned numbers with capability and default-number visibility. | Twilio IncomingPhoneNumbers API for validation/capability fetch; `org_phone_numbers` table model; default FK columns on Organization; API endpoints for CRUD + sync + set-default; frontend PhoneNumbersCard with capability badges and default tags |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| twilio | 9.10.4 | Twilio REST API client for IncomingPhoneNumbers lookup | Official Python helper library; handles auth, pagination, error mapping [VERIFIED: PyPI] |
| SQLAlchemy | 2.0.48+ | ORM for org_phone_numbers model with circular FK | Already in project dependencies [VERIFIED: pyproject.toml] |
| FastAPI | 0.135.1+ | API router for /numbers endpoints | Already in project dependencies [VERIFIED: pyproject.toml] |
| Alembic | 1.18.4+ | Migration for new table + FK columns | Already in project dependencies [VERIFIED: pyproject.toml] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| cryptography | 46.0.3+ | Fernet encryption for TwilioConfigService (existing) | Already installed; used by Phase 88 credential decryption to build Twilio client [VERIFIED: pyproject.toml] |

**Installation:**
```bash
uv add "twilio>=9.10.4"
```

**Version verification:** twilio 9.10.4 confirmed as latest on PyPI as of 2026-04-07 [VERIFIED: PyPI JSON API].

## Architecture Patterns

### Recommended Project Structure
```
app/
  models/
    org_phone_number.py      # New OrgPhoneNumber model
    organization.py          # Add default_voice_number_id, default_sms_number_id FKs
  schemas/
    org_phone_number.py      # Request/response schemas for phone numbers
    org.py                   # (unchanged, but OrgResponse may gain default_numbers info)
  services/
    twilio_config.py         # Add get_twilio_client() method
    org_phone_number.py      # New service for number CRUD + Twilio API calls
  api/v1/
    org_numbers.py           # New router for /api/v1/org/numbers
    org.py                   # Mount numbers sub-router
    router.py                # (unchanged -- org router already mounted)
  db/
    base.py                  # Register new model import
alembic/versions/
  030_org_phone_numbers.py   # New migration
web/src/
  types/org.ts               # Add OrgPhoneNumber interface
  hooks/useOrgNumbers.ts     # New hook for phone number queries/mutations
  components/org/
    PhoneNumbersCard.tsx      # New card component
  routes/org/settings.tsx     # Import and render PhoneNumbersCard
```

### Pattern 1: Circular FK with use_alter
**What:** `organizations.default_voice_number_id` -> `org_phone_numbers.id` AND `org_phone_numbers.org_id` -> `organizations.id` creates a circular dependency.
**When to use:** When two tables reference each other.
**Solution:**

In the SQLAlchemy model, use `use_alter=True` on the FKs that point from organizations to org_phone_numbers. This tells SQLAlchemy to emit these FKs as separate ALTER TABLE statements rather than inline in CREATE TABLE, breaking the circular dependency. [CITED: https://github.com/sqlalchemy/alembic/issues/626]

```python
# In app/models/organization.py — add these columns
from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

class Organization(Base):
    # ... existing fields ...
    default_voice_number_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("org_phone_numbers.id", use_alter=True, ondelete="SET NULL"),
        nullable=True,
    )
    default_sms_number_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("org_phone_numbers.id", use_alter=True, ondelete="SET NULL"),
        nullable=True,
    )
```

```python
# In app/models/org_phone_number.py
class OrgPhoneNumber(Base):
    __tablename__ = "org_phone_numbers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False)
    # ... etc
```

### Pattern 2: Alembic Migration for Circular FKs
**What:** The migration must create the table first, then add the FK columns to organizations separately.
**Approach:** A single migration file with three steps:
1. `op.create_table("org_phone_numbers", ...)` -- includes the `org_id` FK to organizations (no circularity yet)
2. `op.add_column("organizations", ...)` for `default_voice_number_id` and `default_sms_number_id` (no FK constraint inline)
3. `op.create_foreign_key(...)` to add the FK constraints from organizations to org_phone_numbers

```python
# Migration 030_org_phone_numbers.py
def upgrade() -> None:
    # Step 1: Create the phone numbers table
    op.create_table(
        "org_phone_numbers",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("org_id", sa.Uuid(), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("phone_number", sa.String(20), nullable=False),
        sa.Column("friendly_name", sa.String(64), nullable=True),
        sa.Column("phone_type", sa.String(20), nullable=False, server_default="unknown"),
        sa.Column("voice_capable", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("sms_capable", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("mms_capable", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("twilio_sid", sa.String(40), nullable=False),
        sa.Column("capabilities_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_org_phone_numbers_org_id", "org_phone_numbers", ["org_id"])
    op.create_index("ix_org_phone_numbers_phone", "org_phone_numbers", ["org_id", "phone_number"], unique=True)

    # Step 2: Add nullable FK columns to organizations
    op.add_column("organizations", sa.Column("default_voice_number_id", sa.Uuid(), nullable=True))
    op.add_column("organizations", sa.Column("default_sms_number_id", sa.Uuid(), nullable=True))

    # Step 3: Add FK constraints separately (breaks circular dependency)
    op.create_foreign_key(
        "fk_org_default_voice_number",
        "organizations", "org_phone_numbers",
        ["default_voice_number_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_org_default_sms_number",
        "organizations", "org_phone_numbers",
        ["default_voice_number_id"], ["id"],  # Note: planner should correct to default_sms_number_id
        ondelete="SET NULL",
    )
```

### Pattern 3: Sub-Router Mounting on Existing Org Router
**What:** The existing `org.router` at `/api/v1/org` needs `/numbers` endpoints without duplicating middleware.
**How:** Create a separate `numbers_router = APIRouter()` in `app/api/v1/org_numbers.py`, then include it in the existing org router. [VERIFIED: app/api/v1/router.py shows org router mounted at `/org`]

```python
# In app/api/v1/org.py (at bottom)
from app.api.v1.org_numbers import numbers_router
router.include_router(numbers_router, prefix="/numbers", tags=["org-numbers"])
```

This yields paths like `/api/v1/org/numbers`, `/api/v1/org/numbers/{id}`, etc. without touching `router.py`.

### Pattern 4: TwilioConfigService.get_twilio_client()
**What:** New method on existing service that decrypts credentials and returns an authenticated `twilio.rest.Client`.
**Why:** Centralizes credential access; Phase 89 and later phases all need a Twilio client.

```python
# In app/services/twilio_config.py
from twilio.rest import Client as TwilioClient

class TwilioConfigService:
    # ... existing methods ...

    def get_twilio_client(self, org) -> TwilioClient:
        """Return an authenticated Twilio REST client for the given org."""
        creds = self.credentials_for_org(org)
        if creds is None:
            raise TwilioConfigError("Twilio credentials not configured for this org")
        return TwilioClient(creds.account_sid, creds.auth_token)
```

### Pattern 5: Twilio IncomingPhoneNumbers Lookup
**What:** Validate a BYO phone number exists in the org's Twilio account and fetch capabilities.
**Recommendation:** Use `client.incoming_phone_numbers.list(phone_number="+1...")` to find by E.164 number, since we don't have the SID at registration time. The list returns matching records; if empty, the number doesn't belong to this account. For sync, use `client.incoming_phone_numbers(sid).fetch()` since we have the SID stored. [CITED: https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource]

```python
from twilio.rest import Client as TwilioClient
from twilio.base.exceptions import TwilioRestException

def lookup_incoming_number(client: TwilioClient, phone_number: str):
    """Look up an incoming phone number in the Twilio account."""
    numbers = client.incoming_phone_numbers.list(phone_number=phone_number, limit=1)
    if not numbers:
        return None  # Number not found in this account
    num = numbers[0]
    return {
        "sid": num.sid,                          # e.g. "PN..."
        "phone_number": num.phone_number,        # E.164
        "friendly_name": num.friendly_name,      # up to 64 chars
        "capabilities": num.capabilities,        # dict: {"voice": True, "sms": True, "mms": False, "fax": False}
        "status": num.status,
    }

def sync_number_capabilities(client: TwilioClient, twilio_sid: str):
    """Re-fetch capabilities for an already-registered number."""
    try:
        num = client.incoming_phone_numbers(twilio_sid).fetch()
    except TwilioRestException as e:
        if e.status == 404:
            return None  # Number no longer exists in Twilio account
        raise
    return {
        "capabilities": num.capabilities,
        "friendly_name": num.friendly_name,
        "status": num.status,
    }
```

**Capabilities object shape** (from Twilio API):
```json
{
  "voice": true,
  "sms": true,
  "mms": false,
  "fax": false
}
```
[CITED: https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource]

### Pattern 6: Frontend Hook Pattern (useOrgNumbers)
**What:** TanStack Query hooks following the exact pattern from `useOrg.ts`. [VERIFIED: web/src/hooks/useOrg.ts]

```typescript
// web/src/hooks/useOrgNumbers.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/api/client"
import type { OrgPhoneNumber } from "@/types/org"

export function useOrgNumbers() {
  return useQuery({
    queryKey: ["org", "numbers"],
    queryFn: () => api.get("api/v1/org/numbers").json<OrgPhoneNumber[]>(),
  })
}

export function useRegisterOrgNumber() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { phone_number: string }) =>
      api.post("api/v1/org/numbers", { json: data }).json<OrgPhoneNumber>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org", "numbers"] })
    },
  })
}

export function useDeleteOrgNumber() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`api/v1/org/numbers/${id}`).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org", "numbers"] })
      queryClient.invalidateQueries({ queryKey: ["org"] }) // defaults may have changed
    },
  })
}

export function useSyncOrgNumber() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post(`api/v1/org/numbers/${id}/sync`).json<OrgPhoneNumber>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org", "numbers"] })
    },
  })
}

export function useSetDefaultNumber() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, capability }: { id: string; capability: "voice" | "sms" }) =>
      api.patch(`api/v1/org/numbers/${id}/set-default`, { json: { capability } }).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org", "numbers"] })
      queryClient.invalidateQueries({ queryKey: ["org"] })
    },
  })
}
```

### Anti-Patterns to Avoid
- **Inline FK constraints on circular references in Alembic:** Will fail with dependency errors. Always use `op.create_foreign_key()` after both tables exist.
- **Using `client.incoming_phone_numbers(phone_number).fetch()`:** The `.fetch()` method requires a SID, not a phone number string. Use `.list(phone_number=...)` for lookup by number.
- **Storing phone numbers without E.164 normalization:** Always validate and store in E.164 format (`+1XXXXXXXXXX`). The Twilio API returns E.164; use it as the canonical format.
- **Committing db session in a service method that doesn't own the transaction:** Follow existing `OrgService` pattern where the service method calls `await db.commit()` explicitly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Phone number validation | Regex for phone numbers | Twilio API lookup at registration | Twilio validates the number exists in their account AND returns capabilities in one call |
| Twilio API auth/error handling | Raw httpx calls to Twilio REST API | `twilio` Python library | Handles auth, pagination, error mapping, retries; official support |
| Capability badge rendering | Custom colored spans | shadcn/ui `Badge` component with variant props | Already in the project's component library [VERIFIED: web/src/components/ui/badge.tsx] |
| Relative time display | Manual date math | `formatDistanceToNow` from date-fns (or Intl.RelativeTimeFormat) | Standard approach for "synced 3 days ago" display |

**Key insight:** The Twilio Python SDK handles all the REST API complexity (auth, pagination, error codes, retry). The phone number service layer should be thin -- it translates between Twilio SDK objects and SQLAlchemy models.

## Common Pitfalls

### Pitfall 1: Twilio API Errors During Registration
**What goes wrong:** Twilio returns various error codes (20404 for not found, 20003 for auth failure) that must be mapped to meaningful HTTP responses.
**Why it happens:** The Twilio SDK raises `TwilioRestException` with `.status` and `.code` attributes.
**How to avoid:** Catch `TwilioRestException` and map: status 404 -> HTTP 404 "Number not found in your Twilio account"; status 401/403 -> HTTP 502 "Twilio credential error"; other -> HTTP 502 "Twilio service error".
**Warning signs:** Generic 500 errors when registering numbers.

### Pitfall 2: Circular FK Migration Ordering
**What goes wrong:** Alembic autogenerate may not correctly order operations for circular FKs, or may try to create FK constraints before the referenced table exists.
**Why it happens:** Standard autogenerate doesn't handle `use_alter` well [CITED: https://github.com/sqlalchemy/alembic/issues/626].
**How to avoid:** Write the migration manually with explicit three-step ordering: create table, add columns, create FK constraints. Don't rely on autogenerate for this migration.
**Warning signs:** Alembic upgrade fails with "relation org_phone_numbers does not exist".

### Pitfall 3: SET NULL Not Firing on Cascade
**What goes wrong:** Deleting a phone number doesn't clear `default_voice_number_id` or `default_sms_number_id` on the org.
**Why it happens:** The FK `ondelete="SET NULL"` must be set at the database level (in the migration), not just in the SQLAlchemy model.
**How to avoid:** Ensure the `op.create_foreign_key(... ondelete="SET NULL")` is in the migration. Also handle it at the application level as defense-in-depth (clear the FK in the delete endpoint before deleting the row).
**Warning signs:** Stale default_*_number_id values pointing to deleted rows.

### Pitfall 4: Duplicate Phone Number Registration
**What goes wrong:** An admin registers the same Twilio number twice, creating duplicate rows.
**Why it happens:** No unique constraint on (org_id, phone_number).
**How to avoid:** Add a unique index on `(org_id, phone_number)` in the migration. Check for existing registration before calling Twilio API (fast path).
**Warning signs:** Multiple rows for the same number, confusion about which is default.

### Pitfall 5: Phone Number Format Inconsistency
**What goes wrong:** Numbers stored in different formats (with/without +1, with spaces, etc.) causing lookup failures.
**Why it happens:** User input varies; Twilio returns E.164.
**How to avoid:** Normalize input to E.164 before any DB or API operation. A simple check: must start with `+` followed by digits only.
**Warning signs:** "Number not found" errors for numbers that definitely exist.

### Pitfall 6: Blocking Twilio API Calls in Async Handlers
**What goes wrong:** The Twilio Python SDK uses synchronous HTTP calls, which block the async event loop.
**Why it happens:** `twilio` library is sync-only; calling it directly in an `async def` handler blocks.
**How to avoid:** Wrap Twilio calls in `asyncio.to_thread()` or `loop.run_in_executor()` to offload to a thread pool.
**Warning signs:** Slow response times, event loop blocking warnings, timeout errors under load.

## Code Examples

### OrgPhoneNumber Model
```python
# app/models/org_phone_number.py
# Source: Follows project model patterns [VERIFIED: app/models/call_list.py]
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class OrgPhoneNumber(Base):
    """Org-scoped Twilio phone number inventory entry."""

    __tablename__ = "org_phone_numbers"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False)
    friendly_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    phone_type: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown")
    voice_capable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sms_capable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    mms_capable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    twilio_sid: Mapped[str] = mapped_column(String(40), nullable=False)
    capabilities_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

### Pydantic Schemas
```python
# app/schemas/org_phone_number.py
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import Field

from app.schemas.common import BaseSchema


class OrgPhoneNumberResponse(BaseSchema):
    id: uuid.UUID
    phone_number: str
    friendly_name: str | None = None
    phone_type: str
    voice_capable: bool
    sms_capable: bool
    mms_capable: bool
    twilio_sid: str
    capabilities_synced_at: datetime | None = None
    created_at: datetime
    is_default_voice: bool = False
    is_default_sms: bool = False


class RegisterPhoneNumberRequest(BaseSchema):
    phone_number: str = Field(..., pattern=r"^\+[1-9]\d{1,14}$", description="E.164 format")


class SetDefaultRequest(BaseSchema):
    capability: str = Field(..., pattern="^(voice|sms)$")
```

### Error Handling for Twilio Calls
```python
# In the service layer
import asyncio
from twilio.base.exceptions import TwilioRestException
from fastapi import HTTPException, status

async def register_number(self, db, org, phone_number: str):
    client = self._twilio.get_twilio_client(org)

    # Offload sync Twilio call to thread pool
    try:
        numbers = await asyncio.to_thread(
            client.incoming_phone_numbers.list,
            phone_number=phone_number,
            limit=1,
        )
    except TwilioRestException as e:
        if e.status in (401, 403):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Twilio credential error -- verify your Account SID and Auth Token",
            )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Twilio API error: {e.msg}",
        )

    if not numbers:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Phone number not found in your Twilio account",
        )

    twilio_num = numbers[0]
    caps = twilio_num.capabilities or {}
    # ... create OrgPhoneNumber row ...
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| twilio-python v7 (sync-only Client) | twilio-python v9.x (still sync, but stable) | 2024 | Same sync pattern; must use `asyncio.to_thread()` in async contexts |
| SQLAlchemy 1.x `use_alter` via `relationship` config | SQLAlchemy 2.0 `use_alter=True` on `ForeignKey()` directly | SQLAlchemy 2.0 | Simpler -- just add kwarg to ForeignKey constructor |

**Deprecated/outdated:**
- twilio-python v7.x: Dropped in favor of v9.x major version. v9 changed module structure but IncomingPhoneNumbers API surface is the same. [ASSUMED]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | twilio-python v9.x IncomingPhoneNumbers.list() accepts `phone_number` filter param | Architecture Patterns / Pattern 5 | Registration lookup would need different API approach; fallback is to list all and filter client-side |
| A2 | `num.capabilities` returns a dict with boolean `voice`, `sms`, `mms`, `fax` keys | Architecture Patterns / Pattern 5 | Capability extraction code would need adjustment; schema verified from official docs |
| A3 | twilio-python v9 is sync-only; no native async client available | Common Pitfalls / Pitfall 6 | If async client exists, `asyncio.to_thread()` wrapper is unnecessary but harmless |

## Open Questions

1. **Phone number type detection**
   - What we know: Twilio returns `capabilities` (voice/sms/mms booleans) on IncomingPhoneNumber resources. The CONTEXT.md specifies storing `phone_type` (local, toll_free, mobile).
   - What's unclear: The IncomingPhoneNumber resource may not directly expose a "type" field mapping to local/toll_free/mobile. This may require checking the phone number prefix or using Twilio Lookup API.
   - Recommendation: Check if `IncomingPhoneNumber` has an `address_requirements` or `type` property. If not, infer from number format (+1800/+1888 = toll_free, etc.) or default to "unknown" and enhance in a future phase with Lookup API (Phase 94 LOOK-01 may cover this).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest with pytest-asyncio (auto mode) |
| Config file | `pyproject.toml` [VERIFIED] |
| Quick run command | `uv run pytest tests/unit/test_org_numbers_api.py -x` |
| Full suite command | `uv run pytest tests/unit/ -x` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ORG-02a | GET /org/numbers returns registered numbers | unit | `uv run pytest tests/unit/test_org_numbers_api.py::TestListNumbers -x` | Wave 0 |
| ORG-02b | POST /org/numbers validates via Twilio and creates row | unit | `uv run pytest tests/unit/test_org_numbers_api.py::TestRegisterNumber -x` | Wave 0 |
| ORG-02c | DELETE /org/numbers/{id} removes number and clears defaults | unit | `uv run pytest tests/unit/test_org_numbers_api.py::TestDeleteNumber -x` | Wave 0 |
| ORG-02d | POST /org/numbers/{id}/sync re-fetches capabilities | unit | `uv run pytest tests/unit/test_org_numbers_api.py::TestSyncNumber -x` | Wave 0 |
| ORG-02e | PATCH /org/numbers/{id}/set-default sets voice/sms default | unit | `uv run pytest tests/unit/test_org_numbers_api.py::TestSetDefault -x` | Wave 0 |
| ORG-02f | Role gates: org_admin can read, org_owner required for writes | unit | `uv run pytest tests/unit/test_org_numbers_api.py::TestRoleGates -x` | Wave 0 |
| ORG-02g | Twilio errors mapped to appropriate HTTP status codes | unit | `uv run pytest tests/unit/test_org_numbers_api.py::TestTwilioErrors -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/test_org_numbers_api.py -x`
- **Per wave merge:** `uv run pytest tests/unit/ -x`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/test_org_numbers_api.py` -- covers all ORG-02 sub-behaviors
- [ ] Twilio client mock pattern (mock `twilio.rest.Client` and `incoming_phone_numbers.list()/.fetch()`)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | N/A -- uses existing ZITADEL OIDC |
| V3 Session Management | no | N/A -- stateless JWT |
| V4 Access Control | yes | `require_org_role("org_admin")` for reads, `require_org_role("org_owner")` for writes [VERIFIED: existing pattern in org.py] |
| V5 Input Validation | yes | Pydantic E.164 regex validation + Twilio API validation |
| V6 Cryptography | no | Twilio credentials already encrypted by Phase 88; phone numbers are not secrets |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Registering numbers from another org's Twilio account | Spoofing | Twilio API lookup validates number belongs to the org's account (auth'd by their credentials) |
| Org data leakage via phone number endpoints | Information Disclosure | All queries filter by org_id derived from JWT; no cross-org access possible |
| Rate-limiting bypass on Twilio API calls | Denial of Service | Apply existing rate limiter pattern (120/minute for mutations); Twilio has its own rate limits as backstop |

## Sources

### Primary (HIGH confidence)
- [Twilio IncomingPhoneNumber Resource](https://www.twilio.com/docs/phone-numbers/api/incomingphonenumber-resource) -- API properties, capabilities object shape, endpoint structure
- [PyPI twilio package](https://pypi.org/project/twilio/) -- version 9.10.4 confirmed
- Project codebase -- `app/services/twilio_config.py`, `app/api/v1/org.py`, `app/models/organization.py`, `web/src/hooks/useOrg.ts` patterns verified directly

### Secondary (MEDIUM confidence)
- [Alembic circular FK issue #626](https://github.com/sqlalchemy/alembic/issues/626) -- use_alter pattern and manual migration approach
- [SQLAlchemy ForeignKey use_alter docs](https://docs.sqlalchemy.org/en/20/core/constraints.html) -- use_alter=True on ForeignKey constructor

### Tertiary (LOW confidence)
- twilio-python v9 internal module structure -- inferred from GitHub source, exact list() filter params are ASSUMED based on REST API docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- twilio package verified on PyPI, all other deps already in project
- Architecture: HIGH -- circular FK pattern well-documented, project patterns verified from codebase
- Pitfalls: HIGH -- async/sync mismatch, circular FK migration, and duplicate prevention are well-known issues
- Twilio API specifics: MEDIUM -- capabilities object shape confirmed from docs, but exact Python SDK method signatures for list filters are partially assumed

**Research date:** 2026-04-07
**Valid until:** 2026-05-07 (stable domain, 30-day validity)
