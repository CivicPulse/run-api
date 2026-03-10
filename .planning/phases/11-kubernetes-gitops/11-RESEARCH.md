# Phase 11: Kubernetes & GitOps - Research

**Researched:** 2026-03-10
**Domain:** Kubernetes manifests, Traefik IngressRoute, ArgoCD Application
**Confidence:** HIGH

## Summary

Phase 11 produces static Kubernetes YAML manifests (no Helm, no Kustomize) for deploying the run-api to a baremetal cluster. The scope is manifests only -- no actual cluster deployment. All decisions are locked from the CONTEXT.md discussion: Traefik IngressRoute with Cloudflare TLS termination, ArgoCD auto-sync, envFrom for config/secrets, init container for Alembic migrations.

The existing `k8s/deployment.yaml` stub from Phase 10 must be expanded in-place (CI sed replacement targets the `image:` line). Additional manifests (Service, IngressRoute, Secret template, ConfigMap, ArgoCD Application) are new files in `k8s/`. The CI pipeline already auto-commits image SHA updates to `k8s/deployment.yaml`, and ArgoCD watches the `k8s/` directory -- so the GitOps loop is already wired; this phase just needs to produce the manifests.

**Primary recommendation:** Create 5-6 manifest files in `k8s/`, expanding the existing deployment stub and adding service, ingress, config, secret template, and ArgoCD application manifests. All values are locked from CONTEXT.md -- this is a straightforward YAML authoring phase.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Domain: `run.civpulse.org`
- Cloudflare proxy handles TLS termination; Traefik IngressRoute uses `web` entrypoint (HTTP port 80)
- ConfigMap (`run-api-config`): APP_NAME, DEBUG, CORS_ALLOWED_ORIGINS
- Secret (`run-api-secret`): DATABASE_URL, DATABASE_URL_SYNC, ZITADEL_ISSUER, ZITADEL_PROJECT_ID, ZITADEL_SERVICE_CLIENT_ID, ZITADEL_SERVICE_CLIENT_SECRET, S3_ENDPOINT_URL, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET, S3_REGION
- Secret template includes both placeholder YAML and documented `kubectl create secret` commands
- Deployment uses `envFrom` referencing both ConfigMap and Secret
- ArgoCD Application name: `run-api-dev`, project: `default`, auto-sync with self-heal and pruning
- Source: `k8s/` directory; destination: `run-api` namespace
- 1 replica, resource requests 128Mi/100m, limits 512Mi/500m
- Init container runs `alembic upgrade head` from same image
- Liveness: `GET /health/live`; Readiness: `GET /health/ready`
- Container port 8000; non-root `app` user; image `ghcr.io/civicpulse/run-api` with SHA tags

### Claude's Discretion
- Exact resource request/limit values (128Mi/100m and 512Mi/500m are starting points)
- Probe timing (initialDelaySeconds, periodSeconds, failureThreshold)
- Init container resource limits
- Manifest file organization within k8s/ directory
- ConfigMap values for APP_NAME and CORS_ALLOWED_ORIGINS

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| K8S-01 | Deployment manifest with init container for Alembic migrations, liveness/readiness probes | Deployment stub exists at `k8s/deployment.yaml`; health endpoints confirmed at `/health/live` and `/health/ready`; Alembic uses `DATABASE_URL_SYNC` env var; init container overrides CMD with `alembic upgrade head` |
| K8S-02 | ClusterIP Service exposing API on port 8000 | Standard Service manifest targeting `app: run-api` label on port 8000 |
| K8S-03 | Traefik IngressRoute for external access | Traefik CRD `traefik.io/v1alpha1` IngressRoute; `web` entrypoint (HTTP); Cloudflare handles TLS |
| K8S-04 | Secret template YAML with documented `kubectl create secret` commands | 11 secret keys identified from `app/core/config.py`; template includes placeholders + kubectl commands in comments |
| K8S-05 | ArgoCD Application manifest with automated sync from `k8s/` directory | Standard ArgoCD `argoproj.io/v1alpha1` Application; auto-sync + self-heal + prune |
</phase_requirements>

## Standard Stack

### Core
| Resource | API Version | Purpose | Why Standard |
|----------|-------------|---------|--------------|
| Deployment | apps/v1 | Pod management with init container | Standard K8s workload |
| Service | v1 | ClusterIP network exposure | Standard K8s networking |
| ConfigMap | v1 | Non-sensitive configuration | Standard K8s config |
| Secret | v1 | Template for sensitive values | Standard K8s secrets |
| IngressRoute | traefik.io/v1alpha1 | External HTTP routing | Traefik CRD on baremetal cluster |
| Application | argoproj.io/v1alpha1 | GitOps sync definition | ArgoCD CRD |

### No Additional Dependencies
This phase is pure YAML authoring. No libraries, packages, or tools to install.

## Architecture Patterns

### Recommended File Organization
```
k8s/
  deployment.yaml      # Deployment (expand existing stub) + init container
  service.yaml         # ClusterIP Service
  ingress.yaml         # Traefik IngressRoute
  configmap.yaml       # Non-sensitive env vars
  secret-template.yaml # Secret placeholder + kubectl docs (NOT applied by ArgoCD)
  argocd-app.yaml      # ArgoCD Application (lives in k8s/ but applied manually once)
```

**Note on secret-template.yaml:** This file contains placeholder values only and serves as documentation. The actual Secret is created manually via `kubectl create secret`. ArgoCD will not manage secrets (they are created out-of-band). The template should be clearly marked as documentation, not a live manifest.

**Note on argocd-app.yaml:** ArgoCD Application manifests are typically applied once to the ArgoCD namespace (not the app namespace). It can live in `k8s/` for version control but is applied separately with `kubectl apply -f k8s/argocd-app.yaml` to the `argocd` namespace. ArgoCD then watches `k8s/` for the app manifests.

### Pattern 1: Init Container for Migrations
**What:** Run `alembic upgrade head` before the main container starts
**When to use:** Every deployment -- ensures schema is up to date before app starts
**Critical detail:** Alembic's `env.py` reads `DATABASE_URL_SYNC` from environment (line 23 of `alembic/env.py`). The init container MUST have this env var available via `envFrom`.

```yaml
initContainers:
  - name: migrate
    image: ghcr.io/civicpulse/run-api:latest  # CI updates this too
    command: ["python", "-m", "alembic", "upgrade", "head"]
    envFrom:
      - configMapRef:
          name: run-api-config
      - secretRef:
          name: run-api-secret
    resources:
      requests:
        memory: "128Mi"
        cpu: "100m"
      limits:
        memory: "256Mi"
        cpu: "200m"
```

**CI sed consideration:** The CI pipeline uses `sed` to replace the image line: `sed -i "s|image: ghcr.io/civicpulse/run-api:.*|image: ghcr.io/civicpulse/run-api:sha-...|"`. This pattern matches ALL occurrences of the image line in the file. Since both the init container and main container use the same image, the sed will update both -- which is the desired behavior. Verify this works correctly.

### Pattern 2: envFrom with ConfigMap + Secret
**What:** Inject all config as env vars without listing individually
**Why:** pydantic-settings in `app/core/config.py` reads env vars natively; `envFrom` maps cleanly.

```yaml
envFrom:
  - configMapRef:
      name: run-api-config
  - secretRef:
      name: run-api-secret
```

### Pattern 3: Traefik IngressRoute (Cloudflare Origin)
**What:** Route HTTP traffic from Traefik to the Service
**Key:** Uses `web` entrypoint (port 80) because Cloudflare terminates TLS and connects to origin on HTTP.

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: run-api
  namespace: run-api
spec:
  entryPoints:
    - web
  routes:
    - match: Host(`run.civpulse.org`)
      kind: Rule
      services:
        - name: run-api
          port: 8000
```

### Pattern 4: ArgoCD Application with Auto-Sync
**What:** ArgoCD watches `k8s/` directory and auto-deploys changes
**Key settings:** syncPolicy with automated, selfHeal, and prune enabled.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: run-api-dev
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/civicpulse/run-api.git
    targetRevision: main
    path: k8s
  destination:
    server: https://kubernetes.default.svc
    namespace: run-api
  syncPolicy:
    automated:
      selfHeal: true
      prune: true
    syncOptions:
      - CreateNamespace=true
```

### Anti-Patterns to Avoid
- **Hardcoding secrets in manifests:** Secret template must use placeholders only (`CHANGE_ME`), never real values
- **Init container with different image tag:** Both init and main containers must use the same image so CI sed updates both
- **TLS config in IngressRoute:** Cloudflare handles TLS; adding cert-manager or TLS sections is unnecessary and will break the flow
- **Putting argocd-app.yaml in ArgoCD's watched path without understanding:** If ArgoCD watches `k8s/` and `argocd-app.yaml` is in `k8s/`, ArgoCD would try to apply it to `run-api` namespace (wrong). Either exclude it via ArgoCD directory settings, or note it is applied manually once to `argocd` namespace. Simplest: keep it in `k8s/` for version control but document that it is applied manually.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Secret management | Custom secret injection scripts | `kubectl create secret generic` + `envFrom` | K8s native pattern, well-understood |
| TLS termination | cert-manager + IngressRoute TLS | Cloudflare proxy (already configured) | Origin HTTP is simpler; TLS at edge is standard |
| Image tag updates | Custom webhook or script | CI sed + ArgoCD auto-sync | Already built in Phase 10 |

## Common Pitfalls

### Pitfall 1: CI sed Replacing Wrong Lines
**What goes wrong:** If the deployment.yaml has comments or other text containing `image: ghcr.io/civicpulse/run-api:`, sed replaces those too.
**How to avoid:** Keep the image line format consistent. The sed pattern `s|image: ghcr.io/civicpulse/run-api:.*|...|` will match both init container and main container image lines -- this is actually correct since both should use the same image.
**Warning signs:** After CI runs, check that both image lines are updated to the same SHA.

### Pitfall 2: Init Container Missing Database Connectivity
**What goes wrong:** Init container cannot reach the database because env vars are not injected.
**Why it happens:** Forgetting `envFrom` on the init container (only putting it on the main container).
**How to avoid:** Init container MUST have the same `envFrom` as the main container so `DATABASE_URL_SYNC` is available for Alembic.

### Pitfall 3: Alembic Needs Sync Driver
**What goes wrong:** Init container fails because Alembic tries to use async driver.
**Why it happens:** Alembic env.py uses `DATABASE_URL_SYNC` (psycopg2) which it then converts to asyncpg for online migrations. The `DATABASE_URL_SYNC` env var MUST be set with the `postgresql+psycopg2://` prefix.
**How to avoid:** Secret template must clearly document that `DATABASE_URL_SYNC` uses the `+psycopg2` driver prefix.

### Pitfall 4: Namespace Not Created
**What goes wrong:** Manifests reference `run-api` namespace but it does not exist on the cluster.
**How to avoid:** ArgoCD syncOptions includes `CreateNamespace=true`. Alternatively, add a `namespace.yaml` manifest. The ArgoCD approach is cleaner.

### Pitfall 5: Secret Template Applied by ArgoCD
**What goes wrong:** ArgoCD tries to apply secret-template.yaml with placeholder values, overwriting real secrets.
**How to avoid:** Two options: (1) Name the file with a non-yaml extension like `secret-template.yaml.example` so ArgoCD ignores it, or (2) exclude it in the ArgoCD Application directory config. Option 1 is simpler and recommended.

### Pitfall 6: ArgoCD Application Namespace Conflict
**What goes wrong:** ArgoCD Application manifest has `namespace: argocd` but ArgoCD is configured to sync to `run-api` namespace.
**How to avoid:** The ArgoCD Application resource itself lives in the `argocd` namespace. It is applied once manually (`kubectl apply -n argocd -f k8s/argocd-app.yaml`). The ArgoCD source path should either exclude this file or it should be placed outside the watched directory. Simplest: exclude it via ArgoCD directory settings or use `.argocd-app.yaml` naming.

**Recommended approach for Pitfalls 5 & 6:** Place ArgoCD Application manifest and secret template outside the ArgoCD-watched `k8s/` directory, OR use ArgoCD's `directory.exclude` pattern. Alternatively:
- `k8s/argocd-app.yaml` -- applied manually once to `argocd` namespace, not by ArgoCD auto-sync
- `k8s/secret-template.yaml.example` -- non-YAML extension so ArgoCD ignores it

## Code Examples

### Complete Environment Variable Inventory

From `app/core/config.py`, all env vars the application reads:

**ConfigMap (non-sensitive):**
| Key | Default | K8s Value |
|-----|---------|-----------|
| APP_NAME | CivicPulse Run API | CivicPulse Run API |
| DEBUG | false | "false" |
| CORS_ALLOWED_ORIGINS | ["http://localhost:5173"] | '["https://run.civpulse.org"]' |

**Secret (sensitive):**
| Key | Format | Notes |
|-----|--------|-------|
| DATABASE_URL | postgresql+asyncpg://user:pass@host:5432/db | Used by app (async) |
| DATABASE_URL_SYNC | postgresql+psycopg2://user:pass@host:5432/db | Used by Alembic (sync) |
| ZITADEL_ISSUER | https://auth.civpulse.org | Auth server URL |
| ZITADEL_PROJECT_ID | string | ZITADEL project identifier |
| ZITADEL_SERVICE_CLIENT_ID | string | Service account client ID |
| ZITADEL_SERVICE_CLIENT_SECRET | string | Service account secret |
| S3_ENDPOINT_URL | https://... | S3/R2 endpoint |
| S3_ACCESS_KEY_ID | string | S3 access key |
| S3_SECRET_ACCESS_KEY | string | S3 secret key |
| S3_BUCKET | voter-imports | Bucket name |
| S3_REGION | us-east-1 | Region |

**Build metadata (injected at build time, not runtime):**
| Key | Source |
|-----|--------|
| GIT_SHA | Docker build-arg (set by CI) |
| BUILD_TIMESTAMP | Docker build-arg (set by CI) |

### kubectl Create Secret Command
```bash
kubectl create secret generic run-api-secret \
  --namespace run-api \
  --from-literal=DATABASE_URL='postgresql+asyncpg://user:password@db-host:5432/run_api' \
  --from-literal=DATABASE_URL_SYNC='postgresql+psycopg2://user:password@db-host:5432/run_api' \
  --from-literal=ZITADEL_ISSUER='https://auth.civpulse.org' \
  --from-literal=ZITADEL_PROJECT_ID='your-project-id' \
  --from-literal=ZITADEL_SERVICE_CLIENT_ID='your-client-id' \
  --from-literal=ZITADEL_SERVICE_CLIENT_SECRET='your-client-secret' \
  --from-literal=S3_ENDPOINT_URL='https://your-s3-endpoint' \
  --from-literal=S3_ACCESS_KEY_ID='your-access-key' \
  --from-literal=S3_SECRET_ACCESS_KEY='your-secret-key' \
  --from-literal=S3_BUCKET='voter-imports' \
  --from-literal=S3_REGION='us-east-1'
```

### Probe Recommendations (Claude's Discretion)
```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 8000
  initialDelaySeconds: 5
  periodSeconds: 15
  failureThreshold: 3
readinessProbe:
  httpGet:
    path: /health/ready
    port: 8000
  initialDelaySeconds: 10
  periodSeconds: 10
  failureThreshold: 3
```

**Rationale:**
- Liveness `initialDelaySeconds: 5` -- uvicorn starts fast, 5s is generous
- Readiness `initialDelaySeconds: 10` -- allows DB connection pool initialization
- Readiness `periodSeconds: 10` -- checks DB connectivity frequently enough to detect issues
- `failureThreshold: 3` -- standard; allows transient failures before action

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual manifest validation (yamllint + kubectl dry-run) |
| Config file | none -- manifests are validated structurally |
| Quick run command | `python -c "import yaml; [yaml.safe_load(open(f)) for f in __import__('glob').glob('k8s/*.yaml')]"` |
| Full suite command | `kubectl apply --dry-run=client -f k8s/deployment.yaml -f k8s/service.yaml -f k8s/configmap.yaml` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| K8S-01 | Deployment has init container + probes | manual-only | Visual inspection of `k8s/deployment.yaml` | Stub exists, needs expansion |
| K8S-02 | ClusterIP Service on port 8000 | manual-only | `kubectl apply --dry-run=client -f k8s/service.yaml` (needs cluster context) | No |
| K8S-03 | Traefik IngressRoute routes traffic | manual-only | Visual inspection (CRD validation needs cluster) | No |
| K8S-04 | Secret template documents all secrets | manual-only | Compare keys in template vs `app/core/config.py` | No |
| K8S-05 | ArgoCD Application with auto-sync | manual-only | Visual inspection of sync policy | No |

**Justification for manual-only:** These are static YAML manifests. Full validation requires a running cluster with Traefik and ArgoCD CRDs installed. Structural validation (valid YAML, correct apiVersion/kind) can be done locally. Semantic validation (correct behavior) requires deployment.

### Sampling Rate
- **Per task commit:** YAML parse check on all manifest files
- **Per wave merge:** Visual review of all manifests against requirements
- **Phase gate:** All 5 manifest files exist with correct structure

### Wave 0 Gaps
None -- this phase produces YAML files, not code requiring test infrastructure.

## Open Questions

1. **ArgoCD Application placement**
   - What we know: ArgoCD watches `k8s/` directory. The Application manifest belongs in the `argocd` namespace.
   - What's unclear: Whether ArgoCD on this cluster will try to apply all YAML in `k8s/` including its own Application manifest.
   - Recommendation: Place `argocd-app.yaml` in `k8s/` for version control but document manual one-time application. If ArgoCD tries to sync it, it will fail (wrong namespace) but not break anything. The `CreateNamespace=true` sync option only affects the destination namespace.

2. **Secret template file extension**
   - What we know: ArgoCD auto-syncs all YAML in `k8s/`.
   - What's unclear: Whether `.yaml.example` extension is sufficient to exclude from ArgoCD, or if `directory.exclude` is needed.
   - Recommendation: Use `secret-template.yaml.example` extension. ArgoCD only processes `.yaml` and `.json` files by default, so `.yaml.example` will be ignored.

## Sources

### Primary (HIGH confidence)
- `k8s/deployment.yaml` -- existing stub from Phase 10 (verified in repo)
- `app/core/config.py` -- all 16 env vars documented (verified in repo)
- `app/api/health.py` -- health endpoints at `/health/live` and `/health/ready` (verified in repo)
- `alembic/env.py` -- uses `DATABASE_URL_SYNC` env var (line 23, verified in repo)
- `.github/workflows/publish.yml` -- CI sed pattern for image update (verified in repo)
- `Dockerfile` -- confirms non-root `app` user, uvicorn CMD, Alembic files included (verified in repo)

### Secondary (MEDIUM confidence)
- Traefik IngressRoute CRD API version `traefik.io/v1alpha1` -- standard for Traefik v2/v3
- ArgoCD Application CRD API version `argoproj.io/v1alpha1` -- standard for ArgoCD v2.x
- ArgoCD directory exclude behavior for non-YAML extensions -- standard documented behavior

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all K8s resources are well-documented standard APIs
- Architecture: HIGH -- patterns are locked in CONTEXT.md with specific values; code verified in repo
- Pitfalls: HIGH -- pitfalls identified from actual code analysis (sed pattern, Alembic env.py, envFrom)
- Env var inventory: HIGH -- exhaustively verified from `app/core/config.py`

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable domain -- K8s manifest APIs rarely change)
