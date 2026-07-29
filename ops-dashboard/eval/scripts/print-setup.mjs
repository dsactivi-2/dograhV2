#!/usr/bin/env node
/**
 * Prints how to install and run the offline eval stack.
 * npm run eval:setup
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(readFileSync(resolve(root, "eval/manifest.json"), "utf8"));

console.log(`
Dograh Ops — offline eval setup
================================
Registry: eval/manifest.json (v${manifest.version})
User guide: docs/user/eval-tools.md
Env list: .env.example  |  docs/ENV.md

1) Python tools (DeepEval + Ragas)
   python3 -m venv .venv
   source .venv/bin/activate   # Windows: .venv\\Scripts\\activate
   pip install -r eval/python/requirements.txt

2) Gates + keys
   export EVAL_DEEPEVAL=true    # required to run DeepEval
   export EVAL_RAGAS=true       # required to run Ragas
   export OPENAI_API_KEY=...    # or provider key supported by the tool

3) Run
   npm run eval:deepeval -- --dry-run --text "BOT: Hi. USER: Stop calling."
   npm run eval:ragas -- --dry-run --question "Q" --answer "A" --contexts "ctx"
   npm run eval:promptfoo

4) Skills / agents
   skills/eval-deepeval/SKILL.md
   skills/eval-ragas/SKILL.md
   agents/AGENTS.md

5) Dashboard
   Open /optimize → Evaluation tools (toggles discover status; runners stay offline)

Primary production scores still come from Dograh QA on Optimize — not from these offline tools.
`);
