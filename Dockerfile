# =============================================================================
# Multi-stage production Dockerfile for run-api
# Stages: frontend (node build) -> deps (uv install) -> runtime (python-slim)
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Build frontend (Vite/React)
# ---------------------------------------------------------------------------
FROM node:22-slim AS frontend

WORKDIR /build
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build
# Output: /build/dist/

# ---------------------------------------------------------------------------
# Stage 2: Install Python dependencies with uv
# ---------------------------------------------------------------------------
FROM python:3.13-slim AS deps

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /build
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
# Output: /build/.venv/

# ---------------------------------------------------------------------------
# Stage 3: Production runtime
# ---------------------------------------------------------------------------
FROM python:3.13-slim AS runtime

# System dependencies for shapely/geoalchemy2 (libgeos)
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgeos-dev \
    && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN useradd --create-home --shell /bin/bash app

WORKDIR /home/app

# Python virtualenv from deps stage
COPY --from=deps /build/.venv ./.venv

# Application code
COPY app/ ./app/
COPY main.py ./

# Alembic migrations (for K8s init container pattern)
COPY alembic/ ./alembic/
COPY alembic.ini ./

# Built frontend assets
COPY --from=frontend /build/dist/ ./static/

# Build metadata (injectable via --build-arg)
ARG GIT_SHA=unknown
ARG BUILD_TIMESTAMP=unknown
ENV GIT_SHA=$GIT_SHA \
    BUILD_TIMESTAMP=$BUILD_TIMESTAMP

# Runtime configuration
ENV PATH="/home/app/.venv/bin:$PATH" \
    WORKERS=1

# Run as non-root
USER app

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port 8000 --workers ${WORKERS:-1} --log-level info"]
