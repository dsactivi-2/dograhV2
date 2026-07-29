# Eval & optimization tool stack

First-class offline evaluation for the Dograh Ops Dashboard.

| Entry point | Path |
| --- | --- |
| **Registry** | [`manifest.json`](./manifest.json) |
| **User guide** | [`docs/user/eval-tools.md`](../docs/user/eval-tools.md) |
| **Env reference** | [`docs/ENV.md`](../docs/ENV.md) · [`.env.example`](../.env.example) |
| **Skills** | [`skills/eval-deepeval`](../skills/eval-deepeval/SKILL.md), [`skills/eval-ragas`](../skills/eval-ragas/SKILL.md) |
| **Agent profile** | [`agents/AGENTS.md`](../agents/AGENTS.md) |
| **MCP notes** | [`mcp-notes.md`](./mcp-notes.md) |
| **UI** | Optimize → Evaluation tools |

## Mental model

```text
Dograh live QA  ──►  Optimize scoreboard   (primary production truth)
       │
       ├── Promptfoo   text regression gates (Node)
       ├── DeepEval    offline transcript judge (Python)
       └── Ragas       knowledge faithfulness (Python)
```

UI toggles **discover and configure** tools; they do **not** execute Python inside the browser.

---

## npm scripts (from project root)

```bash
npm run eval:setup      # print install instructions
npm run eval:deepeval -- --dry-run --text "BOT: Hi. USER: Stop."
npm run eval:ragas -- --dry-run --question "Q" --answer "A" --contexts "ctx"
npm run eval:promptfoo  # requires promptfoo + optional OPENAI_API_KEY
```

---

## DeepEval

**Purpose:** Shadow-score a full sales transcript against `eval/rubric.json` (aligned with Dograh’s 20 dimensions).

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r eval/python/requirements.txt
export EVAL_DEEPEVAL=true OPENAI_API_KEY=...
npm run eval:deepeval -- --transcript ./call.txt
npm run eval:deepeval -- --text "..." --json-out ./tmp/deepeval.json
```

- Entry: `eval/python/run_deepeval.py`  
- Skill: `skills/eval-deepeval/SKILL.md`  
- Gate: `EVAL_DEEPEVAL=true`  

---

## Ragas

**Purpose:** Faithfulness + answer relevancy when the agent uses KB / product facts.

```bash
export EVAL_RAGAS=true OPENAI_API_KEY=...
npm run eval:ragas -- \
  --question "Koliko košta?" \
  --answer "99 KM." \
  --contexts "Cijena 99 KM"
```

- Entry: `eval/python/run_ragas.py`  
- Skill: `skills/eval-ragas/SKILL.md`  
- Gate: `EVAL_RAGAS=true`  

---

## Promptfoo

```bash
npx promptfoo eval -c eval/promptfoo.yaml
# or: npm run eval:promptfoo
```

Config: `eval/promptfoo.yaml` · Rubric: `eval/rubric.json` · Judge: `eval/judge-prompt.md`

---

## Data correctness (dashboard)

Parser **v2** (`src/lib/dograh/qa.ts`) — see Optimize **Data integrity** panel.

| Field | Source |
| --- | --- |
| Dimensions / overall | Dograh `annotations.qa_*` raw_response |
| Tags | Prefer `annotations.tags` |
| Prompt tokens | `usage_info.llm[*].prompt_tokens` |
| Sales/Delivery/Safety | Derived category means (labeled in UI) |

---

## CI

`.github/workflows/eval.yml` — Promptfoo scaffold + typecheck; optional DeepEval job when `RUN_DEEPEVAL=true`.

---

## Personas (sim V2)

`eval/personas/` — JSON personas for future live sim customers. See `docs/sim-customer-v2.md`.
