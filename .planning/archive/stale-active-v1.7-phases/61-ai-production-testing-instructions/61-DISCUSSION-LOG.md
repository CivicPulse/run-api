# Phase 61: AI Production Testing Instructions - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-30
**Phase:** 61-ai-production-testing-instructions
**Areas discussed:** Target audience & format, Production scope, Auth & data strategy, Environment details

---

## Target Audience & Format

### Who is the primary consumer?

| Option | Description | Selected |
|--------|-------------|----------|
| AI agent only | Optimized for Claude/GPT, machine-parseable, no ambiguity | |
| AI agent + human QA | Dual-purpose: structured for AI, readable for human QA | ✓ |
| Human-first, AI-compatible | Traditional QA runbook, clear enough for AI | |

**User's choice:** AI agent + human QA
**Notes:** None

### What format?

| Option | Description | Selected |
|--------|-------------|----------|
| Markdown runbook | Like existing testing-plan.md — numbered steps, preconditions, expected results | ✓ |
| Structured YAML/JSON | Machine-first format with test IDs as arrays | |
| Markdown with frontmatter | Markdown body + YAML frontmatter per section | |

**User's choice:** Markdown runbook
**Notes:** None

### Relationship to testing-plan.md?

| Option | Description | Selected |
|--------|-------------|----------|
| Reference & delta | References testing-plan.md sections, only documents diffs | |
| Standalone copy | Self-contained, duplicates relevant steps with prod values | ✓ |
| Wrapper with includes | Thin doc listing which sections apply + overrides | |

**User's choice:** Standalone copy
**Notes:** None

### Pass/fail reporting?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline pass/fail log | Structured result table at end: test ID, status, notes | ✓ |
| No reporting guidance | Doc only covers what to test | |
| JSON result schema | Machine-parseable JSON output schema | |

**User's choice:** Inline pass/fail log
**Notes:** None

---

## Production Scope

### Coverage level?

| Option | Description | Selected |
|--------|-------------|----------|
| Critical path subset | ~30-50 curated tests | |
| Full coverage | All 130+ tests mapped to prod | |
| Tiered: smoke + extended | Fast smoke (~15-20) + thorough extended (~50-70) | ✓ |

**User's choice:** Tiered: smoke + extended
**Notes:** None

### Excluded test categories?

| Option | Description | Selected |
|--------|-------------|----------|
| Destructive writes | Delete campaign, org, ownership transfer | |
| Seed/import setup | Seed script and CSV import tests | |
| Accessibility checks | A11Y-01 through A11Y-03 | |
| Offline/field mode | OFFLINE-01 through OFFLINE-03 | |

**User's choice:** None excluded (Other)
**Notes:** "Production isn't in use yet. We need to validate that it's ready." All operations are safe since this is pre-launch validation.

---

## Auth & Data Strategy

### How to handle authentication?

| Option | Description | Selected |
|--------|-------------|----------|
| Same 15 test users | Reuse existing provisioning script with prod config | ✓ |
| Dedicated prod test users | Separate set with different naming | |
| Document both options | Both approaches, future-proof | |

**User's choice:** Same 15 test users
**Notes:** None

### Test data setup?

| Option | Description | Selected |
|--------|-------------|----------|
| Run seed script | Idempotent seed.py against prod DB | |
| Manual data creation via UI | Create all data through UI steps | |
| Seed + UI creation hybrid | Seed for base data, UI for operational data | ✓ |

**User's choice:** Seed + UI creation hybrid
**Notes:** None

### Cleanup/teardown?

| Option | Description | Selected |
|--------|-------------|----------|
| Full teardown | Delete test data, leave prod clean | |
| No cleanup | Leave test data in place | ✓ |
| Optional cleanup section | Include but mark as optional | |

**User's choice:** No cleanup
**Notes:** None

---

## Environment Details

### Production URLs?

| Option | Description | Selected |
|--------|-------------|----------|
| Placeholder variables | ${PROD_URL}, ${ZITADEL_URL} with config section | ✓ |
| Hardcoded URLs | Bake in actual URLs | |
| Environment file reference | Reference .env.production file | |

**User's choice:** Placeholder variables
**Notes:** None

### K8s deployment guide reference?

| Option | Description | Selected |
|--------|-------------|----------|
| Self-contained prereqs | Brief prerequisites without referencing k8s guide | |
| Reference deployment guide | Point to k8s-deployment-guide.md | |
| Include deployment verification | Health-check section before testing | ✓ |

**User's choice:** Include deployment verification
**Notes:** None

### Agent interaction method?

| Option | Description | Selected |
|--------|-------------|----------|
| Browser via Playwright MCP | Sequential browser automation | |
| Mix of API + browser | API for setup, browser for validation | |
| Browser only, manual style | Human-readable UI instructions | |

**User's choice:** Mix of API + Playwright CLI (Other)
**Notes:** "Mix of API + Playwright CLI (not MCP). The Playwright CLI allows for parallel testing."

---

## Claude's Discretion

- Exact test case selection for smoke vs extended tiers
- Health check endpoints and assertions
- Variable naming conventions
- Pass/fail result table structure

## Deferred Ideas

None — discussion stayed within phase scope
