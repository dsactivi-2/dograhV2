# Dograh Ops Dashboard

Standalone **read-only** operations & optimization dashboard for a Dograh / DograhV2 instance.

Lives as `ops-dashboard/` inside [dsactivi-2/dograhV2](https://github.com/dsactivi-2/dograhV2) so platform code (`api/`, `ui/`, …) stays untouched.

## Stack

React 19 · TypeScript · TanStack Start · TanStack Query · Tailwind v4 · Recharts

Talks to Dograh **only** via public REST (`X-API-Key`). Does not modify Dograh `ui/`.

## Features

- Overview: campaigns + workflows, live counters, date range
- Campaign / workflow detail, run table, CSV export
- Call detail: transcript, audio, graph (zoom/pan), tool calls, Open in Langfuse
- **Optimization** page: QA scoreboard, worst runs, node drop-off, data integrity
- Eval groundwork: Promptfoo, DeepEval, Ragas (offline), Langfuse metrics (env)
- Sim customer personas (V2 plan under `docs/sim-customer-v2.md`)

## Local run

```bash
cd ops-dashboard
cp .env.example .env
# set DOGRAH_API_URL, DOGRAH_API_KEY, DOGRAH_USE_MOCK=false
npm install
npm run dev
```

## Vercel

- **Root Directory**: `ops-dashboard`
- **Framework**: Vite / auto
- **Build**: `npm run build`
- **Env** (Production + Preview): see `.env.example`

## Env

| Variable | Required | Purpose |
| --- | --- | --- |
| `DOGRAH_API_URL` | yes | Dograh base URL |
| `DOGRAH_API_KEY` | yes | `X-API-Key` |
| `DOGRAH_USE_MOCK` | no | `false` for live |
| `LANGFUSE_PUBLIC_KEY` | no | Metrics API |
| `LANGFUSE_SECRET_KEY` | no | Metrics API |
| `LANGFUSE_HOST` | no | default `https://cloud.langfuse.com` |

Never commit real secrets.
