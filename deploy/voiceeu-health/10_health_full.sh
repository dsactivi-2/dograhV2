#!/usr/bin/env bash
# =============================================================================
# 10_health_full.sh — Complete Dograh production health check (READ-ONLY)
# Uses preflight-full.env from 00_preflight_full.sh (same directory).
# Exit 0 = GO (no FAIL), 1 = NO-GO (any FAIL), 2 = WARN-only still exit 0? 
#   We use: FAIL→exit 1, only WARN+PASS→exit 0 with WARN count.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_DIR="${REPORT_DIR:-$SCRIPT_DIR}"
PREFLIGHT="${PREFLIGHT_ENV:-$REPORT_DIR/preflight-full.env}"
TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
HOSTF="$(hostname -f 2>/dev/null || hostname)"

PASS=0; FAIL=0; WARN=0
RESULTS=()

log()  { printf '%s\n' "$*"; }
ok()   { PASS=$((PASS+1)); RESULTS+=("PASS|$1|$2"); log "  ✅ PASS  $1 — $2"; }
bad()  { FAIL=$((FAIL+1)); RESULTS+=("FAIL|$1|$2"); log "  ❌ FAIL  $1 — $2"; }
warn() { WARN=$((WARN+1)); RESULTS+=("WARN|$1|$2"); log "  ⚠️  WARN  $1 — $2"; }
skip() { RESULTS+=("SKIP|$1|$2"); log "  ⏭  SKIP  $1 — $2"; }

load_env() {
  local file="$1" line key val
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"; val="${line#*=}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    if [[ ${#val} -ge 2 && "${val:0:1}" == '"' && "${val: -1}" == '"' ]]; then
      val="${val:1:${#val}-2}"
    fi
    printf -v "$key" '%s' "$val"
    export "$key"
  done < "$file"
}

if [[ ! -f "$PREFLIGHT" ]]; then
  log "ERROR: missing $PREFLIGHT"
  log "Run first: sudo bash 00_preflight_full.sh"
  exit 1
fi
log "Loading $PREFLIGHT"
load_env "$PREFLIGHT"

cstat() {
  local id="$1"
  [[ -n "$id" ]] || { echo "missing"; return; }
  docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.RestartCount}}|{{.State.OOMKilled}}' "$id" 2>/dev/null || echo "missing|none|0|false"
}

check_container() {
  # name, id, require_healthy(yes/no)
  local label="$1" id="$2" need_health="${3:-yes}"
  if [[ -z "$id" ]]; then
    bad "$label present" "container id empty — not running?"
    return
  fi
  local st health restarts oom
  IFS='|' read -r st health restarts oom <<<"$(cstat "$id")"
  if [[ "$st" != "running" ]]; then
    bad "$label running" "status=$st"
    return
  fi
  ok "$label running" "id=${id:0:12} status=$st health=$health restarts=$restarts"
  if [[ "$need_health" == "yes" && "$health" != "none" && "$health" != "healthy" ]]; then
    bad "$label docker health" "health=$health (want healthy)"
  elif [[ "$need_health" == "yes" && "$health" == "healthy" ]]; then
    ok "$label docker health" "healthy"
  elif [[ "$health" == "none" ]]; then
    skip "$label docker health" "no healthcheck defined"
  fi
  if [[ "${restarts:-0}" -ge 5 ]]; then
    warn "$label restart count" "restarts=$restarts (unstable?)"
  fi
  if [[ "$oom" == "true" ]]; then
    bad "$label OOMKilled" "true — was OOM killed"
  fi
}

log "=============================================="
log " Dograh FULL Health Check"
log " Host: $HOSTF  Time: $TS"
log "=============================================="
log

# ── 0 Host resources ──────────────────────────────────────────────────────
log "=== 0) Host resources ==="
DISK="${DISK_USE_PCT:-0}"
MEM="${MEM_USE_PCT:-0}"
if [[ "$DISK" -ge 90 ]]; then bad "disk usage" "${DISK}% used"; elif [[ "$DISK" -ge 80 ]]; then warn "disk usage" "${DISK}% used"; else ok "disk usage" "${DISK}% used"; fi
if [[ "$MEM" -ge 95 ]]; then bad "memory usage" "${MEM}% used"; elif [[ "$MEM" -ge 85 ]]; then warn "memory usage" "${MEM}% used"; else ok "memory usage" "${MEM}% used"; fi
ok "load average" "${LOAD_AVG:-?} (ncpu=${NCPU:-?})"
ok "uptime" "${UPTIME:-unknown}"

# ── 1 Core containers ─────────────────────────────────────────────────────
log
log "=== 1) Core containers (postgres redis minio api ui) ==="
check_container "postgres" "${PG_CONTAINER_ID:-}" yes
check_container "redis" "${REDIS_CONTAINER_ID:-}" yes
check_container "minio" "${MINIO_CONTAINER_ID:-}" yes
check_container "api" "${API_CONTAINER_ID:-}" yes
check_container "ui" "${UI_CONTAINER_ID:-}" yes

# ── 2 Remote profile ──────────────────────────────────────────────────────
log
log "=== 2) Remote edge (nginx coturn cloudflared) ==="
if [[ -n "${NGINX_CONTAINER_ID:-}" ]]; then
  check_container "nginx" "$NGINX_CONTAINER_ID" no
else
  warn "nginx present" "not found — local-only install or different reverse proxy?"
fi
if [[ -n "${COTURN_CONTAINER_ID:-}" ]]; then
  check_container "coturn" "$COTURN_CONTAINER_ID" no
else
  warn "coturn present" "not found — WebRTC may fail behind NAT"
fi
if [[ -n "${CLOUDFLARED_CONTAINER_ID:-}" ]]; then
  check_container "cloudflared" "$CLOUDFLARED_CONTAINER_ID" no
else
  skip "cloudflared" "not running (ok if public IP + nginx)"
fi

# ── 3 API image / EU ──────────────────────────────────────────────────────
log
log "=== 3) API image & Deepgram EU ==="
API_CID="${API_CONTAINER_ID:-}"
if [[ -n "$API_CID" ]]; then
  img="${API_IMAGE:-$(docker inspect -f '{{.Config.Image}}' "$API_CID")}"
  ok "api image" "$img"
  if echo "$img" | grep -qiE 'dg-eu|dograhv2-api'; then
    ok "api image EU/custom tag" "$img"
  else
    warn "api image tag" "$img (stock hub image may lack EU Deepgram patch)"
  fi
  if [[ "${HAS_DEEPGRAM_EU_CONSTANT:-}" == "yes" ]]; then
    ok "Deepgram EU constant in image" "api.eu.deepgram.com present"
  else
    warn "Deepgram EU constant in image" "not detected — STT may use US default"
  fi
  if [[ "${HAS_DEEPGRAM_EU_FACTORY:-}" == "yes" ]]; then
    ok "Deepgram EU factory wiring" "_deepgram_inference_urls present"
  else
    warn "Deepgram EU factory wiring" "not detected"
  fi
  # runtime
  PY="$(docker exec "$API_CID" python -c "
from api.constants import DEEPGRAM_BASE_URL
from api.services.pipecat.service_factory import _deepgram_inference_urls
stt,flux,tts=_deepgram_inference_urls()
print('BASE='+DEEPGRAM_BASE_URL)
print('STT='+stt)
print('FLUX='+flux)
print('TTS='+tts)
" 2>/dev/null || true)"
  BASE="$(echo "$PY" | sed -n 's/^BASE=//p' | tail -1)"
  STT="$(echo "$PY" | sed -n 's/^STT=//p' | tail -1)"
  FLUX="$(echo "$PY" | sed -n 's/^FLUX=//p' | tail -1)"
  TTS="$(echo "$PY" | sed -n 's/^TTS=//p' | tail -1)"
  if [[ "$BASE" == *api.eu.deepgram.com* ]]; then
    ok "Deepgram runtime BASE" "$BASE"
  elif [[ -n "$BASE" ]]; then
    warn "Deepgram runtime BASE" "$BASE (not EU)"
  else
    # factory import may fail on non-EU image
    if [[ "${HAS_DEEPGRAM_EU_FACTORY:-}" == "yes" ]]; then
      bad "Deepgram runtime BASE" "could not import / empty"
    else
      skip "Deepgram runtime BASE" "EU factory not in image"
    fi
  fi
  if [[ "$STT" == *api.eu.deepgram.com* && "$FLUX" == *api.eu.deepgram.com* && "$TTS" == *api.eu.deepgram.com* ]]; then
    ok "Deepgram inference URLs" "stt=$STT flux=$FLUX tts=$TTS"
  elif [[ -n "$STT" ]]; then
    warn "Deepgram inference URLs" "stt=$STT flux=$FLUX tts=$TTS"
  fi
else
  bad "api container" "missing — cannot check Deepgram"
fi

# ── 4 HTTP health ─────────────────────────────────────────────────────────
log
log "=== 4) HTTP / HTTPS health endpoints ==="
HURL="${HEALTH_URL:-}"
if [[ -n "$HURL" ]]; then
  body_file="/tmp/dograh_health_body.json"
  code="$(curl -sk -o "$body_file" -w '%{http_code}' --max-time 10 "$HURL" 2>/dev/null || echo 000)"
  if [[ "$code" == "200" ]]; then
    ok "GET /api/v1/health" "HTTP 200 $HURL"
  else
    bad "GET /api/v1/health" "HTTP $code $HURL"
  fi
  if command -v python3 >/dev/null && [[ -f "$body_file" ]]; then
    eval "$(python3 - "$body_file" <<'PY'
import json, sys
path = sys.argv[1]
try:
    d = json.load(open(path))
except Exception as e:
    print("PARSE_FAIL=1")
    sys.exit(0)
def esc(s):
    return str(s).replace("'", "")
print("PARSE_FAIL=0")
print("H_STATUS=%s" % esc(d.get("status", "")))
print("H_VERSION=%s" % esc(d.get("version", "")))
print("H_TURN=%s" % esc(d.get("turn_enabled", "")))
print("H_FORCE_TURN=%s" % esc(d.get("force_turn_relay", "")))
print("H_MODE=%s" % esc(d.get("deployment_mode", "")))
print("H_AUTH=%s" % esc(d.get("auth_provider", "")))
print("H_BACKEND=%s" % esc(d.get("backend_api_endpoint", "")))
PY
)" || true
    if [[ "${PARSE_FAIL:-1}" == "0" ]]; then
      [[ "${H_STATUS}" == "ok" ]] && ok "health.status" "ok" || bad "health.status" "${H_STATUS:-empty}"
      ok "health.version" "${H_VERSION:-?}"
      if [[ "${H_TURN}" == "True" || "${H_TURN}" == "true" || "${H_TURN}" == "1" ]]; then
        ok "health.turn_enabled" "true"
      else
        warn "health.turn_enabled" "${H_TURN} — WebRTC TURN may be disabled"
      fi
      if [[ "${H_FORCE_TURN}" == "True" || "${H_FORCE_TURN}" == "true" ]]; then
        warn "health.force_turn_relay" "true — diagnostic relay-only mode"
      else
        ok "health.force_turn_relay" "false"
      fi
      ok "health.deployment_mode" "${H_MODE:-?}"
      ok "health.auth_provider" "${H_AUTH:-?}"
      ok "health.backend_api_endpoint" "${H_BACKEND:-?}"
    else
      if grep -q '"status"[[:space:]]*:[[:space:]]*"ok"' "$body_file" 2>/dev/null; then
        ok "health.status (grep)" "ok"
      else
        bad "health JSON parse" "could not parse body"
      fi
    fi
  fi
else
  bad "HEALTH_URL" "empty — re-run preflight"
fi

# local API direct
code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8000/api/v1/health 2>/dev/null || echo 000)"
[[ "$code" == "200" ]] && ok "local API :8000 health" "HTTP 200" || bad "local API :8000 health" "HTTP $code"

# UI
UURL="${UI_URL:-${PUBLIC_BASE_URL:-}}"
if [[ -n "$UURL" ]]; then
  code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "$UURL" 2>/dev/null || echo 000)"
  if [[ "$code" =~ ^(200|301|302|303|307|308)$ ]]; then
    ok "UI public" "HTTP $code $UURL"
  else
    bad "UI public" "HTTP $code $UURL"
  fi
fi
code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3010/ 2>/dev/null || echo 000)"
[[ "$code" =~ ^(200|301|302|307|308)$ ]] && ok "UI local :3010" "HTTP $code" || warn "UI local :3010" "HTTP $code"

# ── 5 Datastores ──────────────────────────────────────────────────────────
log
log "=== 5) Postgres / Redis / MinIO live checks ==="
if [[ -n "${PG_CONTAINER_ID:-}" ]]; then
  if docker exec "$PG_CONTAINER_ID" pg_isready -U postgres >/dev/null 2>&1; then
    ok "postgres pg_isready" "accepting connections"
  else
    bad "postgres pg_isready" "not ready"
  fi
else
  bad "postgres" "no container"
fi
if [[ -n "${REDIS_CONTAINER_ID:-}" ]]; then
  # Read password from host .env at runtime — never rely on preflight dumping secrets.
  RP="redissecret"
  if [[ -n "${ENV_FILE:-}" && -f "${ENV_FILE}" ]]; then
    RP="$(grep -E '^REDIS_PASSWORD=' "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' || true)"
    [[ -n "$RP" ]] || RP="redissecret"
  fi
  pong="$(docker exec "$REDIS_CONTAINER_ID" redis-cli -a "$RP" ping 2>/dev/null | tr -d '\r' || true)"
  if [[ "$pong" == "PONG" ]]; then
    ok "redis PING" "PONG"
  else
    bad "redis PING" "response=$pong"
  fi
else
  bad "redis" "no container"
fi
# minio via host localhost or docker exec
mcode="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:9000/minio/health/live 2>/dev/null || echo 000)"
if [[ "$mcode" == "200" ]]; then
  ok "minio health/live" "HTTP 200"
else
  if [[ -n "${MINIO_CONTAINER_ID:-}" ]] && docker exec "$MINIO_CONTAINER_ID" curl -sf http://localhost:9000/minio/health/live >/dev/null 2>&1; then
    ok "minio health/live (in-container)" "ok"
  else
    bad "minio health/live" "HTTP $mcode"
  fi
fi

# ── 6 API internal processes ──────────────────────────────────────────────
log
log "=== 6) API multi-process (uvicorn / arq / orchestrator / ari) ==="
if [[ -n "$API_CID" ]]; then
  # Slim API image has no `ps`. Prefer host-side docker top, then /proc cmdline.
  PS="$(docker top "$API_CID" -eo pid,cmd 2>/dev/null || true)"
  if [[ -z "$PS" ]]; then
    PS="$(docker exec "$API_CID" sh -c 'for f in /proc/[0-9]*/cmdline; do tr "\0" " " <"$f" 2>/dev/null; echo; done' 2>/dev/null || true)"
  fi
  echo "$PS" | head -25
  if echo "$PS" | grep -qi uvicorn; then
    uvc="$(echo "$PS" | grep -ci uvicorn || true)"
    ok "process uvicorn" "found (lines≈$uvc; FASTAPI_WORKERS=${FASTAPI_WORKERS:-?})"
  else
    if curl -sk -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8000/api/v1/health 2>/dev/null | grep -q 200; then
      warn "process uvicorn" "not listed via docker top//proc but :8000 health=200"
    else
      bad "process uvicorn" "not found and API health not 200"
    fi
  fi
  echo "$PS" | grep -qiE 'arq|WorkerSettings' && ok "process arq" "found" || warn "process arq" "not found (background jobs may be down)"
  echo "$PS" | grep -qi campaign_orchestrator && ok "process campaign_orchestrator" "found" || warn "process campaign_orchestrator" "not found"
  echo "$PS" | grep -qi ari_manager && ok "process ari_manager" "found" || warn "process ari_manager" "not found (ok if no Asterisk telephony)"
else
  bad "api processes" "no api container"
fi

# ── 7 Ports ───────────────────────────────────────────────────────────────
log
log "=== 7) Critical host ports ==="
check_port() {
  local port="$1" proto="${2:-tcp}" label="$3"
  if [[ "$proto" == "tcp" ]]; then
    if ss -lnt 2>/dev/null | grep -qE ":${port}\\s" || ss -lnt 2>/dev/null | grep -q ":${port}"; then
      ok "port $label" "tcp/$port listening"
    else
      bad "port $label" "tcp/$port NOT listening"
    fi
  else
    if ss -lnu 2>/dev/null | grep -qE ":${port}\\s" || ss -lnu 2>/dev/null | grep -q ":${port}"; then
      ok "port $label" "udp/$port listening"
    else
      warn "port $label" "udp/$port not seen (coturn may bind differently)"
    fi
  fi
}
check_port 80 tcp "http"
check_port 443 tcp "https"
check_port 8000 tcp "api"
check_port 3010 tcp "ui"
check_port 5432 tcp "postgres"
check_port 6379 tcp "redis"
check_port 3478 tcp "turn-tcp"
check_port 3478 udp "turn-udp"
check_port 5349 tcp "turns-tcp"
check_port 5349 udp "turns-udp"

# ── 8 TLS certificate ─────────────────────────────────────────────────────
log
log "=== 8) TLS certificate (public host) ==="
PH="${PUBLIC_HOST:-}"
if [[ -n "$PH" ]] && command -v openssl >/dev/null; then
  end="$(echo | openssl s_client -servername "$PH" -connect "${PH}:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)"
  if [[ -n "$end" ]]; then
    end_epoch="$(date -d "$end" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$end" +%s 2>/dev/null || echo 0)"
    now="$(date +%s)"
    if [[ "$end_epoch" -gt 0 ]]; then
      days=$(( (end_epoch - now) / 86400 ))
      if [[ "$days" -lt 0 ]]; then
        bad "TLS cert expiry" "EXPIRED ($end)"
      elif [[ "$days" -lt 14 ]]; then
        warn "TLS cert expiry" "expires in ${days}d ($end)"
      else
        ok "TLS cert expiry" "valid ${days}d more (until $end)"
      fi
    else
      ok "TLS cert enddate" "$end"
    fi
  else
    warn "TLS cert" "could not read cert for $PH:443"
  fi
else
  skip "TLS cert" "no PUBLIC_HOST or openssl"
fi

# ── 9 TURN / env consistency ──────────────────────────────────────────────
log
log "=== 9) TURN / env consistency ==="
[[ "${TURN_SECRET_SET:-}" == "yes" ]] && ok "TURN_SECRET set in .env" "yes" || warn "TURN_SECRET set in .env" "no"
[[ -n "${TURN_HOST:-}" ]] && ok "TURN_HOST" "$TURN_HOST" || warn "TURN_HOST" "empty"
[[ "${OSS_JWT_SECRET_SET:-}" == "yes" ]] && ok "OSS_JWT_SECRET set" "yes" || bad "OSS_JWT_SECRET set" "missing — auth broken"
[[ -n "${PUBLIC_BASE_URL:-}" ]] && ok "PUBLIC_BASE_URL" "$PUBLIC_BASE_URL" || warn "PUBLIC_BASE_URL" "empty"
[[ -n "${DEEPGRAM_BASE_URL_IN_ENV:-}" ]] && ok "DEEPGRAM_BASE_URL in .env" "$DEEPGRAM_BASE_URL_IN_ENV" || skip "DEEPGRAM_BASE_URL in .env" "unset (code default may still be EU)"

# ── 10 Logs (fatal patterns) ──────────────────────────────────────────────
log
log "=== 10) Recent logs (fatal patterns) ==="
scan_logs() {
  local label="$1" id="$2"
  [[ -n "$id" ]] || return
  local logs
  logs="$(docker logs --tail 100 "$id" 2>&1 || true)"
  if echo "$logs" | grep -qiE 'Traceback \(most recent call last\)|Application startup failed|Error loading ASGI|A service exited; tearing down'; then
    bad "$label fatal log markers" "found Traceback/startup failure in last 100 lines"
    echo "$logs" | grep -iE 'Traceback|FATAL|startup failed|tearing down' | tail -5
  else
    ok "$label fatal log markers" "none in last 100 lines"
  fi
  # softer patterns
  local ice
  ice="$(echo "$logs" | grep -ciE 'Failed to generate TURN|iceConnectionState: failed|FORCE_TURN_RELAY is on but' || true)"
  if [[ "${ice:-0}" -gt 0 ]]; then
    warn "$label TURN/ICE log warnings" "count≈$ice in last 100 lines"
  fi
}
scan_logs "api" "$API_CID"
scan_logs "nginx" "${NGINX_CONTAINER_ID:-}"
scan_logs "coturn" "${COTURN_CONTAINER_ID:-}"

# ── 11 Container resource pressure ────────────────────────────────────────
log
log "=== 11) Container stats snapshot ==="
if command -v docker >/dev/null; then
  stats="$(docker stats --no-stream --format '{{.Name}} cpu={{.CPUPerc}} mem={{.MemUsage}}' 2>/dev/null | head -20 || true)"
  echo "$stats"
  # warn if any > 90% cpu string
  if echo "$stats" | grep -qE 'cpu=9[0-9]\.|cpu=100'; then
    warn "container CPU" "some container ≥90% CPU"
  else
    ok "container CPU snapshot" "no ≥90% in sample"
  fi
fi

# ── 12 Volumes exist ──────────────────────────────────────────────────────
log
log "=== 12) Persistent volumes ==="
for v in postgres_data redis_data minio-data; do
  if docker volume ls --format '{{.Name}}' | grep -qE "${v}$|dograh_${v}|.*${v}"; then
    ok "volume $v" "present"
  else
    warn "volume $v" "name not matched (may use different project prefix)"
  fi
done

# ── Summary ───────────────────────────────────────────────────────────────
log
log "=============================================="
log " RESULT: PASS=$PASS  WARN=$WARN  FAIL=$FAIL"
log "=============================================="

MD="$REPORT_DIR/health-full-report.md"
ENVR="$REPORT_DIR/health-full-report.env"
{
  echo "HEALTH_TS=$TS"
  echo "PASS=$PASS"
  echo "WARN=$WARN"
  echo "FAIL=$FAIL"
  if [[ "$FAIL" -eq 0 ]]; then echo "HEALTH_OK=yes"; else echo "HEALTH_OK=no"; fi
} >"$ENVR"

{
  echo "# Full health report — $HOSTF — $TS"
  echo
  echo "**PASS=$PASS WARN=$WARN FAIL=$FAIL**"
  echo
  if [[ "$FAIL" -eq 0 ]]; then
    echo "## Verdict: **GO** — stack looks healthy"
  else
    echo "## Verdict: **NO-GO** — fix FAIL items"
  fi
  if [[ "$WARN" -gt 0 ]]; then
    echo
    echo "There are **$WARN** warnings — review but not hard-fail."
  fi
  echo
  echo "| Status | Check | Detail |"
  echo "|--------|-------|--------|"
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r st name detail <<<"$r"
    # escape pipes in detail
    detail="${detail//|/\\|}"
    echo "| $st | $name | $detail |"
  done
} >"$MD"

log "Wrote $MD"
log "Wrote $ENVR"

if [[ "$FAIL" -eq 0 ]]; then
  log "HEALTH_OK=yes"
  exit 0
else
  log "HEALTH_OK=no"
  exit 1
fi
