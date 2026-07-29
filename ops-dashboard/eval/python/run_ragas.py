#!/usr/bin/env python3
"""Ragas foundation — faithfulness / answer relevance for knowledge-heavy turns.

Voice sales is not classic RAG; use Ragas when the agent cites product knowledge.
Gated by EVAL_RAGAS=true.
"""
from __future__ import annotations

import argparse
import json
import os
import sys


def main() -> int:
    if os.environ.get("EVAL_RAGAS", "").lower() not in ("1", "true", "yes"):
        print("Ragas is gated. Set EVAL_RAGAS=true to run.", file=sys.stderr)
        return 2

    parser = argparse.ArgumentParser()
    parser.add_argument("--question", required=True)
    parser.add_argument("--answer", required=True)
    parser.add_argument("--contexts", nargs="*", default=[])
    args = parser.parse_args()

    try:
        from datasets import Dataset
        from ragas import evaluate
        from ragas.metrics import answer_relevancy, faithfulness
    except ImportError as e:
        print(f"Missing dependency: {e}. pip install -r eval/python/requirements.txt", file=sys.stderr)
        return 1

    data = Dataset.from_dict(
        {
            "question": [args.question],
            "answer": [args.answer],
            "contexts": [args.contexts or ["(no context provided)"]],
        }
    )
    result = evaluate(data, metrics=[faithfulness, answer_relevancy])
    print(json.dumps(dict(result), default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
