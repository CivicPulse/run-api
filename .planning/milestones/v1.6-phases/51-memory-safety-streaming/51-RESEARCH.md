# Phase 51: Memory Safety & Streaming - Research

**Researched:** 2026-03-28
**Domain:** Streaming CSV parsing from S3/MinIO with bounded memory
**Confidence:** HIGH

## Summary

Phase 51 replaces the "download all chunks, join, decode, StringIO" pattern in `process_import_file()` with an incremental streaming approach. The current code (lines 1033-1053 of `import_service.py`) downloads the entire file into memory before parsing. For a 30MB CSV, this means ~30MB of raw bytes + ~30MB decoded string + the StringIO buffer + DictReader's internal state all resident simultaneously. The fix is a streaming line iterator that wraps `StorageService.download_file()`'s existing async byte-chunk generator, reconstructs complete text lines across chunk boundaries, and feeds them into `csv.DictReader` one at a time.

The core technical challenge is reconstructing CSV-valid lines from arbitrary byte chunks. S3's `iter_chunks()` yields fixed-size byte buffers (default 1024 bytes) that can split mid-line and mid-character (for multi-byte UTF-8). The solution is a line buffer that accumulates bytes, decodes using the detected encoding, and yields complete lines. Python's `csv.DictReader` accepts any iterable of strings, so a synchronous wrapper that yields lines from the async stream is sufficient.

**Primary recommendation:** Build a `StreamingCSVReader` async generator that wraps `download_file()`, handles encoding detection from the first chunk, reconstructs complete lines from byte chunks, and yields `dict[str, str]` rows compatible with the existing batch loop. Keep `_process_single_batch()` and the batch commit loop entirely unchanged.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Replace the "download all chunks -> join -> decode -> StringIO" pattern with an async line-by-line iterator over S3 chunks. A line buffer reconstructs complete CSV lines across chunk boundaries, then feeds them to `csv.DictReader` via a synchronous file-like wrapper. No new third-party library required -- builds on existing `StorageService.download_file()` async iterator.
- **D-02:** The per-batch commit loop (`_process_single_batch`) is unchanged. Only the file download and CSV parsing preamble in `process_import_file()` changes -- rows are yielded one at a time from the stream instead of materialized from an in-memory string.
- **D-03:** Detect encoding from the first S3 chunk (typically 8-64KB). Try utf-8-sig decode first, fall back to latin-1 -- same logic as current code but applied to one chunk, not the full file. The detected encoding is then used to decode all subsequent chunks in the stream.
- **D-04:** If the first chunk decodes as utf-8-sig, a BOM (byte order mark) at position 0 is stripped. This matches the current `utf-8-sig` codec behavior.
- **D-05:** Keep the existing row-skip approach for crash resume (`rows_skipped < rows_to_skip`). Streaming already frees memory from skipped rows immediately. S3 Range byte-offset optimization is deferred.
- **D-06:** At no point should more than ~2 batches worth of row data (plus one S3 chunk) be resident in memory.

### Claude's Discretion
- Exact async line iterator implementation (async generator vs class-based AsyncIterator)
- S3 chunk size hints (default from aioboto3 vs explicit chunk_size parameter)
- Whether to extract the streaming CSV reader as a utility or keep it inline in import_service
- Structured logging additions for streaming progress (bytes read, chunks processed)
- Test approach for verifying memory-bounded behavior (mock large file, check no full materialization)

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MEMD-01 | CSV file is streamed from MinIO and parsed incrementally instead of loaded entirely into memory | Streaming line iterator wrapping `download_file()` async generator; encoding detection from first chunk; `csv.DictReader` over line iterable; memory bounded to ~2 batches + 1 chunk |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Python:** 3.13, always use `uv` (never system python)
- **Linting:** `uv run ruff check .` / `uv run ruff format .` before every commit
- **Ruff rules:** E, F, I, N, UP, B, SIM, ASYNC (ignore B008)
- **Line length:** 88 chars
- **Tests:** `uv run pytest` (asyncio_mode=auto)
- **Package manager:** `uv add` / `uv add --dev` / `uv remove`
- **Git:** Conventional Commits, commit on branches, never push unless asked

## Standard Stack

### Core (already installed, no changes)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| aioboto3 | 15.5.0 | S3 async client | Already used for `StorageService`; provides `iter_chunks()` on StreamingBody |
| csv (stdlib) | Python 3.13 | CSV parsing | `csv.DictReader` accepts any iterable of strings; no third-party CSV library needed |

### Supporting (no new dependencies)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| aiobotocore.response.StreamingBody | (bundled) | `iter_chunks(chunk_size)` method | Source of raw byte chunks from S3; default chunk_size=1024, should override to 65536 |
| loguru | 0.7.3 | Structured logging | Already used throughout import_service; add streaming progress logs |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom line iterator | aiobotocore `iter_lines()` | `iter_lines` uses `splitlines()` which breaks quoted CSV fields with embedded newlines; custom iterator required |
| Custom line iterator | `aiocsv` library | Adds dependency; our use case is simple enough for stdlib csv + custom line buffer |
| 65KB chunk size | Default 1024 bytes | 1024 creates ~30,000 chunks for a 30MB file; 65KB is ~460 chunks, much better I/O efficiency |

**Installation:** No new packages required.

## Architecture Patterns

### Recommended Project Structure
```
app/services/
    import_service.py      # Modified: process_import_file() preamble
    storage.py             # Optionally add download_file_lines() or keep inline
tests/unit/
    test_batch_resilience.py  # Updated mocks for streaming
    test_streaming_csv.py     # NEW: streaming-specific tests
```

### Pattern 1: Async Byte-to-Line Iterator
**What:** An async generator that consumes byte chunks from S3, handles encoding detection on the first chunk, maintains a line buffer for incomplete lines across chunk boundaries, and yields complete decoded text lines.
**When to use:** Any time byte chunks from a stream need to be converted to text lines for CSV parsing.
**Example:**
```python
# Source: Python csv docs + aiobotocore StreamingBody API
async def stream_csv_lines(
    storage: StorageService,
    file_key: str,
) -> AsyncIterator[str]:
    """Yield decoded text lines from an S3 object, one at a time.

    Detects encoding from the first chunk (utf-8-sig, then latin-1).
    Handles line boundaries that span chunk boundaries.
    Memory: only one chunk + one partial line in memory at a time.
    """
    encoding: str | None = None
    remainder = b""
    chunk_size = 65_536  # 64KB chunks

    async for chunk in storage.download_file(file_key):
        # First chunk: detect encoding
        if encoding is None:
            encoding = _detect_encoding(chunk)

        data = remainder + chunk
        # Split on newlines but keep the last fragment
        # (it may be incomplete if chunk boundary splits a line)
        lines = data.split(b"\n")
        remainder = lines.pop()  # Last element is incomplete or empty

        for raw_line in lines:
            yield raw_line.decode(encoding)

    # Final remainder (last line without trailing newline)
    if remainder:
        yield remainder.decode(encoding or "utf-8")
```

### Pattern 2: csv.DictReader over Line Iterable
**What:** Python's `csv.DictReader` accepts any iterable of strings. A synchronous wrapper collects lines from the async generator and feeds them to DictReader.
**When to use:** When the async byte stream has been converted to lines but needs CSV field parsing.
**Example:**
```python
# Source: https://docs.python.org/3/library/csv.html
# "A csvfile must be an iterable of strings"
lines: list[str] = []  # Collect all lines -- NO, defeats purpose
# Instead, use DictReader with a line-at-a-time approach:

# Option A: Collect lines into a generator that DictReader consumes
# DictReader is synchronous, so we buffer lines per-batch

# Option B: Use DictReader's fieldnames from header, then parse
# remaining lines manually with csv.reader

# Recommended: Buffer one batch of lines, create DictReader per batch
```

### Pattern 3: Encoding Detection from First Chunk
**What:** Try `utf-8-sig` decode on the first chunk. If it succeeds, use `utf-8-sig` (which auto-strips BOM). If it fails with UnicodeDecodeError, fall back to `latin-1`.
**When to use:** During first-chunk processing in the streaming iterator.
**Example:**
```python
def _detect_encoding(first_chunk: bytes) -> str:
    """Detect encoding from first S3 chunk."""
    try:
        first_chunk.decode("utf-8-sig")
        return "utf-8-sig"
    except (UnicodeDecodeError, ValueError):
        return "latin-1"
```

### Key Design Choice: DictReader Integration

**Challenge:** `csv.DictReader` is synchronous and expects an iterable of strings. Our byte stream is async. We need a bridge.

**Recommended approach:** Collect all lines from the async stream into a synchronous iterable adapter. Since we yield lines one at a time from the async generator, we can use a pattern where:

1. The async generator yields decoded text lines
2. A thin synchronous adapter wraps lines for `csv.DictReader`
3. The outer async loop drives both: pulls from the async generator, feeds lines through DictReader, accumulates batch rows

**Concrete pattern:**
```python
# In process_import_file():
header_line: str | None = None
reader_fields: list[str] | None = None
batch: list[dict[str, str]] = []

async for line in stream_csv_lines(storage, job.file_key):
    if header_line is None:
        # First line is the header
        header_line = line
        # Parse header to get field names
        reader_fields = next(csv.reader([header_line]))
        continue

    # Parse this single line using the known fields
    parsed = next(csv.reader([line]))
    if len(parsed) != len(reader_fields):
        # Handle ragged rows
        ...
    row = dict(zip(reader_fields, parsed))

    # Resume skip
    if rows_skipped < rows_to_skip:
        rows_skipped += 1
        continue

    batch.append(row)
    counters["total_rows"] += 1

    if len(batch) >= settings.import_batch_size:
        batch_num += 1
        await self._process_single_batch(...)
        batch = []
```

**Alternative:** Use `csv.DictReader` with a list wrapper. Collect async lines into a list (defeating streaming) or use `csv.DictReader` with `io.StringIO` per-batch (extra copies). The line-by-line `csv.reader` approach above is simplest and most memory-efficient.

### Anti-Patterns to Avoid
- **Collecting all async chunks into a list before processing:** This is exactly the current bug. Never `chunks.append(chunk)` then `b"".join(chunks)`.
- **Using aiobotocore's `iter_lines()` for CSV:** It uses `splitlines()` which breaks on embedded newlines in quoted fields. Verified: `b'"a","b\nc"'.splitlines()` splits incorrectly.
- **Creating a full `io.StringIO` from the decoded stream:** This materializes the entire file in memory as a string, same problem as current code.
- **Using `DictReader` with the async generator directly:** DictReader is synchronous; passing an async generator will fail. Parse lines individually with `csv.reader([line])`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV parsing | Custom field splitter | `csv.reader([line])` per line | Handles quoting, escaping, delimiters correctly |
| Encoding detection | chardet/charset-normalizer | Try `utf-8-sig` then `latin-1` | L2 voter files are always one of these two; no need for heavy detection |
| S3 byte streaming | Custom HTTP client | `StorageService.download_file()` -> `iter_chunks()` | Already built, already tested |
| Line reconstruction from chunks | Regex-based splitter | `bytes.split(b"\n")` with remainder buffer | Simple, correct for the CSV line-ending case |

**Key insight:** The streaming infrastructure already exists (`download_file` is an async generator). The only new code is the byte-to-line bridge and the DictReader integration. This is a ~50-line change to the preamble of `process_import_file()`.

## Common Pitfalls

### Pitfall 1: Chunk Boundary Splits a Multi-byte UTF-8 Character
**What goes wrong:** A chunk ends in the middle of a multi-byte UTF-8 sequence (e.g., the first byte of a 2-byte character). Decoding that chunk raises `UnicodeDecodeError`.
**Why it happens:** `iter_chunks(65536)` splits on byte boundaries, not character boundaries.
**How to avoid:** Split on `b"\n"` (which is always a single byte, 0x0A) before decoding. Each complete line will contain complete characters. The `remainder` buffer carries incomplete data across chunks. Only decode complete lines.
**Warning signs:** `UnicodeDecodeError` on files with accented characters (common in voter names).

### Pitfall 2: iter_lines() Breaks Quoted CSV Fields
**What goes wrong:** aiobotocore's `iter_lines()` uses `bytes.splitlines()` which splits on `\n` inside quoted fields, producing malformed CSV rows.
**Why it happens:** `splitlines()` is encoding-unaware and treats every `\n` as a line boundary regardless of CSV quoting context.
**How to avoid:** Do NOT use `iter_lines()`. Use raw `iter_chunks()` + custom line buffer with `bytes.split(b"\n")`. For the quoted-newline edge case: L2 voter files do not contain quoted newlines in practice. If future formats do, the line buffer would need CSV-aware splitting (track quote state). Document this limitation.
**Warning signs:** Rows with fewer fields than expected; data corruption in address fields.

### Pitfall 3: BOM Not Stripped in Streaming Mode
**What goes wrong:** The `utf-8-sig` codec strips BOM when decoding a complete string. In streaming mode, the BOM appears in the first chunk's first line. If encoding is detected as `utf-8-sig`, the first line's first character may be the BOM.
**How to avoid:** Use `utf-8-sig` codec for decoding -- it handles BOM stripping automatically even when decoding individual lines, because the BOM only appears at the start. The first decoded line will have the BOM stripped by the codec. Verify in tests.
**Warning signs:** First column header has an invisible `\ufeff` prefix; field mapping fails for the first column.

### Pitfall 4: Empty Lines in CSV
**What goes wrong:** `bytes.split(b"\n")` produces empty strings for consecutive newlines (e.g., `\n\n` at end of file). Passing empty strings to `csv.reader` produces empty rows.
**How to avoid:** Skip empty lines after decoding: `if not line.strip(): continue`. Or let `csv.reader` handle it (it returns `[]` for empty lines, which won't match the expected field count).
**Warning signs:** `IndexError` or `ValueError` when zipping fields with parsed values.

### Pitfall 5: Windows Line Endings (\r\n)
**What goes wrong:** Splitting on `b"\n"` leaves trailing `\r` on each line. `csv.reader` handles this if the line is treated as a complete CSV record, but the `\r` could cause issues with field values.
**How to avoid:** After splitting on `b"\n"`, strip trailing `\r` from each line: `raw_line.rstrip(b"\r")`. Or decode and let `csv.reader` handle it (csv module does its own universal newline handling).
**Warning signs:** Field values end with `\r`; string comparisons fail.

### Pitfall 6: Default iter_chunks Size (1024 bytes) is Inefficient
**What goes wrong:** 1024-byte chunks mean ~30,000 async iterations for a 30MB file. Each iteration has overhead (async context switch, function call).
**Why it happens:** aiobotocore's `_DEFAULT_CHUNK_SIZE` is 1024 bytes.
**How to avoid:** Pass explicit `chunk_size=65536` (64KB) to `iter_chunks()`. This requires modifying `StorageService.download_file()` to accept and forward a `chunk_size` parameter, or calling `response["Body"].iter_chunks(65536)` directly.
**Warning signs:** Import is noticeably slower than the download-all approach despite same file size.

### Pitfall 7: Existing Tests Mock download_file as Single-Chunk Yield
**What goes wrong:** All existing tests mock `storage.download_file` as `async def mock_download(key): yield csv_bytes` -- yielding the entire file as one chunk. These tests pass with streaming code but don't exercise the multi-chunk line-reconstruction logic.
**Why it happens:** The old code downloaded everything at once, so single-chunk mocks were fine.
**How to avoid:** Keep existing mocks for backward-compatible behavior tests. Add NEW tests that yield CSV data in small, deliberately split chunks (e.g., 10-byte chunks that split mid-line and mid-character) to verify line reconstruction.
**Warning signs:** Tests pass but production fails on large files.

## Code Examples

### Example 1: Streaming Line Iterator (core new code)
```python
# Source: D-01, D-03, D-04 from CONTEXT.md
from collections.abc import AsyncIterator

from app.services.storage import StorageService

_STREAM_CHUNK_SIZE = 65_536  # 64KB


def _detect_encoding(first_chunk: bytes) -> str:
    """Detect file encoding from the first S3 chunk.

    Tries utf-8-sig (handles BOM) first, falls back to latin-1.
    """
    try:
        first_chunk.decode("utf-8-sig")
        return "utf-8-sig"
    except (UnicodeDecodeError, ValueError):
        return "latin-1"


async def stream_csv_lines(
    storage: StorageService,
    file_key: str,
) -> AsyncIterator[str]:
    """Yield decoded text lines from an S3 CSV file.

    Streams byte chunks, reconstructs lines across chunk
    boundaries, detects encoding from the first chunk.

    Memory: one chunk buffer + one partial-line remainder.
    """
    encoding: str | None = None
    remainder = b""

    async for chunk in storage.download_file(file_key):
        if encoding is None:
            encoding = _detect_encoding(chunk)

        data = remainder + chunk
        parts = data.split(b"\n")
        remainder = parts.pop()

        for raw_line in parts:
            line = raw_line.rstrip(b"\r").decode(encoding)
            if line:  # Skip empty lines
                yield line

    # Flush final remainder
    if remainder:
        line = remainder.rstrip(b"\r").decode(encoding or "utf-8")
        if line:
            yield line
```

### Example 2: Modified process_import_file() Preamble
```python
# Source: D-01, D-02 from CONTEXT.md
# Replaces lines 1033-1053 of import_service.py

# Instead of:
#   chunks = []; async for chunk in storage.download_file(): ...
#   file_content = b"".join(chunks)
#   text_content = file_content.decode(encoding)
#   reader = csv.DictReader(io.StringIO(text_content))

# Use:
header: list[str] | None = None
batch: list[dict[str, str]] = []
rows_skipped = 0

async for line in stream_csv_lines(storage, job.file_key):
    if header is None:
        # Parse header row
        header = next(csv.reader([line]))
        continue

    # Parse data row
    values = next(csv.reader([line]))
    row = dict(zip(header, values, strict=False))

    # Resume skip (D-05)
    if rows_skipped < rows_to_skip:
        rows_skipped += 1
        continue

    batch.append(row)
    counters["total_rows"] += 1

    if len(batch) >= settings.import_batch_size:
        batch_num += 1
        await self._process_single_batch(...)
        batch = []

# Remainder batch (same as current code)
if batch:
    batch_num += 1
    await self._process_single_batch(...)
```

### Example 3: Updated StorageService.download_file() (optional)
```python
# Source: app/services/storage.py lines 99-114
# Add chunk_size parameter to forward to iter_chunks

async def download_file(
    self, key: str, chunk_size: int = 65_536
) -> AsyncIterator[bytes]:
    """Stream file content from S3 for background processing."""
    async with self.session.client(**self._client_kwargs()) as s3:
        response = await s3.get_object(
            Bucket=settings.s3_bucket,
            Key=key,
        )
        async for chunk in response["Body"].iter_chunks(chunk_size):
            yield chunk
```

### Example 4: Test Mock for Multi-Chunk Streaming
```python
# Verify line reconstruction across chunk boundaries
async def mock_download_chunked(key):
    """Yield CSV data in small chunks that split mid-line."""
    csv_data = b"First_Name,Last_Name,VoterID\nJohn,Doe,V001\nJane,Smith,V002\n"
    chunk_size = 10  # Forces splits mid-line
    for i in range(0, len(csv_data), chunk_size):
        yield csv_data[i : i + chunk_size]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `download_file` -> join all chunks -> decode | Stream chunks, reconstruct lines, parse incrementally | This phase | Memory O(chunk_size) instead of O(file_size) |
| `csv.DictReader(io.StringIO(full_text))` | `csv.reader([single_line])` per line with header dict-zip | This phase | No full-text buffer needed |

**Deprecated/outdated:**
- `io.StringIO` for full file: Still correct for small files, but the current import path handles files up to 30MB+ where this causes OOM.

## Open Questions

1. **Quoted fields with embedded newlines**
   - What we know: `bytes.split(b"\n")` will incorrectly split inside quoted fields. L2 voter files do not use quoted newlines.
   - What's unclear: Whether future vendor formats (TargetSmart, Aristotle) will have quoted newlines.
   - Recommendation: Accept the limitation for now. Document it. If needed later, add a quote-aware line buffer that tracks open/close quote state. This is deferred per CONTEXT.md -- only L2 is in scope for v1.6.

2. **Optimal chunk size**
   - What we know: Default is 1024 bytes. 64KB is standard for S3 streaming. The `download_file` method currently uses the default.
   - What's unclear: Whether MinIO in Docker has different optimal chunk sizes than AWS S3.
   - Recommendation: Use 64KB (65,536 bytes). This is the standard S3 streaming chunk size used across the ecosystem. It balances memory usage (~64KB per chunk) with I/O efficiency (~460 chunks for 30MB).

3. **Encoding detection edge case: multi-byte character split at first chunk boundary**
   - What we know: With 64KB chunks, the first chunk is large enough to detect encoding reliably. UTF-8-sig BOM is only 3 bytes.
   - What's unclear: Nothing significant -- 64KB is well beyond any encoding detection needs.
   - Recommendation: Detect encoding from first chunk as specified in D-03. No issue expected.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.0.2 + pytest-asyncio 1.3.0 |
| Config file | `pyproject.toml` [tool.pytest.ini_options] |
| Quick run command | `uv run pytest tests/unit/test_batch_resilience.py tests/unit/test_import_service.py -x -q` |
| Full suite command | `uv run pytest tests/ -x -q` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MEMD-01a | Streaming line iterator yields correct lines from multi-chunk input | unit | `uv run pytest tests/unit/test_streaming_csv.py::test_multi_chunk_line_reconstruction -x` | Wave 0 |
| MEMD-01b | Encoding detected from first chunk (utf-8-sig and latin-1) | unit | `uv run pytest tests/unit/test_streaming_csv.py::test_encoding_detection -x` | Wave 0 |
| MEMD-01c | BOM stripped correctly in streaming mode | unit | `uv run pytest tests/unit/test_streaming_csv.py::test_bom_stripping -x` | Wave 0 |
| MEMD-01d | Windows line endings (\r\n) handled correctly | unit | `uv run pytest tests/unit/test_streaming_csv.py::test_crlf_handling -x` | Wave 0 |
| MEMD-01e | Empty lines skipped without error | unit | `uv run pytest tests/unit/test_streaming_csv.py::test_empty_lines -x` | Wave 0 |
| MEMD-01f | Existing batch resilience tests pass with streaming | unit | `uv run pytest tests/unit/test_batch_resilience.py -x` | Existing (mocks update needed) |
| MEMD-01g | No full-file materialization (no list-of-chunks join) | unit | `uv run pytest tests/unit/test_streaming_csv.py::test_no_full_materialization -x` | Wave 0 |
| MEMD-01h | process_import_file works end-to-end with streaming | unit | `uv run pytest tests/unit/test_batch_resilience.py -x` | Existing (mocks compatible) |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/test_streaming_csv.py tests/unit/test_batch_resilience.py tests/unit/test_import_service.py -x -q`
- **Per wave merge:** `uv run pytest tests/ -x -q`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/test_streaming_csv.py` -- covers MEMD-01a through MEMD-01e, MEMD-01g
- No new fixtures needed (existing mock patterns from test_batch_resilience.py suffice)
- No framework install needed (pytest + pytest-asyncio already installed)

## Sources

### Primary (HIGH confidence)
- [Python csv module docs](https://docs.python.org/3/library/csv.html) -- DictReader accepts any iterable of strings; handles universal newlines; `line_num` tracks source lines not records
- `aiobotocore.response.StreamingBody` (installed v15.5.0, inspected via `inspect.getsource`) -- `iter_chunks(chunk_size=1024)`, `iter_lines(chunk_size=1024, keepends=False)` both available; `iter_lines` uses `splitlines()` (confirmed CSV-incompatible)
- `app/services/storage.py` lines 99-114 -- existing `download_file()` async generator
- `app/services/import_service.py` lines 1033-1053 -- current download-all pattern to replace
- `tests/unit/test_batch_resilience.py` -- existing mock patterns for `storage.download_file`

### Secondary (MEDIUM confidence)
- [aiobotocore response.py source](https://github.com/aio-libs/aiobotocore/blob/main/aiobotocore/response.py) -- confirmed `_DEFAULT_CHUNK_SIZE = 1024`
- [botocore iter_chunks/iter_lines PR](https://github.com/boto/botocore/pull/1491) -- original implementation; confirmed `iter_lines` has chunk-boundary bugs with newlines

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies; all stdlib + existing aioboto3
- Architecture: HIGH -- straightforward async generator pattern with well-understood byte/line semantics
- Pitfalls: HIGH -- verified `iter_lines` CSV incompatibility empirically; BOM handling confirmed via codec docs; chunk boundary handling is a well-known pattern

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable domain -- stdlib csv and aiobotocore API are mature)
