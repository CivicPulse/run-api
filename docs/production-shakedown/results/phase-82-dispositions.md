# Phase 82 Dispositions

This document records the explicit supported behavior and operational dispositions captured during Phase 82 of the v1.13 remediation milestone.

## Resolved In Code

- Production FastAPI docs are disabled. When `settings.environment == "production"`, the app no longer exposes `/docs`, `/redoc`, or `/openapi.json`.
- `GET /campaigns/{campaign_id}/field/me` now derives canvassing totals from live `walk_list_entries`, so direct inserts or stale denormalized counters no longer under-report assigned work.

## Supported Behavior Decisions

- Deleted campaigns remain hidden from list responses, but a direct `GET /campaigns/{id}` still returns the soft-deleted record with `status: "deleted"`. There is no public restore path for deleted campaigns. This is the current supported audit-visible soft-delete contract.
- Survey script lifecycle remains one-way: `draft -> active -> archived`. `archived -> active` is still unsupported by design.
- Phone-bank call recording does not hard-block or annotate a pre-existing DNC match in the response payload. DNC enforcement happens when generating call lists, and a `refused` call outcome automatically adds the number to DNC.
- The SPA catch-all only serves frontend routes. `/api/*` and `/health/*` continue to return 404 rather than falling through to `index.html`.
- Rate limiting is part of the supported API posture at the application layer, but production abuse protection still expects edge enforcement in front of the app.

## Operational Follow-Up

- `pg_stat_statements` is still an operational pre-launch prerequisite for DB observability. This remains a deployment task, not an app-code change.

## Out Of Scope For Phase 82

- Phase 81 production accessibility/mobile verification remains open until the redeployed frontend is rerun in production.
- Phase 83 still requires a live production rerun and explicit cleanup approval before milestone closeout.
