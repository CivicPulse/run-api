# Codebase Structure

**Analysis Date:** 2026-03-09

## Directory Layout

```
run-api/
├── docs/                    # Project documentation and research
│   ├── campaign_platforms_research.md   # Competitive analysis of campaign tech platforms
│   └── spec_driven_dev(SDD).md         # Development methodology documentation
├── .planning/               # Planning artifacts (GSD tooling)
│   └── codebase/            # Codebase analysis documents
├── main.py                  # Placeholder entry point (hello world)
├── pyproject.toml           # Project metadata and dependencies (uv/pip)
├── uv.lock                  # Locked dependency versions
├── .python-version          # Python version pinned to 3.13
├── .gitignore               # Standard Python gitignore
├── init.md                  # Project vision, feature list, and priorities
├── README.md                # Brief project description
└── LICENSE                  # Project license
```

## Directory Purposes

**`docs/`:**
- Purpose: Project documentation, research, and methodology guides
- Contains: Markdown files with competitive research and development methodology
- Key files: `campaign_platforms_research.md` (detailed competitive analysis), `spec_driven_dev(SDD).md` (SDD methodology)

**`.planning/`:**
- Purpose: GSD planning and codebase analysis artifacts
- Contains: Generated analysis documents
- Generated: Yes (by GSD tooling)
- Committed: Yes

## Key File Locations

**Entry Points:**
- `main.py`: Current placeholder entry point — prints "Hello from run-api!"

**Configuration:**
- `pyproject.toml`: Project metadata, Python version requirement (>=3.13), all dependencies
- `.python-version`: Pins Python to 3.13
- `uv.lock`: Locked dependency tree

**Documentation:**
- `init.md`: Project vision document — defines all planned features and their priority order
- `docs/campaign_platforms_research.md`: Competitive analysis of NGPVAN, ActBlue, NationBuilder, GoodParty.org
- `docs/spec_driven_dev(SDD).md`: Development methodology (Specification-Driven Development)

## Naming Conventions

**Files:**
- Python files: `snake_case.py` (only `main.py` exists currently)
- Documentation: `snake_case.md` or `UPPER_CASE.md` for standard files (README, LICENSE)

**Directories:**
- Lowercase with hyphens or underscores (only `docs/` exists currently)

## Where to Add New Code

**New FastAPI Application:**
- Create an `app/` package at project root: `app/__init__.py`, `app/main.py`
- Routers/endpoints: `app/api/` or `app/routers/`
- Pydantic schemas: `app/schemas/`
- SQLAlchemy models: `app/models/`
- Business logic: `app/services/`
- Database utilities: `app/db/`
- Configuration: `app/config.py` or `app/core/config.py`

**Database Migrations:**
- Initialize Alembic at project root: `alembic/` directory
- Config file: `alembic.ini`

**CLI Commands:**
- Typer CLI: `app/cli/` or `cli.py` at project root

**Feature Specifications (SDD methodology):**
- Specifications: `specs/{feature-number}-{feature-name}/spec.md`
- Implementation plans: `specs/{feature-number}-{feature-name}/plan.md`
- Tasks: `specs/{feature-number}-{feature-name}/tasks.md`

**Tests:**
- Test directory: `tests/` at project root
- Test files: `tests/test_{module}.py` or mirror app structure: `tests/api/`, `tests/services/`, etc.
- Test config: `pyproject.toml` `[tool.pytest]` section or `pytest.ini` / `conftest.py`

**Utilities:**
- Shared helpers: `app/utils/` or `app/core/`

## Special Directories

**`.venv/`:**
- Purpose: Python virtual environment managed by uv
- Generated: Yes (by `uv sync`)
- Committed: No (in `.gitignore`)

**`docs/`:**
- Purpose: Research and methodology documentation
- Generated: No (manually authored)
- Committed: Yes

**`.planning/`:**
- Purpose: GSD codebase analysis artifacts
- Generated: Yes (by GSD tooling)
- Committed: Yes

## Package Management

- Use `uv` exclusively for all Python operations
- Run Python with `uv run python ...` or `uv run ...`
- Add dependencies: `uv add <package>` or `uv add --dev <package>`
- Remove dependencies: `uv remove <package>`
- Never use system Python directly

## Project State

This is a greenfield project in pre-implementation phase. Only the project scaffold exists:
- Dependencies are declared but no application code has been written
- No directory structure beyond `docs/` has been created
- No tests, no database models, no API endpoints, no configuration
- The `main.py` is a placeholder that prints a greeting

When building out the application, establish the directory structure described in "Where to Add New Code" above before writing feature code.

---

*Structure analysis: 2026-03-09*
