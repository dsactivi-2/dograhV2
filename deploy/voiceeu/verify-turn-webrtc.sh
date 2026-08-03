#!/usr/bin/env bash
# =============================================================================
# verify-turn-webrtc.sh — READ-ONLY TURN / WebRTC chain audit (DograhEUV2)
#
# Does NOT modify .env, compose, containers, or images.
#
# Based on dograhV2 source of truth:
#
#  WHERE TURN IS CONFIGURED
#  ------------------------
#  A) Host secrets / flags
#     /root/dograh/dograh/.env
#       ENABLE_COTURN=true|false     master switch (default false in code)
#       TURN_HOST=...                public host browsers dial
#       TURN_SECRET=...              shared secret (HMAC / coturn auth)
#       FORCE_TURN_RELAY=true|false  diagnostic: relay-only ICE
#       PUBLIC_HOST=...              fallback for TURN_HOST in api/constants.py
#
#  B) Compose → API container env (MUST pass-through or API never sees flags)
#     Repo reference: docker-compose.yaml service "api" environment:
#       ENABLE_COTURN: "${ENABLE_COTURN:-false}"
#       TURN_HOST: "${TURN_HOST:-}"
#       TURN_SECRET: "${TURN_SECRET:-}"
#       FORCE_TURN_RELAY: "${FORCE_TURN_RELAY:-false}"
#     Live stack path (voiceeu): /root/dograh/dograh/docker-compose.yaml
#     If these keys are missing in LIVE compose, .env alone does nothing.
#
#  C) Coturn process (media relay)
#     Container typically "coturn", ports 3478/5349 + UDP 49152-49200
#     Secret in coturn config must match TURN_SECRET (deploy-time)
#
#  D) API runtime constants (read once at process start)
#     api/constants.py:
#       ENABLE_COTURN = env == "true"
#       TURN_HOST = env or PUBLIC_HOST or "localhost"
#       TURN_SECRET = env
#       FORCE_TURN_RELAY = env == "true"
#
#  WHERE IT IS CHECKED / EXPOSED
#  -----------------------------
#  1) GET /api/v1/health
#       turn_enabled     = ENABLE_COTURN only   (api/routes/main.py)
#       force_turn_relay = FORCE_TURN_RELAY
#     NOTE: health does NOT require TURN_SECRET; credentials endpoints do.
#
#  2) GET /api/v1/turn/credentials  (auth required)
#       503 if not ENABLE_COTURN or missing TURN_SECRET
#       (api/routes/turn_credentials.py)
#
#  3) Public embed config + embed turn credentials
#       turn_enabled = ENABLE_COTURN AND bool(TURN_SECRET)
#       (api/routes/public_embed.py _turn_credentials_available)
#     Slightly stricter than /health.
#
#  4) WebRTC signaling uses TURN_HOST/SECRET when generating ICE/TURN URIs
#       (api/routes/webrtc_signaling.py)
#
#  FULL CHAIN (all must hold for WebRTC TURN to work)
#  --------------------------------------------------
#    .env ENABLE_COTURN=true
#      → compose maps ENABLE_COTURN into api service
#        → container env ENABLE_COTURN=true
#          → health.turn_enabled=true
#    .env TURN_SECRET + TURN_HOST set
#      → compose maps them into api
#        → credentials endpoint can mint URIs
#    coturn running + secret aligned + ports open
#      → browser can actually relay media
#
# Usage (on server):
#   curl -fsSL -o /root/verify-turn-webrtc.sh \
#     'https://raw.githubusercontent.com/dsactivi-2/dograhV2/main/deploy/voiceeu/verify-turn-webrtc.sh'
#   chmod +x /root/verify-turn-webrtc.sh
#   sudo bash /root/verify-turn-webrtc.sh
#
# Exit: 0 = no FAIL (WARN allowed), 1 = at least one FAIL
# =============================================================================
set -euo pipefail

STACK="${DOGRAH_ROOT:-/root/dograh/dograh}"
COMPOSE_FILE="${DOGRAH_COMPOSE:-$STACK/docker-compose.yaml}"
ENV_FILE="${DOGRAH_ENV:-$STACK/.env}"
API_CONTAINER="${DOGRAH_API_CONTAINER:-dograh-api-1}"
COTURN_NAME="${DOGRAH_COTURN_NAME:-coturn}"
HEALTH_URL="${DOGRAH_HEALTH_URL:-https://voiceeu.activi.io/api/v1/health}"
LOCAL_HEALTH_URL="${DOGRAH_LOCAL_HEALTH_URL:-http://127.0.0.1:8000/api/v1/health}"
REPO_COMPOSE_HINT="${DOGRAH_REPO_COMPOSE:-/root/src/dograhV2/docker-compose.yaml}"

REPORT_DIR="${REPORT_DIR:-$(pwd)}"
TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
HOSTF="$(hostname -f 2>/dev/null || hostname)"
mkdir -p "$REPORT_DIR"
OUT_MD="$REPORT_DIR/verify-turn-webrtc.md"
OUT_ENV="$REPORT_DIR/verify-turn-webrtc.env"
RAW="$REPORT_DIR/verify-turn-webrtc.raw.log"

OK=0; WARN=0; FAIL=0; INFO=0
RESULTS=()

exec > >(tee "$RAW") 2>&1

ok()   { OK=$((OK+1));   RESULTS+=("OK|$1|$2");   printf '  OK    %s — %s\n' "$1" "$2"; }
warn() { WARN=$((WARN+1)); RESULTS+=("WARN|$1|$2"); printf '  WARN  %s — %s\n' "$1" "$2"; }
fail() { FAIL=$((FAIL+1)); RESULTS+=("FAIL|$1|$2"); printf '  FAIL  %s — %s\n' "$1" "$2"; }
info() { INFO=$((INFO+1)); RESULTS+=("INFO|$1|$2"); printf '  INFO  %s — %s\n' "$1" "$2"; }

kv() {
  local k="$1"; shift
  local v="$*"
  v="${v//\"/\\\"}"
  printf '%s="%s"\n' "$k" "$v" >>"$OUT_ENV"
}

mask() {
  local s="${1:-}"
  [[ -z "$s" ]] && { echo "(empty)"; return; }
  local n=${#s}
  if [[ $n -le 4 ]]; then echo "****"; else echo "${s:0:2}***${s: -2} (len=$n)"; fi
}

get_env_file_val() {
  local key="$1"
  [[ -f "$ENV_FILE" ]] || { echo ""; return; }
  # last matching assignment wins
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' || true
}

: >"$OUT_ENV"
kv PREFLIGHT_TS "$TS"
kv PREFLIGHT_HOST "$HOSTF"

printf '==============================================\n'
printf ' Dograh TURN / WebRTC verify (READ-ONLY)\n'
printf ' Host: %s  Time: %s\n' "$HOSTF" "$TS"
printf ' Stack: %s\n' "$STACK"
printf '==============================================\n'

# ── 0 Overview ─────────────────────────────────────────────────────────────
printf '\n=== 0) Chain map (from repo) ===\n'
info "chain" ".env flags → compose api.environment → container env → api/constants.py → /health + /turn/credentials + embed"
info "health_field" "turn_enabled == ENABLE_COTURN only (does not check secret)"
info "credentials" "need ENABLE_COTURN AND TURN_SECRET (auth endpoint + embed)"
info "media" "coturn must run; secret must match TURN_SECRET; ports 3478/5349/49152-49200"

# ── 1 Host .env ────────────────────────────────────────────────────────────
printf '\n=== 1) Host .env (keys present / values masked) ===\n'
if [[ -f "$ENV_FILE" ]]; then
  ok "env_file" "$ENV_FILE"
else
  fail "env_file" "missing $ENV_FILE"
fi

ENABLE_COTURN_ENV="$(get_env_file_val ENABLE_COTURN)"
TURN_HOST_ENV="$(get_env_file_val TURN_HOST)"
TURN_SECRET_ENV="$(get_env_file_val TURN_SECRET)"
FORCE_TURN_ENV="$(get_env_file_val FORCE_TURN_RELAY)"
PUBLIC_HOST_ENV="$(get_env_file_val PUBLIC_HOST)"

kv ENABLE_COTURN_IN_ENV "${ENABLE_COTURN_ENV:-}"
kv TURN_HOST_IN_ENV "${TURN_HOST_ENV:-}"
kv TURN_SECRET_SET "$([[ -n "$TURN_SECRET_ENV" ]] && echo yes || echo no)"
kv FORCE_TURN_RELAY_IN_ENV "${FORCE_TURN_ENV:-}"
kv PUBLIC_HOST_IN_ENV "${PUBLIC_HOST_ENV:-}"

if [[ "${ENABLE_COTURN_ENV,,}" == "true" ]]; then
  ok "env_ENABLE_COTURN" "true"
elif [[ -z "$ENABLE_COTURN_ENV" ]]; then
  warn "env_ENABLE_COTURN" "unset (API default false)"
else
  warn "env_ENABLE_COTURN" "value='$ENABLE_COTURN_ENV' (only lowercase true enables)"
fi

[[ -n "$TURN_HOST_ENV" ]] && ok "env_TURN_HOST" "$TURN_HOST_ENV" || warn "env_TURN_HOST" "empty (API may fall back to PUBLIC_HOST)"
[[ -n "$PUBLIC_HOST_ENV" ]] && info "env_PUBLIC_HOST" "$PUBLIC_HOST_ENV" || warn "env_PUBLIC_HOST" "empty"
if [[ -n "$TURN_SECRET_ENV" ]]; then
  ok "env_TURN_SECRET" "set $(mask "$TURN_SECRET_ENV")"
else
  fail "env_TURN_SECRET" "missing — credentials endpoints will 503 even if ENABLE_COTURN=true"
fi
info "env_FORCE_TURN_RELAY" "${FORCE_TURN_ENV:-unset (default false)}"

# duplicate / conflicting keys
for key in ENABLE_COTURN TURN_HOST TURN_SECRET; do
  cnt="$(grep -cE "^${key}=" "$ENV_FILE" 2>/dev/null || echo 0)"
  if [[ "${cnt:-0}" -gt 1 ]]; then
    warn "env_duplicate_$key" "$cnt assignments (last wins)"
  fi
done

# ── 2 Live compose file mapping ────────────────────────────────────────────
printf '\n=== 2) Live compose: does api get TURN env? ===\n'
if [[ -f "$COMPOSE_FILE" ]]; then
  ok "compose_file" "$COMPOSE_FILE"
else
  fail "compose_file" "missing $COMPOSE_FILE"
fi

check_compose_key() {
  local key="$1"
  if [[ -f "$COMPOSE_FILE" ]] && grep -qE "^[[:space:]]*${key}:" "$COMPOSE_FILE"; then
    # show line numbers (no secret expansion)
    local lines
    lines="$(grep -nE "^[[:space:]]*${key}:" "$COMPOSE_FILE" | head -5)"
    ok "compose_has_$key" "$lines"
    kv "COMPOSE_HAS_$key" "yes"
  else
    fail "compose_has_$key" "NOT in $COMPOSE_FILE — .env value cannot reach api container"
    kv "COMPOSE_HAS_$key" "no"
  fi
}

check_compose_key ENABLE_COTURN
check_compose_key TURN_HOST
check_compose_key TURN_SECRET
check_compose_key FORCE_TURN_RELAY

# Compare to repo reference compose if present
if [[ -f "$REPO_COMPOSE_HINT" ]]; then
  info "repo_compose_ref" "$REPO_COMPOSE_HINT"
  for key in ENABLE_COTURN TURN_HOST TURN_SECRET FORCE_TURN_RELAY; do
    if grep -qE "^[[:space:]]*${key}:" "$REPO_COMPOSE_HINT"; then
      if grep -qE "^[[:space:]]*${key}:" "$COMPOSE_FILE" 2>/dev/null; then
        ok "parity_$key" "live compose has key (matches repo expectation)"
      else
        fail "parity_$key" "repo compose has $key under api; LIVE stack compose does not"
      fi
    fi
  done
else
  info "repo_compose_ref" "not found at $REPO_COMPOSE_HINT (optional)"
fi

# Effective compose config (interpolated) — mask secrets
printf '\n=== 3) docker compose config (effective api env, masked) ===\n'
if docker compose version >/dev/null 2>&1 && [[ -f "$COMPOSE_FILE" ]]; then
  CFG="$(cd "$STACK" && docker compose -f "$COMPOSE_FILE" config 2>/dev/null || true)"
  if [[ -z "$CFG" ]]; then
    warn "compose_config" "empty or failed"
  else
    for key in ENABLE_COTURN TURN_HOST TURN_SECRET FORCE_TURN_RELAY; do
      line="$(printf '%s\n' "$CFG" | grep -E "^[[:space:]]*${key}:" | head -1 || true)"
      if [[ -n "$line" ]]; then
        if [[ "$key" == "TURN_SECRET" ]]; then
          val="$(echo "$line" | sed 's/.*:[[:space:]]*//;s/[\"'\'']//g')"
          ok "compose_config_$key" "present $(mask "$val")"
        else
          ok "compose_config_$key" "$(echo "$line" | xargs)"
        fi
      else
        fail "compose_config_$key" "not in effective config"
      fi
    done
  fi
else
  warn "compose_config" "docker compose unavailable or no compose file"
fi

# ── 4 Container env ────────────────────────────────────────────────────────
printf '\n=== 4) Running API container env ===\n'
if docker ps --format '{{.Names}}' | grep -qx "$API_CONTAINER"; then
  ST="$(docker inspect -f 'status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}n/a{{end}} image={{.Config.Image}}' "$API_CONTAINER")"
  ok "api_container" "$API_CONTAINER $ST"
  for key in ENABLE_COTURN TURN_HOST TURN_SECRET FORCE_TURN_RELAY PUBLIC_HOST; do
    val="$(docker exec "$API_CONTAINER" printenv "$key" 2>/dev/null || true)"
    if [[ -z "$val" ]]; then
      fail "container_$key" "NOT SET inside container"
      kv "CONTAINER_$key" ""
    else
      if [[ "$key" == "TURN_SECRET" ]]; then
        ok "container_$key" "set $(mask "$val")"
      else
        ok "container_$key" "$val"
      fi
      kv "CONTAINER_$key" "$val"
    fi
  done

  # Runtime Python view (what health uses)
  if docker exec "$API_CONTAINER" python -c "import api.constants" >/dev/null 2>&1; then
    PY="$(docker exec "$API_CONTAINER" python - <<'PY'
from api.constants import ENABLE_COTURN, TURN_HOST, FORCE_TURN_RELAY, TURN_SECRET
print("ENABLE_COTURN", ENABLE_COTURN)
print("TURN_HOST", TURN_HOST)
print("FORCE_TURN_RELAY", FORCE_TURN_RELAY)
print("TURN_SECRET_SET", bool(TURN_SECRET))
PY
)"
    info "python_constants" "$(echo "$PY" | tr '\n' '; ')"
    echo "$PY" | while read -r line; do info "py" "$line"; done
    if echo "$PY" | grep -q 'ENABLE_COTURN True'; then
      ok "py_ENABLE_COTURN" "True"
    else
      fail "py_ENABLE_COTURN" "False — health.turn_enabled will be false"
    fi
  else
    warn "python_constants" "could not import api.constants"
  fi
else
  fail "api_container" "$API_CONTAINER not running"
fi

# ── 5 Health endpoints ─────────────────────────────────────────────────────
printf '\n=== 5) Health: turn_enabled / force_turn_relay ===\n'
probe_health() {
  local url="$1"
  local body code
  code="$(curl -sS -o /tmp/turn-health.body -w '%{http_code}' --max-time 12 "$url" 2>/dev/null || echo 000)"
  body="$(cat /tmp/turn-health.body 2>/dev/null || true)"
  if [[ "$code" != "200" ]]; then
    fail "health_$url" "HTTP $code"
    return
  fi
  ok "health_http" "$url → 200"
  # extract fields without jq dependency
  te="$(echo "$body" | sed -n 's/.*"turn_enabled"[[:space:]]*:[[:space:]]*\(true\|false\).*/\1/p' | head -1)"
  fr="$(echo "$body" | sed -n 's/.*"force_turn_relay"[[:space:]]*:[[:space:]]*\(true\|false\).*/\1/p' | head -1)"
  ver="$(echo "$body" | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
  info "health_version" "${ver:-unknown}"
  info "health_turn_enabled" "${te:-parse_fail}"
  info "health_force_turn_relay" "${fr:-parse_fail}"
  kv "HEALTH_turn_enabled_$url" "${te:-}"
  if [[ "$te" == "true" ]]; then
    ok "turn_enabled_flag" "$url reports true"
  elif [[ "$te" == "false" ]]; then
    fail "turn_enabled_flag" "$url reports false (ENABLE_COTURN not true in process)"
  else
    warn "turn_enabled_flag" "could not parse turn_enabled from $url"
  fi
}
probe_health "$LOCAL_HEALTH_URL"
probe_health "$HEALTH_URL"

# ── 6 Coturn process / ports ───────────────────────────────────────────────
printf '\n=== 6) Coturn container & host ports ===\n'
if docker ps --format '{{.Names}}' | grep -qx "$COTURN_NAME"; then
  CST="$(docker inspect -f 'status={{.State.Status}} image={{.Config.Image}}' "$COTURN_NAME")"
  ok "coturn_running" "$COTURN_NAME $CST"
else
  # fuzzy
  CID="$(docker ps --filter name=coturn -q | head -1 || true)"
  if [[ -n "$CID" ]]; then
    NAME="$(docker inspect -f '{{.Name}}' "$CID" | sed 's#^/##')"
    warn "coturn_running" "expected name $COTURN_NAME; found $NAME"
  else
    fail "coturn_running" "no coturn container — media relay unavailable"
  fi
fi

# Listening ports (host)
for p in 3478 5349; do
  if ss -lntu 2>/dev/null | grep -qE ":${p}\\b" || netstat -lntu 2>/dev/null | grep -qE ":${p}\\b"; then
    ok "port_$p" "listening on host"
  else
    warn "port_$p" "not detected listening (ss/netstat)"
  fi
done

# ── 7 Credential endpoint shape (no auth — expect 401/403, not always 503) ─
printf '\n=== 7) Credential route reachability (unauthenticated) ===\n'
# Authenticated route: without cookie should be 401/403 if enabled, or 503 if disabled
code="$(curl -sS -o /tmp/turn-cred.body -w '%{http_code}' --max-time 10 \
  "${LOCAL_HEALTH_URL%/api/v1/health}/api/v1/turn/credentials" 2>/dev/null || echo 000)"
body="$(head -c 200 /tmp/turn-cred.body 2>/dev/null || true)"
info "turn_credentials_http" "GET /api/v1/turn/credentials → $code ${body:0:120}"
case "$code" in
  401|403) ok "turn_credentials_route" "reachable (auth required) — good sign route exists" ;;
  503)     warn "turn_credentials_route" "503 TURN server not configured (ENABLE_COTURN false or no secret in process)" ;;
  404)     warn "turn_credentials_route" "404 — path may differ on this build" ;;
  000)     fail "turn_credentials_route" "request failed" ;;
  *)       info "turn_credentials_route" "HTTP $code" ;;
esac

# ── 8 Diagnosis matrix ─────────────────────────────────────────────────────
printf '\n=== 8) Diagnosis (what is broken vs ok) ===\n'

# Build simple boolean states from prior checks
COMPOSE_OK=0
grep -qE 'compose_has_ENABLE_COTURN\|OK' <<<"$(printf '%s\n' "${RESULTS[@]}")" 2>/dev/null || true
# recompute simply:
has_compose_enable=0
grep -qE "^[[:space:]]*ENABLE_COTURN:" "$COMPOSE_FILE" 2>/dev/null && has_compose_enable=1
cont_enable="$(docker exec "$API_CONTAINER" printenv ENABLE_COTURN 2>/dev/null || true)"
health_te="$(curl -sS --max-time 8 "$LOCAL_HEALTH_URL" 2>/dev/null | sed -n 's/.*"turn_enabled"[[:space:]]*:[[:space:]]*\(true\|false\).*/\1/p' | head -1)"

if [[ "${ENABLE_COTURN_ENV,,}" == "true" && "$has_compose_enable" -eq 0 ]]; then
  fail "root_cause_likely" ".env has ENABLE_COTURN=true but LIVE compose does not map it into api → container never sees it"
fi
if [[ "$has_compose_enable" -eq 1 && "${cont_enable,,}" != "true" ]]; then
  fail "root_cause_likely" "compose maps ENABLE_COTURN but container value is '${cont_enable:-empty}' — recreate api after compose fix"
fi
if [[ "${cont_enable,,}" == "true" && "$health_te" != "true" ]]; then
  fail "root_cause_likely" "container ENABLE_COTURN=true but health still false — process may need recreate / wrong worker env"
fi
if [[ "${ENABLE_COTURN_ENV,,}" != "true" ]]; then
  warn "root_cause_possible" "ENABLE_COTURN not true in .env"
fi
if [[ -n "$TURN_SECRET_ENV" && -z "$(docker exec "$API_CONTAINER" printenv TURN_SECRET 2>/dev/null || true)" ]]; then
  fail "root_cause_likely" "TURN_SECRET in .env but not in container — compose missing TURN_SECRET mapping"
fi

# Recommended next steps (text only — no changes)
printf '\n=== 9) Recommended fix order (DO NOT auto-apply) ===\n'
cat <<'EOF'
  If compose_has_ENABLE_COTURN = FAIL:
    1) Backup live docker-compose.yaml
    2) Under service api → environment, add (same indent as neighbors):
         ENABLE_COTURN: "${ENABLE_COTURN:-false}"
         TURN_HOST: "${TURN_HOST:-}"
         TURN_SECRET: "${TURN_SECRET:-}"
         FORCE_TURN_RELAY: "${FORCE_TURN_RELAY:-false}"
       (repo reference: docker-compose.yaml around the TURN block)
    3) docker compose config | grep ENABLE_COTURN   # must show true when .env true
    4) docker compose up -d --no-deps --force-recreate api
    5) Re-run THIS script — expect:
         container_ENABLE_COTURN=true
         health turn_enabled=true
         py ENABLE_COTURN True

  If only TURN_HOST/SECRET missing in compose: add those three keys too.
  If coturn not running: start coturn profile/service separately (ops).
  Do NOT set FORCE_TURN_RELAY=true in production until TURN path verified.
EOF

# ── Summary + report ───────────────────────────────────────────────────────
printf '\n=== Summary ===\n'
printf '  OK=%s  WARN=%s  FAIL=%s  INFO=%s\n' "$OK" "$WARN" "$FAIL" "$INFO"
kv PREFLIGHT_OK "$([[ "$FAIL" -eq 0 ]] && echo yes || echo no)"
kv PREFLIGHT_OK_COUNT "$OK"
kv PREFLIGHT_WARN_COUNT "$WARN"
kv PREFLIGHT_FAIL_COUNT "$FAIL"

{
  echo "# TURN / WebRTC verify"
  echo
  echo "- Host: \`$HOSTF\`"
  echo "- Time: \`$TS\`"
  echo "- OK=$OK WARN=$WARN FAIL=$FAIL"
  echo
  echo "## Repo chain"
  echo
  echo '```'
  echo '.env ENABLE_COTURN / TURN_*'
  echo '  → compose api.environment pass-through'
  echo '    → container env'
  echo '      → api/constants.py'
  echo '        → GET /api/v1/health  (turn_enabled = ENABLE_COTURN)'
  echo '        → GET /api/v1/turn/credentials (needs ENABLE_COTURN + TURN_SECRET + auth)'
  echo '        → embed turn_enabled (ENABLE_COTURN AND TURN_SECRET)'
  echo '  + coturn container for actual media relay'
  echo '```'
  echo
  echo "## Results"
  echo
  echo "| Status | Check | Detail |"
  echo "|--------|-------|--------|"
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r st name detail <<<"$r"
    # escape pipes in detail
    detail="${detail//|/\\|}"
    echo "| $st | \`$name\` | $detail |"
  done
} >"$OUT_MD"

printf '\nWrote %s\n' "$OUT_MD"
printf 'Wrote %s\n' "$OUT_ENV"
printf 'Wrote %s\n' "$RAW"

if [[ "$FAIL" -eq 0 ]]; then
  printf '\nVERIFY_OK=yes\n'
  exit 0
fi
printf '\nVERIFY_OK=no — see FAILs above before changing compose\n'
exit 1
