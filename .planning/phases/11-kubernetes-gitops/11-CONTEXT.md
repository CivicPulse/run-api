# Phase 11: Kubernetes & GitOps - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Complete K8s manifests and ArgoCD application config so the API can be deployed to a baremetal cluster. Includes Deployment (with init container for migrations), ClusterIP Service, Traefik IngressRoute, Secret/ConfigMap templates, and ArgoCD Application manifest. Actual cluster deployment is out of scope — manifests only.

</domain>

<decisions>
## Implementation Decisions

### Ingress & routing
- Domain: `run.civpulse.org`
- Cloudflare proxy handles TLS termination (already configured on the cluster)
- Traefik IngressRoute uses `web` entrypoint (HTTP) — Cloudflare connects to origin on port 80
- No TLS config needed in the IngressRoute itself

### Secret management
- Split into ConfigMap (non-sensitive) and Secret (credentials)
- ConfigMap (`run-api-config`): APP_NAME, DEBUG, CORS_ALLOWED_ORIGINS
- Secret (`run-api-secret`): DATABASE_URL, DATABASE_URL_SYNC, ZITADEL_ISSUER, ZITADEL_PROJECT_ID, ZITADEL_SERVICE_CLIENT_ID, ZITADEL_SERVICE_CLIENT_SECRET, S3_ENDPOINT_URL, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET, S3_REGION
- Secret template YAML includes both placeholder values AND documented `kubectl create secret` commands in comments
- Deployment uses `envFrom` referencing both ConfigMap and Secret

### ArgoCD configuration
- Application name: `run-api-dev`
- Project: `default` (matches existing voter-api-dev and contact-api apps)
- Auto-sync enabled with self-heal and pruning (true GitOps)
- Source: `k8s/` directory in the repo
- Destination: `run-api` namespace on the cluster

### Resource limits & replicas
- 1 replica (dev deployment, matches WORKERS=1 default)
- Conservative resource requests/limits included (requests: 128Mi/100m, limits: 512Mi/500m)
- No HPA or PodDisruptionBudget — add when scaling for production

### Deployment configuration (carried from Phase 8)
- Init container runs `alembic upgrade head` from the same image (different CMD)
- Liveness probe: `GET /health/live`
- Readiness probe: `GET /health/ready` (includes DB connectivity check)
- Container port: 8000
- Non-root `app` user (baked into the image)
- Image: `ghcr.io/civicpulse/run-api` with SHA tags (CI auto-updates deployment.yaml)

### Claude's Discretion
- Exact resource request/limit values (128Mi/100m and 512Mi/500m are starting points — tune as needed)
- Probe timing (initialDelaySeconds, periodSeconds, failureThreshold)
- Init container resource limits
- Manifest file organization within k8s/ directory
- ConfigMap values for APP_NAME and CORS_ALLOWED_ORIGINS

</decisions>

<specifics>
## Specific Ideas

- Follows the pattern established by existing cluster apps: voter-api-dev and contact-api
- ArgoCD Application in `default` project, consistent with existing apps
- CI pipeline (Phase 10) auto-commits image SHA updates to `k8s/deployment.yaml` → ArgoCD auto-syncs → zero-touch deploys
- Secret template serves as deployment documentation — includes both YAML and kubectl commands so operators can choose their preferred approach

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `k8s/deployment.yaml`: Stub already exists from Phase 10 with correct namespace (`run-api`), labels, and image line for CI sed replacement
- `Dockerfile`: Multi-stage build with Alembic files included — ready for init container pattern with CMD override
- `app/api/health.py`: `/health/live` and `/health/ready` endpoints with DB check and build info
- `.env.example`: Documents all 13+ env vars — source of truth for Secret/ConfigMap keys

### Established Patterns
- Phase 10 CI uses `sed` to replace image line in `k8s/deployment.yaml` — new manifest must preserve this pattern
- Image tagged as `ghcr.io/civicpulse/run-api:sha-<full-commit-hash>`
- `python -m uvicorn` invocation (not bare uvicorn) per Phase 8 decision
- pydantic-settings loads from env vars natively — envFrom in K8s works directly

### Integration Points
- CI publish workflow (`.github/workflows/publish.yml`) auto-updates `k8s/deployment.yaml` image line
- ArgoCD watches `k8s/` directory — any committed change triggers sync
- Traefik IngressRoute CRD must be available on the cluster (assumed present for baremetal setup)
- Namespace `run-api` referenced in stub deployment.yaml — all manifests use this namespace

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-kubernetes-gitops*
*Context gathered: 2026-03-10*
