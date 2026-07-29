"""Cost / safety guards for voice eval + training voice (P6).

Voice runs are expensive (STT+LLM+TTS). These pure helpers enforce hard
limits; callers supply recent-session counts from the DB.
"""

from __future__ import annotations

from typing import Any, Optional

# Hard defaults — not org-configurable in MVP (avoid unbounded batch voice).
VOICE_EVAL_MAX_DURATION_HINT_SECONDS = 90
VOICE_EVAL_HARD_MAX_DURATION_SECONDS = 180  # still ≤ default workflow 300s
VOICE_EVAL_MAX_SESSIONS_PER_ORG_HOUR = 10
VOICE_EVAL_MAX_BATCH = 1  # no multi-scenario batch in one request
VOICE_EVAL_FEATURE_ENABLED = True  # process-level kill switch


class VoiceEvalGuardError(ValueError):
    """Raised when a voice-eval action is blocked by cost/safety policy."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def clamp_max_duration_seconds(requested: Optional[int | float]) -> int:
    """Return a safe max-duration hint (seconds) for voice eval sessions."""
    if requested is None:
        return VOICE_EVAL_MAX_DURATION_HINT_SECONDS
    try:
        n = int(requested)
    except (TypeError, ValueError):
        return VOICE_EVAL_MAX_DURATION_HINT_SECONDS
    if n <= 0:
        return VOICE_EVAL_MAX_DURATION_HINT_SECONDS
    return min(n, VOICE_EVAL_HARD_MAX_DURATION_SECONDS)


def check_voice_eval_allowed(
    *,
    recent_session_count: int = 0,
    batch_size: int = 1,
    feature_enabled: bool = VOICE_EVAL_FEATURE_ENABLED,
) -> dict[str, Any]:
    """Validate that a new voice session may be created.

    Returns a guard payload on success; raises VoiceEvalGuardError otherwise.
    """
    if not feature_enabled:
        raise VoiceEvalGuardError(
            "feature_disabled",
            "Voice eval is disabled (feature flag). Use score-run on existing runs.",
        )
    if batch_size < 1:
        raise VoiceEvalGuardError("invalid_batch", "batch_size must be ≥ 1")
    if batch_size > VOICE_EVAL_MAX_BATCH:
        raise VoiceEvalGuardError(
            "batch_too_large",
            f"Voice eval batch limited to {VOICE_EVAL_MAX_BATCH} session(s); "
            f"requested {batch_size}. Use sampling, not full-suite voice runs.",
        )
    if recent_session_count >= VOICE_EVAL_MAX_SESSIONS_PER_ORG_HOUR:
        raise VoiceEvalGuardError(
            "rate_limited",
            f"Org voice-eval/training sessions capped at "
            f"{VOICE_EVAL_MAX_SESSIONS_PER_ORG_HOUR}/hour "
            f"(current hour: {recent_session_count}). Score existing runs instead.",
        )
    remaining = max(0, VOICE_EVAL_MAX_SESSIONS_PER_ORG_HOUR - recent_session_count - 1)
    return {
        "allowed": True,
        "max_sessions_per_org_hour": VOICE_EVAL_MAX_SESSIONS_PER_ORG_HOUR,
        "recent_session_count": recent_session_count,
        "remaining_after": remaining,
        "max_duration_hint_seconds": VOICE_EVAL_MAX_DURATION_HINT_SECONDS,
        "hard_max_duration_seconds": VOICE_EVAL_HARD_MAX_DURATION_SECONDS,
        "max_batch": VOICE_EVAL_MAX_BATCH,
    }


def voice_eval_guard_payload(
    *,
    recent_session_count: int = 0,
    max_duration_seconds: Optional[int] = None,
) -> dict[str, Any]:
    """Build annotations/tester metadata for a guarded voice session."""
    duration = clamp_max_duration_seconds(max_duration_seconds)
    return {
        "source": "voice_eval",
        "modality": "voice",
        "max_duration_hint_seconds": duration,
        "rate_limit_per_hour": VOICE_EVAL_MAX_SESSIONS_PER_ORG_HOUR,
        "recent_session_count": recent_session_count,
        "batch_max": VOICE_EVAL_MAX_BATCH,
    }
