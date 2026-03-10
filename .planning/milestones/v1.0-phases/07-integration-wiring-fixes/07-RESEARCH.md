# Phase 7: Integration Wiring Fixes - Research

**Researched:** 2026-03-10
**Domain:** FastAPI lifespan wiring, SQLAlchemy/Alembic model discovery, startup validation
**Confidence:** HIGH

## Summary

This phase addresses three audit gaps (INT-01, INT-02, FLOW-01) that prevent runtime functionality despite all code being implemented. The fixes are surgical: (1) add `ZitadelService` instantiation to the FastAPI lifespan function with fail-fast startup validation, (2) add three missing model imports to `app/db/base.py` for Alembic autogenerate discovery, and (3) add a regression test to prevent future model import drift.

All code referenced already exists in the codebase. No new libraries, no new patterns, no new architecture. The research focus is on the exact wiring needed, the established patterns to follow, and the verification approach.

**Primary recommendation:** Follow existing lifespan patterns exactly (import inside function, store on `app.state`, fail fast on error) and add a filesystem-based regression test for model coverage.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Fail fast on startup if ZITADEL is unreachable, credentials are invalid, or config is missing (empty client_id/secret)
- Validate credentials at startup by attempting a token exchange (_get_token()) -- bad config surfaces at deploy time, not on first user request
- No cleanup needed on shutdown -- current ZitadelService creates a new httpx.AsyncClient per request, no persistent connection to close
- Missing config (empty zitadel_service_client_id or zitadel_service_client_secret) is a startup error, not a warning
- Full audit of app/models/ against app/db/base.py -- not just the three known gaps (call_list, phone_bank, dnc)
- Add all missing model imports to base.py
- Add a regression test that asserts every .py model file in app/models/ is imported in app/db/base.py -- prevents future drift
- Unit test with mock for ZitadelService lifespan wiring (consistent with existing test patterns that mock zitadel_service on app.state)
- Model file coverage test for Alembic discovery (no DB needed -- just checks imports against filesystem)
- E2E campaign creation flow test (with mocked ZITADEL) to directly validate FLOW-01 closure
- Startup failure tests for all three fail-fast scenarios: missing config, invalid credentials, ZITADEL unreachable

### Claude's Discretion
- Exact error messages for startup failures
- Test file organization (new module vs alongside existing)
- How the model coverage test discovers and compares files

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTH-02 | Campaign admin can create a campaign | INT-01 fix: ZitadelService init in lifespan enables `request.app.state.zitadel_service` access in campaigns.py:38 |
| AUTH-03 | Campaign admin can update and delete campaigns | INT-01 fix: ZitadelService init enables campaigns.py:155 (delete uses zitadel deactivate) |
| AUTH-05 | Campaign admin can assign roles | INT-01 fix: ZitadelService init enables members.py:115/170/218 |
| AUTH-07 | Campaign admin can invite users | INT-01 fix: ZitadelService init enables invites.py:120 |
| PHONE-01 | Generate call lists from voter criteria | INT-02 fix: call_list model discoverable by Alembic |
| PHONE-02 | Phone banker can follow call scripts | INT-02 fix: phone_bank model discoverable by Alembic |
| PHONE-03 | Record call outcomes | INT-02 fix: phone_bank model discoverable by Alembic |
| PHONE-04 | Capture survey responses during calls | INT-02 fix: phone_bank model discoverable by Alembic |
| PHONE-05 | Call outcomes sync to voter interaction history | INT-02 fix: dnc model discoverable by Alembic |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Role in This Phase |
|---------|---------|---------|-------------------|
| FastAPI | (installed) | Web framework | Lifespan function modification |
| httpx | (installed) | Async HTTP client | Used by ZitadelService._get_token() for startup validation |
| SQLAlchemy | (installed) | ORM | base.py model registry for Alembic |
| Alembic | (installed) | Migrations | Consumer of base.py model imports |
| pytest | >=9.0.2 | Test runner | All verification tests |
| pytest-asyncio | >=1.3.0 | Async test support | Async lifespan and E2E tests |

### Supporting
No new libraries needed. All dependencies already installed.

## Architecture Patterns

### Pattern 1: Lifespan Service Initialization (Existing)

**What:** Services are imported inside the lifespan function body and stored on `app.state`.
**Where:** `app/main.py:lifespan()` lines 20-46
**Why:** Avoids circular imports at module level. Provides a single initialization point.

Current lifespan initializes three services in order:
1. `app.state.jwks_manager` = JWKSManager (auth token validation)
2. `app.state.storage_service` = StorageService (object storage)
3. `app.state.broker` = broker (background tasks)

ZitadelService should be inserted between JWKSManager and StorageService (both are auth-related).

```python
# Source: existing pattern in app/main.py + CONTEXT.md decision
from app.services.zitadel import ZitadelService

# Config validation (fail fast)
if not settings.zitadel_service_client_id or not settings.zitadel_service_client_secret:
    raise RuntimeError("...")

zitadel_service = ZitadelService(
    issuer=settings.zitadel_issuer,
    client_id=settings.zitadel_service_client_id,
    client_secret=settings.zitadel_service_client_secret,
)
# Validate credentials at startup
await zitadel_service._get_token()
app.state.zitadel_service = zitadel_service
```

### Pattern 2: Route Handler Access (Existing)

**What:** Route handlers access services via `request.app.state.<service_name>`.
**Where:** Already in place -- no changes needed.

```python
# Source: app/api/v1/campaigns.py:38
zitadel = request.app.state.zitadel_service
```

Six locations already use this pattern:
- `campaigns.py:38` (create), `campaigns.py:155` (delete)
- `invites.py:120` (accept)
- `members.py:115` (assign), `members.py:170` (remove), `members.py:218` (transfer)

### Pattern 3: Alembic Model Discovery (Existing)

**What:** All model modules must be imported in `app/db/base.py` after `Base` definition so Alembic's `target_metadata = Base.metadata` captures all tables.
**Where:** `app/db/base.py` lines 14-29

Currently has 14 model imports. Missing 3:
- `app.models.call_list` (CallList, CallListEntry)
- `app.models.phone_bank` (PhoneBankSession, SessionCaller)
- `app.models.dnc` (DoNotCallEntry)

Note: `app/models/__init__.py` already imports all 18 model modules including these three -- it can serve as the source of truth for the regression test.

### Pattern 4: Test Mocking (Existing)

**What:** Tests mock `app.state.zitadel_service` directly on the test app instance.
**Where:** `tests/unit/test_api_campaigns.py:138`, `test_api_invites.py:146`, `test_api_members.py:92`

```python
# Source: tests/unit/test_api_campaigns.py:138
app.state.zitadel_service = zitadel  # AsyncMock
```

For ZitadelService itself, tests use `unittest.mock.patch` on `app.services.zitadel.httpx.AsyncClient`:
```python
# Source: tests/unit/test_campaign_service.py:48
with patch("app.services.zitadel.httpx.AsyncClient", return_value=mock_client):
    token = await zitadel_service._get_token()
```

### Anti-Patterns to Avoid
- **Importing ZitadelService at module level in main.py:** Follow the existing pattern of importing inside the lifespan function body to avoid circular imports.
- **Silently skipping ZitadelService init on missing config:** User decision says missing config is a startup error, not a warning.
- **Using `app/models/__init__.py` as the Alembic discovery point:** Alembic uses `Base.metadata` from `base.py`, not `__init__.py`. Both need the imports.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Model file discovery for test | Manual list of expected files | `pathlib.Path.glob("*.py")` on `app/models/` | Auto-discovers new model files without test maintenance |
| Import verification | AST parsing or importlib | String matching against `base.py` content | Simpler, sufficient -- just check if `import app.models.<name>` appears |

## Common Pitfalls

### Pitfall 1: Startup Validation Swallowing Exceptions
**What goes wrong:** Catching the `_get_token()` exception and logging instead of re-raising means the app starts with invalid credentials and fails on first request.
**How to avoid:** Let `ZitadelUnavailableError` propagate. For `httpx.HTTPStatusError` (401 on bad credentials), catch and re-raise as `RuntimeError` with a clear message.

### Pitfall 2: Config Check Missing Empty String Case
**What goes wrong:** `if not settings.zitadel_service_client_id` catches `None` but the field has a default of `""` (empty string). `not ""` is `True` in Python, so this works correctly. But `if settings.zitadel_service_client_id is None` would NOT catch empty strings.
**How to avoid:** Use `if not settings.zitadel_service_client_id` (truthiness check), not `is None`.

### Pitfall 3: Alembic Import Order
**What goes wrong:** Adding imports before `Base` definition causes `ImportError` because models inherit from `Base`.
**How to avoid:** Follow existing pattern -- all model imports come after the `class Base` definition. The `# noqa: E402, F401` comments suppress linting for post-class imports.

### Pitfall 4: Test App Lifespan Not Invoked
**What goes wrong:** The `test_app` fixture creates the app via `create_app()` but the lifespan is only invoked when the app is started (e.g., via `AsyncClient` as context manager with `ASGITransport`). Direct attribute access on `app.state` without going through lifespan will still fail.
**How to avoid:** For lifespan testing, use `async with` on the lifespan context manager directly, or test via HTTP calls through the async client which triggers the lifespan. For E2E tests that mock ZitadelService, continue setting `app.state.zitadel_service` directly in test setup (existing pattern).

### Pitfall 5: _get_token() 401 vs Connection Error
**What goes wrong:** `_get_token()` calls `response.raise_for_status()` which raises `httpx.HTTPStatusError` for 401 (bad credentials). This is NOT caught by the existing `except (httpx.ConnectError, httpx.TimeoutException)` block -- it propagates as an unhandled exception.
**How to avoid:** In the lifespan, wrap the `_get_token()` call to catch both `ZitadelUnavailableError` (connection issues) and `httpx.HTTPStatusError` (bad credentials) and convert both to clear startup errors.

## Code Examples

### ZitadelService Lifespan Init (Target State)

```python
# Source: synthesized from existing app/main.py pattern + CONTEXT.md decisions
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None]:
    from app.core.security import JWKSManager
    from app.services.storage import StorageService
    from app.services.zitadel import ZitadelService
    from app.tasks.broker import broker

    logger.info("Starting {}", settings.app_name)

    # Auth - JWKS
    app.state.jwks_manager = JWKSManager(issuer=settings.zitadel_issuer)

    # Auth - ZITADEL service account (fail fast on bad config)
    if not settings.zitadel_service_client_id or not settings.zitadel_service_client_secret:
        raise RuntimeError(
            "ZITADEL service account not configured: "
            "set ZITADEL_SERVICE_CLIENT_ID and ZITADEL_SERVICE_CLIENT_SECRET"
        )
    zitadel_service = ZitadelService(
        issuer=settings.zitadel_issuer,
        client_id=settings.zitadel_service_client_id,
        client_secret=settings.zitadel_service_client_secret,
    )
    await zitadel_service._get_token()  # validates credentials at startup
    app.state.zitadel_service = zitadel_service
    logger.info("ZitadelService initialized and credentials validated")

    # Object storage
    storage_service = StorageService()
    await storage_service.ensure_bucket()
    app.state.storage_service = storage_service

    # Background task broker
    await broker.startup()
    app.state.broker = broker

    yield

    await broker.shutdown()
    logger.info("Shutting down {}", settings.app_name)
```

### base.py Missing Imports (3 Lines to Add)

```python
# Source: diff between app/models/*.py files and app/db/base.py
# Add after existing line 29 (import app.models.shift):
import app.models.call_list  # noqa: E402, F401
import app.models.dnc  # noqa: E402, F401
import app.models.phone_bank  # noqa: E402, F401
```

### Model Coverage Regression Test

```python
# Source: CONTEXT.md decision - filesystem-based model coverage check
from pathlib import Path

def test_all_models_imported_in_base():
    """Every model file in app/models/ must be imported in app/db/base.py."""
    models_dir = Path("app/models")
    model_files = {
        f.stem for f in models_dir.glob("*.py")
        if f.stem != "__init__" and not f.stem.startswith("_")
    }

    base_path = Path("app/db/base.py")
    base_content = base_path.read_text()

    missing = []
    for model_name in sorted(model_files):
        import_line = f"import app.models.{model_name}"
        if import_line not in base_content:
            missing.append(model_name)

    assert not missing, (
        f"Models not imported in app/db/base.py (Alembic won't detect changes): {missing}"
    )
```

### Lifespan Startup Failure Test Pattern

```python
# Source: synthesized from existing test_campaign_service.py mock patterns
from unittest.mock import patch, AsyncMock
import pytest
from app.main import create_app

async def test_startup_fails_on_missing_config():
    """App startup raises RuntimeError when ZITADEL credentials are empty."""
    app = create_app()
    with patch("app.main.settings") as mock_settings:
        mock_settings.zitadel_service_client_id = ""
        mock_settings.zitadel_service_client_secret = "some-secret"
        # other settings...
        with pytest.raises(RuntimeError, match="ZITADEL service account not configured"):
            async with app.router.lifespan_context(app):
                pass
```

## State of the Art

Not applicable -- this phase uses no new technology. All patterns are established in the existing codebase.

## Open Questions

1. **httpx.HTTPStatusError handling in lifespan**
   - What we know: `_get_token()` raises `httpx.HTTPStatusError` for 401 (bad credentials) and `ZitadelUnavailableError` for connection failures. Both should cause startup failure.
   - What's unclear: Whether to catch and re-raise as `RuntimeError` (cleaner message) or let the original exception propagate (preserves stack trace).
   - Recommendation: Catch both and raise `RuntimeError` with descriptive message -- keeps startup error handling consistent and message user-friendly. This is Claude's discretion per CONTEXT.md.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest >=9.0.2 + pytest-asyncio >=1.3.0 |
| Config file | `pyproject.toml` [tool.pytest.ini_options] |
| Quick run command | `uv run pytest tests/unit/ -x -q` |
| Full suite command | `uv run pytest tests/ -x -q` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-02 | Campaign create works (no AttributeError) | unit (E2E mock) | `uv run pytest tests/unit/test_lifespan.py::test_campaign_create_e2e -x` | No - Wave 0 |
| AUTH-03 | Campaign delete works (no AttributeError) | unit (E2E mock) | `uv run pytest tests/unit/test_lifespan.py::test_campaign_delete_e2e -x` | No - Wave 0 |
| AUTH-05 | Member role assign works | unit (covered by existing) | `uv run pytest tests/unit/test_api_members.py -x` | Yes |
| AUTH-07 | Invite accept works | unit (covered by existing) | `uv run pytest tests/unit/test_api_invites.py -x` | Yes |
| PHONE-01 | call_list model in base.py | unit (regression) | `uv run pytest tests/unit/test_model_coverage.py -x` | No - Wave 0 |
| PHONE-02 | phone_bank model in base.py | unit (regression) | `uv run pytest tests/unit/test_model_coverage.py -x` | No - Wave 0 |
| PHONE-03 | phone_bank model in base.py | unit (regression) | `uv run pytest tests/unit/test_model_coverage.py -x` | No - Wave 0 |
| PHONE-04 | phone_bank model in base.py | unit (regression) | `uv run pytest tests/unit/test_model_coverage.py -x` | No - Wave 0 |
| PHONE-05 | dnc model in base.py | unit (regression) | `uv run pytest tests/unit/test_model_coverage.py -x` | No - Wave 0 |

### Additional Tests (from CONTEXT.md decisions)
| Test | Type | Command | File Exists? |
|------|------|---------|-------------|
| ZitadelService lifespan wiring | unit | `uv run pytest tests/unit/test_lifespan.py::test_zitadel_service_initialized -x` | No - Wave 0 |
| Startup fails: missing config | unit | `uv run pytest tests/unit/test_lifespan.py::test_startup_fails_missing_config -x` | No - Wave 0 |
| Startup fails: invalid credentials (401) | unit | `uv run pytest tests/unit/test_lifespan.py::test_startup_fails_invalid_credentials -x` | No - Wave 0 |
| Startup fails: ZITADEL unreachable | unit | `uv run pytest tests/unit/test_lifespan.py::test_startup_fails_unreachable -x` | No - Wave 0 |
| Campaign creation E2E (FLOW-01) | unit (E2E mock) | `uv run pytest tests/unit/test_lifespan.py::test_campaign_create_flow -x` | No - Wave 0 |
| Model coverage regression | unit | `uv run pytest tests/unit/test_model_coverage.py -x` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/unit/ -x -q`
- **Per wave merge:** `uv run pytest tests/ -x -q`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/test_lifespan.py` -- covers lifespan wiring, startup failures, campaign E2E flow
- [ ] `tests/unit/test_model_coverage.py` -- covers Alembic model discovery regression

## Sources

### Primary (HIGH confidence)
- `app/main.py` -- current lifespan implementation (lines 20-46)
- `app/db/base.py` -- current model imports (lines 14-29, missing call_list/dnc/phone_bank)
- `app/models/__init__.py` -- complete model registry (all 18 modules imported)
- `app/services/zitadel.py` -- ZitadelService implementation (constructor, _get_token)
- `app/core/config.py` -- settings with empty string defaults for zitadel_service_client_id/secret
- `tests/unit/test_campaign_service.py` -- existing ZitadelService test patterns
- `tests/unit/test_api_campaigns.py` -- existing app.state.zitadel_service mock pattern
- `.planning/v1.0-MILESTONE-AUDIT.md` -- INT-01, INT-02, FLOW-01 gap definitions

### Secondary (MEDIUM confidence)
- None needed -- all findings verified against existing codebase

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies, all existing code
- Architecture: HIGH - following established patterns exactly
- Pitfalls: HIGH - verified against actual source code
- Testing: HIGH - existing test patterns well understood

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable -- no external dependencies changing)
