#!/usr/bin/env bash
# =============================================================================
# 04_verify_deepgram_eu.sh
# -----------------------------------------------------------------------------
# Post-deploy verification for Deepgram EU wiring on a Dograh host (voiceeu).
#
# Prerequisites:
#   1) Run 00_preflight_discover.sh on this host first (recommended), OR
#   2) Set DOGRAH_ROOT / API container env vars yourself.
#
# Reads:  ./preflight-report.env  (same dir) if present
# Writes: verify-report.md, verify-report.env, exit code 0=PASS 1=FAIL
#
# Read-only: does not restart containers or change images.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_DIR="${REPORT_DIR:-$SCRIPT_DIR}"
PREFLIGHT_ENV="${PREFLIGHT_ENV:-$REPORT_DIR/preflight-report.env}"
TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
HOSTNAME_F="$(hostname -f 2>/dev/null || hostname)"

PASS=0
FAIL=0
SKIP=0
RESULTS=()

log()  { printf '%s\n' "$*"; }
ok()   { PASS=$((PASS+1)); RESULTS+=("PASS|$1|$2"); log "  ✅ PASS  $1 — $2"; }
bad()  { FAIL=$((FAIL+1)); RESULTS+=("FAIL|$1|$2"); log "  ❌ FAIL  $1 — $2"; }
skip() { SKIP=$((SKIP+1)); RESULTS+=("SKIP|$1|$2"); log "  ⏭  SKIP  $1 — $2"; }

# --- load preflight ----------------------------------------------------------
if [[ -f "$PREFLIGHT_ENV" ]]; then
  log "Loading preflight: $PREFLIGHT_ENV"
  # shellcheck disable=SC1090
  set -a
  # shellcheck disable=SC1091
  source "$PREFLIGHT_ENV"
  set +a
else
  log "WARN: no $PREFLIGHT_ENV — attempting inline discovery (run 00_preflight_discover.sh for full report)"
fi

# defaults only if still empty after preflight (no fake hosts — discover)
DOGRAH_ROOT="${DOGRAH_ROOT:-}"
COMPOSE_FILE="${COMPOSE_FILE:-}"
API_SERVICE="${API_SERVICE:-api}"
API_CONTAINER_ID="${API_CONTAINER_ID:-}"
API_CONTAINER_NAME="${API_CONTAINER_NAME:-}"
CONSTANTS_PATH="${CONSTANTS_PATH:-}"
FACTORY_PATH="${FACTORY_PATH:-}"
HEALTH_URL="${HEALTH_URL:-}"
APP_ROOT_IN_CONTAINER="${APP_ROOT_IN_CONTAINER:-}"
EXPECT_BASE="${EXPECT_DEEPGRAM_BASE:-api.eu.deepgram.com}"

compose() {
  if [[ -n "${COMPOSE_FILE:-}" && -n "${DOGRAH_ROOT:-}" ]]; then
    ( cd "$DOGRAH_ROOT" && docker compose -f "$COMPOSE_FILE" "$@" )
  else
    docker compose "$@"
  fi
}

resolve_api_cid() {
  if [[ -n "${API_CONTAINER_ID:-}" ]] && docker inspect "$API_CONTAINER_ID" >/dev/null 2>&1; then
    echo "$API_CONTAINER_ID"
    return
  fi
  if [[ -n "${API_CONTAINER_NAME:-}" ]] && docker inspect "$API_CONTAINER_NAME" >/dev/null 2>&1; then
    docker inspect -f '{{.Id}}' "$API_CONTAINER_NAME"
    return
  fi
  if [[ -n "${DOGRAH_ROOT:-}" && -n "${COMPOSE_FILE:-}" ]]; then
    local id
    id="$(compose ps -q "$API_SERVICE" 2>/dev/null | head -1 || true)"
    if [[ -n "$id" ]]; then echo "$id"; return; fi
  fi
  docker ps --filter "label=com.docker.compose.service=api" -q | head -1
}

log "=============================================="
log " Dograh Deepgram-EU Verify"
log " Host: $HOSTNAME_F  Time: $TS"
log " Expect DEEPGRAM host: $EXPECT_BASE"
log "=============================================="
log

CID="$(resolve_api_cid || true)"
if [[ -z "$CID" ]]; then
  bad "A1 API container running" "no API container found — run preflight or start stack"
  log "FATAL: cannot continue without API container"
  FAIL=$((FAIL+1))
else
  ok "A1 API container running" "id=${CID:0:12} name=$(docker inspect -f '{{.Name}}' "$CID" | sed 's#^/##')"
fi

# --- A2 image ----------------------------------------------------------------
if [[ -n "$CID" ]]; then
  IMG="$(docker inspect -f '{{.Config.Image}}' "$CID")"
  STATUS="$(docker inspect -f '{{.State.Status}}' "$CID")"
  log "  Image: $IMG  Status: $STATUS"
  if [[ "$STATUS" == "running" ]]; then
    ok "A1b container status" "$STATUS"
  else
    bad "A1b container status" "$STATUS"
  fi
  # After EU deploy we expect custom tag; still PASS if EU code present even on other tag
  if echo "$IMG" | grep -qiE 'dg-eu|dograhv2-api'; then
    ok "A2 image tag looks like EU build" "$IMG"
  else
    # not hard-fail — old name possible if they retagged; code checks matter more
    skip "A2 image tag naming" "image=$IMG (OK if code checks B* pass; expected *dg-eu* after deploy)"
  fi
  # must not be only stock if code missing — handled in B
fi

# --- A3 health ---------------------------------------------------------------
log
log "=== A) Health ==="
if [[ -z "$HEALTH_URL" && -n "$CID" ]]; then
  # try localhost via container network
  for u in \
    "http://127.0.0.1:8000/api/v1/health" \
    "http://localhost:8000/api/v1/health"
  do
    code="$(curl -sk -o /tmp/dg_verify_health.json -w '%{http_code}' --max-time 5 "$u" 2>/dev/null || echo 000)"
    if [[ "$code" == "200" ]]; then HEALTH_URL="$u"; break; fi
  done
  # exec wget/curl inside container
  if [[ -z "$HEALTH_URL" ]]; then
    if docker exec "$CID" sh -c 'curl -sf http://127.0.0.1:8000/api/v1/health >/tmp/h.json' 2>/dev/null; then
      HEALTH_URL="container://127.0.0.1:8000/api/v1/health"
    fi
  fi
fi

if [[ -n "$HEALTH_URL" ]]; then
  if [[ "$HEALTH_URL" == container://* ]]; then
    ok "A3 health endpoint" "OK via docker exec $HEALTH_URL"
  else
    code="$(curl -sk -o /tmp/dg_verify_health.json -w '%{http_code}' --max-time 10 "$HEALTH_URL" || echo 000)"
    if [[ "$code" == "200" ]]; then
      ok "A3 health endpoint" "HTTP 200 $HEALTH_URL"
    else
      bad "A3 health endpoint" "HTTP $code $HEALTH_URL"
    fi
  fi
else
  bad "A3 health endpoint" "no working HEALTH_URL (re-run preflight)"
fi

# --- resolve code paths if missing -------------------------------------------
if [[ -n "$CID" && -z "$CONSTANTS_PATH" ]]; then
  CONSTANTS_PATH="$(docker exec "$CID" sh -c 'find /app /code /usr/src/app -path "*/api/constants.py" 2>/dev/null | head -1' || true)"
fi
if [[ -n "$CID" && -z "$FACTORY_PATH" ]]; then
  FACTORY_PATH="$(docker exec "$CID" sh -c 'find /app /code /usr/src/app -path "*/pipecat/service_factory.py" 2>/dev/null | head -1' || true)"
fi

log
log "=== B) EU code inside API container ==="
log "  CONSTANTS_PATH=${CONSTANTS_PATH:-<empty>}"
log "  FACTORY_PATH=${FACTORY_PATH:-<empty>}"

if [[ -z "$CID" ]]; then
  bad "B0 container exec" "no container"
else
  if [[ -z "$CONSTANTS_PATH" ]]; then
    bad "B1 DEEPGRAM_BASE_URL in constants" "constants.py not found in image"
  else
    if docker exec "$CID" test -f "$CONSTANTS_PATH"; then
      if docker exec "$CID" grep -q "api.eu.deepgram.com" "$CONSTANTS_PATH"; then
        SNIP="$(docker exec "$CID" grep -n 'DEEPGRAM_BASE_URL\|api.eu.deepgram.com' "$CONSTANTS_PATH" | head -5 | tr '\n' ' ; ')"
        ok "B1 DEEPGRAM_BASE_URL default EU" "$SNIP"
      else
        bad "B1 DEEPGRAM_BASE_URL default EU" "api.eu.deepgram.com NOT in $CONSTANTS_PATH — still old image?"
      fi
    else
      bad "B1 constants file missing" "$CONSTANTS_PATH"
    fi
  fi

  if [[ -z "$FACTORY_PATH" ]]; then
    bad "B2 _deepgram_inference_urls" "service_factory.py not found"
  else
    if docker exec "$CID" grep -q '_deepgram_inference_urls' "$FACTORY_PATH"; then
      ok "B2 _deepgram_inference_urls present" "$FACTORY_PATH"
    else
      bad "B2 _deepgram_inference_urls present" "function missing — EU factory patch not in image"
    fi
    if docker exec "$CID" grep -q 'base_url=stt_base_url\|base_url=stt_base' "$FACTORY_PATH"; then
      ok "B3 Nova STT base_url wired" "stt_base_url passed to DeepgramSTTService"
    else
      # broader check
      if docker exec "$CID" grep -A6 'DeepgramSTTService(' "$FACTORY_PATH" | grep -q 'base_url'; then
        ok "B3 Nova STT base_url wired" "base_url in DeepgramSTTService() call"
      else
        bad "B3 Nova STT base_url wired" "DeepgramSTTService without base_url"
      fi
    fi
    if docker exec "$CID" grep -A8 'DeepgramFluxSTTService(' "$FACTORY_PATH" | grep -q 'url='; then
      ok "B4 Flux url wired" "url= passed to DeepgramFluxSTTService"
    else
      bad "B4 Flux url wired" "DeepgramFluxSTTService without url="
    fi
    if docker exec "$CID" grep -A8 'DeepgramTTSService(' "$FACTORY_PATH" | grep -q 'base_url'; then
      ok "B5 Deepgram TTS base_url wired" "base_url in DeepgramTTSService() call"
    else
      bad "B5 Deepgram TTS base_url wired" "DeepgramTTSService without base_url"
    fi
  fi

  # Python runtime assertion (authoritative)
  log
  log "=== B6) Python runtime wiring ==="
  PY_OUT="$(docker exec "$CID" python - <<'PY' 2>&1 || true
import sys
errors = []
try:
    from api.constants import DEEPGRAM_BASE_URL
except Exception as e:
    print("IMPORT_CONST_FAIL", type(e).__name__, e)
    sys.exit(2)
print("DEEPGRAM_BASE_URL", DEEPGRAM_BASE_URL)
if DEEPGRAM_BASE_URL.rstrip("/") != "api.eu.deepgram.com" and "api.eu.deepgram.com" not in DEEPGRAM_BASE_URL:
    # allow override via env if explicitly set to eu
    print("BASE_NOT_EU", DEEPGRAM_BASE_URL)
    sys.exit(3)
try:
    from api.services.pipecat.service_factory import _deepgram_inference_urls
    stt, flux, tts = _deepgram_inference_urls()
    print("STT_BASE", stt)
    print("FLUX_URL", flux)
    print("TTS_BASE", tts)
    assert stt.replace("https://","").replace("wss://","").split("/")[0] == "api.eu.deepgram.com" or stt.endswith("api.eu.deepgram.com") or stt == "api.eu.deepgram.com"
    assert "api.eu.deepgram.com" in flux
    assert "api.eu.deepgram.com" in tts
    print("URLS_OK")
except Exception as e:
    print("FACTORY_FAIL", type(e).__name__, e)
    sys.exit(4)
print("ALL_OK")
PY
)"
  log "$PY_OUT"
  if echo "$PY_OUT" | grep -q 'ALL_OK'; then
    ok "B6 Python DEEPGRAM_BASE_URL + inference URLs" "$(echo "$PY_OUT" | tr '\n' ' ' | cut -c1-200)"
  elif echo "$PY_OUT" | grep -q 'IMPORT_CONST_FAIL'; then
    bad "B6 Python import api.constants" "$PY_OUT"
  elif echo "$PY_OUT" | grep -q 'BASE_NOT_EU'; then
    bad "B6 DEEPGRAM_BASE_URL is EU" "$PY_OUT"
  elif echo "$PY_OUT" | grep -q 'FACTORY_FAIL'; then
    bad "B6 _deepgram_inference_urls()" "$PY_OUT"
  else
    bad "B6 Python runtime wiring" "$PY_OUT"
  fi
fi

# --- C data intact hints -----------------------------------------------------
log
log "=== C) Stack / data smoke ==="
if [[ -n "${DOGRAH_ROOT:-}" && -f "${DOGRAH_ROOT}/.env" ]]; then
  ok "C1 host .env present" "${DOGRAH_ROOT}/.env"
else
  skip "C1 host .env present" "not found at DOGRAH_ROOT/.env"
fi
if [[ -n "$CID" ]]; then
  # postgres container?
  PG="$(docker ps --format '{{.Names}}' | grep -iE 'postgres|db' | head -1 || true)"
  if [[ -n "$PG" ]]; then
    ok "C2 postgres container" "$PG"
  else
    skip "C2 postgres container" "not matched by name"
  fi
fi

# --- E logs crash loop -------------------------------------------------------
log
log "=== E) Recent API logs (crash markers) ==="
if [[ -n "$CID" ]]; then
  LOGS="$(docker logs --tail 60 "$CID" 2>&1 || true)"
  if echo "$LOGS" | grep -qiE 'Traceback|FATAL|Application startup failed|Error loading ASGI'; then
    # show last matching lines
    bad "E1 clean recent logs" "error markers in last 60 lines — inspect docker logs"
    echo "$LOGS" | tail -20
  else
    ok "E1 clean recent logs" "no fatal traceback in last 60 lines"
  fi
fi

# --- summary -----------------------------------------------------------------
log
log "=============================================="
log " RESULT: PASS=$PASS  FAIL=$FAIL  SKIP=$SKIP"
log "=============================================="

VERIFY_ENV="$REPORT_DIR/verify-report.env"
VERIFY_MD="$REPORT_DIR/verify-report.md"
{
  echo "VERIFY_TS=$TS"
  echo "VERIFY_HOST=$HOSTNAME_F"
  echo "PASS=$PASS"
  echo "FAIL=$FAIL"
  echo "SKIP=$SKIP"
  echo "API_CONTAINER_ID=${CID:-}"
  echo "HEALTH_URL=${HEALTH_URL:-}"
  echo "CONSTANTS_PATH=${CONSTANTS_PATH:-}"
  echo "FACTORY_PATH=${FACTORY_PATH:-}"
  echo "EXPECT_BASE=$EXPECT_BASE"
  if [[ "$FAIL" -eq 0 ]]; then echo "VERIFY_OK=yes"; else echo "VERIFY_OK=no"; fi
} >"$VERIFY_ENV"

{
  echo "# Verify report — $HOSTNAME_F — $TS"
  echo
  echo "**PASS=$PASS FAIL=$FAIL SKIP=$SKIP**"
  echo
  echo "| Status | Check | Detail |"
  echo "|--------|-------|--------|"
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r st name detail <<<"$r"
    echo "| $st | $name | $detail |"
  done
  echo
  if [[ "$FAIL" -eq 0 ]]; then
    echo "## Verdict: **GO** — EU Deepgram wiring looks present and healthy."
  else
    echo "## Verdict: **NO-GO** — run rollback if this was a deploy verify."
    echo
    echo '```bash'
    echo '# example rollback (adjust image tag from your 01_prepare_rollback)'
    echo '# docker tag / compose image pin → dograhai/dograh-api:1.43.0'
    echo '# docker compose up -d --no-deps api'
    echo '```'
  fi
} >"$VERIFY_MD"

log "Wrote $VERIFY_ENV"
log "Wrote $VERIFY_MD"

if [[ "$FAIL" -eq 0 ]]; then
  log "VERIFY_OK=yes"
  exit 0
else
  log "VERIFY_OK=no"
  exit 1
fi
