# Quick Task 260406-mgu Summary

## Outcome

Created `scripts/reset_prod.py` — a production reset script that:

1. Drops the public schema and re-runs all Alembic migrations (clean slate)
2. Lists all ZITADEL orgs via Admin API, deletes everything except "Vote Hatcher"
3. Creates the Vote Hatcher org in ZITADEL if it doesn't exist, ensures project grant
4. Finds Kerry's ZITADEL user by email, seeds User + Organization + OrganizationMember records
5. Assigns the "owner" project role in ZITADEL

Safety: requires `--confirm` flag; without it, prints a dry-run summary.

## Verification

- `uv run ruff check scripts/reset_prod.py` — all checks passed
- Verifier: 5/5 must-haves confirmed (drop/migrate, ZITADEL cleanup, seed, --confirm gate, kubectl docs)

## Usage

```bash
kubectl scale deployment run-api-worker --replicas=0 -n civpulse-prod
kubectl exec -it deploy/run-api -n civpulse-prod -- python scripts/reset_prod.py --confirm
kubectl scale deployment run-api-worker --replicas=1 -n civpulse-prod
```
