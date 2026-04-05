---
phase: 76-reliability-backend-infrastructure
plan: 04
subsystem: backend-api
tags: [security, uploads, dnc, imports, hardening]
requires: [76-01]
provides:
  - "bulk_import_dnc with 10MB size cap enforced via Content-Length and stream byte-cap"
  - "initiate_import with _sanitize_filename helper applied before S3 key composition"
affects:
  - app/api/v1/dnc.py
  - app/api/v1/imports.py
tech-stack:
  added: []
  patterns: ["streaming byte-count cap", "allowlist filename sanitization"]
key-files:
  created: []
  modified:
    - app/api/v1/dnc.py
    - app/api/v1/imports.py
decisions:
  - "10MB DNC CSV cap enforced via BOTH Content-Length header AND streaming byte-count (neither alone trusted)"
  - "Filename sanitization uses allowlist regex [A-Za-z0-9._-] with '-' replacement and UUID prefix"
  - "Stream chunks at 64KB to balance memory and syscall overhead"
metrics:
  duration: "~5 min"
  completed: "2026-04-05"
  tasks: 2
  tests_passing: 18
requirements: [REL-09, REL-10]
---

# Phase 76 Plan 04: DNC Upload Cap + Import Filename Sanitization Summary

**One-liner:** Closes H1/H2 HIGH-severity upload gaps — 10MB cap on DNC CSV bulk-import (Content-Length + streamed byte-cap) and allowlist-based filename sanitization with UUID prefix before S3 key composition.

## What Shipped

### Task 1: DNC 10MB Cap (REL-09 / H1) — commit `a0a4fef`

Added `MAX_DNC_CSV_BYTES = 10 * 1024 * 1024` constant. In `bulk_import_dnc`:

1. **Content-Length pre-check** — reject >10MB declared size with 413 before reading any body bytes.
2. **Streaming byte-cap** — read in 64KB chunks, track running total, return 413 if cumulative bytes exceed cap (defends against missing/falsified Content-Length).

```python
content_length_header = request.headers.get("content-length")
if content_length_header is not None:
    try:
        declared = int(content_length_header)
    except ValueError:
        declared = 0
    if declared > MAX_DNC_CSV_BYTES:
        return problem.ProblemResponse(
            status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            title="CSV Upload Too Large",
            detail=f"DNC CSV upload exceeds {MAX_DNC_CSV_BYTES} byte limit",
            type="dnc-csv-too-large",
        )

chunks: list[bytes] = []
total = 0
while True:
    chunk = await file.read(64 * 1024)
    if not chunk:
        break
    total += len(chunk)
    if total > MAX_DNC_CSV_BYTES:
        return problem.ProblemResponse(...)
    chunks.append(chunk)
content = b"".join(chunks)
```

### Task 2: Import Filename Sanitization (REL-10 / H2) — commit `3516900`

Added `_sanitize_filename(name) -> str` helper:

```python
_SAFE_FILENAME_RE = _re.compile(r"[^A-Za-z0-9._-]+")
_MAX_FILENAME_LEN = 120

def _sanitize_filename(name: str) -> str:
    base = name.replace("\\", "/").rsplit("/", 1)[-1]
    base = base.replace("\x00", "").strip()
    while base.startswith("."):
        base = base[1:]
    safe = _SAFE_FILENAME_RE.sub("-", base).strip("-._")
    if not safe:
        safe = "file"
    return safe[:_MAX_FILENAME_LEN]
```

`initiate_import` now composes keys as `imports/{campaign_id}/{job_id}/{uuid}-{safe-basename}`.

**Example transformations:**

| Input                          | Output                         |
| ------------------------------ | ------------------------------ |
| `../../../etc/passwd`          | `passwd`                       |
| `foo\x00.csv`                  | `foo.csv`                      |
| `C:\Windows\evil.csv`          | `evil.csv`                     |
| `voters.csv`                   | `voters.csv`                   |
| `` (empty) / all-invalid       | `file`                         |

Each result is then prefixed with `{uuid}-` in the S3 key.

## Tests

- `tests/unit/test_dnc_upload_size_limit.py` — 2/2 passing (was 1 fail + 1 pass)
- `tests/unit/test_import_filename_sanitize.py` — 4/4 passing (was 4 fail)
- `tests/unit/test_dnc.py` — 9/9 passing (regression guard)
- `tests/unit/test_import_upload.py` — 3/3 passing (regression guard)

**Total: 18 passing, 0 failing.**

## Deviations from Plan

None — plan executed exactly as written.

## Success Criteria

- [x] DNC bulk-import rejects >10MB uploads with 413
- [x] Enforced via both Content-Length header AND stream byte-cap
- [x] Import filenames sanitized and UUID-prefixed before S3 key composition
- [x] Wave 0 upload-safety tests flipped from failing to passing
- [x] No regression in existing DNC or import upload tests
- [x] Ruff clean on changed lines (pre-existing E501 at imports.py:76 out of scope)

## Self-Check: PASSED

- FOUND: app/api/v1/dnc.py (MAX_DNC_CSV_BYTES, streaming cap)
- FOUND: app/api/v1/imports.py (_sanitize_filename, uuid prefix)
- FOUND: commit a0a4fef
- FOUND: commit 3516900
- FOUND: 18/18 target tests passing
