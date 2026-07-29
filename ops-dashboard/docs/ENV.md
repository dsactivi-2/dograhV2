# Environment variables

## Where to find the list

| Location | Purpose |
| --- | --- |
| **[`.env.example`](../.env.example)** | **Canonical list** of all supported variables (checked into git) |
| **`.env`** | Your local secrets (gitignored — never commit) |
| **Vercel → Project → Settings → Environment Variables** | Production / Preview deploy |
| **This file** | Human explanation of each variable |

In the monorepo layout under DograhV2:

```text
dograhV2/ops-dashboard/.env.example   ← same file
```

In the Grok / standalone workspace:

```text
/workspace/.env.example
```

## Variable reference

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `DOGRAH_API_URL` | Yes (live) | `http://localhost:3000` | Dograh API base URL **without** trailing path like `/overview` |
| `DOGRAH_API_KEY` | Yes (live) | empty | Sent as `X-API-Key`. Empty → mock mode unless forced |
| `DOGRAH_USE_MOCK` | No | `true` if no key | `false` = force live API |
| `LANGFUSE_HOST` | No | `https://cloud.langfuse.com` | Langfuse origin for Metrics API |
| `LANGFUSE_PUBLIC_KEY` | No | — | Metrics API (`pk-lf-…`) |
| `LANGFUSE_SECRET_KEY` | No | — | Metrics API (`sk-lf-…`) |
| `EVAL_DEEPEVAL` | No | off | Must be `true` to run DeepEval (cost gate) |
| `EVAL_RAGAS` | No | off | Must be `true` to run Ragas |
| `EVAL_PROMPTFOO` | No | on | Set `false` to mark Promptfoo disabled in status |
| `OPENAI_API_KEY` | For offline eval | — | Used by DeepEval / Ragas / Promptfoo (not read by dashboard UI) |
| `SIM_CUSTOMER_PHONE` | Sim V2 | — | Dedicated inbound number for simulated customer |
| `SIM_CUSTOMER_GATEWAY_URL` | Sim V2 | — | URL of customer gateway when built |

## How the app loads Dograh env

Server-side: `src/lib/dograh/env.server.ts` reads `process.env` and optionally a local `.env` file (never shipped to the browser).

## Security

- Never commit `.env`
- Never put `DOGRAH_API_KEY` or Langfuse secret in client code
- Rotate keys if pasted into chat
