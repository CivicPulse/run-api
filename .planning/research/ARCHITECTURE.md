# Architecture Research: v1.20 Native Auth Rebuild & Invite Onboarding

**Domain:** How fastapi-users + cookie sessions + our own CSRF middleware slot into the existing FastAPI + SQLAlchemy-async + Procrastinate + React+ky stack, replacing ZITADEL OIDC end-to-end
**Project:** CivicPulse Run
**Researched:** 2026-04-23
**Scope:** Q1–Q8 from the spawn brief. Existing architecture (ASGI middleware discipline, `get_campaign_db` RLS, Procrastinate queue shape, ky client conventions) is taken as-is — this research is strictly about where the new seams go and what order they get built in.

---

## Q1. fastapi-users dependencies + `get_campaign_db` RLS — coexistence, order, set_config interaction

### Summary

`current_active_user` and `get_campaign_db` are **independent, orthogonal dependencies** and compose by stacking. **Order does not matter at dependency-resolution time** (FastAPI resolves each once per request, caches, and hands the values to the path operation). Order *does* matter at runtime observable-behavior time in exactly one dimension: transaction-scoped `set_config('app.current_campaign_id', ..., true)` is bound to the session FastAPI yields — the fastapi-users lookup must NOT share that session, because fastapi-users reads `access_token` and `user` rows that live **outside** campaign scope and RLS could deny them.

### Concrete dependency shape (recommended)

```python
# app/auth/users.py  (new)
from fastapi_users import FastAPIUsers
fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])
current_active_user = fastapi_users.current_user(active=True)
current_verified_user = fastapi_users.current_user(active=True, verified=True)
current_superuser   = fastapi_users.current_user(active=True, superuser=True)

# app/api/deps.py  (modified)
async def get_campaign_db(
    campaign_id: uuid.UUID,
    user: User = Depends(current_active_user),   # <-- new: gates RLS session
) -> AsyncGenerator[AsyncSession]:
    async with async_session_factory() as session:
        await set_campaign_context(session, str(campaign_id))
        # Also set user-scoped RLS var if we ever add user-level policies.
        yield session
```

**Why `current_active_user` comes FIRST (as a sub-dep of `get_campaign_db`):**

1. **Authorization check happens before RLS context** — an unauthenticated request should get a 401 without ever touching a DB connection from the pool. Today's `require_role()` already works this way (see `app/core/security.py:396`) — we keep that invariant.
2. **fastapi-users needs its own session for `access_token` + `user` lookup**. `fastapi-users` `DatabaseStrategy` uses an `SQLAlchemyAccessTokenDatabase` that takes a session via `get_async_session` dependency. That dep must be **separate** from `get_campaign_db` — it opens a session, looks up the `access_token` row by the cookie value, validates expiry, and yields the `User`. That session either (a) has no RLS context set (nil UUID default from pool checkout) or (b) is a dedicated session factory that bypasses campaign RLS for auth-table queries. We already have `get_db()` (non-RLS) in `app/db/session.py` — use it.

### Transaction-scoped RLS + fastapi-users: the sharp edge

The v1.5 transaction-scoped RLS fix (`set_config(..., true)`) means **`db.commit()` clears `app.current_campaign_id`**. The `ensure_user_synced` helper in `deps.py` already captures and restores this (lines 110-115, 251-252). fastapi-users' login/register/verify endpoints all commit — but **they use their own session, scoped to the `users`/`access_token` tables only**, never a `get_campaign_db` session. So no interaction. Do NOT try to share the session across fastapi-users' internal DB ops and campaign-scoped routes.

The one integration gap: after `current_active_user` resolves the User, we still need the campaign-member lookup that `require_role()` does today (resolve effective campaign role against `CampaignMember` + `OrganizationMember`). That lookup must run on the **campaign-scoped** session (it needs RLS), which is what `get_campaign_db` yields. So the final shape is:

```
Depends(current_active_user)          # auth — own session, no RLS
   → Depends(get_campaign_db)         # RLS session, takes user
       → Depends(require_role(...))   # role check on RLS session
```

`require_role()` becomes a thin wrapper that takes both deps and performs the additive campaign+org role resolution already in `security.py:_resolve_effective_role`. The JWT-based `AuthenticatedUser` shape goes away entirely; `User` from SQLAlchemy is passed through directly.

### Files

- **New:** `app/auth/users.py` (fastapi-users wiring), `app/auth/backend.py` (CookieTransport+DatabaseStrategy), `app/auth/user_manager.py` (UserManager subclass with `validate_password`, `on_after_register`, `on_after_forgot_password` hooks)
- **Modified:** `app/api/deps.py` (gate `get_campaign_db` on `current_active_user`, remove `ensure_user_synced` JWT path, keep org/campaign-member ensure as an `on_after_login` hook OR keep it inline but driven by User row not JWT claims)
- **Modified:** `app/core/security.py` (delete `JWKSManager`, `get_current_user`, `get_optional_current_user`; keep `CampaignRole`, `OrgRole`, `_resolve_effective_role`, `require_role` with new signature)
- **Deleted:** All JWT/JWKS machinery in `security.py`, all `app.state.jwks_manager` wiring in `main.py`

---

## Q2. User-table migration strategy

### Verdict: **(b) single-migration reshape with zero-password state**, ONLY after verifying (c) is not available — and (c) IS available in practice.

### Prod user audit (verify before proceeding)

Before committing to any strategy, someone must run this exact check against prod:

```bash
kubectl exec -it deploy/run-api -n civpulse-prod -- \
  uv run python -c "
import asyncio
from sqlalchemy import select, func
from app.db.session import async_session_factory
from app.models.user import User
async def main():
    async with async_session_factory() as s:
        n = await s.scalar(select(func.count()).select_from(User))
        rows = (await s.execute(select(User.id, User.email).limit(20))).all()
        print(f'count={n}', rows)
asyncio.run(main())
"
```

Based on `scripts/reset_prod.py` existing at all (explicit tool for wiping prod to single-org demo) and the v1.13 production shakedown history (GO-with-conditions, no real customer traffic), the working hypothesis is **(c) — no real prod users exist; seed + E2E regeneration is the honest path.** But this requires an explicit confirmation from the operator before the migration ships.

### If (c) holds: recommended path

1. **Alembic migration 042_native_auth_user_reshape** — single migration:
   - Add columns: `hashed_password TEXT NOT NULL` (no default — the migration will populate from a placeholder), `is_active BOOLEAN NOT NULL DEFAULT true`, `is_superuser BOOLEAN NOT NULL DEFAULT false`, `is_verified BOOLEAN NOT NULL DEFAULT false`
   - Change PK: `id` from `VARCHAR(255)` (ZITADEL sub) to `UUID`. **This is the FK blast radius** — 27 tables reference `users.id` (see audit below). Strategy: keep `users.id` as TEXT for now, OR do a staged rename. Honest choice: **keep PK as TEXT/VARCHAR(36) holding a UUID string**. fastapi-users accepts a custom ID type via the `FastAPIUsers[User, UUID]` generic — but the underlying column can be stored as string. Check Context7/fastapi-users docs for the `SQLAlchemyBaseUserTableUUID` vs custom ID type decision.
   - Drop columns: any `zitadel_user_id`, `zitadel_sub` on `users` (the actual `user.py` model is lean — see below — but confirm via `\d users` in psql; migrations may have added columns outside the model).
   - Populate `hashed_password` with a deterministic "unusable" marker (e.g., argon2 hash of a random secret that's immediately discarded). All existing user rows are effectively zombied.
   - Seed + `create-e2e-users.py` regenerate the demo + test users using the new `/auth/register` admin endpoint, so no usable state is left behind.

2. **FK impact (27 tables, all pointing at `users.id`):** if PK stays as string (storing UUID text), no FK migration needed. If PK changes to native UUID, every FK column needs ALTER. **Recommend string-stored UUID** to avoid 27 concurrent ALTER TABLEs on a live DB — much cheaper migration, and fastapi-users doesn't care.

3. **Current User model is blessedly thin** (`app/models/user.py` — 32 lines, columns `id/display_name/email/created_at/updated_at`). No ZITADEL columns in the model. The tight shape is a gift; the reshape is small.

### If (c) does NOT hold (prod has real users): fallback is (a)

- Add fastapi-users columns *alongside* existing columns in one migration (`hashed_password` NULLABLE initially).
- Build a "claim your account" flow: users receive a one-time email, set password, `hashed_password` populated, `is_verified=true`.
- Cutover: when all users claimed, second migration makes `hashed_password` NOT NULL and drops any remaining ZITADEL columns.
- This is a 4–6 week user-facing migration, not a code migration. Do NOT pick this unless prod user count > 0.

### Explicit gate

**Do not merge the migration until the prod audit returns count=0 or count=small-list-of-internal-staff-who-can-reset.** This is a plan-phase gate, not a research deliverable.

---

## Q3. CSRF middleware placement + exemptions + token delivery

### Middleware order (definitive)

FastAPI/Starlette middleware execute in **reverse registration order on the request path, forward order on the response path**. So the last `add_middleware` call is the outermost on the response. Recommended registration order (copy to `app/main.py`):

```python
app.add_middleware(CORSMiddleware, ...)              # registered first → outermost on request
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(StructlogMiddleware)              # pure ASGI, ContextVars
app.add_middleware(CSRFMiddleware)                   # new, pure ASGI
# fastapi-users routes mounted via include_router — no middleware
```

Rationale:
- **CORS first** so preflights never reach CSRF (OPTIONS requests have no cookies anyway).
- **StructlogMiddleware before CSRF** so CSRF failures are logged with the same request_id as any other failure.
- **CSRF is pure ASGI, not BaseHTTPMiddleware** — this matches the existing `StructlogMiddleware` pattern and avoids the streaming-response hazard called out in `PROJECT.md` Key Decisions. The ~40 LOC commitment in the decision note is compatible with pure ASGI; a BaseHTTPMiddleware version would also be ~40 LOC but would break streaming and is explicitly off-limits.

### Endpoints exempt from CSRF

The double-submit pattern requires the client to echo a cookie value in a header — which is impossible on the very first request, before any cookie is set. So:

**Exempt (no cookie yet, or pre-session):**
- `POST /auth/register` (public registration — if ever enabled; currently out of scope)
- `POST /auth/cookie/login` (fastapi-users login endpoint name — confirm via Context7; see below)
- `POST /auth/forgot-password`, `POST /auth/reset-password`
- `POST /auth/request-verify-token`, `POST /auth/verify`
- `POST /invites/{token}/accept` (public invite acceptance — no session yet)
- `GET /health/*`
- `GET /api/config` (public runtime config fetch)

**Enforced (session-cookie-bearing requests):**
- All `/api/v1/*` endpoints
- `POST /auth/logout` (state-changing, session-bearing — enforce)

### How the CSRF token reaches the frontend

Three candidates; evaluated:

1. **HTML meta tag injected by FastAPI** — rejected. The SPA is served statically (or by Vite in dev); injecting a per-request meta tag requires server-side rendering, which we don't do.
2. **JSON endpoint (`GET /auth/csrf-token`)** — workable but adds a roundtrip on every app boot.
3. **Cookie readable by JS (double-submit proper)** — **recommended**. The CSRF cookie (`csrf_token`) is set by the login endpoint (and refreshed on any state-changing response), `httponly=False` so JS can read it, `samesite="lax"`, `secure=true` in prod. The session cookie (`fastapiusersauth` or whatever we name it) is `httponly=True`. `ky.beforeRequest` reads `document.cookie`, extracts `csrf_token`, sets `X-CSRF-Token` header. CSRF middleware compares header value to cookie value — equal and non-empty → pass, else → 403.

This is textbook OWASP double-submit. The header name `X-CSRF-Token` is already in the decision note.

### Files

- **New:** `app/core/middleware/csrf.py` (pure ASGI, ~40 LOC, exempt list is a `frozenset[str]` of path prefixes)
- **New:** `app/auth/csrf.py` (helper to set the CSRF cookie from auth backend `on_after_login`)
- **Modified:** `app/main.py` (registration order), `web/src/api/client.ts` (read cookie, set header in `beforeRequest`)

---

## Q4. Frontend auth rewire — blast radius

### Inventory of touched frontend surfaces

Found by grepping for `oidc-client-ts`, `access_token`, `Authorization`, `useAuthStore`:

| Surface | Current behavior | New behavior |
|---|---|---|
| `web/src/api/client.ts` | `beforeRequest` fetches `useAuthStore.getState().getAccessToken()` and sets `Authorization: Bearer` | Set `credentials: 'include'` on the ky instance; read `csrf_token` cookie via `document.cookie`, set `X-CSRF-Token` header |
| `web/src/stores/authStore.ts` | Full `oidc-client-ts` `UserManager` lifecycle (initialize, login/logout redirects, silent renew) | Rewrite: state = `{ user, isAuthenticated, isLoading }`; `login(email, password)` POSTs to `/auth/cookie/login`; `logout()` POSTs to `/auth/cookie/logout`; `fetchMe()` GETs `/users/me`. No redirects, no localStorage user storage |
| `web/src/routes/callback.tsx` (if present) | OIDC redirect callback handler | **Delete** — no more redirect flow |
| `web/src/routes/login.tsx` | "Sign in with ZITADEL" button that calls `login()` | Real form: email + password, `react-hook-form + zod`, submits to authStore |
| Route guards (TanStack Router `beforeLoad` hooks) | Check `isAuthenticated` from authStore | Unchanged — the store's `isAuthenticated` boolean remains the guard signal |
| TanStack Query hooks (e.g., `useCampaigns`, every `useX`) | Inherit auth via `api` ky instance | Unchanged — ky handles it |
| `web/src/config.ts` (`loadConfig`) | Fetches ZITADEL issuer/client_id | Can be deleted or reduced to app-level config only |
| `web/.env.local` | ZITADEL issuer, client IDs | Remove all VITE_ZITADEL_* |
| `web/e2e/auth-flow.ts` | Playwright storageState bootstrap via ZITADEL UI | Rewrite: POST to `/auth/cookie/login` directly, Playwright captures the `Set-Cookie` into storageState |

### CSRF token injection point

```ts
// web/src/api/client.ts (new)
export const api = ky.create({
  prefixUrl: API_BASE_URL,
  credentials: "include",                          // <-- cookies ride automatically
  hooks: {
    beforeRequest: [
      (request) => {
        const method = request.method.toUpperCase()
        if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
          const csrf = getCookie("csrf_token")     // doc.cookie parser
          if (csrf) request.headers.set("X-CSRF-Token", csrf)
        }
      },
    ],
    afterResponse: [/* 401 → clear store; 403 → PermissionError (existing) */],
  },
})
```

No `beforeRequest` token read from the auth store anymore (the cookie handles it). GET/HEAD/OPTIONS don't need CSRF header — middleware exempts safe methods.

### `useAuth` surface

New shape (public API consumed by components):

```ts
interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean                       // new — needed because no synchronous OIDC session
  login(email: string, password: string): Promise<void>
  logout(): Promise<void>
  refresh(): Promise<void>                 // calls /users/me
}
```

Components using `useAuthStore` today mostly read `user` and `isAuthenticated` — low churn. The `getAccessToken()` method disappears entirely (token is in an httpOnly cookie, unreachable from JS — which is the point).

---

## Q5. Invite flow integration

### Current flow (ZITADEL-era)

Email link → `/invites/{token}` landing → ZITADEL redirect (hosted login/password-set) → callback → accept. Broken because ZITADEL login app bundling (Phase 111 FAIL).

### New flow (recommended)

1. Email link → `/invites/{token}/setup` (single URL, single route component).
2. Frontend `GET /api/v1/invites/{token}` returns `{invite: {email, campaign_name, expires_at}}` — public endpoint, no auth required, rate-limited.
3. User sees: email (prefilled, read-only), password input, confirm-password input, live policy validator. Submits to `POST /api/v1/invites/{token}/accept` with `{password}`.
4. Backend endpoint:
   - Validates token (same checks as today: exists, not revoked, not expired, not already accepted).
   - Validates password against policy (Q-AUTH-02 rule set).
   - Creates `User` row (hashed password via fastapi-users `UserManager.create`, `is_verified=true` if Q-AUTH-01 resolves to "invite-as-proof").
   - Creates `CampaignMember` / `OrganizationMember` rows with invite-assigned role.
   - Sets `invite.accepted_at`.
   - **Mints session** (see below).
   - Returns 200 with Set-Cookie headers for session + CSRF.
5. Frontend receives response, updates authStore, router navigates to campaign dashboard.

### Session minting at invite-accept

fastapi-users' `auth_backend.login(strategy, user)` is the canonical way to write a session. It returns a `Response` with cookies set. Inside a custom endpoint, you do:

```python
@router.post("/invites/{token}/accept")
async def accept_invite(
    token: str,
    payload: AcceptInvitePayload,
    user_manager: UserManager = Depends(get_user_manager),
    strategy: DatabaseStrategy = Depends(auth_backend.get_strategy),
    db: AsyncSession = Depends(get_db),
):
    # ... validate invite, create user via user_manager ...
    new_user = await user_manager.create(UserCreate(email=..., password=...))
    # ... create members, mark invite accepted ...
    return await auth_backend.login(strategy, new_user)
```

This works for a freshly-created user; there's no separate "first-login" ceremony. The user's browser receives the session cookie in the same response that confirms the invite was accepted. **One network round-trip, one page — no intermediate "now please log in" step.** This is the primary UX argument for DIY over ZITADEL's urlTemplate path — we finally own this flow.

### Single route vs. split route

**Recommendation: single `/invites/{token}/setup` route** (not `/invites/{token}` → redirect to `/setup-password?invite=...`). One URL, one bookmark, one place for the UX to evolve. Splitting adds an unnecessary redirect and two sources of truth for invite state.

### Files

- **New:** `app/api/v1/invites.py` (expand existing; add public `/invites/{token}` GET and `/invites/{token}/accept` POST)
- **New:** `app/schemas/auth.py` (AcceptInvitePayload, UserCreate wrapper)
- **Modified:** `web/src/routes/invites.$token.setup.tsx` (new file-based route) and delete old ZITADEL-redirect-based invite landing

---

## Q6. Procrastinate tasks for auth emails

### Recommendation: **extend existing `communications` queue, new module `app/tasks/auth_tasks.py`**

Not one monolithic `invite_tasks.py` — three distinct templates (password-reset, email-verify, invite) share delivery machinery but have distinct triggers, distinct schema updates, and distinct retry semantics. Organizing as:

```
app/tasks/
  invite_tasks.py      # existing — campaign invite email (unchanged)
  auth_tasks.py        # NEW — password_reset_email, verify_email_email
  import_task.py       # existing
  sms_tasks.py         # existing
```

All three auth tasks live on the `communications` queue so they share Mailgun rate limits, delivery audit (`email_delivery_attempt` table from v1.16), and the same retry envelope.

### Commit/durability seam

Identical to v1.16's invite-email shape (`app/tasks/invite_tasks.py` and `app/services/invite.py:99-113`):

1. fastapi-users `UserManager.on_after_forgot_password(user, token)` hook fires.
2. Hook calls a **thin synchronous function** that writes a `password_reset_request` row (or inlines onto User.last_password_reset_token / etc. — schema decision in plan-phase) and then calls `procrastinate_app.defer_async("send_password_reset_email", user_id=str(user.id), token=token)`.
3. Procrastinate persists the job to Postgres (same transaction if we're clever about it; otherwise post-commit `defer` via the SQLAlchemy event listener pattern v1.16 uses).
4. Worker picks up the job, renders the template via existing `app/services/email_templates.py`, sends via Mailgun, writes to `email_delivery_attempt`.

The durability seam is **the Procrastinate job row** — if the API crashes between writing the reset-token and deferring the job, fastapi-users' default behavior is to have the user re-click "forgot password." Acceptable. If stricter durability is needed, use the post-commit listener pattern from v1.16.

### fastapi-users hook → Procrastinate bridge

```python
# app/auth/user_manager.py
class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    async def on_after_forgot_password(self, user, token, request=None):
        await procrastinate_app.defer_async(
            "send_password_reset_email",
            user_id=str(user.id),
            token=token,
        )

    async def on_after_request_verify(self, user, token, request=None):
        await procrastinate_app.defer_async(
            "send_verify_email", user_id=str(user.id), token=token,
        )
```

### Files

- **New:** `app/tasks/auth_tasks.py` (2 tasks: `send_password_reset_email`, `send_verify_email`)
- **New:** `app/services/auth_email.py` (parallels `invite_email.py` — template context builders, Mailgun submission)
- **New:** Templates in `app/services/email_templates.py` (or the HTML template files wherever they live)
- **Modified:** `app/auth/user_manager.py` hooks to defer tasks

---

## Q7. Test harness changes

### `scripts/create-e2e-users.py` (999 lines)

Current: provisions ZITADEL users via v2 API, creates `.zitadel-data/env.zitadel` for Playwright.

**Rewrite direction:** a ~100-line script that:
1. Reads env (campaign IDs, user list).
2. `POST`s to a new protected admin endpoint `POST /api/v1/auth/admin/bootstrap-user` (superuser-only, dev/test only — feature-flagged off in production) for each test user.
3. Writes a `web/e2e/fixtures/users.json` with `{email, password}` pairs for Playwright to log in with.

Alternative: skip the API and insert `User` rows directly via SQL in a migration-style script. Cleaner in the sense of zero network, but then the `hashed_password` has to be computed via argon2 in Python — doable, just requires `argon2-cffi`. **Recommend the direct-DB-insert path** (simpler, faster, matches the "we own this" posture).

### Playwright `web/e2e/auth-flow.ts` storageState

Current: walks ZITADEL UI, captures cookies and localStorage to `auth.json` storageState file.

**New:** one-shot `POST /auth/cookie/login` via `page.request.post()`, captures cookies into storageState via `page.context().storageState({ path: "auth.json" })`. Faster (no UI walk), more reliable (no ZITADEL version sensitivity), and the storageState contains just cookies — no localStorage needed since there's no OIDC state.

### `scripts/seed.py` user sections

Currently creates ZITADEL users + local User rows. New: delete the ZITADEL side, keep the local-User creation with argon2-hashed passwords. ~200 LOC reduction expected.

### Integration test fixtures that mock ZITADEL JWKS

Grep for `JWKSManager`, `validate_token` in `tests/` — any fixture that mocks JWKS gets deleted. New fixtures mint sessions directly by POSTing to `/auth/cookie/login` with a seeded user.

### Files

- **Modified:** `scripts/create-e2e-users.py` (heavy rewrite — could be renamed since it's no longer ZITADEL-specific)
- **Modified:** `scripts/seed.py` (user sections)
- **Modified:** `web/e2e/auth-flow.ts`, `web/e2e/fixtures/` (storageState regeneration)
- **Deleted:** Any `tests/conftest.py` fixture mocking ZITADEL JWKS; any `app/core/security.py` JWT test helpers
- **New:** `tests/auth/test_cookie_login.py`, `tests/auth/test_csrf_middleware.py`, `tests/auth/test_invite_accept.py`, `tests/auth/test_password_reset.py`

---

## Q8. SEED-002 architecture — continuous test verification

### Recommendation: **three-layer verification, built BEFORE the auth rewrite lands**

1. **Pre-commit hooks** (`.pre-commit-config.yaml` at repo root):
   - `uv run ruff check --fix` + `uv run ruff format` (already mandated but not enforced)
   - `uv run pytest --lf -x` against the already-running docker-compose stack
   - `cd web && npx vitest related --run` for staged TS files
   - Fails fast with "run `docker compose up -d` first" if compose isn't up (honors the compose-only invariant from SEED-002 hard constraints)

2. **CI on push** (modify `.github/workflows/pr.yml` or add `push.yml`):
   - Currently PR-only. Add `push:` trigger for feature branches (subset — unit + lint, not full Playwright) so pushes without open PRs still get signal.
   - Full suite on `main` every push AND on PR open/sync.
   - Every job starts with `docker compose up -d --wait` (no direct `uvicorn`/`vite` calls).

3. **Scheduled nightly** (new `.github/workflows/nightly.yml`):
   - Full pytest + vitest + Playwright on `main`.
   - On regression (tail-20 of `web/e2e-runs.jsonl` shows deterioration vs tail-100), open a GitHub issue automatically via `gh api`.
   - Integrates with existing `web/scripts/run-e2e.sh` wrapper — it already logs JSONL; the nightly job just adds an analysis step.

### Integration with `web/scripts/run-e2e.sh`

Existing wrapper logs every run to `web/e2e-runs.jsonl`. Add a sibling `web/scripts/analyze-e2e-trend.sh` that:
- Reads the last 100 runs.
- Computes pass-rate delta between tail-20 and tail-100.
- Exits non-zero + prints a human-readable summary if degradation exceeds a threshold (e.g., >5 percentage points).
- Called from the nightly workflow; on non-zero exit, `gh issue create` opens a tracking ticket.

### Why SEED-002 goes FIRST in v1.20

Per seed's own guidance: SEED-002 is **prerequisite** to any cross-cutting work, and native-auth touches every route, every test, every fixture. If SEED-002 lands after the auth rewrite, we're back to the Phase 106 problem at a larger scale. Concrete ordering consequence: **Phase 112 must be SEED-002 infrastructure; auth work cannot start until Phase 112 is green.**

### Files

- **New:** `.pre-commit-config.yaml` (root)
- **New:** `.github/workflows/nightly.yml`
- **Modified:** `.github/workflows/pr.yml` (add `push:` trigger; split into push-quick and PR-full jobs)
- **New:** `web/scripts/analyze-e2e-trend.sh`, `scripts/doctor.sh` (env-drift healthcheck from SEED-002 item 4)
- **Modified:** `scripts/bootstrap-dev.sh` (call `scripts/doctor.sh` as last step)

---

## Cross-Cutting: Build Order

Dependencies constrain sequencing. Recommended phase order:

### Phase 112 — SEED-002 Continuous Verification (prerequisite)
- Pre-commit hooks, push-trigger CI, nightly workflow, env-drift doctor
- **Blocks** all subsequent phases. Nothing else ships until test baseline is watched continuously.
- No code changes to application surface.

### Phase 113 — User Table Migration + fastapi-users Scaffolding
- Prod user audit (gate)
- Alembic `042_native_auth_user_reshape`
- `app/auth/` module tree (users.py, backend.py, user_manager.py)
- New fastapi-users routes mounted under `/auth/*`
- **ZITADEL still alive in parallel** (both auth paths work) to de-risk — feature flag `AUTH_BACKEND=native|zitadel` in settings
- Tests: `tests/auth/` suite

### Phase 114 — CSRF Middleware + Cookie Session Integration
- `app/core/middleware/csrf.py` (pure ASGI)
- Middleware registration order fix in `main.py`
- CSRF token cookie emission on login
- Tests: `tests/auth/test_csrf_middleware.py`

### Phase 115 — Frontend Auth Rewire
- `web/src/api/client.ts` (credentials: 'include', CSRF header)
- `web/src/stores/authStore.ts` (rewrite — drop `oidc-client-ts`)
- Real login/logout UI
- `web/e2e/auth-flow.ts` rewrite
- Delete callback route, ZITADEL env vars
- **Cutover point:** flip `AUTH_BACKEND` default to `native`, keep ZITADEL path behind the flag for one milestone, monitor, then rip

### Phase 116 — Invite Flow on Native Auth
- `POST /api/v1/invites/{token}/accept` session minting
- `/invites/{token}/setup` frontend route
- `scripts/create-e2e-users.py` rewrite for invite-path testing
- Playwright specs for invite-accept-with-password-set

### Phase 117 — Password Reset + Email Verify
- `app/tasks/auth_tasks.py` (Procrastinate tasks)
- fastapi-users `/auth/forgot-password`, `/auth/reset-password`, `/auth/request-verify-token`, `/auth/verify` exposed
- Email templates
- Q-AUTH-01 decision implemented (invite-as-proof vs ceremony)

### Phase 118 — ZITADEL Tear-Out
- Delete `app/services/zitadel.py`, `scripts/bootstrap-zitadel.py`, `.zitadel-data/`
- Remove ZITADEL service from `docker-compose.yml`
- Delete `JWKSManager`, all JWT code in `app/core/security.py`
- Remove `zitadel_*` settings
- Drop ZITADEL columns from any table that still has them (audit via `\d`)
- **Gated on:** Phase 115 cutover has been running in prod for at least one milestone without incident

### Phase 119 — Session Lifecycle + Admin Controls
- Q-AUTH-03 decisions implemented
- Idle/absolute timeout
- Expired-token cleanup Procrastinate task
- Admin "revoke all sessions for user X" endpoint
- Optional: "my active sessions" UI

---

## Patterns Preserved (Do Not Violate)

1. **Pure ASGI middleware for anything that reads/writes request context.** CSRF middleware is pure ASGI. No `BaseHTTPMiddleware` anywhere in this milestone.
2. **Transaction-scoped RLS via `set_config(..., true)`.** The new `current_active_user` dep must NOT share its session with `get_campaign_db` — auth table queries go through `get_db()` (non-RLS), campaign-data queries go through `get_campaign_db()` (RLS).
3. **AST-based rate-limit-guard test.** New `/auth/*` endpoints registered by fastapi-users need rate limits — either via fastapi-users' built-in limiter hook or by wrapping the fastapi-users router with slowapi decorators. The existing AST test at CI time will fail the build if we forget. Verify the test can see the fastapi-users routes (it may need a tweak to recognize the `fastapi_users.get_auth_router(...)` pattern).
4. **Procrastinate `communications` queue for all email.** Auth emails join invite emails on the same queue, same retry envelope, same `email_delivery_attempt` audit table.
5. **Docker-compose-only dev/test env.** No `uvicorn` or `vite` invocations anywhere in new scripts. CI jobs do `docker compose up -d --wait`.
6. **No service-worker-managed OIDC state.** There's no service worker; cookies ride the HTTP layer transparently. No new runtime complexity on the frontend.

---

## Open Hooks to Plan-Phase Research

- **Q-AUTH-01** (email verification model) — determines `is_verified` initial value at invite-accept and whether Phase 117 ships a verify-email ceremony or not.
- **Q-AUTH-02** (password policy) — determines frontend `live-validator.ts` shape and `UserManager.validate_password` hook body. Blocks Phase 113 UI work.
- **Q-AUTH-03** (session lifecycle) — determines `access_token` table expiry strategy and whether Phase 119 needs a Procrastinate cleanup task. Phase 113 can ship with a conservative default (e.g., 7-day absolute, no idle) and refine in Phase 119.
- **Prod user audit** — gates Q2 migration strategy (c) vs (a). Must run before Phase 113.
- **Context7 lookup: exact fastapi-users 15.0.5 route prefix** — the decision note says `CookieTransport` + `DatabaseStrategy`; confirm the default router paths (`/auth/cookie/login` vs `/auth/login`) so CSRF exempt list is correct on first try.

## Sources

- `.planning/notes/decision-drop-zitadel-diy-auth.md` — decision record; tactical framing
- `.planning/research/questions.md` — Q-AUTH-01/02/03 open questions
- `.planning/seeds/SEED-002-test-hygiene-continuous-verification.md` — continuous verification rationale + constraints
- `app/api/deps.py`, `app/core/security.py`, `app/main.py`, `app/models/user.py`, `app/tasks/invite_tasks.py`, `web/src/api/client.ts`, `web/src/stores/authStore.ts` — read for current-state integration points
- `.planning/research/v1.19/ARCHITECTURE.md` — prior-milestone research for structural reference (Procrastinate pattern, Invite durable delivery shape)
- Context7: **fastapi-users 15.0.5** official docs (recommend plan-phase lookup for: exact router prefixes, `DatabaseStrategy` session-sharing semantics, UUID vs string ID handling, `on_after_*` hook signatures) — not fetched during this research pass; deferred to Phase 113 plan
