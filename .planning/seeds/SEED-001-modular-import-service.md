---
id: SEED-001
status: dormant
planted: 2026-03-29
planted_during: v1.6 Imports (post-milestone verification)
trigger_when: new import formats, next imports milestone, performance work
scope: Medium
---

# SEED-001: Refactor import_service.py into modular format

## Why This Matters

import_service.py is 1,342 lines — 2x the next largest service. 380 lines of static
CANONICAL_FIELDS data obscures the actual import logic. The streaming CSV infrastructure
is generic but trapped inside an import-specific module. Currently navigable by someone
who built it, but hard for newcomers. More critically, adding new import formats (beyond
L2/generic CSV) would compound the monolith. A modular split enables pluggable format
support and clearer separation of concerns.

## When to Surface

**Trigger:** New import formats, next imports milestone, performance work

This seed should be presented during `/gsd:new-milestone` when the milestone
scope matches any of these conditions:
- Adding support for new voter file formats (e.g., TargetSmart, Aristotle, state-specific)
- Any milestone that modifies or extends the import pipeline
- Performance optimization work on large file handling or streaming

## Scope Estimate

**Medium** — A phase or two with planning. Three natural extraction targets:

1. **CANONICAL_FIELDS** (380 lines) -> `app/services/field_mappings.py` or a YAML/JSON config
2. **Streaming CSV utilities** (`stream_csv_lines`, `_detect_encoding`, `_STREAM_CHUNK_SIZE`) -> `app/utils/csv_streaming.py`
3. **Format-specific helpers** (`normalize_party`, `parse_propensity`, `parse_voting_history`, `suggest_field_mapping`, `detect_l2_format`) -> `app/services/import_formats/l2.py`

The ImportService class itself (610 lines) is the right size and likely stays in place.

## Breadcrumbs

Related code and decisions found in the current codebase:

**Core file:**
- `app/services/import_service.py` (1,342 lines) — the monolith

**Direct consumers:**
- `app/tasks/import_task.py` — Procrastinate task, calls ImportService
- `app/api/v1/imports.py` — API endpoints, instantiates ImportService

**Test files (14 total, all must stay green):**
- `tests/unit/test_import_service.py`
- `tests/unit/test_import_parsing.py`
- `tests/unit/test_import_task.py`
- `tests/unit/test_import_cancel.py`
- `tests/unit/test_batch_resilience.py`
- `tests/unit/test_streaming_csv.py`
- `tests/unit/test_field_mapping.py`
- `tests/unit/test_l2_mapping.py`
- `tests/unit/test_l2_detection.py`
- `tests/unit/test_voting_history_l2.py`
- `tests/integration/test_l2_import.py`

**Analysis context:**
- Analysis performed post-v1.6 milestone verification (87/87 UAT tests pass)
- 610/610 Python unit tests pass, codebase is stable
- No urgency — refactor is preventive, not corrective

## Notes

The file grew organically across v1.6 phases 49-55 as features were added:
- Phase 49: Procrastinate integration
- Phase 50: Batch commits, error storage, merge logic
- Phase 51: Streaming CSV, encoding detection
- Phase 52: L2 auto-mapping, CANONICAL_FIELDS, voting history parsing
- Phase 53: Cancellation detection in batch loop

Each addition was cohesive within the import domain but the aggregate is now large enough
to warrant modular extraction when the next opportunity arises.
