# Voice Eval + Training Voice (P6)

| Feld | Wert |
|------|------|
| **Datum (UTC)** | 2026-07-29 |
| **Repo** | https://github.com/dsactivi-2/dograh |
| **Branch** | `feature/stepsales-sales-api-mvp` |
| **UI** | `/evals` (Voice-Tab), `/training` (mode=voice) |
| **API** | `/api/v1/evals/voice/*`, `/api/v1/training/modules/{id}/voice/*` |

## Phase 0 — Verifikation (Kurz)

| Capability | Status | P6 |
|---|---|---|
| SMALLWEBRTC + telephony pipeline | vorhanden | Session-Create |
| Transcript aus RTF events | vorhanden | Score |
| QA schema v1 + QA Center | vorhanden | Score optional |
| Disposition success codes | vorhanden | Score |
| Text-eval harness | vorhanden | Template |
| Training shadow/text | vorhanden | + voice mode |
| Looptalk dual-role | **entfernt** | BLOCKED |
| Headless user-audio inject | **fehlt** | DEFERRED |

## Was gebaut (MVP)

### A) Score bestehenden Run (kostenlos)

`POST /api/v1/evals/voice/score-run`

- Input: `workflow_run_id`, optional assertions, success_codes, include_qa
- Transcript: `logs.realtime_feedback_events` → `generate_transcript_text`
- Score: Assertions 70% + Disposition 20% + QA 10% (wenn QA da); sonst 80/20
- Stamp: `annotations.voice_eval`

### B) Bewachte WebRTC-Session

`POST /api/v1/evals/voice/sessions` → SMALLWEBRTC run (`VEVAL-*`)

`POST /api/v1/evals/voice/sessions/{run_id}/finalize`

- Client verbindet über existierendes Signaling:  
  `/api/v1/ws/signaling/{workflow_id}/{run_id}`
- **Kein** Audio-Inject, **kein** Dual-Role
- Guards: max 10 Sessions/Org/Stunde, batch=1, duration hint ≤180s
- Quota: `authorize_workflow_run_start` (402)

### C) Training Voice

- Module `mode=voice` (kein Schema-Migration — `mode` ist String)
- `POST .../voice/start` → `VTRAIN-*` SMALLWEBRTC
- `POST .../voice/complete` → Score + `training_attempts`

## Cost Guards

| Guard | Wert |
|-------|------|
| Max sessions / org / hour | 10 (`VEVAL-%` + `VTRAIN-%`) |
| Max batch | 1 |
| Duration hint default | 90s (hard clamp 180s) |
| Feature flag | `VOICE_EVAL_FEATURE_ENABLED` |
| Unbounded batch voice | **verboten** |

Hinweis: Pipeline `max_call_duration` kommt weiterhin aus der Workflow-Definition (default 300s). Der Hint steuert UX/Sampling; UI soll früh auflegen.

## Scoring-Reuse

- Assertions: `text_harness.evaluate_assertion` auf Transcript
- QA: `outcomes.normalize_run_qa` (schema v1)
- Training: `score_voice_drill` wrappt voice score → attempt

## Bewusst nicht

| Item | Status |
|------|--------|
| Headless STT-Audio-Inject | DEFERRED |
| Dual-role / Looptalk | BLOCKED_EXTERNAL (tables dropped) |
| Batch voice suite runner | DEFERRED (cost) |
| Telephony auto-dial for eval | DEFERRED |

## Tests

`api/tests/test_voice_eval.py` — pure unit (no DB)

## UI checklist

- [ ] `/evals` → Tab Voice → Score Run mit vorhandener Run-ID
- [ ] `/evals` → Session anlegen → Run-ID + Signaling-Pfad
- [ ] Nach Call → Finalize → Transcript + Score
- [ ] `/training` → Modul Voice anlegen → Start → Complete
- [ ] Rate-Limit: 11. Session → 429
- [ ] QA Center: Run mit `annotations.voice_eval` sichtbar
