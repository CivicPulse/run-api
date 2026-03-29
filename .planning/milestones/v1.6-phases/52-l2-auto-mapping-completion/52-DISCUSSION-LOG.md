# Phase 52: L2 Auto-Mapping Completion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 52-l2-auto-mapping-completion
**Areas discussed:** Voting history formats, Auto-detect & skip UX, Column coverage gaps, Mapping approach, New Voter model columns, Mapping confidence in API response, Test strategy

---

## Voting History Formats

| Option | Description | Selected |
|--------|-------------|----------|
| Map to General_YYYY | Treat unqualified "Voted in YYYY" as general election. "Voted in YYYY Primary" → Primary_YYYY. | ✓ |
| Map to both General + Primary | Expand into both entries. Maximizes coverage but may overcount. | |
| Keep original format | Store "Voted_in_YYYY" as-is. Preserves fidelity but adds third format. | |

**User's choice:** Map to General_YYYY
**Notes:** Consistent with L2's typical convention where unqualified = general.

### Bare Year Columns

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, bare years → General_YYYY | Column named "2024" with Y/A/E value → General_2024. | ✓ |
| No, only named patterns | Only handle explicit patterns. Bare years go to extra_data. | |

**User's choice:** Yes, bare years → General_YYYY

---

## Auto-detect & Skip UX

### Wizard Behavior on L2 Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Skip to preview/confirm | Auto-apply mapping, jump to preview. Banner + "Back to mapping" link. | |
| Show mapping pre-filled + locked | Show mapping table read-only with L2 mappings. | |
| Show mapping pre-filled + editable | Show mapping table pre-filled but fully editable. | ✓ |

**User's choice:** Show mapping pre-filled + editable
**Notes:** User wants the ability to review and override any mapping.

### Visual Indicator

| Option | Description | Selected |
|--------|-------------|----------|
| Banner + confidence badge | Blue info banner + per-field checkmark/auto badge. | ✓ |
| Banner only | Just the info banner, no per-field indicators. | |
| No indicator | Pre-fill silently. | |

**User's choice:** Banner + confidence badge

### Detection Location

| Option | Description | Selected |
|--------|-------------|----------|
| Backend in detect-columns | Add L2 detection to existing endpoint. Return is_l2 flag. | ✓ |
| Frontend from headers | Client-side L2 detection. | |

**User's choice:** Backend in detect-columns

---

## Column Coverage Gaps

### Reference Source

| Option | Description | Selected |
|--------|-------------|----------|
| Research L2 columns | Let researcher investigate L2 standard headers. | |
| I have a sample file | User provides real L2 CSV for auditing. | ✓ |
| Use existing + fill gaps | Trust existing aliases, add obvious missing ones. | |

**User's choice:** I have a sample file
**Notes:** Two L2 CSV files in data/ folder — example is truncated version of full export.

### Unmapped Columns

| Option | Description | Selected |
|--------|-------------|----------|
| extra_data JSON | Unmapped → extra_data JSONB field. | |
| Silently drop | Don't import unmapped columns. | |
| Add new canonical fields | Add as new Voter model columns. | ✓ |

**User's choice:** Add new canonical fields

### Typo Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit aliases for known typos | Add misspelled forms as aliases. | ✓ |
| Rely on fuzzy matching | Trust 75% RapidFuzz threshold. | |

**User's choice:** Explicit aliases for known typos

---

## Mapping Approach

### Mapping Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Enhanced fuzzy aliases | Add all L2 headers as aliases. One code path for all files. | ✓ |
| Exact match for L2, fuzzy for others | Separate deterministic L2 mapping dict. | |
| L2 system template | Use FieldMappingTemplate with system L2 template. | |

**User's choice:** Enhanced fuzzy aliases

### Detection Heuristic

| Option | Description | Selected |
|--------|-------------|----------|
| 3+ L2-specific headers | Check for 3+ unique L2 headers. | |
| Threshold % of known L2 aliases | >80% of columns match known L2 aliases. | ✓ |
| Exact column count + key headers | 55 columns AND specific headers. | |

**User's choice:** Threshold % of known L2 aliases

---

## New Voter Model Columns

### Mailing Sub-Components

| Option | Description | Selected |
|--------|-------------|----------|
| All as individual columns | Each decomposed part gets its own column. | ✓ |
| Only useful ones | Add mailing_apartment_number only. | |
| Store in extra_data | Keep in JSONB. | |

**User's choice:** All as individual columns

### USPS Codes

| Option | Description | Selected |
|--------|-------------|----------|
| Add as columns | mailing_bar_code and mailing_verifier as Voter columns. | ✓ |
| Store in extra_data | USPS codes in JSONB. | |

**User's choice:** Add as columns

### Registration Address Components

| Option | Description | Selected |
|--------|-------------|----------|
| Both as columns | house_number and street_number_odd_even. | ✓ |
| House number only | Add house_number, odd/even to extra_data. | |
| Both to extra_data | Neither as columns. | |

**User's choice:** Both as columns
**Notes:** Street number parity useful for walk list optimization. House number for sorting.

### Mailing Household Party Registration

| Option | Description | Selected |
|--------|-------------|----------|
| Separate column | New mailing_household_party_registration column. | ✓ |
| Map to existing | Both → household_party_registration. | |

**User's choice:** Separate column

### Mailing Household Size

| Option | Description | Selected |
|--------|-------------|----------|
| Separate column | New mailing_household_size column. | ✓ |
| Map to household_size | Treat as same concept. | |

**User's choice:** Separate column

### Mailing Household Size Mapping

| Option | Description | Selected |
|--------|-------------|----------|
| Mailing Household Size → household_size | Keep existing mapping. Mailing_Families_HHCount → new column. | ✓ |
| Both to mailing_household_size | Both mailing fields to new column. | |

**User's choice:** Mailing Household Size → household_size

---

## Mapping Confidence in API Response

### Format Detection Field

| Option | Description | Selected |
|--------|-------------|----------|
| Add format_detected field | String field: "l2", "generic", null. Extensible. | ✓ |
| Boolean is_l2 flag | Simple but not extensible. | |
| Metadata object | Full detection metadata. Heavier API surface. | |

**User's choice:** Add format_detected field

### Per-Field Confidence

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, match_type per field | {col: {field, match_type: "exact"|"fuzzy"|null}}. | ✓ |
| No, just field names | Keep {col: field_or_null}. | |

**User's choice:** Yes, match_type per field

---

## Test Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Unit + integration tests | Unit: header row → mapping assertion. Integration: full import flow. | ✓ |
| Unit tests only | Hardcoded column lists, no file I/O. | ✓ |
| E2E Playwright test | Upload through wizard UI, verify banner and completion. | ✓ |

**User's choice:** All three — "belt and suspenders"
**Notes:** User wants comprehensive test coverage across all three levels.

---

## Claude's Discretion

- Exact naming of new Voter model columns
- Alembic migration structure
- Frontend component structure for L2 banner and badges
- L2 detection function extraction
- Exact 80% threshold tuning
- Structured logging

## Deferred Ideas

None — discussion stayed within phase scope
