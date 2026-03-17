# CivicPulse Run

A multi-tenant, nonpartisan platform for managing political campaign field operations. Any candidate, regardless of party or budget, can run professional-grade field operations.

## Features

- **Campaign Management** -- Create and manage campaigns with role-based access
- **Voter CRM** -- Import voter files (CSV, including L2 format), manage voter lists and tags, track contact history
- **Canvassing** -- Geographic turf cutting with PostGIS, walk list generation, mobile field mode with offline support
- **Phone Banking** -- Call list management, phone bank sessions, scripted calls, DNC compliance
- **Volunteer Coordination** -- Self-service registration, shift management, hour tracking
- **Operational Dashboard** -- Real-time campaign metrics and activity

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.13+, FastAPI, SQLAlchemy (async), PostgreSQL + PostGIS |
| Frontend | React, TypeScript, TanStack Router/Query, shadcn/ui, Tailwind CSS |
| Auth | ZITADEL (OIDC) |
| Storage | MinIO (dev) / Cloudflare R2 (prod) |
| Deployment | Docker Compose (dev), K8s + ArgoCD (prod) |

## Getting Started

Choose the guide for your role:

| Guide | Audience | Description |
|-------|----------|-------------|
| [System Administrator](docs/getting-started-admin.md) | DevOps / IT | Deploy and configure the platform |
| [Campaign Manager](docs/getting-started-campaign-manager.md) | Campaign staff | Set up and run campaign operations |
| [Volunteer](docs/getting-started-volunteer.md) | Field volunteers | Use the app for canvassing and phone banking |

## Quick Start (Development)

```bash
git clone <repo-url>
cd run-api
cp .env.example .env
# Edit .env with your ZITADEL credentials (see Admin guide)
docker compose up
```

- API: http://localhost:8000
- Web UI: http://localhost:8000 (served by API container)
- MinIO Console: http://localhost:9001
- API Docs: http://localhost:8000/docs

## Documentation

- [System Admin Guide](docs/getting-started-admin.md) -- Deployment, configuration, infrastructure
- [Campaign Manager Guide](docs/getting-started-campaign-manager.md) -- Campaign setup and operations
- [Volunteer Guide](docs/getting-started-volunteer.md) -- Field mode, canvassing, phone banking
- [K8s Deployment Guide](docs/k8s-deployment-guide.md) -- Production Kubernetes deployment

## License

[Add license information]
