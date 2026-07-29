# Skill: DeepEval (Dograh Ops)

## When to use

Use this skill when the user wants to **offline-score a sales call transcript** against the Dograh 20-dimension QA rubric, or to **regression-check** a prompt change without placing a live voice call.

Primary production scores still come from **Dograh `annotations.qa_*`** on the Optimization page. DeepEval is a **shadow / offline** judge.

## Prerequisites

- Python 3.10+
- `pip install -r eval/python/requirements.txt`
- `EVAL_DEEPEVAL=true`
- `OPENAI_API_KEY` (or DeepEval-compatible provider)

## Commands

```bash
# From ops-dashboard root (or monorepo ops-dashboard/)
npm run eval:deepeval -- --dry-run --text "BOT: Hi. USER: Do not call me."
npm run eval:deepeval -- --transcript ./tmp/run-91.txt
npm run eval:deepeval -- --text "..." --json-out ./tmp/deepeval-out.json
```

## Inputs

| Flag | Meaning |
| --- | --- |
| `--text` | Inline transcript |
| `--transcript` | Path to `.txt` transcript (export from run detail) |
| `--dry-run` | Validate only (no LLM cost) |
| `--json-out` | Machine-readable summary |

## Rubric source of truth

- `eval/rubric.json` — dimensions aligned with Dograh QA
- `eval/judge-prompt.md` — judge instructions
- `src/lib/dograh/qa.ts` — how live annotations are parsed

## Do not

- Treat DeepEval as a replacement for Dograh production QA without calibration
- Auto-publish prompt changes from a DeepEval score
- Run without the gate (`EVAL_DEEPEVAL=true`)

## Related

- `eval/manifest.json` — tool registry
- `eval/README.md#deepeval`
- Skill: `skills/eval-ragas/SKILL.md` for knowledge-turn metrics
- Optimize UI toggles: Evaluation tools panel
