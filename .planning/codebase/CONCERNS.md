# Codebase Concerns

**Analysis Date:** 2026-03-09

## Tech Debt

**No Application Code Exists:**
- Issue: The project has dependencies declared in `pyproject.toml` (FastAPI, SQLAlchemy, Alembic, asyncpg, etc.) but `main.py` is a stub that only prints "Hello from run-api!" -- no FastAPI app, no routes, no models, no database configuration
- Files: `main.py`, `pyproject.toml`
- Impact: None of the declared dependencies are used; the application cannot serve any requests or connect to any database
- Fix approach: Scaffold the FastAPI application structure -- create app package with routes, models, schemas, config, and database setup modules

**Missing Project Structure:**
- Issue: The project has no source package directory (no `src/` or `app/` directory). All code would need to be built from scratch
- Files: Project root contains only `main.py`
- Impact: Cannot begin feature development until basic project scaffolding is complete
- Fix approach: Create a proper Python package structure (e.g., `app/` with `__init__.py`, `config.py`, `models/`, `routes/`, `schemas/`, `services/`, `db/`)

**Placeholder Project Metadata:**
- Issue: `pyproject.toml` has placeholder description "Add your description here"
- Files: `pyproject.toml`
- Impact: Minor -- affects package metadata only
- Fix approach: Update description to match project purpose from `init.md`

## Known Bugs

No bugs to report -- the application has no functional code.

## Security Considerations

**No Authentication Implementation:**
- Risk: `init.md` specifies ZITADEL (https://auth.civpulse.org) for authentication, but no auth middleware, token validation, or ZITADEL integration exists
- Files: `main.py` (no auth code), `init.md` (auth requirements)
- Current mitigation: None -- app has no endpoints to protect
- Recommendations: When building the FastAPI app, implement ZITADEL OIDC/OAuth2 token validation middleware before creating any protected endpoints. Use `pydantic-settings` (already a dependency) for secure configuration management. Create `.env.example` documenting required environment variables without secrets.

**No Environment Configuration:**
- Risk: No `.env` file, no settings module, no configuration management despite `pydantic-settings` being a dependency
- Files: `pyproject.toml` (lists `pydantic-settings` dependency)
- Current mitigation: None
- Recommendations: Create a settings module using `pydantic-settings.BaseSettings` with environment variable validation before any database or service connections are implemented. Ensure `.env` remains in `.gitignore` (it is currently listed).

**No CORS Configuration:**
- Risk: When the API is built, it will need CORS configuration for the run-web frontend
- Files: N/A (no FastAPI app exists)
- Current mitigation: None
- Recommendations: Configure FastAPI CORS middleware with explicit allowed origins from environment variables, not wildcards

**Sensitive Data Handling Not Planned:**
- Risk: The application will handle voter PII, donor financial information, and FEC compliance data per `init.md`. No data protection patterns, encryption-at-rest, or audit logging patterns exist
- Files: `init.md` (feature requirements mentioning constituent data, donation data, CRM)
- Current mitigation: None
- Recommendations: Design data models with PII classification from the start. Implement field-level encryption for sensitive voter/donor data. Build audit logging into the base model layer. Consider GDPR/state privacy law compliance requirements early.

## Performance Bottlenecks

**Dual PostgreSQL Driver Dependencies:**
- Problem: Both `asyncpg` (async) and `psycopg2-binary` (sync) are listed as dependencies in `pyproject.toml`
- Files: `pyproject.toml`
- Cause: Unclear whether the project intends to use async or sync database access patterns
- Improvement path: Decide on one approach. For FastAPI, use `asyncpg` with SQLAlchemy async engine. Use `psycopg2-binary` only if needed for Alembic migrations (which typically run synchronously). Document the decision. Remove the unneeded driver if possible, or clarify each driver's role.

**No Database Migration Infrastructure:**
- Problem: Alembic is a dependency but no `alembic.ini` or `alembic/` directory exists
- Files: `pyproject.toml` (lists `alembic>=1.18.4`)
- Cause: Project not yet scaffolded
- Improvement path: Run `alembic init` and configure it to use the same database URL as the FastAPI app. Set up async-compatible migration configuration.

## Fragile Areas

**No Fragile Code Areas:** The codebase is too nascent to have fragile areas. However, the following architectural risks should be addressed during initial development:

**Ambitious Feature Scope vs. Zero Implementation:**
- Files: `init.md` (12 major feature areas listed)
- Why fragile: The gap between planned features (constituent management, event management, volunteer management, donation management, user management, analytics, canvassing, phone banking, CRM, integrations, campaign websites, third-party integrations) and current state (empty stub) creates risk of rushed implementation
- Safe modification: Follow the priority order defined in `init.md` (auth first, then campaign management, then integrations, etc.)
- Test coverage: No tests exist; no test framework is configured despite needing one

## Scaling Limits

Not applicable -- no application exists to evaluate scaling characteristics. When building:
- Use async SQLAlchemy with connection pooling for database access
- Design multi-tenant data isolation early (campaigns are the tenant boundary per `init.md`)
- Plan for voter file imports (potentially millions of records per state) requiring batch processing

## Dependencies at Risk

**`psycopg2-binary`:**
- Risk: The `-binary` variant bundles its own libpq and is not recommended for production deployments by the psycopg2 maintainers
- Impact: Potential issues in production containers
- Migration plan: Use `psycopg2` (non-binary) for production builds, or migrate to `psycopg[binary]` (psycopg3) which is the successor library. Alternatively, rely solely on `asyncpg` for all database access if going fully async.

**No Dev Dependencies Declared:**
- Risk: No test framework (pytest), no linter (ruff), no type checker (mypy/pyright), no formatter configured in `pyproject.toml`
- Impact: No quality gates exist; code quality will degrade without tooling
- Migration plan: Add dev dependencies: `pytest`, `pytest-asyncio`, `httpx` (for FastAPI test client), `ruff`, `mypy` or `pyright`. Configure in `pyproject.toml` under `[tool.ruff]`, `[tool.pytest.ini_options]`, etc.

**Typer Dependency May Be Unnecessary:**
- Risk: `typer>=0.24.1` is declared but there is no CLI code; unclear if the project needs a CLI framework alongside FastAPI
- Impact: Minor -- unused dependency adds to install size
- Migration plan: Clarify if CLI management commands are needed (e.g., for data imports, admin tasks). If not, remove. If yes, implement the CLI module.

## Missing Critical Features

**No Application Skeleton:**
- Problem: There is no FastAPI application, no database models, no API routes, no configuration management
- Blocks: All feature development is blocked until basic scaffolding exists

**No Testing Infrastructure:**
- Problem: No test framework, no test directory, no test configuration
- Blocks: Cannot verify any feature implementation; no CI/CD quality gates possible

**No Database Schema:**
- Problem: No SQLAlchemy models, no Alembic migrations, no database schema
- Blocks: All data-dependent features (which is everything listed in `init.md`)

**No Docker/Deployment Configuration:**
- Problem: `init.md` specifies Kubernetes deployment but no Dockerfile, docker-compose, or K8s manifests exist
- Blocks: Cannot deploy or run the application in any environment beyond local development

**No API Documentation/OpenAPI Spec:**
- Problem: Despite `docs/spec_driven_dev(SDD).md` suggesting a spec-driven development approach, no OpenAPI specification exists
- Blocks: Cannot generate client SDKs, cannot validate API contracts, cannot enable frontend development in parallel

## Test Coverage Gaps

**Zero Test Coverage:**
- What's not tested: Everything -- the entire application
- Files: No test files exist anywhere in the project
- Risk: Any code written without tests will be untestable retroactively without significant refactoring
- Priority: High -- establish testing patterns (conftest.py, fixtures, test database setup) before writing any feature code

---

*Concerns audit: 2026-03-09*
