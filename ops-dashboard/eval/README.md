# Eval & optimization tool stack

Groundwork for the semi-automatic improvement loop. The **Optimization** page (`/optimize`) is the P0 product surface; this folder is the offline/CI foundation.

## Data correctness (dashboard)

Parser **v2** (`src/lib/dograh/qa.ts`):

| Field | Source | Aggregation |
| --- | --- | --- |
| Dimensions | `annotations.qa_*/node_results[*].raw_response.scores` | Mean across QA nodes (sample size tracked) |
| Overall | Dograh `overall_score` per node | **Mean of node overalls** (not re-derived from dimensions) |
| Sales / Delivery / Safety | Our category keys | Mean of present dims; needs ≥ half of keys |
| Tags | Prefer `annotations.tags` | Call-level authoritative |
| Prompt tokens | `usage_info.llm[*].prompt_tokens` | Sum per run; scoreboard averages sums |
| Unscored runs | Missing QA | **Excluded** from averages (never treated as 0) |

See **Data integrity** panel on `/optimize` for live warnings.

## Tools

| Piece | Path | Status |
| --- | --- | --- |
| Dograh QA parser | `src/lib/dograh/qa.ts` | Live (v2) |
| Optimization UI | `/optimize` | Live |
| Rubric | `eval/rubric.json` | Ready |
| LLM-as-judge prompt | `eval/judge-prompt.md` | Ready |
| Promptfoo | `eval/promptfoo.yaml` | Scaffold |
| DeepEval | `eval/python/run_deepeval.py` | Offline, gated `EVAL_DEEPEVAL=true` |
| Ragas | `eval/python/run_ragas.py` | Offline, gated `EVAL_RAGAS=true` |
| Langfuse Metrics API | server `fetchLangfuseMetrics` | Needs `LANGFUSE_*` secrets |
| CI | `.github/workflows/eval.yml` | Scaffold |
| Sim personas V2 | `eval/personas/`, `docs/sim-customer-v2.md` | Plan + samples |

## Install offline Python stack

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r eval/python/requirements.txt
export EVAL_DEEPEVAL=true OPENAI_API_KEY=...
python eval/python/run_deepeval.py --text "BOT: ... USER: ..."
```

## Promptfoo

```bash
npm i -D promptfoo   # optional
npx promptfoo eval -c eval/promptfoo.yaml
```

## Langfuse Metrics

Dograh’s `langfuse-credentials` endpoint returns **masked** keys. For aggregated trends in the dashboard:

```env
LANGFUSE_HOST=https://cloud.langfuse.com
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
```

Toggle **Langfuse metrics** on Optimize → Evaluation tools.

## CI next steps (actionable)

1. Push this repo to GitHub.  
2. Add secrets: `OPENAI_API_KEY` (Promptfoo/DeepEval), optional `LANGFUSE_*`.  
3. Enable `.github/workflows/eval.yml` (already scaffolds Promptfoo on `eval/**` changes).  
4. Optional job: `pip install -r eval/python/requirements.txt` + DeepEval on sample fixtures.  
5. Fail PRs that break hard gates (`order_safety`, DNC persona text fixtures).

## Sim customers V2

See [`docs/sim-customer-v2.md`](../docs/sim-customer-v2.md). Personas in `eval/personas/`.
