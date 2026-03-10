---
phase: 11
slug: kubernetes-gitops
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual manifest validation (yamllint + kubectl dry-run) |
| **Config file** | none — manifests are validated structurally |
| **Quick run command** | `python -c "import yaml; [yaml.safe_load(open(f)) for f in __import__('glob').glob('k8s/*.yaml')]"` |
| **Full suite command** | `kubectl apply --dry-run=client -f k8s/deployment.yaml -f k8s/service.yaml -f k8s/configmap.yaml` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run `python -c "import yaml; [yaml.safe_load(open(f)) for f in __import__('glob').glob('k8s/*.yaml')]"`
- **After every plan wave:** Run `kubectl apply --dry-run=client -f k8s/deployment.yaml -f k8s/service.yaml -f k8s/configmap.yaml`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 2 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | K8S-01 | manual-only | Visual inspection of `k8s/deployment.yaml` | ✅ stub | ⬜ pending |
| 11-01-02 | 01 | 1 | K8S-02 | manual-only | `kubectl apply --dry-run=client -f k8s/service.yaml` | ❌ W0 | ⬜ pending |
| 11-01-03 | 01 | 1 | K8S-03 | manual-only | Visual inspection (CRD needs cluster) | ❌ W0 | ⬜ pending |
| 11-01-04 | 01 | 1 | K8S-04 | manual-only | Compare keys vs `app/core/config.py` | ❌ W0 | ⬜ pending |
| 11-01-05 | 01 | 1 | K8S-05 | manual-only | Visual inspection of sync policy | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

This phase produces YAML files, not code requiring test infrastructure. No Wave 0 stubs needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Deployment has init container for Alembic | K8S-01 | Semantic validation needs running cluster | Inspect `k8s/deployment.yaml` for initContainers with `alembic upgrade head` command and correct envFrom |
| Liveness/readiness probes configured | K8S-01 | Probe paths need running app to test | Verify probes point to `/health/live` and `/health/ready` on port 8000 |
| ClusterIP Service on port 8000 | K8S-02 | Service validation needs cluster context | Inspect `k8s/service.yaml` for type ClusterIP, port 8000, selector `app: run-api` |
| Traefik IngressRoute routes traffic | K8S-03 | CRD validation needs Traefik installed | Inspect `k8s/ingress.yaml` for `web` entrypoint, Host match `run.civpulse.org` |
| Secret template documents all keys | K8S-04 | Completeness check is manual comparison | Compare keys in template against `app/core/config.py` Settings class — all 11 secret keys present |
| ArgoCD Application auto-sync enabled | K8S-05 | ArgoCD CRD needs ArgoCD installed | Inspect `k8s/argocd-app.yaml` for syncPolicy.automated with selfHeal and prune |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 2s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
