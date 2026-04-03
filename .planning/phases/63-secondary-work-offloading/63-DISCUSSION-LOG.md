# Phase 63: Secondary Work Offloading - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md.

**Date:** 2026-04-03
**Phase:** 63-secondary-work-offloading
**Mode:** Autonomous auto-selection
**Areas discussed:** Critical-path boundary, Secondary work shape, Chunk lifecycle

---

## Critical-path boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Voter upsert only on primary path | Phones and geometry move after the primary commit | ✓ |
| Keep inline geom or phones | Offload only part of the secondary work | |
| Delay offloading to a later phase | Keep current hot path | |

**Auto choice:** Voter upsert only on primary path.

## Secondary work shape

| Option | Description | Selected |
|--------|-------------|----------|
| Two durable post-chunk tasks | Separate phone and geometry tasks consume persisted work manifests | ✓ |
| Re-read CSV in follow-up tasks | Secondary work reconstructs inputs from source rows | |
| One combined follow-up task | Phones and geometry stay coupled out of band | |

**Auto choice:** Two durable post-chunk tasks.

## Chunk lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Chunk stays non-terminal until both secondary tasks finish | Parent fan-in waits for all secondary work | ✓ |
| Mark chunk completed after primary work | Parent may finalize while follow-up tasks still run | |
| Track only parent-level secondary work | Chunk-level durability becomes ambiguous | |

**Auto choice:** Chunk stays non-terminal until both secondary tasks finish.

---

*Audit log only. Decisions live in `63-CONTEXT.md`.*
