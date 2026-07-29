# Dograh Live Operations Dashboard

Standalone **read-only** operations dashboard for monitoring outbound campaigns on a self-hosted (or cloud) [Dograh](https://github.com/dograh-hq/dograh) instance.

Talks to Dograh exclusively through the public REST API (`X-API-Key`). Does **not** modify the official Dograh `ui/` folder.

## Features

- **Overview** — live campaign widgets (running + paused), progress bars, failed counts, in-progress calls
- **Global date range** — filters stats and run lists (Today / 7d / 30d / 90d / custom)
- **Campaign detail** — live progress, success rate, cost & duration, disposition charts, paginated/filterable/sortable runs table, CSV export
- **Call detail** — transcript, audio player, initial/gathered context JSON, cost breakdown, logs
- **Live polling** — TanStack Query every ~7s with last-updated indicator
- **Dark / light mode**
- **Demo mode** — rich mock data when no API key is configured

## Stack

React 19 · TypeScript · TanStack Start / Router / Query / Table · Tailwind CSS v4 · Recharts · date-fns · Radix/shadcn-style UI

> Built as a standalone TanStack Start app (Vite) rather than Next.js so it runs cleanly in this environment and deploys to Vercel. Architecture mirrors a typical App Router product: typed API client, server functions for secrets, client polling for live data.

## Setup

### 1. Environment

```bash
cp .env.example .env
```

| Variable | Description |
| --- | --- |
| `DOGRAH_API_URL` | Base URL of your Dograh API (e.g. `http://localhost:3000` or `https://app.dograh.com`) |
| `DOGRAH_API_KEY` | API key from Dograh **API Keys** page — sent as `X-API-Key` |
| `DOGRAH_USE_MOCK` | `true` forces demo data; when the key is empty, mock is **on** by default |

### 2. Install & run

```bash
npm install
npm run dev
```

App listens on `http://0.0.0.0:8080`.

### 3. Production build

```bash
npm run build
npm run preview   # or deploy the Nitro/Vercel output
```

## Dograh API surface used

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/campaign/` | List campaigns |
| `GET` | `/api/v1/campaign/{id}` | Campaign detail |
| `GET` | `/api/v1/campaign/{id}/progress` | Live progress |
| `GET` | `/api/v1/campaign/{id}/runs` | Paginated runs (`page`, `limit`, `filters`, `sort_by`, `sort_order`) |
| `GET` | `/api/v1/workflow/{workflow_id}/runs/{run_id}` | Full run (transcript, recording, context) |

Auth header: `X-API-Key: <key>`

## Project layout

```text
src/
  lib/dograh/          # Typed client, mock data, server functions, stats
  lib/date-range.tsx   # Global date range provider
  lib/theme.tsx        # Dark / light mode
  components/          # UI + domain widgets
  routes/              # Overview, campaign detail, call detail
```

## Scope notes

- **Read-only** — no pause / resume / redial controls
- Disposition primarily from `gathered_context.call_disposition`
- Real-time via **polling only** (no WebSockets)

## License

Use freely alongside your Dograh deployment.
