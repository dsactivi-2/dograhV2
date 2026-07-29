#!/usr/bin/env python3
"""Ragas — faithfulness / answer relevance for knowledge-heavy agent turns.

Part of the Dograh Ops eval stack (see eval/manifest.json, eval/README.md).

Voice sales is not classic RAG; use Ragas when the agent cites product knowledge,
prices, or policy facts from a knowledge base / tool context.

Requires:
  pip install -r eval/python/requirements.txt
  EVAL_RAGAS=true
  OPENAI_API_KEY (typical Ragas backend)

Usage:
  npm run eval:ragas -- --question "..." --answer "..." --contexts "fact1" "fact2"
  python eval/python/run_ragas.py --help
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


def _gated() -> bool:
    return os.environ.get("EVAL_RAGAS", "").lower() in ("1", "true", "yes")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Ragas faithfulness + answer relevancy for knowledge turns",
    )
    parser.add_argument("--question", required=True, help="Customer / user question")
    parser.add_argument("--answer", required=True, help="Agent answer to evaluate")
    parser.add_argument(
        "--contexts",
        nargs="*",
        default=[],
        help="Grounding contexts (KB snippets, tool outputs)",
    )
    parser.add_argument("--json-out", type=Path, help="Write JSON metrics here")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate inputs without calling an LLM",
    )
    args = parser.parse_args(argv)

    if not args.dry_run and not _gated():
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "Ragas is gated. Set EVAL_RAGAS=true to run.",
                    "docs": "eval/README.md#ragas",
                }
            ),
            file=sys.stderr,
        )
        return 2

    payload = {
        "tool": "ragas",
        "question": args.question,
        "answer_chars": len(args.answer),
        "context_count": len(args.contexts),
        "status": "dry_run" if args.dry_run else "running",
    }

    if args.dry_run:
        payload["ok"] = True
        payload["note"] = "Input OK. Re-run without --dry-run with EVAL_RAGAS=true."
        print(json.dumps(payload, indent=2))
        if args.json_out:
            args.json_out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return 0

    try:
        from datasets import Dataset
        from ragas import evaluate
        from ragas.metrics import answer_relevancy, faithfulness
    except ImportError as e:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": f"Missing dependency: {e}. pip install -r eval/python/requirements.txt",
                    "docs": "eval/README.md#ragas",
                }
            ),
            file=sys.stderr,
        )
        return 1

    data = Dataset.from_dict(
        {
            "question": [args.question],
            "answer": [args.answer],
            "contexts": [args.contexts or ["(no context provided)"]],
        }
    )
    result = evaluate(data, metrics=[faithfulness, answer_relevancy])
    # result behaves like a dict-like scores object
    try:
        scores = dict(result)
    except Exception:
        scores = {"raw": str(result)}

    payload["ok"] = True
    payload["status"] = "ok"
    payload["scores"] = scores
    print(json.dumps(payload, indent=2, default=str))
    if args.json_out:
        args.json_out.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
