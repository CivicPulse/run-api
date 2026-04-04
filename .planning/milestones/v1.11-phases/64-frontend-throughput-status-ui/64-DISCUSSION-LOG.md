# Phase 64: Frontend Throughput & Status UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md.

**Date:** 2026-04-03
**Phase:** 64-frontend-throughput-status-ui
**Mode:** Autonomous auto-selection
**Areas discussed:** Status handling, Progress metrics, Error-report access

---

## Status handling

| Option | Description | Selected |
|--------|-------------|----------|
| First-class partial-success UI | `completed_with_errors` is terminal and visually distinct | ✓ |
| Reuse completed styling | Treat partial success as plain success | |
| Reuse failed styling | Treat partial success as failure | |

**Auto choice:** First-class partial-success UI.

## Progress metrics

| Option | Description | Selected |
|--------|-------------|----------|
| Client-side derived metrics | Compute throughput and ETA from existing timestamps/counters | ✓ |
| Backend-persisted metrics | Add server-authored throughput/ETA fields | |
| No metrics | Keep percent/counts only | |

**Auto choice:** Client-side derived metrics.

## Error-report access

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated `error_report_url` field | Keep raw key and browser URL separate | ✓ |
| Keep overloading `error_report_key` | Signed URL on detail only, raw key on list | |
| Remove direct history download | Force details page for all downloads | |

**Auto choice:** Dedicated `error_report_url` field.

---

*Audit log only. Decisions live in `64-CONTEXT.md`.*
