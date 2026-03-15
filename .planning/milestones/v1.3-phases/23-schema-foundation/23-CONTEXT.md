# Phase 23: Schema Foundation - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

All new voter data columns exist in the database, the ORM model reflects them, and API schemas serialize/deserialize the expanded fields. Existing registration address fields are renamed with `registration_` prefix for symmetry with new `mailing_` fields. VoterPhone gets a unique constraint for dedup. No import pipeline changes, no filter changes, no frontend changes.

</domain>

<decisions>
## Implementation Decisions

### Mailing address naming
- Use `mailing_` prefix for all mailing address columns: mailing_line1, mailing_line2, mailing_city, mailing_state, mailing_zip, mailing_zip4, mailing_country, mailing_type
- Rename existing registration address fields to `registration_` prefix: address_line1 → registration_line1, address_line2 → registration_line2, city → registration_city, state → registration_state, zip_code → registration_zip, county → registration_county
- Registration address is no longer the "default" — both addresses are explicitly prefixed
- `registration_zip` (not `registration_zip_code`) — symmetric with mailing_zip
- County only exists on registration address (political geography), not mailing

### zip_plus4 and apartment_type
- `registration_zip4` (String(4)) — from VMOD-07 zip_plus4, belongs to registration address
- `registration_apartment_type` (String(20)) — short codes: Apt, Unit, Ste, Lot, Bldg, Rm, Trlr, Fl, Lowr, Uppr, Rear, Frnt, Side, Spc, Dept, Hngr, Ph, Stop
- `mailing_zip4` (String(4)) — from VMOD-02, belongs to mailing address
- No mailing equivalent for apartment_type

### family_id vs household_id
- household_id and family_id are distinct L2 concepts — keep both
- household_id (existing, String(255)) — geographic clustering (same physical address), used by canvassing walk lists
- family_id (new, String(255)) — relational clustering (same family unit, may span addresses)
- household_id keeps its name (no prefix — it's not address-specific)
- household_size as SmallInteger (not Integer) — values always small (1-20 range)
- household_party_registration as String(50)

### Claude's Discretion
- Migration ordering (single vs multiple migrations)
- Index strategy for new columns (which get indexed for Phase 25 filter queries)
- Column ordering within model sections
- Whether to add a registration_zip4 field alongside registration_zip (for symmetry with zip_plus4)

</decisions>

<specifics>
## Specific Ideas

- Full address symmetry: both registration and mailing addresses use explicit prefixes rather than treating registration as default
- apartment_type values are L2 short codes (18 known values), not free text

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- Voter model (`app/models/voter.py`): 30 existing columns, well-organized with section comments
- VoterPhone model (`app/models/voter_contact.py`): needs unique constraint addition
- Voter schemas (`app/schemas/voter.py`): VoterResponse, VoterCreateRequest, VoterUpdateRequest — all need new fields + renames
- 5 existing Alembic migrations in `alembic/versions/`

### Established Patterns
- `native_enum=False` for all StrEnum columns (VARCHAR for migration extensibility)
- `mapped_column(String(N))` for all string fields — no raw `Text` usage
- `ARRAY(String)` for voting_history — array pattern established
- `JSONB` for extra_data — flexible storage for unmapped vendor fields
- `server_default=func.now()` for created_at/updated_at

### Integration Points
- Registration address rename impacts: voter model, voter schemas, voter service, import service (field mapping), canvassing (walk lists use address fields), frontend voter display/edit/filter
- VoterPhone unique constraint impacts: import service upsert logic (Phase 24)
- New columns flow to: VoterResponse (API output), VoterCreateRequest/VoterUpdateRequest (API input), import field mapping (Phase 24), filter builder (Phase 25), frontend (Phase 26)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 23-schema-foundation*
*Context gathered: 2026-03-13*
