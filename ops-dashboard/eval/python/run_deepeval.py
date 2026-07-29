#!/usr/bin/env python3
"""DeepEval — offline shadow scoring against the Dograh 20-dim QA rubric.

Part of the Dograh Ops eval stack (see eval/manifest.json, eval/README.md).

Requires:
  pip install -r eval/python/requirements.txt
  EVAL_DEEPEVAL=true
  OPENAI_API_KEY (or provider supported by DeepEval)

Usage:
  npm run eval:deepeval -- --text "BOT: ... USER: ..."
  npm run eval:deepeval -- --transcript path/to/call.txt
  python eval/python/run_deepeval.py --help
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUBRIC_PATH = ROOT / "eval" / "rubric.json"
JUDGE_PATH = ROOT / "eval" / "judge-prompt.md"


def _gated() -> bool:
    return os.environ.get("EVAL_DEEPEVAL", "").lower() in ("1", "true", "yes")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="DeepEval shadow score for Dograh sales transcripts",
    )
    parser.add_argument("--transcript", type=Path, help="Path to transcript text file")
    parser.add_argument("--text", type=str, help="Inline transcript text")
    parser.add_argument(
        "--json-out",
        type=Path,
        help="Write machine-readable summary JSON here",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate rubric + inputs without calling an LLM",
    )
    args = parser.parse_args(argv)

    if not args.dry_run and not _gated():
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "DeepEval is gated. Set EVAL_DEEPEVAL=true to run (avoids accidental cost).",
                    "docs": "eval/README.md#deepeval",
                }
            ),
            file=sys.stderr,
        )
        return 2

    if args.transcript:
        text = args.transcript.read_text(encoding="utf-8")
    elif args.text:
        text = args.text
    else:
        print("Provide --transcript or --text", file=sys.stderr)
        return 2

    if not RUBRIC_PATH.is_file():
        print(f"Missing rubric: {RUBRIC_PATH}", file=sys.stderr)
        return 1

    rubric = json.loads(RUBRIC_PATH.read_text(encoding="utf-8"))
    dims = [d.get("key") for d in rubric.get("dimensions", []) if d.get("key")]
    judge_hint = JUDGE_PATH.read_text(encoding="utf-8")[:500] if JUDGE_PATH.is_file() else ""

    summary = {
        "tool": "deepeval",
        "rubric_version": rubric.get("version", "unknown"),
        "dimensions": dims,
        "transcript_chars": len(text),
        "status": "dry_run" if args.dry_run else "running",
    }

    if args.dry_run:
        summary["ok"] = True
        summary["note"] = "Rubric and input OK. Re-run without --dry-run with EVAL_DEEPEVAL=true."
        print(json.dumps(summary, indent=2))
        if args.json_out:
            args.json_out.write_text(json.dumps(summary, indent=2), encoding="utf-8")
        return 0

    try:
        from deepeval import evaluate
        from deepeval.metrics import GEval
        from deepeval.test_case import LLMTestCase, LLMTestCaseParams
    except ImportError:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "deepeval not installed. Run: pip install -r eval/python/requirements.txt",
                    "docs": "eval/README.md#deepeval",
                }
            ),
            file=sys.stderr,
        )
        return 1

    criteria = (
        "Score the voice sales agent transcript 0-10 using the Dograh QA rubric. "
        "Hard-fail low order_safety / privacy / DNC violations. "
        "Return a single overall quality score aligned to overall_score. "
        f"Rubric keys: {', '.join(dims[:12])}… "
        f"Judge notes: {judge_hint[:200]}"
    )

    metric = GEval(
        name="dograh_overall",
        criteria=criteria,
        evaluation_params=[LLMTestCaseParams.ACTUAL_OUTPUT],
        threshold=0.55,
    )

    case = LLMTestCase(
        input="Evaluate this sales call transcript against the Dograh 20-dim QA rubric.",
        actual_output=text[:12000],
    )
    evaluate([case], [metric])

    summary["ok"] = True
    summary["status"] = "ok"
    summary["note"] = "See DeepEval console report above for score details."
    print(json.dumps(summary, indent=2))
    if args.json_out:
        args.json_out.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
