# External Integrations

**Analysis Date:** 2026-03-09

**Note:** This project is in early bootstrapping. No integrations are implemented yet. This document reflects the **planned** integrations based on `init.md` and dependency declarations, plus what is already wired into `pyproject.toml`.

## APIs & External Services

**Authentication:**
- ZITADEL - External identity provider and authentication service
  - Instance URL: `https://auth.civpulse.org`
  - SDK/Client: Not yet integrated (no ZITADEL SDK in dependencies)
  - Auth flow: Not yet implemented
  - Priority: #1 in feature roadmap

**Payment Processing (Planned):**
- Stripe - Donation processing
  - SDK/Client: Not yet added to dependencies
  - Priority: Part of #3 (Third-party integrations) and #9 (Donation management)

**Email (Planned):**
- Mailgun - Email marketing and transactional email
  - SDK/Client: Not yet added to dependencies
  - Priority: Part of #3 (Third-party integrations)

**SMS/Voice (Planned):**
- Twilio - Phone banking and SMS outreach
  - SDK/Client: Not yet added to dependencies
  - Priority: Part of #6 (Phone banking management)

**Social Media (Planned):**
- Facebook - Social media integration for outreach
- X (Twitter) - Social media integration for outreach
  - SDKs/Clients: Not yet added to dependencies
  - Priority: Part of #3 (Third-party integrations)

**DNS/Hosting (Planned):**
- Cloudflare - Domain purchases and hosting for campaign websites
  - SDK/Client: Not yet added to dependencies
  - Priority: Part of #12 (Campaign website management)

## Data Storage

**Databases:**
- PostgreSQL (primary relational database)
  - Async driver: `asyncpg` >=0.31.0 (in `pyproject.toml`)
  - Sync driver: `psycopg2-binary` >=2.9.11 (in `pyproject.toml`)
  - ORM: SQLAlchemy >=2.0.48
  - Migrations: Alembic >=1.18.4
  - Connection config: Not yet implemented (will use `pydantic-settings` env vars)

**File Storage:**
- Not yet determined (CSV import for constituents is planned)

**Caching:**
- None configured

## Authentication & Identity

**Auth Provider:**
- ZITADEL (external, self-hosted at `https://auth.civpulse.org`)
  - Implementation: Not yet started
  - Expected pattern: OIDC/OAuth2 token validation in FastAPI middleware
  - User management will integrate with ZITADEL for identity, with local user records for app-specific roles/permissions

## Monitoring & Observability

**Error Tracking:**
- None configured

**Logs:**
- Loguru >=0.7.3 declared as dependency (not yet wired up)

## CI/CD & Deployment

**Hosting:**
- Kubernetes (planned, per `init.md`)
- No Dockerfile or Kubernetes manifests exist yet

**CI Pipeline:**
- None configured (no `.github/workflows/`, no CI config files)

## Environment Configuration

**Required env vars (anticipated based on stack):**
- Database connection URL (PostgreSQL)
- ZITADEL instance URL and client credentials
- Application secret key

**Secrets location:**
- `.env` file (gitignored) for local development
- No production secrets management configured yet

## Webhooks & Callbacks

**Incoming:**
- None implemented (Stripe webhooks for donation events anticipated)

**Outgoing:**
- None implemented

## Integration Priority Roadmap (from `init.md`)

1. ZITADEL authentication - Highest priority
2. PostgreSQL database - Already has drivers in dependencies
3. Third-party services (Mailgun, Stripe, Facebook, X, Twilio)
4. Cloudflare (campaign websites) - Lowest priority

---

*Integration audit: 2026-03-09*
