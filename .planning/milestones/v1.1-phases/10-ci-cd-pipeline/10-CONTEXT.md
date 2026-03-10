# Phase 10: CI/CD Pipeline - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

GitHub Actions CI/CD pipeline for automated image publishing. Two workflows: a PR validation workflow (quality gates) and a main/tag publish workflow (build, push to GHCR, update K8s manifest). Creates a stub `k8s/deployment.yaml` for the auto-update mechanism. Full K8s manifests are Phase 11.

</domain>

<decisions>
## Implementation Decisions

### Workflow triggers & branching
- Two separate workflow files: PR validation and main publish
- PR workflow triggers on pull requests to main — runs full quality gates (lint, test, frontend, docker build)
- Publish workflow triggers on pushes to main AND version tags (v*)
- Publish workflow does NOT re-run quality gates — trusts that PR validation already passed

### Image tagging strategy
- Full SHA tags: `sha-<full 40-char commit hash>` (not short SHA)
- Every main push produces: `sha-<full>` + `latest`
- Version tag pushes (v*) produce: `sha-<full>` + `v1.1.0` (the tag) + `latest`
- Build args auto-populated from GitHub Actions context: `--build-arg GIT_SHA=${{ github.sha }}` and `--build-arg BUILD_TIMESTAMP=<UTC ISO>`
- Registry: `ghcr.io/civicpulse/run-api`

### K8s manifest auto-update
- Publish workflow updates `k8s/deployment.yaml` with new image SHA after successful push
- Uses `sed` replacement on the image line (not yq) — simple pattern: `s|image: ghcr.io/civicpulse/run-api:.*|image: ghcr.io/civicpulse/run-api:sha-<full>|`
- Commits back using built-in `GITHUB_TOKEN` with `github-actions[bot]` identity — commits from GITHUB_TOKEN don't re-trigger workflows, preventing infinite loops
- Auto-commit happens on every main push (no change-detection gating)
- Phase 10 creates a stub `k8s/deployment.yaml` with just enough structure for sed to update the image line — Phase 11 fills in the full manifest

### Quality gates (PR workflow)
- Python linting and format checking: Ruff (lint + format check) — single tool, configured in pyproject.toml
- No type checking (mypy/pyright) — 56K+ LOC codebase not built with strict typing, would surface too many issues
- Unit tests only: run pytest excluding integration tests (those needing DB/ZITADEL/MinIO) via marker like `@pytest.mark.integration`
- Frontend validation: `npm ci` + `npm run lint` + `npm run build` — catches TypeScript/ESLint errors with clearer messages than Docker build failure
- Docker build validation: build the image (no push) to verify Dockerfile integrity

### Claude's Discretion
- Exact workflow YAML structure and job naming
- GitHub Actions runner version (ubuntu-latest vs pinned)
- Docker layer caching strategy (actions/cache or docker/build-push-action cache)
- Ruff rule selection and configuration in pyproject.toml
- pytest marker setup for integration test exclusion
- Exact stub deployment.yaml structure (minimal valid YAML for sed target)
- Commit message format for auto-update commits

</decisions>

<specifics>
## Specific Ideas

- Follows "contact-api" pattern referenced throughout project docs for GHCR publishing and SHA tagging
- Health endpoint (`/health/live`, `/health/ready`) already includes GIT_SHA and BUILD_TIMESTAMP from Phase 8 — CI populates these so deployed containers show real build info
- Same Dockerfile from Phase 8 used for both CI builds and local Docker Compose (Phase 9)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Dockerfile`: Multi-stage build (node:22-slim → python:3.13-slim → python:3.13-slim runtime) with GIT_SHA/BUILD_TIMESTAMP build args already defined
- `pyproject.toml`: Existing project config — Ruff config can be added here
- `.env.example`: Documents all env vars — CI needs subset for test runs

### Established Patterns
- `uv` for Python dependency management — CI should use `uv sync` for fast installs
- `npm ci` for deterministic frontend installs (lockfile exists)
- `python -m uvicorn` invocation pattern (not bare uvicorn) per Phase 8 decision
- Three-stage Docker build already optimized for layer caching (deps before source code)

### Integration Points
- Phase 8 Dockerfile: built by both workflows (PR validates, main publishes)
- Phase 11 K8s: `k8s/deployment.yaml` stub created here, full manifest in Phase 11
- ArgoCD (Phase 11): watches `k8s/` directory — auto-commit here triggers ArgoCD sync
- GHCR: `ghcr.io/civicpulse/run-api` — GitHub org is `CivicPulse`

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-ci-cd-pipeline*
*Context gathered: 2026-03-10*
