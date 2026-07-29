# MCP notes — Dograh Ops + eval tools

## Two MCP layers

| MCP | Host | Role |
| --- | --- | --- |
| **Dograh MCP** (instance) | Your Dograh / DograhV2 server | Inspect workflows, node schemas, draft prompt/graph edits |
| **Ops MCP** (future package) | Separate from this Vite app | Expose Optimize data: scoreboard, worst runs, QA parse |

This dashboard remains **read-only** on Dograh REST. MCP draft tools must stay **human-gated** for publish.

## How agents should use eval tools via MCP / skills

When connected to Claude / Codex / Hermes with repo access:

1. Read `eval/manifest.json` for tool registry.  
2. For offline transcript scoring → skill **`skills/eval-deepeval`**.  
3. For KB/fact answers → skill **`skills/eval-ragas`**.  
4. For live production diagnosis → Optimize data / Dograh REST (not DeepEval).  
5. For workflow edits → **Dograh MCP** draft only.

Suggested future Ops MCP tools (not implemented yet):

| Tool | Maps to |
| --- | --- |
| `ops_get_optimization_bundle` | `buildOptimizationFromRuns` |
| `ops_parse_run_qa` | `parseRunQa` |
| `ops_list_worst_runs` | scoreboard worst list |
| `ops_eval_deepeval_run` | shell out to `eval/python/run_deepeval.py` (optional) |
| `ops_eval_ragas_turn` | shell out to `run_ragas.py` |

## Dograh MCP loop with Optimize P0

1. On `/optimize`, identify weak node (drop-off + tags).  
2. Open worst runs + Langfuse.  
3. With Dograh MCP: request a **draft-only** prompt fix.  
4. Optional: DeepEval/Promptfoo offline.  
5. Human publishes in Dograh → re-sample Optimize.  

## Do not automate

- Auto-publish to production  
- Silent prompt rewrites from the dashboard  
- Writing scores back into Dograh without product support  
