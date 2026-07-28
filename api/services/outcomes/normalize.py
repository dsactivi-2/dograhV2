"""Normalize free-form workflow_run.annotations QA into a stable schema."""

from __future__ import annotations

from collections import Counter
from typing import Any, Optional

from api.schemas.outcomes import QaNodeOutcome, QaRunOutcome


def _as_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_str_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value] if value else []
    if isinstance(value, list):
        return [str(v) for v in value if v is not None and str(v).strip()]
    return []


def normalize_run_qa(
    run_id: int,
    annotations: dict[str, Any] | None,
    workflow_id: int | None = None,
) -> QaRunOutcome:
    """Convert raw annotations JSON into QaRunOutcome (schema_version=1).

    Tolerates missing/partial QA. Never raises on bad shapes.
    """
    ann = annotations if isinstance(annotations, dict) else {}
    nodes: list[QaNodeOutcome] = []
    errors: list[str] = []
    source_keys: list[str] = []
    aggregate_tags: list[str] = []

    # Top-level aggregated tags written by run_integrations
    aggregate_tags.extend(_as_str_list(ann.get("tags")))

    for key, payload in ann.items():
        if key in {"tags"}:
            continue
        if not isinstance(payload, dict):
            continue
        node_results = payload.get("node_results")
        if not isinstance(node_results, dict):
            # Skip pure integration payloads without QA node_results
            continue
        source_keys.append(str(key))
        if payload.get("error"):
            errors.append(f"{key}: {payload.get('error')}")
        for node_id, result in node_results.items():
            if not isinstance(result, dict):
                errors.append(f"{key}/{node_id}: non-dict result")
                continue
            tags = _as_str_list(result.get("tags"))
            aggregate_tags.extend(tags)
            err = result.get("error")
            if err:
                errors.append(f"{key}/{node_id}: {err}")
            nodes.append(
                QaNodeOutcome(
                    node_id=str(node_id),
                    node_name=str(result.get("node_name") or node_id),
                    score=_as_float(result.get("score")),
                    tags=tags,
                    summary=str(result.get("summary") or ""),
                    error=str(err) if err else None,
                    raw={
                        k: v
                        for k, v in result.items()
                        if k
                        not in {"node_name", "score", "tags", "summary", "error"}
                    },
                )
            )

    scores = [n.score for n in nodes if n.score is not None]
    overall = sum(scores) / len(scores) if scores else None
    # de-dupe tags preserving order
    seen: set[str] = set()
    tags_unique: list[str] = []
    for t in aggregate_tags:
        if t not in seen:
            seen.add(t)
            tags_unique.append(t)

    return QaRunOutcome(
        schema_version=1,
        run_id=run_id,
        workflow_id=workflow_id,
        has_qa=bool(nodes) or bool(source_keys),
        overall_score=overall,
        tags=tags_unique,
        nodes=nodes,
        errors=errors,
        source_keys=source_keys,
    )


def summarize_outcomes(runs: list[dict[str, Any]]) -> dict[str, Any]:
    """Aggregate disposition + QA coverage from normalized run dicts."""
    total = len(runs)
    completed = sum(1 for r in runs if r.get("is_completed"))
    disp_counts: Counter[str] = Counter()
    tag_counts: Counter[str] = Counter()
    scores: list[float] = []
    with_qa = 0

    for r in runs:
        disp = r.get("disposition") or "UNKNOWN"
        disp_counts[disp] += 1
        qa = r.get("qa") or {}
        if isinstance(qa, dict) and qa.get("has_qa"):
            with_qa += 1
            if qa.get("overall_score") is not None:
                try:
                    scores.append(float(qa["overall_score"]))
                except (TypeError, ValueError):
                    pass
            for t in qa.get("tags") or []:
                tag_counts[str(t)] += 1

    disposition_distribution = [
        {
            "disposition": d,
            "count": c,
            "percentage": round((c / total * 100) if total else 0, 2),
        }
        for d, c in disp_counts.most_common()
    ]
    top_qa_tags = [
        {"tag": t, "count": c} for t, c in tag_counts.most_common(20)
    ]
    return {
        "total_runs": total,
        "completed_runs": completed,
        "disposition_distribution": disposition_distribution,
        "qa_coverage": {
            "runs_with_qa": with_qa,
            "runs_without_qa": total - with_qa,
            "coverage_pct": round((with_qa / total * 100) if total else 0, 2),
        },
        "average_qa_score": (sum(scores) / len(scores)) if scores else None,
        "top_qa_tags": top_qa_tags,
    }
