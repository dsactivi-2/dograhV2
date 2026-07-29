# Skill: Ragas (Dograh Ops)

## When to use

Use this skill when the agent answer depends on **knowledge base / product facts / tool context** and you want **faithfulness** (did it stick to context?) and **answer relevancy** metrics.

Not a full call-level sales rubric — use **DeepEval** or Dograh QA for overall call quality.

## Prerequisites

- Python 3.10+
- `pip install -r eval/python/requirements.txt`
- `EVAL_RAGAS=true`
- `OPENAI_API_KEY` (typical)

## Commands

```bash
npm run eval:ragas -- --dry-run \
  --question "Koliko košta?" \
  --answer "Košta 99 KM sa besplatnom dostavom." \
  --contexts "Cijena je 99 KM" "Besplatna dostava u BiH"

npm run eval:ragas -- \
  --question "..." \
  --answer "..." \
  --contexts "fact1" "fact2" \
  --json-out ./tmp/ragas-out.json
```

## When Ragas helps in voice sales

- Price / delivery claims vs KB
- Policy answers (returns, consent)
- Tool/CRM readback accuracy (as context)

## Do not

- Use Ragas alone for naturalness, pronunciation, or turn-taking
- Run ungated in CI without secrets budget

## Related

- `eval/manifest.json`
- `eval/README.md#ragas`
- Skill: `skills/eval-deepeval/SKILL.md`
