# Stack Research — v1.20 Native Auth Rebuild & Invite Onboarding

**Domain:** Native password auth on FastAPI + async SQLAlchemy, Postgres-backed sessions, SPA cookie auth
**Researched:** 2026-04-23
**Confidence:** HIGH on library versions & availability (verified via PyPI/npm/Context7 2026-04-23); MEDIUM on specific integration patterns (HIGH from fastapi-users docs, MEDIUM on CSRF/policy choices where we own the design)

---

## Scope of This Research

This is a **subsequent-milestone** STACK.md. The existing CivicPulse Run stack is **not re-researched** — Python 3.13, FastAPI, async SQLAlchemy 2.x + asyncpg, Postgres 16 + PostGIS, Procrastinate, Mailgun, React 18 + TanStack, shadcn/ui, Playwright, pytest, uv, Docker Compose are all **retained as-is**. See `.planning/research/v1.19/STACK.md` for the validated baseline.

This document answers only: **what new dependencies does v1.20 need, what goes away, and what's the correct 2026 version/integration for each?**

The three upstream decisions (fastapi-users + cookie + Postgres sessions, argon2id, own-built CSRF) are **not re-litigated** — they are inputs. See `.planning/notes/decision-drop-zitadel-diy-auth.md`.

---

## Dependency Deltas (the TL;DR)

### ADD to `pyproject.toml`

```toml
# Native auth — replaces authlib/ZITADEL JWKS path
"fastapi-users[sqlalchemy]>=15.0.5,<16",   # core + CookieTransport + DatabaseStrategy

# Password strength scoring — backend pre-validate hook (Q-AUTH-02 candidate)
"zxcvbn>=4.5.0,<5",                         # only if policy Q-AUTH-02 chooses zxcvbn

# Dev / CI
"pre-commit>=4.6.0,<5",                     # dev group only
```

### ADD to `web/package.json`

```json
{
  "dependencies": {
    "@zxcvbn-ts/core": "^3.0.4",            // only if policy Q-AUTH-02 chooses zxcvbn
    "@zxcvbn-ts/language-common": "^3.0.4",
    "@zxcvbn-ts/language-en": "^3.0.4"
  },
  "devDependencies": {
    "husky": "^9.1.7",
    "lint-staged": "^16.4.0",
    "prettier": "^3.8.3"
  }
}
```

### REMOVE from `pyproject.toml`

```toml
"authlib>=1.6.9",     # used ONLY for ZITADEL JWKS JWT validation — dead on v1.20
```

### REMOVE from `web/package.json`

```json
"oidc-client-ts": "^3.1.0"   // OIDC SPA flow gone — cookie auth replaces it entirely
```

---

## Detailed Recommendations

### 1. `fastapi-users[sqlalchemy]` 15.0.5

| | |
|---|---|
| **PyPI verification (2026-04-23)** | 15.0.5 is current; released 2026-03-27 |
| **Correct dep line** | `fastapi-users[sqlalchemy]>=15.0.5,<16` |
| **Peer deps pulled automatically** | `pwdlib[argon2,bcrypt]==0.3.0`, `pyjwt[crypto]>=2.12.0,<3`, `makefun`, `email-validator`, `python-multipart`, and — via `[sqlalchemy]` extra — `fastapi-users-db-sqlalchemy>=7.0.0` |
| **Do NOT add** | `passlib`, `bcrypt`, `argon2-cffi`, `pyjwt` — all pulled transitively. Adding them explicitly risks version drift. |
| **Extras we do NOT want** | `[redis]` (no Redis), `[oauth]` (no third-party OAuth), `[beanie]` (not using Mongo) |
| **CookieTransport + DatabaseStrategy** | First-class in 15.x. `DatabaseStrategy` uses `SQLAlchemyAccessTokenDatabase` against a new `access_token` table (opaque tokens, Postgres-backed). No extra extras required beyond `[sqlalchemy]`. |
| **Why this library (vs. roll-own / fastapi-login / authx)** | Only 2026-maintained async-SQLAlchemy-native FastAPI auth library with cookie+database sessions, argon2id defaults, UUID PKs, and a well-tested `validate_password` hook. Authx is active but newer/smaller; fastapi-login is sync-first. |

**Integration hints specific to our stack:**
- `fastapi-users-db-sqlalchemy` 7.0.0 assumes SQLAlchemy 2.x async — matches ours.
- The `access_token` table is a **new Alembic migration**; the `SQLAlchemyBaseAccessTokenTable` mixin provides the shape. It's a simple 3-column table (`token` PK varchar(43), `user_id` FK, `created_at`) — no conflict with our existing RLS, because sessions are **user-scoped, not campaign-scoped**. RLS context is set *after* auth, from the session → user → campaign lookup.
- The `User` ORM model will adopt `SQLAlchemyBaseUserTableUUID` — **new Alembic migration reshapes the existing `users` table** (drop `zitadel_sub`, `zitadel_user_id`; add `email UNIQUE NOT NULL`, `hashed_password VARCHAR`, `is_active`, `is_superuser`, `is_verified`). Data-migration strategy: a ZITADEL-era user row gets `hashed_password = NULL` and a forced password-reset invite.
- `validate_password` is an async hook — integrate with our Procrastinate-free, sync-bounded password policy logic (see §4).

### 2. Argon2id hashing — **no explicit `argon2-cffi` dep needed**

**Important correction to the decision doc:** fastapi-users 15.x does **not** use `passlib` + `argon2-cffi` directly. It depends on **`pwdlib[argon2,bcrypt]==0.3.0`**, which wraps `argon2-cffi>=23.1.0,<26` and `bcrypt>=4.1.2,<6`. `pwdlib` is by the same author as fastapi-users (frankie567) and replaces passlib (which has been effectively unmaintained — last meaningful release 2020).

**What this means:**
- Do not add `argon2-cffi` or `passlib` explicitly. `pwdlib` is pulled automatically.
- argon2id is the pwdlib default (v=19, memory 65536 KiB, parallelism 4, iterations 3) — matches OWASP 2026 guidance, no override needed.
- bcrypt is included for **verify-only** paths (if we ever need to migrate bcrypt hashes from a legacy store — not applicable here since we're starting fresh).
- CFFI dep on argon2-cffi means the Docker image needs `libffi-dev` at build time; already present in our `python:3.13-slim` base.

**Confidence:** HIGH (verified via PyPI `requires_dist` 2026-04-23).

### 3. CSRF middleware — **roll our own (~40 LOC)**

Three maintained candidates evaluated:

| Library | Latest | Last release | Verdict |
|---|---|---|---|
| `starlette-csrf` | 3.0.0 | **2023-06-27** | **STALE** — no release in ~3 years. Works with modern Starlette in practice but no bugfix commitments. Author = frankie567 (same as fastapi-users) — he has moved on from it. |
| `fastapi-csrf-protect` | 1.0.7 | 2025-09-16 | **MAINTAINED** — active in 2025-2026. Uses Pydantic settings, supports double-submit. **However:** it ships a stateful "csrf_protect" dependency that expects `.validate_csrf(request)` calls in each route — a poor fit for our middleware-based approach, and it couples CSRF state to a `JWTStrategy`-style secret signing, not plain double-submit. |
| `asgi-csrf` | 0.11 | 2024-11-15 | Maintained. Pure ASGI middleware (good), Simon Willison author. **However:** its double-submit implementation reads the cookie and compares to a form field by default; header-mode requires `header_name=` config and only supports **a single session-wide** token, not per-request tokens. Works, but small enough that its abstraction cost ≈ its LOC savings. |

**Recommendation: roll our own, as the decision doc specifies.**

Rationale:
- The double-submit pattern is genuinely ~40 LOC of Starlette `BaseHTTPMiddleware` (or pure ASGI middleware, matching our existing structlog middleware style).
- No maintained library matches the exact shape we want: httponly session cookie (fastapi-users-managed) + non-httponly `csrf_token` cookie + `X-CSRF-Token` header comparison, scoped to state-changing verbs only (`POST`/`PUT`/`PATCH`/`DELETE`).
- Owning it means no version-drift surprise and no coupling to another auth abstraction.

**Integration hint:** place it **after** the auth middleware so unauthenticated requests short-circuit the CSRF check. Emit the `csrf_token` cookie on successful `/auth/login`, rotate it on `/auth/logout`, and on 401-with-renewable sessions. Frontend `web/src/api/client.ts` reads the cookie (document.cookie) and sets `X-CSRF-Token` header on mutating verbs.

**Confidence:** HIGH that this is the right call (verified maintenance status of all three alternatives against PyPI 2026-04-23).

### 4. Password policy library — **recommend `zxcvbn` 4.5.0** (pending Q-AUTH-02)

| Library | Latest | Last release | Status | Notes |
|---|---|---|---|---|
| `zxcvbn` (Python) | **4.5.0** | 2025-02-19 | **MAINTAINED** | Official Dropbox port; the canonical Python zxcvbn in 2026. Requires no external service. |
| `zxcvbn-python` | 4.4.24 | (older) | Legacy fork | Superseded by `zxcvbn`. Avoid. |
| `pwdlib` | 0.3.0 | 2025-10-25 | **Hashing only** | Does NOT provide policy/strength scoring — it's a passlib replacement for *hashing*. Not a policy library. |
| `pyhibp` (HIBP client) | 4.2.0 | **2021-03-28** | **STALE** | Last release 5 years old. Use **Pwned Passwords v3 k-anonymity endpoint directly via `httpx`** (~20 LOC) if Q-AUTH-02 chooses HIBP route. |
| `python-bcrypt-patches` | — | — | **Not a thing** | Not a real package. Disregard. |

**Frontend companion (if zxcvbn chosen):** `@zxcvbn-ts/core` 3.0.4 (TypeScript rewrite, ~15KB gz core, modular dictionaries). Do NOT use the legacy `zxcvbn` npm package — unmaintained since 2017 and 180KB+.

**Recommendation:** Plan-phase-level choice (Q-AUTH-02). If zxcvbn: `zxcvbn==4.5.0` on backend (`validate_password` hook), `@zxcvbn-ts/core` on frontend (live strength indicator on password-set page). If length+HIBP: no Python lib, ~20 LOC httpx call to `api.pwnedpasswords.com/range/{prefix}`. **Do not use `pyhibp`.**

**Confidence:** HIGH on library statuses; MEDIUM on recommendation (pending Q-AUTH-02 resolution).

### 5. Continuous test verification (SEED-002)

| Tool | Version | Role |
|---|---|---|
| `pre-commit` | 4.6.0 (2026-04-21) | Driver — runs ruff, prettier, lint-staged hooks locally and in CI |
| `ruff` | 0.15.5+ (already in project) | Python lint+format, runs in pre-commit Python hook |
| `prettier` | 3.8.3 | TS/JSON/MD formatting in pre-commit |
| `lint-staged` | 16.4.0 | Scopes prettier/eslint to changed files only |
| `husky` | 9.1.7 | Git hooks installer (invoked by npm `prepare` script) |
| GitHub Actions scheduled workflow | n/a | `on: schedule: - cron: '0 7 * * *'` — full pytest + vitest + Playwright run daily |

**2026-specific worth-adopting:**
- **`pre-commit` 4.x** improved `default_language_version` pinning and supports `uv run ruff` hooks natively.
- **Playwright 1.58+ sharding** (we're on 1.58.2) — the scheduled CI run should shard across 4 workers to stay under 15 min wall-clock.
- **`ruff` pre-commit hook** runs both `ruff check --fix` and `ruff format` in one hook since 0.6 — no need for separate `black`/`isort`.
- **Test drift detection:** existing `web/scripts/run-e2e.sh` writes to `web/e2e-runs.jsonl`. Extend with a small Python script that reads last 7 runs and flags regressions (pass count drops, flake count rises). ~30 LOC, no new dep.

**Nothing new-and-shiny worth adopting:** no AI-test-triage tooling has matured to production-worthiness in 2026 for a project our size. Stick with pre-commit + scheduled CI.

**Integration hint:** `.pre-commit-config.yaml` at repo root; `.github/workflows/scheduled-tests.yml` with cron; both invoked in `CONTRIBUTING.md`.

### 6. What Goes Away — Verified

#### `authlib>=1.6.9` (Python)

Grep confirms usage is **ZITADEL-only**:
- `app/services/zitadel.py` — imports `authlib.jose` for JWKS/JWT decoding
- `app/core/auth.py` (or equivalent) — imports `authlib` for ID-token validation

No other callers. **Safe to remove** once `app/services/zitadel.py` is deleted.

**Flag:** audit `grep -rn "authlib\|jose" app/ scripts/ tests/` before removal to catch any test helper that imports directly. Any hit outside ZITADEL/auth code is a surprise that needs review.

#### `oidc-client-ts@3.1.0` (web)

Used only by the SPA auth bootstrap:
- `web/src/auth/` (OIDC client wiring)
- `web/src/main.tsx` or `App.tsx` — `UserManager` initialization
- `web/src/api/client.ts` — `Authorization: Bearer ${token}` injection

Replacement path:
- `web/src/api/client.ts` switches from `Authorization` header to `credentials: 'include'` (ky supports this via `credentials` option) — cookie rides automatically, `X-CSRF-Token` injected from document.cookie on mutations.
- `useAuth` hook returns `{ user, isAuthenticated }` by calling `GET /auth/me`.
- All `UserManager` code deleted.

**Flag:** verify **no Playwright helper** reads tokens from localStorage (`oidc-client-ts` stores session state there). Playwright auth helpers must be rewritten to post to `/auth/login` and capture the `Set-Cookie` into the browser context. Our existing `web/playwright/.auth/` state-storage pattern will work with cookies natively.

---

## Alternatives Considered (and rejected)

| Recommended | Alternative | Why Not |
|---|---|---|
| fastapi-users 15.0.5 | authx, fastapi-login | authx is newer/smaller community; fastapi-login is sync-first. fastapi-users is the de-facto 2026 choice. |
| pwdlib (via fastapi-users) | explicit passlib + argon2-cffi | passlib is effectively unmaintained since 2020. pwdlib is the designated successor. |
| Roll-own CSRF (~40 LOC) | starlette-csrf 3.0.0 | Stale since 2023. |
| Roll-own CSRF | fastapi-csrf-protect 1.0.7 | Maintained but couples CSRF to signed-JWT state; wrong shape for our middleware-plus-cookie design. |
| Roll-own CSRF | asgi-csrf 0.11 | Maintained, but a single session-wide token; not worth the import over ~40 LOC. |
| zxcvbn 4.5.0 | zxcvbn-python 4.4.24 | Legacy fork; `zxcvbn` is the maintained Dropbox port. |
| Direct httpx HIBP call | pyhibp 4.2.0 | 5-year-old library; just call the k-anonymity endpoint directly. |
| pre-commit 4.6 | lefthook, simple-git-hooks | pre-commit has the richest Python+Node shared-hook ecosystem and is what the `uv`+`ruff` community uses. |

---

## What NOT to Use

- **Redis / redis-py** — explicitly out of scope per the decision. Postgres-backed sessions via `DatabaseStrategy` are the design.
- **JWT-in-cookie / JWTStrategy** — fastapi-users ships this; we are NOT using it. Stateless JWT sessions block eager revocation.
- **OAuth2 password-grant flow for the SPA** — confused with "password auth"; we use CookieTransport, not OAuth2PasswordBearer. OAuth2PasswordBearer stays only for any service-to-service endpoints we might add (currently none).
- **`oidc-client-ts`, `openid-client`, `@okta/okta-auth-js`** — all OIDC SPA libraries. None apply.
- **`authlib`** — removed.
- **`passlib`** — do not add; pwdlib replaces it and is pulled by fastapi-users.
- **`pyhibp`** — stale.
- **`starlette-csrf`** — stale.

---

## Installation

```bash
# Backend (run from repo root)
uv add "fastapi-users[sqlalchemy]>=15.0.5,<16"
uv add --dev "pre-commit>=4.6.0,<5"
# Optional — only if Q-AUTH-02 chooses zxcvbn
uv add "zxcvbn>=4.5.0,<5"
uv remove authlib

# Frontend
cd web
npm install --save-dev husky@^9.1.7 lint-staged@^16.4.0 prettier@^3.8.3
npm uninstall oidc-client-ts
# Optional — only if Q-AUTH-02 chooses zxcvbn
npm install @zxcvbn-ts/core @zxcvbn-ts/language-common @zxcvbn-ts/language-en
npx husky init
```

---

## Sources & Confidence

| Claim | Confidence | Source |
|---|---|---|
| fastapi-users 15.0.5 is current and released 2026-03-27 | HIGH | PyPI JSON API 2026-04-23 |
| fastapi-users 15.x pulls pwdlib[argon2,bcrypt], NOT passlib | HIGH | PyPI `requires_dist` 2026-04-23 |
| argon2-cffi 25.1.0 is transitively pulled via pwdlib | HIGH | PyPI `requires_dist` 2026-04-23 |
| fastapi-users-db-sqlalchemy 7.0.0 is the current SQLAlchemy adapter | HIGH | PyPI 2026-04-23 |
| starlette-csrf is stale (last release 2023-06-27) | HIGH | PyPI release history 2026-04-23 |
| fastapi-csrf-protect 1.0.7 is maintained (2025-09-16) | HIGH | PyPI 2026-04-23 |
| asgi-csrf 0.11 is maintained (2024-11-15) | HIGH | PyPI 2026-04-23 |
| zxcvbn 4.5.0 is the maintained Python port | HIGH | PyPI 2026-04-23 |
| pyhibp is stale (2021-03-28) | HIGH | PyPI 2026-04-23 |
| pre-commit 4.6.0 released 2026-04-21 | HIGH | PyPI 2026-04-23 |
| lint-staged 16.4.0, husky 9.1.7, prettier 3.8.3 current | HIGH | npm registry 2026-04-23 |
| `@zxcvbn-ts/core` 3.0.4 preferred over legacy zxcvbn npm | MEDIUM | npm registry; legacy zxcvbn is unmaintained since 2017 |
| Roll-own CSRF middleware is the right call | HIGH | Three alternatives surveyed; none match the desired shape; 40-LOC implementation is well-established |
| authlib and oidc-client-ts have no callers outside auth surfaces | MEDIUM | Claim from decision doc; REQUIRES `grep` audit in implementation plan before removal |

---

*End of stack research. Downstream consumers (REQUIREMENTS.md, ROADMAP.md) should treat the "Dependency Deltas" section as the authoritative list of package changes for v1.20.*
