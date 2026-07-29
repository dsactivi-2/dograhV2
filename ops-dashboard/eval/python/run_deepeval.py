#!/usr/bin/env python3
"""DeepEval foundation — score a transcript against the Dograh 20-dim rubric (shadow).

Requires:
  pip install -r eval/python/requirements.txt
  OPENAI_API_KEY (or Azure equivalents)
  EVAL_DEEPEVAL=true (optional gate)

Usage:
  python eval/python/run_deepeval.py --transcript path/to.txt
  python eval/python/run_deepeval.py --text "BOT: ... USER: ..."
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

RUBRIC_PATH = Path(__file__).resolve().parents[1] / "rubric.json"


def main() -> int:
    if os.environ.get("EVAL_DEEPEVAL", "").lower() not in ("1", "true", "yes"):
        print(
            "DeepEval is gated. Set EVAL_DEEPEVAL=true to run (avoids accidental cost).",
            file=sys.stderr,
        )
        return 2

    parser = argparse.ArgumentParser()
    parser.add_argument("--transcript", type=Path)
    parser.add_argument("--text", type=str)
    args = parser.parse_args()

    if args.transcript:
        text = args.transcript.read_text(encoding="utf-8")
    elif args.text:
        text = args.text
    else:
        print("Provide --transcript or --text", file=sys.stderr)
        return 2

    rubric = json.loads(RUBRIC_PATH.read_text(encoding="utf-8"))
    dims = [d["key"] for d in rubric["dimensions"]]

    try:
        from deepeval import evaluate
        from deepeval.metrics import GEval
        from deepeval.test_case import LLMTestCase, LLMTestCaseParams
    except ImportError:
        print("deepeval not installed. pip install -r eval/python/requirements.txt", file=sys.stderr)
        return 1

    # Single composite metric aligned to overall_score — expand per-dim later
    metric = GEval(
        name="dograh_overall",
        criteria=(
            "Score the voice sales agent transcript 0-10 using the Dograh QA rubric. "
            "Hard-fail low order_safety / privacy. Return a single overall quality score."
        ),
        evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT],
        threshold=0.55,
    )

    case = LLMTestCase(
        input="Evaluate this sales call transcript.",
        actual_output=text[:12000],
    )
    evaluate([case], [metric])
    print(json.dumps({"dims": dims, "note": "See DeepEval report above", "status": "ok"}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
