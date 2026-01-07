# Energy-Unit Statistics Platform

A production-grade MVP for tracking and analyzing energy unit statistics in Germany. This platform processes bulk XML data exports containing solar, wind, and other renewable energy unit registrations, stores them in a normalized database, and exposes aggregated statistics via a read-only REST API.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Energy Statistics Platform                  │
├──────────────────────────┬──────────────────────────────────────┤
│                          │                                       │
│   ┌──────────────────┐   │   ┌─────────────────────────────┐    │
│   │    Ingestor      │   │   │         API Service         │    │
│   │   (CLI Worker)   │   │   │       (Fastify REST)        │    │
│   │                  │   │   │                             │    │
│   │  • Stream ZIP    │   │   │  • GET /meta                │    │
│   │  • Parse XML     │   │   │  • GET /kpi/today           │    │
│   │  • Batch Upsert  │   │   │  • GET /kpi/rolling         │    │
│   │  • Rebuild Aggs  │   │   │  • GET /rankings/bundesland │    │
│   └────────┬─────────┘   │   └─────────────┬───────────────┘    │
│            │             │                 │                     │
│            ▼             │                 ▼                     │
│   ┌──────────────────────┴─────────────────────────────────┐    │
│   │                    PostgreSQL 16                        │    │
│   │  ┌─────────┐  ┌───────────────┐  ┌───────────────────┐ │    │
│   │  │  units  │  │ ingest_runs   │  │  agg_* tables     │ │    │
│   │  └─────────┘  └───────────────┘  └───────────────────┘ │    │
│   └─────────────────────────────────────────────────────────┘    │
│                                                                   │
│   ┌─────────────────────────────────────────────────────────┐    │
│   │                      Redis 7                             │    │
│   │  Response caching with TTL (default: 300s)              │    │
│   └─────────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────┘
```

## 📋 Prerequisites

- **Docker** (with Docker Compose)
- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0

## 🚀 Quick Start

### 1. Clone and Install

```bash
cd /path/to/energy/mvp
pnpm install
```

### 2. Start Infrastructure

```bash
docker compose up -d
```

This starts:
- PostgreSQL 16 on port 5432
- Redis 7 on port 6379

### 3. Run Migrations

```bash
pnpm db:migrate
```

### 4. Generate Demo Data

```bash
pnpm demo:generate
```

This creates `demo-data/bulk.zip` with ~250 energy units (200 solar, 50 wind).

### 5. Ingest Demo Data

```bash
pnpm ingest:demo
```

### 6. Start the API

```bash
pnpm --filter @energy/api dev
```

The API will be available at `http://localhost:3000`.

### One-Command Demo

Alternatively, run everything with a single command:

```bash
pnpm demo:up
```

## 📡 API Endpoints

### GET /health

Health check endpoint.

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "ok",
  "timestamp": "2026-01-07T20:00:00.000Z"
}
```

### GET /meta

Dataset metadata including last successful import.

```bash
curl http://localhost:3000/meta
```

```json
{
  "dataset": {
    "last_success_export_date": "2026-01-06",
    "last_run_id": "550e8400-e29b-41d4-a716-446655440000",
    "total_units": 250
  },
  "generated_at": "2026-01-07T20:00:00.000Z"
}
```

### GET /kpi/today

Daily commissioning statistics by technology.

```bash
# Specific day
curl "http://localhost:3000/kpi/today?day=2026-01-06"

# Latest (uses last_success_export_date)
curl http://localhost:3000/kpi/today
```

```json
{
  "day": "2026-01-06",
  "kpis": [
    {
      "tech": "solar",
      "count_units": 5,
      "sum_brutto_kw": 125.5,
      "sum_netto_kw": 120.0
    },
    {
      "tech": "wind",
      "count_units": 2,
      "sum_brutto_kw": 7000.0,
      "sum_netto_kw": 6800.0
    }
  ]
}
```

### GET /kpi/rolling

Rolling window statistics.

```bash
# Last 7 days
curl "http://localhost:3000/kpi/rolling?days=7&end=2026-01-06"

# Last 30 days (defaults to latest)
curl "http://localhost:3000/kpi/rolling?days=30"
```

```json
{
  "start_date": "2025-12-31",
  "end_date": "2026-01-06",
  "days": 7,
  "kpis": [
    {
      "tech": "solar",
      "count_units": 45,
      "sum_brutto_kw": 5625.0,
      "sum_netto_kw": 5400.0
    }
  ]
}
```

### GET /rankings/bundesland

Top Bundesland rankings by metric.

```bash
# Top Bundesland for solar by brutto_kw
curl "http://localhost:3000/rankings/bundesland?days=7&tech=solar&metric=brutto_kw"

# Top Bundesland for wind by netto_kw
curl "http://localhost:3000/rankings/bundesland?days=7&tech=wind&metric=netto_kw"
```

```json
{
  "tech": "solar",
  "metric": "brutto_kw",
  "start_date": "2025-12-31",
  "end_date": "2026-01-06",
  "rankings": [
    {
      "bundesland_code": "08",
      "count_units": 15,
      "sum_brutto_kw": 1875.0,
      "sum_netto_kw": 1800.0,
      "metric_value": 1875.0
    },
    {
      "bundesland_code": "09",
      "count_units": 12,
      "sum_brutto_kw": 1500.0,
      "sum_netto_kw": 1440.0,
      "metric_value": 1500.0
    }
  ],
  "total": {
    "count_units": 45,
    "sum_brutto_kw": 5625.0,
    "sum_netto_kw": 5400.0
  }
}
```

## 📊 Understanding "Commissioned" vs "First Seen"

This platform tracks two distinct concepts:

### Commissioning Date (`commissioning_date`)
The actual date when an energy unit was put into operation. This comes from the `Inbetriebnahmedatum` field in the XML data.

- Used in `agg_commissioning_day` table
- Represents **when the unit started producing energy**
- Query via `/kpi/today` and `/kpi/rolling`

### First Seen Date (`first_seen_export_date`)
The date when the unit first appeared in our data imports.

- Used in `agg_first_seen_day` table
- Represents **when we first learned about the unit**
- Useful for tracking data completeness and lag

**Example**: A solar installation commissioned on 2025-12-01 might first appear in our data on 2026-01-06 if there was a reporting delay.

## 🔧 Using Real Bulk Data

To use real MaStR bulk export data instead of demo data:

```bash
# Run ingestor with custom path and date
pnpm --filter @energy/ingestor ingest -- \
  --bulkPath /path/to/your/Gesamtdatenexport.zip \
  --exportDate 2026-01-07
```

The ingestor supports:
- UTF-8 and UTF-16 encoded XML files
- Split files (e.g., `EinheitenSolar_1.xml`, `EinheitenSolar_2.xml`)
- Various energy unit types (solar, wind, biomass, hydro, storage)

## 🧪 Testing

### Unit Tests

```bash
pnpm test
```

### Integration Tests

Requires Docker for testcontainers:

```bash
pnpm test:integration
```

### Test Coverage

```bash
pnpm test -- --coverage
```

## 📁 Project Structure

```
.
├── docker-compose.yml      # PostgreSQL + Redis
├── db/
│   └── migrations/         # SQL migration files
├── packages/
│   └── shared/             # Shared types and utilities
├── services/
│   ├── ingestor/           # Batch worker CLI
│   └── api/                # Fastify REST API
├── scripts/
│   ├── migrate.ts          # Migration runner
│   └── generateDemo.ts     # Demo data generator
└── test/
    └── integration/        # Integration tests
```

## 🔄 Development Workflow

### Start Development Environment

```bash
# Start DB and Redis
docker compose up -d

# Run migrations
pnpm db:migrate

# Start API in watch mode
pnpm --filter @energy/api dev
```

### Rebuild After Changes

```bash
# Build all packages
pnpm build

# Type check
pnpm typecheck

# Lint
pnpm lint
```

## 🔐 Environment Variables

Copy `.env.example` to `.env` and adjust as needed:

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_HOST` | `localhost` | PostgreSQL host |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_USER` | `energy` | Database user |
| `POSTGRES_PASSWORD` | `energy` | Database password |
| `POSTGRES_DB` | `energy` | Database name |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `API_PORT` | `3000` | API server port |
| `CACHE_TTL` | `300` | Cache TTL in seconds |

## 📈 Caching

All API endpoints are cached in Redis with a default TTL of 300 seconds.

Cache status is indicated via the `x-cache` response header:
- `x-cache: hit` - Response served from cache
- `x-cache: miss` - Fresh response, now cached

```bash
# First request (cache miss)
curl -v http://localhost:3000/meta 2>&1 | grep x-cache
# < x-cache: miss

# Second request (cache hit)
curl -v http://localhost:3000/meta 2>&1 | grep x-cache
# < x-cache: hit
```

## 📝 License

MIT
