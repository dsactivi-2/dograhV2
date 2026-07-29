# Architecture — Dograh Ops Dashboard

Standalone **operations + optimization** app for Dograh / DograhV2.  
Lives as `ops-dashboard/` in monorepo [dsactivi-2/dograhV2](https://github.com/dsactivi-2/dograhV2) (does **not** modify `ui/` or `api/`).

## Stack

- TanStack Start (Vite) + React 19 + TypeScript  
- TanStack Query (polling)  
- Tailwind v4 + shadcn-style UI + Recharts  
- Server functions hold `DOGRAH_API_KEY` (never client)  
- Deploy target: **Vercel** (`nitro` preset on build), Root Directory = `ops-dashboard`

## Product areas

| Route | Role |
| --- | --- |
| `/` | Live overview (campaigns + workflows) |
| `/campaigns/*`, `/workflows/*` | Detail + runs + call detail |
| `/optimize` | QA scoreboard, suggestions path, eval discoverability |
| `/lab` (planned) | Test Lab — controlled calls, sim, schedule |

## Data flow

```text
Browser  →  createServerFn  →  Dograh REST (X-API-Key)
                │
                ├── list workflows/runs
                ├── get run → parse annotations.qa_* (src/lib/dograh/qa.ts v2)
                └── optional Langfuse Metrics API (LANGFUSE_*)

Offline: eval/ (Promptfoo, DeepEval, Ragas) — not in the browser
```

## Write path (future, gated)

See `docs/automation-loop.md`. Defaults remain **read-only** until:

```env
OPS_ALLOW_WORKFLOW_WRITE=true
OPS_ALLOW_TEST_CALLS=true
```

Dograh supports `create-draft` → `PUT` definition → `validate` → `publish`.

## Eval stack

Registry: `eval/manifest.json`  
Guide: `docs/user/eval-tools.md`  
Skills: `skills/eval-deepeval`, `skills/eval-ragas`  
Agents: `agents/AGENTS.md`

## Key docs

| Doc | Topic |
| --- | --- |
| `docs/ENV.md` | Environment variables |
| `docs/automation-loop.md` | Observe→Suggest→Approve→Apply→Retest |
| `docs/test-control-page.md` | Test Lab + Asterisk |
| `docs/sim-customer-v2.md` | Sim customer blockers & plan |
| `docs/optimization-system-architecture.md` | Long-form optimization system |
| `DEPLOY.md` | Vercel root directory notes |

## Security

- Secrets only in server env / Vercel  
- No auto-publish  
- Test numbers allowlisted when Lab ships  
