# Usage guide — Eval tools (DeepEval, Ragas, Promptfoo)

*User-facing guide (also suitable to paste into Notion).*

## What is this?

Your Ops Dashboard shows **live quality scores** from Dograh (after each call).  
Separately, you can run **offline evaluation tools** on your computer or in CI to test prompt changes **before** rolling them out to production voice.

| Tool | What it is for | Where it lives |
| --- | --- | --- |
| **Dograh QA** (primary) | Real call scores after production/test calls | Optimize page in the dashboard |
| **Promptfoo** | Quick text regression tests | `eval/promptfoo.yaml` |
| **DeepEval** | Offline AI judge on a full transcript | `eval/python/run_deepeval.py` |
| **Ragas** | Checks answers against knowledge/context | `eval/python/run_ragas.py` |

## Dashboard toggles (Optimize → Evaluation tools)

The checkboxes **do not run Python in the browser**. They:

- Remember what you care about (local browser storage)
- Show whether the tool is **ready** or **needs configuration**
- Point you to docs / env vars

Actual scoring still happens:

1. **Live:** Dograh writes QA → Optimize reads it  
2. **Offline:** You run npm/Python commands locally or in GitHub Actions  

## DeepEval — step by step

1. Install Python 3.10+  
2. In the project folder (`ops-dashboard/` if monorepo):

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r eval/python/requirements.txt
```

3. Export a transcript from a bad call (run detail) into a text file, or paste text.  
4. Run:

```bash
export EVAL_DEEPEVAL=true
export OPENAI_API_KEY=sk-...   # or your provider key
npm run eval:deepeval -- --transcript ./my-call.txt
```

5. Compare with Dograh’s score on Optimize — use DeepEval as a **second opinion**, not a silent override.

Dry run (no LLM cost):

```bash
npm run eval:deepeval -- --dry-run --text "BOT: Hello. USER: Stop calling."
```

## Ragas — step by step

Use when the agent quotes **prices, policies, or KB facts**:

```bash
export EVAL_RAGAS=true
export OPENAI_API_KEY=sk-...
npm run eval:ragas -- \
  --question "Koliko košta?" \
  --answer "99 KM sa dostavom." \
  --contexts "Cijena 99 KM" "Dostava besplatna u BiH"
```

## Promptfoo

```bash
npm run eval:promptfoo
# needs OPENAI_API_KEY for live evals; config is always present
```

## Recommended workflow

1. Optimize → find worst runs / weak dimensions  
2. Open run + Langfuse  
3. Draft a prompt fix in Dograh (human)  
4. Optional: Promptfoo or DeepEval offline  
5. Place test calls (or sim V2 later)  
6. Re-check Optimize averages  

## More detail

- Technical: `eval/README.md`  
- Registry: `eval/manifest.json`  
- Agent skill: `skills/eval-deepeval/SKILL.md`, `skills/eval-ragas/SKILL.md`  
- Env list: `.env.example` at project root  
