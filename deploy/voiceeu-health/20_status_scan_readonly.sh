#!/usr/bin/env bash
# =============================================================================
# 20_status_scan_readonly.sh — ONLY READ, never changes the server
#
# Single-shot status scan for Dograh voiceeu (or any remote Dograh host):
#   • discovers paths / containers / env flags (no secret values dumped)
#   • checks health of stack + Deepgram EU + the 4 API processes
#   • classifies each area: OK | STILL_ISSUE | NEW_ISSUE | INFO
#   • compares against the known-good baseline after Deepgram-EU deploy
#
# Exit: 0 = no FAIL-class issues, 1 = at least one STILL_ISSUE or NEW_ISSUE hard fail
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${REPORT_DIR:-$SCRIPT_DIR}"
TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
HOSTF="$(hostname -f 2>/dev/null || hostname)"
mkdir -p "$OUT_DIR"
REPORT_MD="$OUT_DIR/status-scan-report.md"
REPORT_ENV="$OUT_DIR/status-scan-report.env"
RAW_LOG="$OUT_DIR/status-scan.raw.log"

OK=0; WARN=0; FAIL=0; INFO=0
RESULTS=()

log()  { printf '%s\n' "$*"; }
ok()   { OK=$((OK+1));   RESULTS+=("OK|$1|$2");   log "  ✅ OK     $1 — $2"; }
warn() { WARN=$((WARN+1)); RESULTS+=("WARN|$1|$2"); log "  ⚠️  WARN   $1 — $2"; }
fail() { FAIL=$((FAIL+1)); RESULTS+=("FAIL|$1|$2"); log "  ❌ FAIL   $1 — $2"; }
info() { INFO=$((INFO+1)); RESULTS+=("INFO|$1|$2"); log "  ℹ  INFO   $1 — $2"; }

have() { command -v "$1" >/dev/null 2>&1; }

# Known-good baseline (post Deepgram-EU + process fix era)
BASELINE_API_IMAGE_RE='dograhv2-api:dg-eu|dg-eu'
BASELINE_DG='api.eu.deepgram.com'
BASELINE_PUBLIC_HOST_HINT='voiceeu.activi.io'

exec > >(tee "$RAW_LOG") 2>&1

log "=============================================="
log " Dograh READ-ONLY Status Scan"
log " Host: $HOSTF  Time: $TS"
log " Mode: ONLY READ — no docker restart, no file writes outside $OUT_DIR"
log "=============================================="
log

# ── 0 Host ────────────────────────────────────────────────────────────────
log "=== 0) Host ==="
info "hostname" "$HOSTF"
info "whoami" "$(whoami)"
info "uptime" "$(uptime -p 2>/dev/null || true)"
DISK="$(df -P / | awk 'NR==2{gsub(/%/,"",$5); print $5}')"
MEM="$(free | awk '/Mem:/{printf "%d", $3*100/$2}')"
LOAD="$(cut -d' ' -f1-3 /proc/loadavg)"
NCPU="$(nproc 2>/dev/null || echo 1)"
[[ "${DISK:-0}" -ge 90 ]] && fail "disk" "${DISK}% used" || { [[ "${DISK:-0}" -ge 80 ]] && warn "disk" "${DISK}% used" || ok "disk" "${DISK}% used"; }
[[ "${MEM:-0}" -ge 95 ]] && fail "memory" "${MEM}% used" || { [[ "${MEM:-0}" -ge 85 ]] && warn "memory" "${MEM}% used" || ok "memory" "${MEM}% used"; }
ok "load" "$LOAD (ncpu=$NCPU)"
have docker && ok "docker" "$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo present)" || fail "docker" "not available"

# ── 1 Discover Dograh root ────────────────────────────────────────────────
log
log "=== 1) Discover install ==="
FOUND_ROOT=""; FOUND_COMPOSE=""; ENV_FILE=""
CAND=()
[[ -n "${DOGRAH_ROOT:-}" ]] && CAND+=("$DOGRAH_ROOT")
CAND+=(/root/dograh/dograh /root/dograh /opt/dograh /opt/dograh/dograh)
while IFS= read -r f; do CAND+=("$(dirname "$f")"); done < <(
  find /root /opt /home /srv -maxdepth 4 -type f \( -name docker-compose.yaml -o -name docker-compose.yml \) 2>/dev/null | head -25
)
declare -A SEEN=()
for d in "${CAND[@]}"; do
  [[ -d "$d" ]] || continue
  [[ -n "${SEEN[$d]:-}" ]] && continue
  SEEN[$d]=1
  for name in docker-compose.yaml docker-compose.yml; do
    if [[ -f "$d/$name" ]] && grep -qE 'dograh-api|dograhai/|^\s+api:' "$d/$name" 2>/dev/null; then
      FOUND_ROOT="$d"; FOUND_COMPOSE="$d/$name"; break 2
    fi
  done
done
if [[ -z "$FOUND_ROOT" ]]; then
  cid="$(docker ps --filter label=com.docker.compose.service=api -q 2>/dev/null | head -1 || true)"
  if [[ -n "$cid" ]]; then
    wdir="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$cid" 2>/dev/null || true)"
    [[ -n "$wdir" && -d "$wdir" ]] && FOUND_ROOT="$wdir"
    for name in docker-compose.yaml docker-compose.yml; do
      [[ -f "${FOUND_ROOT:-}/$name" ]] && FOUND_COMPOSE="$FOUND_ROOT/$name" && break
    done
  fi
fi
for f in "${FOUND_ROOT:-}/.env" /root/dograh/dograh/.env; do
  [[ -f "$f" ]] && ENV_FILE="$f" && break
done

if [[ -n "$FOUND_ROOT" ]]; then
  ok "dograh_root" "$FOUND_ROOT"
else
  fail "dograh_root" "not found"
fi
[[ -n "$FOUND_COMPOSE" ]] && ok "compose_file" "$FOUND_COMPOSE" || warn "compose_file" "not found"
[[ -n "$ENV_FILE" ]] && ok "env_file" "$ENV_FILE" || warn "env_file" "not found"

get_env() {
  local key="$1"
  [[ -n "$ENV_FILE" && -f "$ENV_FILE" ]] || { echo ""; return; }
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' || true
}

PUBLIC_HOST="$(get_env PUBLIC_HOST)"
PUBLIC_BASE_URL="$(get_env PUBLIC_BASE_URL)"
BACKEND_API_ENDPOINT="$(get_env BACKEND_API_ENDPOINT)"
TURN_HOST="$(get_env TURN_HOST)"
DEEPGRAM_ENV="$(get_env DEEPGRAM_BASE_URL)"
FASTAPI_WORKERS="$(get_env FASTAPI_WORKERS)"
FW="${FASTAPI_WORKERS:-1}"
[[ "$FW" =~ ^[0-9]+$ ]] || FW=1
TURN_SECRET_SET=no; [[ -n "$(get_env TURN_SECRET)" ]] && TURN_SECRET_SET=yes
OSS_JWT_SET=no; [[ -n "$(get_env OSS_JWT_SECRET)" ]] && OSS_JWT_SET=yes

info "PUBLIC_HOST" "${PUBLIC_HOST:-empty}"
info "PUBLIC_BASE_URL" "${PUBLIC_BASE_URL:-empty}"
info "DEEPGRAM_BASE_URL in .env" "${DEEPGRAM_ENV:-unset (code default may apply)}"
info "FASTAPI_WORKERS" "$FW"
[[ "$TURN_SECRET_SET" == "yes" ]] && ok "TURN_SECRET" "set" || warn "TURN_SECRET" "not set"
[[ "$OSS_JWT_SET" == "yes" ]] && ok "OSS_JWT_SECRET" "set" || fail "OSS_JWT_SECRET" "missing"
[[ -n "$TURN_HOST" ]] && ok "TURN_HOST" "$TURN_HOST" || warn "TURN_HOST" "empty"

# ── 2 Containers ──────────────────────────────────────────────────────────
log
log "=== 2) Containers (read-only docker ps/inspect) ==="
resolve_cid() {
  local svc="$1" name_pat="$2" img_pat="${3:-}"
  local id
  id="$(docker ps --filter "label=com.docker.compose.service=$svc" -q 2>/dev/null | head -1 || true)"
  [[ -n "$id" ]] && { echo "$id"; return; }
  if [[ -n "$img_pat" ]]; then
    id="$(docker ps --format '{{.ID}} {{.Image}} {{.Names}}' 2>/dev/null | grep -iE "$img_pat" | awk '{print $1}' | head -1 || true)"
    [[ -n "$id" ]] && { echo "$id"; return; }
  fi
  docker ps --format '{{.ID}} {{.Names}}' 2>/dev/null | grep -iE "$name_pat" | awk '{print $1}' | head -1 || true
}

API_CID="$(resolve_cid api 'dograh-api|dograhv2-api' 'dograh-api|dograhv2-api')"
UI_CID="$(resolve_cid ui 'dograh-ui' 'dograh-ui')"
PG_CID="$(resolve_cid postgres 'postgres' 'pgvector|postgres')"
REDIS_CID="$(resolve_cid redis 'redis' 'redis:')"
MINIO_CID="$(resolve_cid minio 'minio' 'minio/minio')"
NGINX_CID="$(resolve_cid nginx 'nginx' '')"
COTURN_CID="$(resolve_cid coturn 'coturn' 'coturn')"
CF_CID="$(resolve_cid cloudflared 'cloudflared|tunnel' 'cloudflared')"

cstat() {
  local id="$1"
  [[ -n "$id" ]] || { echo "missing|none|0|false|"; return; }
  docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.RestartCount}}|{{.State.OOMKilled}}|{{.Config.Image}}' "$id" 2>/dev/null || echo "missing|none|0|false|"
}

check_c() {
  local label="$1" id="$2" need_h="${3:-yes}"
  if [[ -z "$id" ]]; then
    fail "$label" "not running"
    return
  fi
  local st health restarts oom img
  IFS='|' read -r st health restarts oom img <<<"$(cstat "$id")"
  if [[ "$st" != "running" ]]; then
    fail "$label" "status=$st image=$img"
    return
  fi
  ok "$label running" "id=${id:0:12} image=$img health=$health restarts=$restarts"
  if [[ "$need_h" == "yes" && "$health" != "none" && "$health" != "healthy" ]]; then
    fail "$label health" "health=$health (want healthy)"
  elif [[ "$health" == "healthy" ]]; then
    ok "$label health" "healthy"
  fi
  [[ "${restarts:-0}" -ge 5 ]] && warn "$label restarts" "restarts=$restarts (unstable?)"
  [[ "$oom" == "true" ]] && fail "$label OOM" "was OOMKilled"
}

check_c postgres "$PG_CID" yes
check_c redis "$REDIS_CID" yes
check_c minio "$MINIO_CID" yes
check_c api "$API_CID" yes
check_c ui "$UI_CID" yes
check_c nginx "$NGINX_CID" no
check_c coturn "$COTURN_CID" no
if [[ -n "$CF_CID" ]]; then check_c cloudflared "$CF_CID" no; else info "cloudflared" "not running (ok if public IP)"; fi

# leftover exited junk
EXITED="$(docker ps -a --filter status=exited --format '{{.Names}} {{.Status}}' 2>/dev/null | grep -viE 'dograh_init|dograh-init' | head -5 || true)"
if [[ -n "$EXITED" ]]; then
  warn "exited containers" "leftovers (not always bad): $(echo "$EXITED" | tr '\n' '; ' | cut -c1-160)"
else
  ok "exited containers" "none notable"
fi

# ── 3 API image + Deepgram EU ─────────────────────────────────────────────
log
log "=== 3) Deepgram EU / API image (baseline check) ==="
API_IMAGE=""
if [[ -n "$API_CID" ]]; then
  API_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$API_CID" 2>/dev/null || true)"
  info "api_image" "$API_IMAGE"
  if echo "$API_IMAGE" | grep -qiE "$BASELINE_API_IMAGE_RE"; then
    ok "api image baseline" "matches EU/custom expectation ($API_IMAGE)"
  else
    warn "api image baseline" "not dg-eu tag ($API_IMAGE) — stock hub image may lack EU patch"
  fi

  HAS_CONST=no; HAS_FACT=no
  docker exec "$API_CID" grep -q 'api.eu.deepgram.com' /app/api/constants.py 2>/dev/null && HAS_CONST=yes || true
  docker exec "$API_CID" grep -q '_deepgram_inference_urls' /app/api/services/pipecat/service_factory.py 2>/dev/null && HAS_FACT=yes || true
  [[ "$HAS_CONST" == "yes" ]] && ok "Deepgram EU in constants.py" "present" || fail "Deepgram EU in constants.py" "MISSING — STILL US or old image"
  [[ "$HAS_FACT" == "yes" ]] && ok "Deepgram EU factory" "_deepgram_inference_urls present" || fail "Deepgram EU factory" "MISSING — inference may not use EU"

  PY="$(docker exec "$API_CID" python -c "
from api.constants import DEEPGRAM_BASE_URL
print('BASE='+DEEPGRAM_BASE_URL)
try:
  from api.services.pipecat.service_factory import _deepgram_inference_urls
  stt,flux,tts=_deepgram_inference_urls()
  print('STT='+stt); print('FLUX='+flux); print('TTS='+tts)
except Exception as e:
  print('FACTORY_ERR='+type(e).__name__)
" 2>/dev/null || true)"
  BASE="$(echo "$PY" | sed -n 's/^BASE=//p' | tail -1)"
  STT="$(echo "$PY" | sed -n 's/^STT=//p' | tail -1)"
  FLUX="$(echo "$PY" | sed -n 's/^FLUX=//p' | tail -1)"
  TTS="$(echo "$PY" | sed -n 's/^TTS=//p' | tail -1)"
  FERR="$(echo "$PY" | sed -n 's/^FACTORY_ERR=//p' | tail -1)"

  if [[ "$BASE" == *"$BASELINE_DG"* ]]; then
    ok "Deepgram runtime BASE" "$BASE"
  elif [[ -n "$BASE" ]]; then
    fail "Deepgram runtime BASE" "$BASE (expected $BASELINE_DG) — NOT FIXED / drifted"
  else
    fail "Deepgram runtime BASE" "empty/import failed"
  fi

  if [[ -n "$FERR" ]]; then
    fail "Deepgram inference URLs" "import error $FERR"
  elif [[ "$STT" == *"$BASELINE_DG"* && "$FLUX" == *"$BASELINE_DG"* && "$TTS" == *"$BASELINE_DG"* ]]; then
    ok "Deepgram inference URLs" "STT/Flux/TTS all EU ($STT | $FLUX | $TTS)"
  elif [[ -n "$STT" ]]; then
    fail "Deepgram inference URLs" "not all EU: stt=$STT flux=$FLUX tts=$TTS"
  fi

  if [[ -n "$DEEPGRAM_ENV" && "$DEEPGRAM_ENV" == *"$BASELINE_DG"* ]]; then
    ok "DEEPGRAM_BASE_URL in .env" "$DEEPGRAM_ENV"
  elif [[ -z "$DEEPGRAM_ENV" ]]; then
    info "DEEPGRAM_BASE_URL in .env" "unset — code default applies"
  else
    warn "DEEPGRAM_BASE_URL in .env" "$DEEPGRAM_ENV (not EU)"
  fi
else
  fail "Deepgram checks" "no API container"
fi

# ── 4 HTTP health ─────────────────────────────────────────────────────────
log
log "=== 4) HTTP health ==="
HEALTH_URL=""
for u in \
  "${PUBLIC_BASE_URL%/}/api/v1/health" \
  "${BACKEND_API_ENDPOINT%/}/api/v1/health" \
  "https://${PUBLIC_HOST}/api/v1/health" \
  "http://127.0.0.1:8000/api/v1/health"
do
  [[ -z "$u" || "$u" == *'//'*/api* && "$u" != http* ]] && continue
  [[ "$u" == "/api/v1/health" || "$u" == "https:///api/v1/health" ]] && continue
  code="$(curl -sk -o /tmp/dg_scan_h.json -w '%{http_code}' --max-time 8 "$u" 2>/dev/null || echo 000)"
  if [[ "$code" == "200" ]]; then
    HEALTH_URL="$u"
    break
  fi
done

if [[ -n "$HEALTH_URL" ]]; then
  ok "public/local health URL" "HTTP 200 $HEALTH_URL"
  if have python3 && [[ -f /tmp/dg_scan_h.json ]]; then
    eval "$(python3 - <<'PY'
import json
try:
  d=json.load(open("/tmp/dg_scan_h.json"))
except Exception:
  print("PARSE=0"); raise SystemExit
print("PARSE=1")
print("H_STATUS=%s" % d.get("status",""))
print("H_VERSION=%s" % str(d.get("version","")).replace(" ",""))
print("H_TURN=%s" % d.get("turn_enabled",""))
print("H_FORCE=%s" % d.get("force_turn_relay",""))
print("H_MODE=%s" % d.get("deployment_mode",""))
print("H_BACKEND=%s" % str(d.get("backend_api_endpoint","")).replace(" ",""))
PY
)" || true
    if [[ "${PARSE:-0}" == "1" ]]; then
      [[ "$H_STATUS" == "ok" ]] && ok "health.status" "ok" || fail "health.status" "${H_STATUS:-?}"
      info "health.version" "${H_VERSION:-?}"
      [[ "$H_TURN" == "True" || "$H_TURN" == "true" || "$H_TURN" == "1" ]] && ok "health.turn_enabled" "true" || warn "health.turn_enabled" "$H_TURN"
      [[ "$H_FORCE" == "True" || "$H_FORCE" == "true" ]] && warn "health.force_turn_relay" "true (diagnostic)" || ok "health.force_turn_relay" "false"
      info "health.backend" "${H_BACKEND:-?}"
    fi
  fi
else
  fail "health URL" "no 200 from public or local candidates"
fi

code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8000/api/v1/health 2>/dev/null || echo 000)"
[[ "$code" == "200" ]] && ok "local :8000" "HTTP 200" || fail "local :8000" "HTTP $code"

# ── 5 Datastores ──────────────────────────────────────────────────────────
log
log "=== 5) Datastores (live probes) ==="
if [[ -n "$PG_CID" ]] && docker exec "$PG_CID" pg_isready -U postgres >/dev/null 2>&1; then
  ok "postgres" "pg_isready OK"
else
  fail "postgres" "not ready / missing"
fi
if [[ -n "$REDIS_CID" ]]; then
  RP="$(get_env REDIS_PASSWORD)"; [[ -n "$RP" ]] || RP="redissecret"
  pong="$(docker exec "$REDIS_CID" redis-cli -a "$RP" ping 2>/dev/null | tr -d '\r' || true)"
  [[ "$pong" == "PONG" ]] && ok "redis" "PONG" || fail "redis" "ping=$pong"
else
  fail "redis" "missing"
fi
mcode="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:9000/minio/health/live 2>/dev/null || echo 000)"
if [[ "$mcode" == "200" ]]; then
  ok "minio" "health/live 200"
elif [[ -n "$MINIO_CID" ]] && docker exec "$MINIO_CID" curl -sf http://localhost:9000/minio/health/live >/dev/null 2>&1; then
  ok "minio" "health/live OK (in-container)"
else
  fail "minio" "HTTP $mcode"
fi

# ── 6 Four API processes (deep, no ps required) ───────────────────────────
log
log "=== 6) API processes (uvicorn / arq / campaign / ari) ==="
if [[ -n "$API_CID" ]]; then
  TOP="$(docker top "$API_CID" -eo pid,cmd 2>/dev/null || docker top "$API_CID" 2>/dev/null || true)"
  PROC="$(docker exec "$API_CID" sh -c 'for f in /proc/[0-9]*/cmdline; do [ -r "$f" ]||continue; tr "\0" " " <"$f"; echo; done' 2>/dev/null || true)"
  BUNDLE="${TOP}
${PROC}"
  START_LOG="$(docker logs "$API_CID" 2>&1 | grep -E '→ Starting|Starting Dograh Services' | tail -40 || true)"
  TEAR="$(docker logs "$API_CID" 2>&1 | grep -iE 'A service exited|tearing down' | tail -5 || true)"

  if [[ -n "$(echo "$BUNDLE" | tr -d '[:space:]')" ]]; then
    ok "process list" "docker top//proc readable"
    log "--- process snapshot ---"
    echo "$BUNDLE" | sed '/^$/d' | head -20
  else
    warn "process list" "empty — will use health + startup logs"
  fi
  [[ -n "$START_LOG" ]] && { ok "startup markers" "found"; echo "$START_LOG"; } || warn "startup markers" "none in logs"
  if [[ -n "$TEAR" ]]; then
    fail "child exit markers" "service may have died"; echo "$TEAR"
  else
    ok "child exit markers" "none"
  fi

  seen() { echo "$BUNDLE" | grep -qiE "$1"; }
  started() { echo "$START_LOG" | grep -qE "$1"; }

  # uvicorn
  UV_N="$(echo "$BUNDLE" | grep -cE 'uvicorn api\.app:app|/uvicorn api\.app:app' || true)"
  if seen 'uvicorn|api\.app:app'; then
    ok "uvicorn" "DEFINITELY RUNNING (count≈$UV_N, expected_workers=$FW)"
    if [[ "$FW" -gt 1 ]]; then
      if [[ "$UV_N" -ge "$FW" ]]; then
        ok "uvicorn workers" "all $FW workers in process table (host may only publish :8000 — that is OK)"
      elif [[ "$UV_N" -ge 1 ]]; then
        warn "uvicorn workers" "only ≈$UV_N/$FW in table — partial?"
      fi
    fi
  elif [[ "$(curl -sk -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8000/api/v1/health 2>/dev/null || echo 000)" == "200" ]]; then
    ok "uvicorn" "RUNNING (health=200; not listed — tooling/cmdline)"
  else
    fail "uvicorn" "NOT RUNNING — API broken"
  fi

  if seen 'arq|WorkerSettings'; then
    ok "arq" "DEFINITELY RUNNING"
  elif started '→ Starting arq'; then
    warn "arq" "started in log but not in table now"
  else
    warn "arq" "NOT PROVEN — background jobs may be down"
  fi

  if seen 'campaign_orchestrator'; then
    ok "campaign_orchestrator" "DEFINITELY RUNNING"
  elif started '→ Starting campaign_orchestrator'; then
    warn "campaign_orchestrator" "started in log but not in table now"
  else
    warn "campaign_orchestrator" "NOT PROVEN — campaigns only"
  fi

  if seen 'ari_manager'; then
    ok "ari_manager" "DEFINITELY RUNNING"
  elif started '→ Starting ari_manager'; then
    warn "ari_manager" "started in log but not in table now"
  else
    info "ari_manager" "NOT PROVEN — only needed for Asterisk"
  fi
else
  fail "API processes" "no container"
fi

# ── 7 Ports / TLS ─────────────────────────────────────────────────────────
log
log "=== 7) Ports & TLS ==="
port_tcp() {
  local p="$1" lab="$2"
  if ss -lnt 2>/dev/null | grep -qE ":${p}\\b"; then ok "port $lab" "tcp/$p"; else fail "port $lab" "tcp/$p missing"; fi
}
port_udp() {
  local p="$1" lab="$2"
  if ss -lnu 2>/dev/null | grep -qE ":${p}\\b"; then ok "port $lab" "udp/$p"; else warn "port $lab" "udp/$p not seen"; fi
}
port_tcp 80 http; port_tcp 443 https; port_tcp 8000 api; port_tcp 3010 ui
port_tcp 5432 postgres; port_tcp 6379 redis
port_tcp 3478 turn-tcp; port_udp 3478 turn-udp
port_tcp 5349 turns-tcp; port_udp 5349 turns-udp

if [[ -n "${PUBLIC_HOST:-}" ]] && have openssl; then
  end="$(echo | openssl s_client -servername "$PUBLIC_HOST" -connect "${PUBLIC_HOST}:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)"
  if [[ -n "$end" ]]; then
    end_epoch="$(date -d "$end" +%s 2>/dev/null || echo 0)"
    now="$(date +%s)"
    if [[ "$end_epoch" -gt 0 ]]; then
      days=$(( (end_epoch - now) / 86400 ))
      if [[ "$days" -lt 0 ]]; then fail "TLS" "EXPIRED ($end)"
      elif [[ "$days" -lt 14 ]]; then warn "TLS" "expires in ${days}d ($end)"
      else ok "TLS" "valid ${days}d (until $end)"; fi
    else
      info "TLS" "$end"
    fi
  else
    warn "TLS" "could not read cert for $PUBLIC_HOST"
  fi
fi

# ── 8 Logs ────────────────────────────────────────────────────────────────
log
log "=== 8) Recent fatal log markers ==="
scan_logs() {
  local lab="$1" id="$2"
  [[ -n "$id" ]] || return
  local logs
  logs="$(docker logs --tail 80 "$id" 2>&1 || true)"
  if echo "$logs" | grep -qiE 'Traceback \(most recent call last\)|Application startup failed|Error loading ASGI|A service exited; tearing down'; then
    fail "$lab logs" "fatal markers in last 80 lines"
  else
    ok "$lab logs" "no fatal markers"
  fi
}
scan_logs api "$API_CID"
scan_logs nginx "$NGINX_CID"
scan_logs coturn "$COTURN_CID"

# ── 9 Baseline verdict ────────────────────────────────────────────────────
log
log "=== 9) Baseline vs current (Deepgram-EU era) ==="
# Summarize known baseline points
BASE_FAIL=0
echo "$API_IMAGE" | grep -qiE "$BASELINE_API_IMAGE_RE" || BASE_FAIL=$((BASE_FAIL+1))
[[ "$BASE" == *"$BASELINE_DG"* ]] || BASE_FAIL=$((BASE_FAIL+1))
[[ "$HAS_CONST" == "yes" && "$HAS_FACT" == "yes" ]] || BASE_FAIL=$((BASE_FAIL+1))
[[ -n "$API_CID" ]] || BASE_FAIL=$((BASE_FAIL+1))

if [[ "$FAIL" -eq 0 && "$BASE_FAIL" -eq 0 ]]; then
  ok "overall baseline" "matches known-good Deepgram-EU voiceeu state (or equivalent)"
  VERDICT="CURRENT_OK"
elif [[ "$FAIL" -eq 0 ]]; then
  warn "overall baseline" "soft drift/warnings only — stack usable"
  VERDICT="OK_WITH_WARNINGS"
else
  fail "overall baseline" "$FAIL hard issue(s) — see FAIL rows (not fixed / new breakage)"
  VERDICT="NEEDS_ATTENTION"
fi

# ── Write reports (only under OUT_DIR) ─────────────────────────────────────
log
log "=============================================="
log " RESULT: OK=$OK  WARN=$WARN  FAIL=$FAIL  INFO=$INFO"
log " VERDICT: $VERDICT"
log "=============================================="

{
  echo "SCAN_TS=$TS"
  echo "HOST=$HOSTF"
  echo "OK=$OK"
  echo "WARN=$WARN"
  echo "FAIL=$FAIL"
  echo "INFO=$INFO"
  echo "VERDICT=$VERDICT"
  echo "API_IMAGE=${API_IMAGE:-}"
  echo "DEEPGRAM_BASE=${BASE:-}"
  echo "DOGRAH_ROOT=${FOUND_ROOT:-}"
  echo "READONLY=yes"
} >"$REPORT_ENV"

{
  echo "# Read-only status scan — $HOSTF — $TS"
  echo
  echo "**OK=$OK WARN=$WARN FAIL=$FAIL INFO=$INFO**"
  echo
  echo "## Verdict: \`$VERDICT\`"
  echo
  case "$VERDICT" in
    CURRENT_OK) echo "Stack matches the expected healthy Deepgram-EU deployment. No hard issues." ;;
    OK_WITH_WARNINGS) echo "Usable, but review WARN lines (drift / optional components)." ;;
    NEEDS_ATTENTION) echo "Hard FAIL(s) present — either old issues not fixed or new breakage." ;;
  esac
  echo
  echo "| Status | Check | Detail |"
  echo "|--------|-------|--------|"
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r st name detail <<<"$r"
    detail="${detail//|/\\|}"
    echo "| $st | $name | $detail |"
  done
  echo
  echo "## Notes"
  echo "- This script is **read-only** (no restarts, no image pulls, no .env edits)."
  echo "- Secrets are **not** written to the report."
  echo "- uvicorn workers 8001+ are internal to Docker; host may only show :8000 — that is normal."
  echo "- Reports: \`$REPORT_MD\` , \`$REPORT_ENV\` , \`$RAW_LOG\`"
} >"$REPORT_MD"

log "Wrote $REPORT_MD"
log "Wrote $REPORT_ENV"
log "Wrote $RAW_LOG"
log
log "VERDICT=$VERDICT  (exit $([[ "$FAIL" -eq 0 ]] && echo 0 || echo 1))"

[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
