# Deploy ops-dashboard on Vercel

1. Import GitHub repo `dsactivi-2/dograhV2` (or merge `feature/ops-dashboard` first).
2. Set **Root Directory** to `ops-dashboard`.
3. Add environment variables from `.env.example` (Production + Preview).
4. Deploy Production.

Do **not** set Root Directory to the monorepo root — that is Dograh platform (`api/`, `ui/`), not this app.
