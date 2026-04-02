# Getting Started: System Administrator

Deploy and configure CivicPulse Run for local development or production use.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start (Docker Compose)](#quick-start-docker-compose)
- [ZITADEL Configuration](#zitadel-configuration)
- [Environment Variables Reference](#environment-variables-reference)
- [Storage (MinIO)](#storage-minio)
- [Database](#database)
- [Production Deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)
- [See Also](#see-also)

## Overview

CivicPulse Run is a multi-tenant, nonpartisan platform for managing political campaign field operations. It consists of:

- **API server** -- Python/FastAPI backend serving both the REST API and the built React frontend
- **PostgreSQL + PostGIS** -- Relational database with geographic extensions for turf cutting and walk lists
- **MinIO** -- S3-compatible object storage for voter CSV file uploads (Cloudflare R2 in production)
- **ZITADEL** -- External OIDC identity provider for authentication

This guide walks you through deploying all local services with Docker Compose and configuring the external ZITADEL dependency.

## Prerequisites

| Requirement | Minimum Version | Notes |
|-------------|----------------|-------|
| Docker | 24+ | With Docker Compose v2 |
| Docker Compose | v2.20+ | Included with Docker Desktop |
| Git | 2.30+ | For cloning the repository |
| ZITADEL instance | Latest | Self-hosted or cloud at [zitadel.com](https://zitadel.com/docs) |

You do **not** need Python, Node.js, or any other runtime installed locally -- everything runs inside containers.

## Quick Start (Docker Compose)

### 1. Clone the repository

```bash
git clone <repo-url>
cd run-api
```

### 2. Create your environment file

```bash
cp .env.example .env
```

### 3. Start all services from a clean slate

```bash
docker compose down -v
docker compose up --build
```

Docker Compose will start the full local stack:
- **api** -- Builds from the Dockerfile, runs migrations automatically, then starts uvicorn with hot-reload
- **web** -- Vite dev server with proxying to the API and MinIO
- **postgres** -- PostGIS 17-3.5 with health checks
- **minio** -- S3-compatible object storage with console UI
- **zitadel** -- Local OIDC provider for browser login
- **zitadel-bootstrap** -- One-shot bootstrap that creates the local project/apps
- **worker** -- Background task worker

No external ZITADEL setup is required for local Docker development. The
bootstrap container writes the local auth settings automatically on first boot.

### 4. Verify services are running

| Service | URL | Expected |
|---------|-----|----------|
| Web UI | http://localhost:5173 | React app with Vite proxy |
| API | http://localhost:18000 | FastAPI backend |
| API Docs | http://localhost:18000/docs | Swagger/OpenAPI interactive docs |
| ZITADEL | http://localhost:8080 | Local auth server |
| MinIO Console | http://localhost:9001 | MinIO admin dashboard |
| MinIO API | http://localhost:9000 | S3-compatible endpoint |
| PostgreSQL | localhost:5433 | Connect with any SQL client |

The API container automatically:
1. Runs Alembic database migrations (`alembic upgrade head`)
2. Creates the MinIO `voter-imports` bucket if it does not exist
3. Starts uvicorn with hot-reload on port 8000

Default local admin login after the first successful boot:

- `admin@localhost` / `Admin1234!`

## ZITADEL Configuration

CivicPulse Run uses [ZITADEL](https://zitadel.com/docs) as its OIDC identity provider. You need to create two applications in your ZITADEL project:

### 1. Create a ZITADEL project

1. Log in to your ZITADEL instance (e.g., `https://auth.civpulse.org`)
2. Navigate to **Projects** and create a new project
3. Note the **Project ID** -- this is your `ZITADEL_PROJECT_ID`

### 2. Create a service account (backend API)

The backend uses a service account to make authenticated API calls to ZITADEL (e.g., looking up user details).

1. In your project, go to **Applications** > **New**
2. Select **API** application type
3. Choose **Basic** authentication method
4. Note the **Client ID** and **Client Secret** -- these are your `ZITADEL_SERVICE_CLIENT_ID` and `ZITADEL_SERVICE_CLIENT_SECRET`

### 3. Create an SPA application (browser OIDC)

The React frontend uses PKCE-based OIDC login flow.

1. In your project, go to **Applications** > **New**
2. Select **User Agent** (SPA) application type
3. Configure redirect URIs:
   - `http://localhost:5173/callback` (Vite dev server)
   - `http://localhost:8000/callback` (production/Docker)
4. Configure post-logout redirect URIs:
   - `http://localhost:5173`
   - `http://localhost:8000`
5. Note the **Client ID** -- this is your `ZITADEL_SPA_CLIENT_ID`

### 4. Update your .env file

```dotenv
ZITADEL_ISSUER=https://auth.civpulse.org
ZITADEL_PROJECT_ID=<project-id-from-step-1>
ZITADEL_SERVICE_CLIENT_ID=<client-id-from-step-2>
ZITADEL_SERVICE_CLIENT_SECRET=<client-secret-from-step-2>
ZITADEL_SPA_CLIENT_ID=<client-id-from-step-3>
```

## Environment Variables Reference

### Backend (.env)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `APP_NAME` | No | `CivicPulse Run API` | Application display name |
| `DEBUG` | No | `false` | Enable debug mode |
| `DATABASE_URL` | No | `postgresql+asyncpg://postgres:postgres@localhost:5432/run_api` | Async database connection string (used by the application) |
| `DATABASE_URL_SYNC` | No | `postgresql+psycopg2://postgres:postgres@localhost:5432/run_api` | Sync database connection string (used by Alembic migrations) |
| `ZITADEL_ISSUER` | Yes | `https://auth.civpulse.org` | ZITADEL instance URL (OIDC issuer) |
| `ZITADEL_PROJECT_ID` | Yes | -- | ZITADEL project ID |
| `ZITADEL_SERVICE_CLIENT_ID` | Yes | -- | Service account client ID for backend API calls |
| `ZITADEL_SERVICE_CLIENT_SECRET` | Yes | -- | Service account client secret |
| `ZITADEL_SPA_CLIENT_ID` | Yes | -- | SPA application client ID for browser OIDC |
| `CORS_ALLOWED_ORIGINS` | No | `["http://localhost:5173"]` | JSON array of allowed CORS origins |
| `S3_ENDPOINT_URL` | No | `http://localhost:9000` | S3-compatible storage endpoint |
| `S3_PRESIGN_ENDPOINT_URL` | No | Same as `S3_ENDPOINT_URL` | Public-facing URL for presigned upload URLs |
| `S3_ACCESS_KEY_ID` | No | `minioadmin` | S3 access key |
| `S3_SECRET_ACCESS_KEY` | No | `minioadmin` | S3 secret key |
| `S3_BUCKET` | No | `voter-imports` | S3 bucket name for voter file uploads |
| `S3_REGION` | No | `us-east-1` | S3 region |

### Frontend (build-time via Docker)

These are passed as build arguments in `docker-compose.yml` and baked into the React build:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_BASE_URL` | No | `http://localhost:8000` | API base URL for frontend requests |
| `VITE_ZITADEL_ISSUER` | No | `https://auth.civpulse.org` | ZITADEL issuer for browser OIDC |
| `VITE_ZITADEL_CLIENT_ID` | Yes | -- | SPA client ID (same as `ZITADEL_SPA_CLIENT_ID`) |
| `VITE_ZITADEL_PROJECT_ID` | Yes | -- | ZITADEL project ID (same as `ZITADEL_PROJECT_ID`) |

**Note:** In Docker Compose, the `DATABASE_URL` and `S3_ENDPOINT_URL` are overridden in the `environment` section to use container network hostnames (`postgres`, `minio`) instead of `localhost`.

## Storage (MinIO)

MinIO provides S3-compatible object storage for voter CSV file uploads during development.

### Default credentials

| Setting | Value |
|---------|-------|
| Root user | `minioadmin` |
| Root password | `minioadmin` |
| Console URL | http://localhost:9001 |
| API endpoint | http://localhost:9000 |

### Bucket auto-creation

The `dev-entrypoint.sh` script automatically creates the `voter-imports` bucket on startup if it does not exist. No manual setup is needed.

### Production note

In production, CivicPulse uses **Cloudflare R2** as the S3-compatible storage backend. The same `S3_*` environment variables are used -- just point them to your R2 endpoint and credentials instead of MinIO.

## Database

### Engine

PostgreSQL with PostGIS extensions, using the `postgis/postgis:17-3.5` Docker image. PostGIS enables geographic operations for canvassing features like turf cutting and walk list generation.

### Default credentials (development)

| Setting | Value |
|---------|-------|
| Host | `localhost` |
| Port | `5433` (mapped from container port 5432) |
| Database | `run_api` |
| User | `postgres` |
| Password | `postgres` |

### Migrations

Database migrations run automatically on container startup via the `dev-entrypoint.sh` script, which executes:

```bash
python -m alembic upgrade head
```

Migrations are managed with [Alembic](https://alembic.sqlalchemy.org/) and located in the `alembic/` directory.

### Seed data

To populate the database with sample data for development:

```bash
docker compose exec api python scripts/seed.py
```

## Production Deployment

For production deployment on Kubernetes with ArgoCD, see the [K8s Deployment Guide](k8s-deployment-guide.md).

Key differences from local development:

- **Database** -- External PostgreSQL instance (not containerized)
- **Storage** -- Cloudflare R2 instead of MinIO
- **Ingress** -- Cloudflare Tunnel to Traefik IngressRoute
- **Auth** -- Same ZITADEL instance, production redirect URIs
- **Images** -- Built via GitHub Actions CI/CD, pushed to GHCR

## Troubleshooting

### ZITADEL connection refused

**Symptom:** API fails to start with OIDC discovery errors or connection refused to the ZITADEL issuer.

**Fix:** Verify `ZITADEL_ISSUER` in your `.env` file is correct and reachable from your machine. The API container needs to reach this URL to download OIDC configuration. If your ZITADEL instance is on a private network, ensure the Docker container can access it (you may need to configure Docker networking or use `ZITADEL_BASE_URL` for in-cluster access).

### MinIO health check failing

**Symptom:** The `api` container waits indefinitely because the `minio` health check never passes.

**Fix:** MinIO can take 10-15 seconds to become healthy on first startup. If it consistently fails, check Docker logs:

```bash
docker compose logs minio
```

Ensure ports 9000 and 9001 are not in use by another process.

### Database migration errors

**Symptom:** The API container exits with Alembic migration errors.

**Fix:** Check the `DATABASE_URL` is correct. In Docker Compose, the API connects to `postgres:5432` (container hostname), not `localhost:5433`. The `docker-compose.yml` overrides this automatically. If you see connection refused errors, the postgres container may not be healthy yet -- check with:

```bash
docker compose ps
docker compose logs postgres
```

### Port conflicts

**Symptom:** "address already in use" errors on startup.

**Fix:** CivicPulse Run uses ports 8000 (API), 5433 (PostgreSQL), 9000 (MinIO API), and 9001 (MinIO Console). Stop any conflicting services or change the port mappings in `docker-compose.yml`.

### Hot-reload not working

**Symptom:** Code changes in `app/` are not reflected without restarting.

**Fix:** The `docker-compose.yml` mounts `./app`, `./main.py`, `./alembic`, and `./scripts` as volumes. Uvicorn watches these for changes. If hot-reload stops working, try:

```bash
docker compose restart api
```

## See Also

- [README.md](../README.md) -- Project overview and quick start
- [Campaign Manager Guide](getting-started-campaign-manager.md) -- Set up and run campaign operations
- [Volunteer Guide](getting-started-volunteer.md) -- Field mode, canvassing, and phone banking
- [K8s Deployment Guide](k8s-deployment-guide.md) -- Production Kubernetes deployment with ArgoCD
