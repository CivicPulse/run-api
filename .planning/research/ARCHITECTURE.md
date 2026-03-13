# Architecture Research: v1.3 Voter Model & Import Enhancement

**Domain:** Voter model expansion and import pipeline enhancement for existing campaign management API
**Researched:** 2026-03-13
**Confidence:** HIGH (based on direct codebase analysis -- no external dependencies to verify)

## System Overview: Change Impact Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ALEMBIC MIGRATION                           │
│  ADD ~20 columns to voters  |  UPDATE L2 template seed data        │
│  ADD indexes for new filter  |  NO new tables needed               │
├─────────────────────────────────────────────────────────────────────┤
│                         SQLALCHEMY MODEL                            │
│  ┌──────────────────┐  ┌────────────────┐  ┌──────────────────┐    │
│  │  Voter (MODIFY)  │  │ VoterPhone     │  │ VoterAddress     │    │
│  │  +20 new columns │  │ (no change)    │  │ (no change)      │    │
│  └────────┬─────────┘  └───────┬────────┘  └───────┬──────────┘    │
│           │ new fields          │ bulk insert        │ bulk insert   │
├───────────┴─────────────────────┴───────────────────┴──────────────┤
│                        IMPORT SERVICE                               │
│  ┌───────────────────┐  ┌──────────────────┐  ┌────────────────┐   │
│  │ CANONICAL_FIELDS  │  │ process_csv_batch │  │ L2 Template    │   │
│  │ +20 new entries   │  │ +phone extraction │  │ +20 mappings   │   │
│  │ +phone aliases    │  │ +mailing addr     │  │                │   │
│  │ +mailing aliases  │  │ +voting history   │  │                │   │
│  └───────────────────┘  └──────────────────┘  └────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│                       SCHEMAS & FILTERS                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐    │
│  │ VoterResponse    │  │ VoterFilter      │  │ build_voter_   │    │
│  │ +20 new fields   │  │ +new dimensions  │  │ query() update │    │
│  └──────────────────┘  └──────────────────┘  └────────────────┘    │
├─────────────────────────────────────────────────────────────────────┤
│                         FRONTEND                                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐    │
│  │ Voter type       │  │ VoterFilter type │  │ VoterDetail    │    │
│  │ +20 new fields   │  │ +new dimensions  │  │ +new cards     │    │
│  │                  │  │                  │  │                │    │
│  │ ColumnMapping    │  │ FilterBuilder    │  │ VoterEditSheet │    │
│  │ +new canonicals  │  │ +new filters     │  │ +new fields    │    │
│  └──────────────────┘  └──────────────────┘  └────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Analysis: What Changes and What Stays

### Files Modified (Existing)

| File | Change Type | Scope |
|------|-------------|-------|
| `app/models/voter.py` | ADD columns | ~20 new `mapped_column` fields on Voter class |
| `app/services/import_service.py` | ADD entries + NEW logic | New CANONICAL_FIELDS entries, phone/mailing/voting-history extraction in `process_csv_batch` |
| `app/services/voter.py` | ADD conditions | New filter conditions in `build_voter_query()` |
| `app/schemas/voter.py` | ADD fields | New fields on VoterResponse, VoterCreateRequest, VoterUpdateRequest |
| `app/schemas/voter_filter.py` | ADD fields | New filter dimensions on VoterFilter |
| `web/src/types/voter.ts` | ADD fields | Mirror backend schema additions |
| `web/src/components/voters/ColumnMappingTable.tsx` | ADD entries | New CANONICAL_FIELDS entries |
| `web/src/components/voters/VoterFilterBuilder.tsx` | ADD controls | New filter UI controls |
| `web/src/components/voters/VoterEditSheet.tsx` | ADD fields | New editable fields |
| `web/src/routes/campaigns/$campaignId/voters/$voterId.tsx` | ADD display | New data cards for expanded fields |
| `alembic/versions/` | NEW file | Migration adding columns, indexes, updating L2 template |

### Files NOT Modified

| File | Reason |
|------|--------|
| `app/models/voter_contact.py` | VoterPhone/VoterEmail/VoterAddress schemas are unchanged |
| `app/services/voter_contact.py` | Contact CRUD stays the same -- import service creates phones directly |
| `app/api/v1/imports.py` | Import API endpoints unchanged -- logic is in service layer |
| `app/tasks/import_task.py` | Task orchestration unchanged -- delegates to ImportService |
| `app/models/import_job.py` | Import job model unchanged -- field_mapping is JSONB |
| `app/db/rls.py` | RLS patterns unchanged -- no new tables |

## Detailed Integration Points

### 1. Voter Model Expansion (app/models/voter.py)

**Current state:** 23 data columns + geom + extra_data + metadata (id, campaign_id, timestamps).

**New columns to add to Voter class:**

```python
# Propensity scores (L2 "Modeled" fields)
likely_dem: Mapped[int | None] = mapped_column()           # 0-100
likely_rep: Mapped[int | None] = mapped_column()           # 0-100
likely_lib: Mapped[int | None] = mapped_column()           # 0-100
likely_grn: Mapped[int | None] = mapped_column()           # 0-100
likely_ind: Mapped[int | None] = mapped_column()           # 0-100
turnout_score: Mapped[int | None] = mapped_column()        # 0-100

# Extended demographics
language: Mapped[str | None] = mapped_column(String(100))
religion: Mapped[str | None] = mapped_column(String(100))
education: Mapped[str | None] = mapped_column(String(100))
income_estimate: Mapped[str | None] = mapped_column(String(50))
marital_status: Mapped[str | None] = mapped_column(String(50))
home_owner: Mapped[str | None] = mapped_column(String(20))
occupation: Mapped[str | None] = mapped_column(String(255))

# Military
military_status: Mapped[str | None] = mapped_column(String(50))

# Mailing address (distinct from residential on Voter)
mail_address_line1: Mapped[str | None] = mapped_column(String(500))
mail_address_line2: Mapped[str | None] = mapped_column(String(500))
mail_city: Mapped[str | None] = mapped_column(String(255))
mail_state: Mapped[str | None] = mapped_column(String(2))
mail_zip_code: Mapped[str | None] = mapped_column(String(10))

# Household
household_size: Mapped[int | None] = mapped_column()

# Phone (inline on voter for import convenience -- also creates VoterPhone)
phone: Mapped[str | None] = mapped_column(String(50))
phone_type: Mapped[str | None] = mapped_column(String(20))
```

**Design decision -- Mailing address on Voter vs VoterAddress:**
Put mailing address as flat columns on the Voter model rather than forcing it through VoterAddress during import. Rationale:
- L2 voter files ship residential and mailing addresses as columns in the same CSV row
- The import pipeline uses bulk INSERT ON CONFLICT DO UPDATE -- inserting into a separate table mid-batch breaks the atomic upsert pattern
- The `extra_data` JSONB is already the fallback for unmapped fields, but mailing address is common enough to be first-class for filtering
- VoterAddress remains available for manually-added or secondary addresses via the Contacts tab

**Design decision -- Phone on Voter model:**
Add `phone` and `phone_type` columns directly to the Voter model for import mapping convenience, but the import pipeline ALSO auto-creates a VoterPhone record. This means:
- Phone data is queryable directly on the voter (no join for simple display)
- VoterPhone is the canonical contact record for phone banking (call list generation joins voter_phones)
- The import step creates VoterPhone as a post-upsert batch insert
- No duplication risk because VoterPhone records are created after voter upsert, keyed by voter_id

### 2. Import Service Enhancement (app/services/import_service.py)

**Current flow:**
```
CSV rows --> apply_field_mapping() --> valid_voters list --> INSERT ON CONFLICT DO UPDATE
```

**Enhanced flow:**
```
CSV rows --> apply_field_mapping() --> valid_voters list
    |                                        |
    |  (extract phone values)                |
    |  (extract mailing addr values)         |
    |  (parse voting history columns)        |
    |                                        v
    |                              INSERT ON CONFLICT DO UPDATE (voters)
    |                                        |
    v                                        v
phone_records list              RETURNING id --> match voter_ids
    |                                        |
    v                                        v
INSERT VoterPhone batch
(ON CONFLICT DO NOTHING
 on dedup index)
```

**Key changes to apply_field_mapping():**

1. **New CANONICAL_FIELDS entries** (~20 new aliases for propensity, demographics, mailing, phone)
2. **New _VOTER_COLUMNS entries** to match the new Voter model columns
3. **Phone extraction**: When a CSV column maps to "phone" canonical field, extract the value into a separate `_phone_data` dict alongside the voter dict
4. **Voting history parsing**: L2 files have columns like `General_2024`, `Primary_2024` with values "Y"/"N". Detect columns matching election pattern, collect "Y" values into the `voting_history` array

**Key changes to process_csv_batch():**

```python
async def process_csv_batch(self, rows, field_mapping, campaign_id, source_type, session):
    mapped_results = self.apply_field_mapping(rows, field_mapping, campaign_id, source_type)

    valid_voters = []
    phone_records = []  # NEW: collect phone data
    errors = []

    for i, result in enumerate(mapped_results):
        if result.get("error"):
            errors.append(...)
        else:
            voter = result["voter"]
            if not voter.get("source_id"):
                voter["source_id"] = str(uuid.uuid4())
            valid_voters.append(voter)

            # NEW: extract phone for VoterPhone creation
            if result.get("phone_data"):
                phone_records.append({
                    "source_id": voter["source_id"],  # link back
                    **result["phone_data"],
                })

    if valid_voters:
        # Existing upsert -- now with RETURNING
        stmt = insert(Voter).values(valid_voters)
        stmt = stmt.on_conflict_do_update(...)
        result = await session.execute(stmt.returning(Voter.id, Voter.source_id))
        voter_id_map = {row.source_id: row.id for row in result}

        # NEW: bulk insert VoterPhone records
        if phone_records:
            phone_inserts = []
            for pr in phone_records:
                voter_id = voter_id_map.get(pr["source_id"])
                if voter_id and pr.get("value"):
                    phone_inserts.append({
                        "campaign_id": campaign_id,
                        "voter_id": voter_id,
                        "value": pr["value"],
                        "type": pr.get("type", "unknown"),
                        "is_primary": True,
                        "source": "import",
                    })
            if phone_inserts:
                phone_stmt = insert(VoterPhone).values(phone_inserts)
                phone_stmt = phone_stmt.on_conflict_do_nothing(
                    index_elements=["campaign_id", "voter_id", "value"]
                )
                await session.execute(phone_stmt)

        await session.flush()

    return len(valid_voters), errors
```

**Critical detail -- RETURNING clause:** The current upsert does NOT use RETURNING. Adding `.returning(Voter.id, Voter.source_id)` is essential for mapping back to phone records. This is a PostgreSQL INSERT ... ON CONFLICT ... RETURNING pattern that works correctly -- RETURNING returns rows for both inserted and updated rows.

**Critical detail -- VoterPhone dedup:** VoterPhone currently has no unique constraint on (voter_id, value). For re-imports, use ON CONFLICT DO NOTHING with a new unique index `(campaign_id, voter_id, value)` added to VoterPhone in the migration. This prevents duplicate phone records when the same voter file is imported multiple times.

### 3. Voting History Parsing

**Current state:** `voting_history` is an `ARRAY(String)` column. The filter builder uses array containment (`@>`) for voted_in/not_voted_in queries. Frontend shows election year checkboxes.

**L2 voting history columns:** L2 files contain columns like:
- `General_2024`, `General_2022`, `General_2020`, etc.
- `Primary_2024`, `Primary_2022`, `Primary_2020`, etc.
- Values are typically "Y", "N", or empty

**Parsing strategy -- pattern-based detection in apply_field_mapping:**

After standard mapping, scan unmapped columns for election-like patterns (`General_YYYY`, `Primary_YYYY`, `Runoff_YYYY`, etc.). For each column where value is "Y", add the column name (e.g., "General_2024") to the voting_history array.

```python
import re

_ELECTION_PATTERN = re.compile(
    r"^(General|Primary|Runoff|Municipal|Special)_(\d{4})$", re.IGNORECASE
)

# In apply_field_mapping, after standard mapping:
voting_history = []
for csv_col, value in row.items():
    if _ELECTION_PATTERN.match(csv_col) and value and value.strip().upper() in ("Y", "YES", "1"):
        voting_history.append(csv_col)
if voting_history:
    voter["voting_history"] = sorted(voting_history)
```

This runs only on unmapped columns, so it won't interfere with explicit mappings. Non-L2 files can still manually set voting_history via the existing canonical field mapping.

### 4. CANONICAL_FIELDS Expansion (import_service.py)

New entries to add (aliases from L2 voter file column names):

```python
# Propensity scores
"likely_dem": ["likely_dem", "modeled_dem", "partisan_score_dem"],
"likely_rep": ["likely_rep", "modeled_rep", "partisan_score_rep"],
"likely_lib": ["likely_lib", "modeled_lib"],
"likely_grn": ["likely_grn", "modeled_grn"],
"likely_ind": ["likely_ind", "modeled_ind"],
"turnout_score": ["turnout_score", "modeled_turnout", "turnout_likelihood"],

# Extended demographics
"language": ["language", "voters_language", "primary_language", "languagename"],
"religion": ["religion", "religionname"],
"education": ["education", "educationname"],
"income_estimate": ["income_estimate", "income", "estimatedincome", "incomename"],
"marital_status": ["marital_status", "maritalstatus", "marital"],
"home_owner": ["home_owner", "homeowner", "homeownership", "dwellingtype"],
"occupation": ["occupation", "occupationname"],

# Military
"military_status": ["military_status", "military", "militarystatus"],

# Mailing address
"mail_address_line1": ["mail_address_line1", "mailing_address1", "mail_address",
                        "mailingaddress_addressline"],
"mail_address_line2": ["mail_address_line2", "mailing_address2",
                        "mailingaddress_extraaddressline"],
"mail_city": ["mail_city", "mailing_city", "mailingaddress_city"],
"mail_state": ["mail_state", "mailing_state", "mailingaddress_state"],
"mail_zip_code": ["mail_zip_code", "mailing_zip", "mailingaddress_zip"],

# Household
"household_size": ["household_size", "hhsize", "household_members"],

# Phone (maps to voter.phone AND triggers VoterPhone creation)
"phone": ["phone", "phone_number", "cell_phone", "home_phone",
           "voters_phone", "phonenumber", "landline_phone"],
"phone_type": ["phone_type", "phonetype"],
```

### 5. L2 System Template Update (Migration)

The L2 mapping template seeded in migration 002b needs to be updated to include the new fields. This is done in the new migration:

```python
_NEW_L2_MAPPINGS = {
    # Propensity
    "Modeled_Dem": "likely_dem",
    "Modeled_Rep": "likely_rep",
    "Modeled_Lib": "likely_lib",
    "Modeled_Grn": "likely_grn",
    "Modeled_Ind": "likely_ind",
    "Modeled_Turnout": "turnout_score",
    # Demographics
    "LanguageName": "language",
    "ReligionName": "religion",
    "EducationName": "education",
    "EstimatedIncome": "income_estimate",
    "MaritalStatus": "marital_status",
    "DwellingType": "home_owner",
    "OccupationName": "occupation",
    # Military
    "MilitaryStatus": "military_status",
    # Mailing
    "MailingAddress_AddressLine": "mail_address_line1",
    "MailingAddress_ExtraAddressLine": "mail_address_line2",
    "MailingAddress_City": "mail_city",
    "MailingAddress_State": "mail_state",
    "MailingAddress_Zip": "mail_zip_code",
    # Household
    "Voters_HHSize": "household_size",
    # Phone
    "Voters_Phone": "phone",
    "Voters_PhoneType": "phone_type",
}

def upgrade():
    # ... add columns ...

    # Update L2 template: merge new mappings into existing JSONB
    op.execute(
        sa.text(
            "UPDATE field_mapping_templates "
            "SET mapping = mapping || CAST(:new_mappings AS jsonb) "
            "WHERE is_system = true AND source_type = 'l2'"
        ).bindparams(new_mappings=json.dumps(_NEW_L2_MAPPINGS))
    )
```

Uses PostgreSQL `||` JSONB merge operator. Preserves existing L2 mappings while adding new ones. Safe because the existing L2 template keys don't overlap with the new ones.

### 6. Filter Builder Expansion (app/services/voter.py + app/schemas/voter_filter.py)

**New VoterFilter fields:**

```python
# VoterFilter additions
ethnicity: str | None = None              # already exists in model, adding to filter
language: str | None = None
military_status: str | None = None
home_owner: str | None = None
marital_status: str | None = None
turnout_score_min: int | None = None
turnout_score_max: int | None = None
likely_dem_min: int | None = None
likely_dem_max: int | None = None
likely_rep_min: int | None = None
likely_rep_max: int | None = None
has_mailing_address: bool | None = None
household_size_min: int | None = None
household_size_max: int | None = None
```

**New build_voter_query() conditions:**

```python
# Exact match filters
if filters.ethnicity is not None:
    conditions.append(Voter.ethnicity == filters.ethnicity)
if filters.language is not None:
    conditions.append(Voter.language == filters.language)
if filters.military_status is not None:
    conditions.append(Voter.military_status == filters.military_status)
if filters.home_owner is not None:
    conditions.append(Voter.home_owner == filters.home_owner)
if filters.marital_status is not None:
    conditions.append(Voter.marital_status == filters.marital_status)

# Range filters
if filters.turnout_score_min is not None:
    conditions.append(Voter.turnout_score >= filters.turnout_score_min)
if filters.turnout_score_max is not None:
    conditions.append(Voter.turnout_score <= filters.turnout_score_max)
if filters.likely_dem_min is not None:
    conditions.append(Voter.likely_dem >= filters.likely_dem_min)
# ... etc for likely_rep, household_size

# Boolean existence
if filters.has_mailing_address is not None:
    if filters.has_mailing_address:
        conditions.append(Voter.mail_address_line1.isnot(None))
    else:
        conditions.append(Voter.mail_address_line1.is_(None))
```

### 7. Frontend Changes

**TypeScript type additions (web/src/types/voter.ts):**

Add to Voter interface:
```typescript
likely_dem: number | null
likely_rep: number | null
likely_lib: number | null
likely_grn: number | null
likely_ind: number | null
turnout_score: number | null
language: string | null
religion: string | null
education: string | null
income_estimate: string | null
marital_status: string | null
home_owner: string | null
occupation: string | null
military_status: string | null
mail_address_line1: string | null
mail_address_line2: string | null
mail_city: string | null
mail_state: string | null
mail_zip_code: string | null
household_size: number | null
phone: string | null
phone_type: string | null
```

**ColumnMappingTable.tsx -- Add to CANONICAL_FIELDS array:**
```typescript
"likely_dem", "likely_rep", "likely_lib", "likely_grn", "likely_ind",
"turnout_score",
"language", "religion", "education", "income_estimate",
"marital_status", "home_owner", "occupation",
"military_status",
"mail_address_line1", "mail_address_line2", "mail_city", "mail_state", "mail_zip_code",
"household_size",
"phone", "phone_type",
```

**VoterDetail page -- New cards:**
- "Propensity Scores" card with horizontal bar charts or badge-style 0-100 displays
- "Mailing Address" card (separate from residential address)
- "Demographics" card expanded with language, religion, education, income, marital, military
- "Household" section showing household_id and household_size

**VoterFilterBuilder.tsx -- New filter controls:**
- Turnout score range slider (0-100)
- Partisan score range sliders
- Language dropdown (populated from distinct values or static list)
- Military status checkbox
- Has mailing address toggle

**VoterEditSheet.tsx -- Additional editable fields:**
- Language, education, marital_status (selects)
- Military status (select)

## Data Flow: Import Pipeline with Auto-Phone Creation

### Current Import Flow

```
Browser                   API                    TaskIQ Worker           PostgreSQL
  |                        |                         |                      |
  |-- POST /imports ------>|                         |                      |
  |<-- upload_url ---------|                         |                      |
  |-- PUT to MinIO ------->|                         |                      |
  |-- POST /detect ------->|                         |                      |
  |<-- columns + mapping --|                         |                      |
  |-- POST /confirm ------>|                         |                      |
  |                        |-- kiq(import_id) ------>|                      |
  |                        |                         |-- process_csv_batch->|
  |                        |                         |   INSERT ON CONFLICT |
  |                        |                         |   (voters only)      |
  |-- GET /imports/:id --->|                         |                      |
  |<-- status: completed --|                         |                      |
```

### Enhanced Import Flow (v1.3)

```
Browser                   API                    TaskIQ Worker           PostgreSQL
  |                        |                         |                      |
  |  (same upload flow)    |                         |                      |
  |-- POST /confirm ------>|                         |                      |
  |                        |-- kiq(import_id) ------>|                      |
  |                        |                         |                      |
  |                        |                         |-- apply_field_mapping |
  |                        |                         |   (now extracts phone |
  |                        |                         |    + parses elections)|
  |                        |                         |                      |
  |                        |                         |-- INSERT ON CONFLICT  |
  |                        |                         |   voters (RETURNING   |
  |                        |                         |   id, source_id)      |
  |                        |                         |                      |
  |                        |                         |-- INSERT VoterPhone   |
  |                        |                         |   ON CONFLICT NOTHING |
  |                        |                         |   (batch, using       |
  |                        |                         |    returned voter_ids)|
  |                        |                         |                      |
  |-- GET /imports/:id --->|                         |                      |
  |<-- status: completed --|                         |                      |
```

**Key changes in the flow:**
1. `apply_field_mapping` now returns `phone_data` alongside `voter` dicts
2. Voting history columns are auto-detected and collapsed into the `voting_history` array
3. The upsert now uses `RETURNING` to get voter UUIDs back
4. A second bulk INSERT creates VoterPhone records linked to the returned voter IDs
5. All within the same transaction -- no partial state risk

## Alembic Migration Strategy

### Single Migration File

One migration (`006_voter_model_expansion.py` or next sequence number) that:

1. **Adds columns** to `voters` table (~20 ADD COLUMN statements)
2. **Adds unique index** on VoterPhone for dedup: `(campaign_id, voter_id, value)` UNIQUE
3. **Adds indexes** for new filterable columns: `(campaign_id, turnout_score)`, `(campaign_id, language)`
4. **Updates L2 template** JSONB mapping via `||` merge
5. **No data backfill needed** -- new columns are all nullable, existing rows get NULL

**Migration pattern follows existing conventions:**
- Raw `op.execute()` for RLS-adjacent operations
- `sa.text().bindparams()` for parameterized DML (like L2 template update)
- `op.add_column()` / `op.create_index()` for DDL
- Clean `downgrade()` that drops columns and indexes

**No new tables** -- this is purely additive to the existing schema.

### Index Considerations

Current indexes on voters:
- `ix_voters_campaign_source` (campaign_id, source_type, source_id) UNIQUE
- `ix_voters_campaign_party` (campaign_id, party)
- `ix_voters_campaign_precinct` (campaign_id, precinct)
- `ix_voters_campaign_zip` (campaign_id, zip_code)
- `ix_voters_campaign_last_name` (campaign_id, last_name)
- `ix_voters_geom` GIST index on geom

New indexes to add:
- `ix_voters_campaign_turnout` (campaign_id, turnout_score) -- range queries on score
- `ix_voters_campaign_language` (campaign_id, language) -- exact match filter
- `uq_voter_phones_dedup` UNIQUE (campaign_id, voter_id, value) on voter_phones -- dedup for re-import

Do NOT add indexes for every new column. Propensity score range queries are common in campaign targeting, so index turnout_score. Language is a common demographic filter. Other new columns (religion, education, income, etc.) are low-cardinality or rarely filtered alone -- these can be added later if query performance requires it.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Separate Table for Every Field Group

**What people do:** Create a `voter_propensity_scores` table, a `voter_demographics_extended` table, etc.
**Why it's wrong:** The import pipeline does atomic batch upsert. Every additional table means another INSERT per batch, more joins for read queries, and more complex transaction management. The voter record is the unit of import.
**Do this instead:** Flat columns on the Voter model. They're nullable, they're cheap in PostgreSQL, and they keep the upsert atomic.

### Anti-Pattern 2: Storing Phone Only in VoterPhone

**What people do:** Map phone columns directly to VoterPhone and skip the Voter model entirely.
**Why it's wrong:** The import upsert returns voter IDs AFTER the batch insert. Creating VoterPhone records requires those IDs. If you only store in VoterPhone, you lose the ability to display phone in voter list views without a join, and the import pipeline becomes two-phase with failure modes.
**Do this instead:** Store phone on the Voter model AND create VoterPhone records. The Voter.phone column is for display/convenience; VoterPhone is for phone banking operations.

### Anti-Pattern 3: Parsing Voting History in the Migration

**What people do:** Add a data migration that scans extra_data JSONB for election columns and backfills voting_history.
**Why it's wrong:** Existing data in extra_data may not follow the L2 naming convention. The parsing belongs in the import pipeline where the column names are known from the CSV headers.
**Do this instead:** Parse voting history during import only. Existing voters with election data in extra_data keep it there -- it's accessible but not structured. Future re-imports will populate the voting_history array correctly.

### Anti-Pattern 4: Breaking the Upsert Uniqueness

**What people do:** Add a new unique constraint or change the conflict target for the voter upsert.
**Why it's wrong:** The `(campaign_id, source_type, source_id)` uniqueness is the foundation of idempotent imports. Changing it breaks re-import behavior for all existing data.
**Do this instead:** Keep the existing unique constraint. New columns are simply additional SET targets in the ON CONFLICT DO UPDATE clause. The upsert grows wider but the conflict resolution stays the same.

## Suggested Build Order

Based on dependency analysis:

### Phase 1: Schema + Model (Backend Foundation)

**Why first:** Everything depends on the database columns existing.

1. Alembic migration: ADD columns to voters, ADD VoterPhone dedup index, ADD filter indexes, UPDATE L2 template
2. Voter model: Add new `mapped_column` fields
3. Voter schemas: Add fields to VoterResponse, VoterCreateRequest, VoterUpdateRequest
4. Run migration, verify columns exist

**Dependencies:** None. Pure additive.
**Risk:** Low. All new columns are nullable. Existing data unaffected.

### Phase 2: Import Pipeline Enhancement

**Why second:** Needs the model columns from Phase 1.

1. CANONICAL_FIELDS: Add ~20 new entries with aliases
2. _VOTER_COLUMNS: Add new column names
3. apply_field_mapping: Add phone extraction, voting history parsing
4. process_csv_batch: Add RETURNING clause, VoterPhone bulk insert
5. Update L2 template aliases in suggest_field_mapping (already covered by CANONICAL_FIELDS)

**Dependencies:** Phase 1 (model columns must exist).
**Risk:** Medium. The RETURNING clause change and VoterPhone insertion are the most complex changes. Need to test with real L2 files.

### Phase 3: Filter + Query Enhancement

**Why third:** Needs model columns from Phase 1; independent of Phase 2.

1. VoterFilter schema: Add new filter dimensions
2. build_voter_query: Add new condition handlers
3. Verify filters work with existing AND/OR logic

**Dependencies:** Phase 1 (model columns).
**Risk:** Low. Follows established pattern exactly -- each filter is an independent condition.

### Phase 4: Frontend Updates

**Why last:** Needs API changes from Phases 1-3.

1. TypeScript types: Mirror backend additions
2. ColumnMappingTable: Add new CANONICAL_FIELDS entries
3. VoterDetail: Add new display cards (propensity, mailing, extended demographics)
4. VoterFilterBuilder: Add new filter controls
5. VoterEditSheet: Add new editable fields

**Dependencies:** Phases 1-3 (API must return new fields and accept new filters).
**Risk:** Low. Purely additive UI changes.

## Sources

- Direct codebase analysis of all files listed in Component Analysis
- Existing Alembic migration patterns (001, 002b, 003)
- Existing import pipeline code flow (app/services/import_service.py)
- PostgreSQL INSERT ON CONFLICT RETURNING documentation
- Existing L2 voter file column naming conventions (seeded in migration 002b)

---
*Architecture research for: v1.3 Voter Model & Import Enhancement*
*Researched: 2026-03-13*
