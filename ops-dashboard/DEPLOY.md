# Deploy ops-dashboard on Vercel

## Required settings

| Setting | Value |
| --- | --- |
| Git repo | `dsactivi-2/dograhV2` |
| **Root Directory** | **`ops-dashboard`** |
| Build | `npm run build` |
| Install | `npm install` |
| Framework | Vite (auto) |

## Critical

If Root Directory is the **monorepo root**, Vercel builds Dograh platform UI/API packaging — **not** this dashboard.  
Production URL must serve the TanStack Ops app (Optimize, workflows, etc.).

## Environment variables

See `.env.example` and `docs/ENV.md`.

Minimum live:

```
DOGRAH_API_URL=https://your-dograh-host
DOGRAH_API_KEY=...
DOGRAH_USE_MOCK=false
```

Optional: `LANGFUSE_*`, eval gates, `OPS_ALLOW_*` (future write/test).

## After deploy checklist

1. Open `/` — workflows/campaigns load (or mock if misconfigured)
2. Open `/optimize` — scoreboard for a workflow with QA
3. Confirm API key never appears in browser network as plain client env
