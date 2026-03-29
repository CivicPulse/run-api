# Phase 51: Memory Safety & Streaming - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 51-memory-safety-streaming
**Areas discussed:** Streaming approach, Encoding detection, Resume strategy
**Mode:** Auto (all decisions auto-selected)

---

## Streaming Approach

| Option | Description | Selected |
|--------|-------------|----------|
| Async line buffer over S3 chunks | No new library, reconstructs lines across chunk boundaries, wraps for csv.DictReader | ✓ |
| aiocsv library | Third-party async CSV parser | |
| codecs.StreamReader wrapper | Standard library codec streaming | |

**User's choice:** [auto] Async line buffer over S3 chunks (recommended default)
**Notes:** Builds on existing `download_file()` async iterator. No new dependencies. Line buffer handles chunk boundary splits naturally.

---

## Encoding Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Sniff from first chunk | Try utf-8-sig then latin-1 on first chunk, use for full stream | ✓ |
| Require UTF-8 only | Reject non-UTF-8 files | |
| chardet on header chunk | Use chardet library for detection | |

**User's choice:** [auto] Sniff from first chunk (recommended default)
**Notes:** Matches current behavior with bounded memory. First chunk is typically 8-64KB — more than enough for reliable encoding detection.

---

## Resume Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Keep row-skip approach | Stream and skip, memory freed immediately | ✓ |
| S3 Range byte-offset | Track byte position per batch, skip via HTTP Range header | |

**User's choice:** [auto] Keep row-skip approach (recommended default)
**Notes:** Streaming means skipped rows aren't accumulated in memory. S3 Range adds byte-position tracking complexity for marginal benefit. Row skip runs once per resume.

---

## Claude's Discretion

- Exact async line iterator implementation pattern
- S3 chunk size configuration
- Whether to extract streaming reader as utility or keep inline
- Structured logging for streaming progress
- Test approach for memory-bounded verification

## Deferred Ideas

None — discussion stayed within phase scope
