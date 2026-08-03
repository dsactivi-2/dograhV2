#!/usr/bin/env bash
# =============================================================================
# preflight-deploy-api.sh — READ-ONLY checks before deploy-api-main.sh
#
# Run on DograhEUV2 / voiceeu. Does NOT change containers, images, or files
# outside REPORT_DIR (default: current dir).
#
# Usage:
#   curl -fsSL -o /root/preflight-deploy-api.sh \
#     'https://raw.githubusercontent.com/dsactivi-2/dograhV2/main/deploy/voiceeu/preflight-deploy-api.sh'
#   chmod +x /root/preflight-deploy-api.sh
#   sudo bash /root/preflight-deploy-api.sh
#
# Exit: 0 = safe to deploy (no hard FAIL), 1 = fix issues first
# =============================================================================
set -euo pipefail

SRC="${DOGRAH_SRC:-/root/src/dograhV2}"
STACK="${DOGRAH_ROOT:-/root/dograh/dograh}"
COMPOSE_FILE="${DOGRAH_COMPOSE:-$STACK/docker-compose.yaml}"
HEALTH_URL="${DOGRAH_HEALTH_URL:-https://voiceeu.activi.io/api/v1/health}"
LOCAL_HEALTH_URL="${DOGRAH_LOCAL_HEALTH_URL:-http://127.0.0.1:8000/api/v1/health}"
IMAGE_TAG="${DOGRAH_API_IMAGE:-dograhv2-api:dg-eu-fish}"
API_CONTAINER="${DOGRAH_API_CONTAINER:-dograh-api-1}"
REPO_URL="${DOGRAH_REPO_URL:-https://github.com/dsactivi-2/dograhV2.git}"
REMOTE_NAME="${DOGRAH_REMOTE:-origin}"
BRANCH="${DOGRAH_BRANCH:-main}"

REPORT_DIR="${REPORT_DIR:-$(pwd)}"
TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
HOSTF="$(hostname -f 2>/dev/null || hostname)"
mkdir -p "$REPORT_DIR"
OUT_MD="$REPORT_DIR/preflight-deploy-api.md"
OUT_ENV="$REPORT_DIR/preflight-deploy-api.env"
RAW="$REPORT_DIR/preflight-deploy-api.raw.log"

OK=0
WARN=0
FAIL=0
RESULTS=()

exec > >(tee "$RAW") 2>&1

ok()   { OK=$((OK+1));   RESULTS+=("OK|$1|$2");   printf '  OK    %s — %s\n' "$1" "$2"; }
warn() { WARN=$((WARN+1)); RESULTS+=("WARN|$1|$2"); printf '  WARN  %s — %s\n' "$1" "$2"; }
fail() { FAIL=$((FAIL+1)); RESULTS+=("FAIL|$1|$2"); printf '  FAIL  %s — %s\n' "$1" "$2"; }
info() { RESULTS+=("INFO|$1|$2"); printf '  INFO  %s — %s\n' "$1" "$2"; }
have() { command -v "$1" >/dev/null 2>&1; }

kv() {
  local k="$1"; shift
  local v="$*"
  v="${v//\"/\\\"}"
  printf '%s="%s"\n' "$k" "$v" >>"$OUT_ENV"
}

: >"$OUT_ENV"
kv PREFLIGHT_TS "$TS"
kv PREFLIGHT_HOST "$HOSTF"
kv WHOAMI "$(whoami)"

printf '==============================================\n'
printf ' Dograh API Deploy Preflight (READ-ONLY)\n'
printf ' Host: %s  Time: %s\n' "$HOSTF" "$TS"
printf ' Mode: no docker restarts, no image builds\n'
printf '==============================================\n\n'

# --- tools ---
printf '=== 0) Tools ===\n'
if have docker; then
  ok "docker" "$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo present)"
else
  fail "docker" "not found"
fi
if docker compose version >/dev/null 2>&1; then
  ok "docker_compose" "$(docker compose version --short 2>/dev/null || echo yes)"
  kv COMPOSE_CMD "docker compose"
else
  fail "docker_compose" "docker compose not available"
fi
have git && ok "git" "$(git --version | awk '{print $3}')" || fail "git" "not found"
have curl && ok "curl" "present" || fail "curl" "not found"
info "whoami" "$(whoami)"
[[ "$(id -u)" -eq 0 ]] && ok "root" "yes" || warn "root" "not root — deploy may need sudo"

# --- host resources ---
printf '\n=== 1) Host resources ===\n'
DISK="$(df -P / | awk 'NR==2{gsub(/%/,"",$5); print $5}')"
MEM="$(free | awk '/Mem:/{printf "%d", $3*100/$2}')"
LOAD="$(cut -d' ' -f1-3 /proc/loadavg)"
NCPU="$(nproc 2>/dev/null || echo 1)"
kv DISK_USE_PCT "$DISK"
kv MEM_USE_PCT "$MEM"
kv LOAD_AVG "$LOAD"
kv NCPU "$NCPU"
[[ "${DISK:-0}" -ge 90 ]] && fail "disk" "${DISK}% used" \
  || { [[ "${DISK:-0}" -ge 80 ]] && warn "disk" "${DISK}% used" || ok "disk" "${DISK}% used"; }
[[ "${MEM:-0}" -ge 95 ]] && fail "memory" "${MEM}% used" \
  || { [[ "${MEM:-0}" -ge 85 ]] && warn "memory" "${MEM}% used" || ok "memory" "${MEM}% used"; }
ok "load" "$LOAD (ncpu=$NCPU)"

# --- paths for deploy-api-main.sh ---
printf '\n=== 2) Deploy paths ===\n'
kv EXPECT_SRC "$SRC"
kv EXPECT_STACK "$STACK"
kv EXPECT_COMPOSE "$COMPOSE_FILE"
kv EXPECT_IMAGE "$IMAGE_TAG"
kv EXPECT_API_CONTAINER "$API_CONTAINER"

if [[ -d "$STACK" ]]; then
  ok "stack_dir" "$STACK"
else
  fail "stack_dir" "missing: $STACK"
fi

if [[ -f "$COMPOSE_FILE" ]]; then
  ok "compose_file" "$COMPOSE_FILE"
  if grep -qE '^\s+api:|dograhv2-api|dograh-api' "$COMPOSE_FILE" 2>/dev/null; then
    ok "compose_looks_like_dograh" "api service / image refs found"
  else
    warn "compose_looks_like_dograh" "no obvious api service markers"
  fi
  # show api image line(s)
  API_IMAGE_LINES="$(grep -nE 'image:.*dograh' "$COMPOSE_FILE" 2>/dev/null | head -5 || true)"
  info "compose_image_lines" "${API_IMAGE_LINES//$'\n'/; }"
  kv COMPOSE_IMAGE_LINES "${API_IMAGE_LINES//$'\n'/ | }"
else
  fail "compose_file" "missing: $COMPOSE_FILE"
fi

if [[ -f "$STACK/.env" ]]; then
  ok "env_file" "$STACK/.env"
  # keys only — no secret values
  for key in PUBLIC_HOST PUBLIC_BASE_URL DEEPGRAM_BASE_URL FASTAPI_WORKERS; do
    val="$(grep -E "^${key}=" "$STACK/.env" 2>/dev/null | tail -1 | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' || true)"
    if [[ -n "$val" ]]; then
      info "$key" "$val"
      kv "$key" "$val"
    else
      warn "$key" "not set in .env"
    fi
  done
else
  warn "env_file" "missing $STACK/.env"
fi

# --- source tree ---
printf '\n=== 3) Source tree (build context) ===\n'
if [[ -d "$SRC/.git" ]]; then
  ok "source_git" "$SRC"
  kv SRC_PATH "$SRC"
  (
    cd "$SRC"
    BR="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
    SH="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
    FULL="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
    info "source_branch" "$BR"
    info "source_sha" "$SH ($FULL)"
    kv SRC_BRANCH "$BR"
    kv SRC_SHA "$SH"
    kv SRC_FULL "$FULL"
    # remote main tip (fetch is network — optional, read-only)
    if git remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
      REMOTE_URL="$(git remote get-url "$REMOTE_NAME")"
      ok "git_remote" "$REMOTE_NAME → $REMOTE_URL"
      kv GIT_REMOTE_URL "$REMOTE_URL"
      if git fetch --dry-run "$REMOTE_NAME" "$BRANCH" >/dev/null 2>&1; then
        ok "git_fetch_dry_run" "$REMOTE_NAME/$BRANCH reachable"
      else
        # try real ls-remote without updating
        if git ls-remote --heads "$REMOTE_NAME" "$BRANCH" 2>/dev/null | grep -q .; then
          ok "git_remote_branch" "$REMOTE_NAME/$BRANCH exists"
        else
          warn "git_remote_branch" "cannot confirm $REMOTE_NAME/$BRANCH"
        fi
      fi
    else
      warn "git_remote" "remote $REMOTE_NAME not configured"
    fi
    # Deepgram markers in current checkout (may be behind main)
    REG="$SRC/api/services/configuration/registry.py"
    if [[ -f "$REG" ]]; then
      if grep -q 'DEEPGRAM_2' "$REG" && grep -q 'DEEPGRAM_3' "$REG"; then
        ok "source_deepgram_2_3" "present in current checkout"
      else
        warn "source_deepgram_2_3" "not in current checkout — deploy will git pull main"
      fi
    else
      fail "source_registry" "missing $REG"
    fi
    if [[ -f "$SRC/api/Dockerfile" ]]; then
      ok "api_dockerfile" "$SRC/api/Dockerfile"
    else
      fail "api_dockerfile" "missing"
    fi
  )
else
  warn "source_git" "missing $SRC — deploy script will clone $REPO_URL"
  kv SRC_PATH "MISSING"
fi

# --- running stack ---
printf '\n=== 4) Running containers ===\n'
if have docker; then
  if docker ps --format '{{.Names}}' | grep -qx "$API_CONTAINER"; then
    ST="$(docker inspect -f '{{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}} image={{.Config.Image}}' "$API_CONTAINER" 2>/dev/null || true)"
    ok "api_container" "$API_CONTAINER $ST"
    kv API_STATUS "$ST"
    IMG="$(docker inspect -f '{{.Config.Image}}' "$API_CONTAINER" 2>/dev/null || true)"
    kv API_IMAGE_RUNNING "$IMG"
    if [[ "$IMG" == "$IMAGE_TAG"* ]] || [[ "$IMG" == *dg-eu-fish* ]] || [[ "$IMG" == *dograhv2-api* ]]; then
      ok "api_image_family" "$IMG"
    else
      warn "api_image_family" "running $IMG (expected family $IMAGE_TAG)"
    fi
  else
    # try compose label
    CID="$(docker ps --filter label=com.docker.compose.service=api -q | head -1 || true)"
    if [[ -n "$CID" ]]; then
      NAME="$(docker inspect -f '{{.Name}}' "$CID" | sed 's#^/##')"
      warn "api_container" "expected $API_CONTAINER not found; found compose api=$NAME"
      kv API_CONTAINER_FOUND "$NAME"
    else
      fail "api_container" "$API_CONTAINER not running"
    fi
  fi

  # core services snapshot
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' | head -20 || true

  if docker image inspect "$IMAGE_TAG" >/dev/null 2>&1; then
    ok "local_image_tag" "$IMAGE_TAG exists"
  else
    warn "local_image_tag" "$IMAGE_TAG not present yet (first custom build?)"
  fi
fi

# --- health ---
printf '\n=== 5) Health probes ===\n'
for url in "$LOCAL_HEALTH_URL" "$HEALTH_URL"; do
  code="$(curl -sS -o /tmp/pf-health.body -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || echo 000)"
  if [[ "$code" == "200" ]]; then
    body="$(head -c 200 /tmp/pf-health.body 2>/dev/null || true)"
    ok "health" "$url → $code ${body:0:120}"
  else
    fail "health" "$url → HTTP $code"
  fi
done
kv HEALTH_URL "$HEALTH_URL"
kv LOCAL_HEALTH_URL "$LOCAL_HEALTH_URL"

# --- optional: code markers inside running container ---
printf '\n=== 6) Live API code markers (if container healthy) ===\n'
if docker ps --format '{{.Names}}' | grep -qx "$API_CONTAINER"; then
  if docker exec "$API_CONTAINER" python -c "import api" >/dev/null 2>&1; then
    DG2="$(docker exec "$API_CONTAINER" python -c "from api.services.configuration.registry import ServiceProviders; print(getattr(ServiceProviders,'DEEPGRAM_2',None))" 2>/dev/null || echo err)"
    DG3="$(docker exec "$API_CONTAINER" python -c "from api.services.configuration.registry import ServiceProviders; print(getattr(ServiceProviders,'DEEPGRAM_3',None))" 2>/dev/null || echo err)"
    if [[ "$DG2" == *DEEPGRAM_2* || "$DG2" == *deepgram_2* ]]; then
      ok "live_deepgram_2" "$DG2"
    else
      warn "live_deepgram_2" "not in running image yet ($DG2) — expected before deploy"
    fi
    if [[ "$DG3" == *DEEPGRAM_3* || "$DG3" == *deepgram_3* ]]; then
      ok "live_deepgram_3" "$DG3"
    else
      warn "live_deepgram_3" "not in running image yet ($DG3) — deploy-api-main.sh will add it"
    fi
  else
    warn "live_import" "could not import api in container"
  fi
fi

# --- summary ---
printf '\n=== Summary ===\n'
printf '  OK=%s  WARN=%s  FAIL=%s\n' "$OK" "$WARN" "$FAIL"
kv PREFLIGHT_OK "$([[ "$FAIL" -eq 0 ]] && echo yes || echo no)"
kv PREFLIGHT_OK_COUNT "$OK"
kv PREFLIGHT_WARN_COUNT "$WARN"
kv PREFLIGHT_FAIL_COUNT "$FAIL"

{
  echo "# API Deploy Preflight"
  echo
  echo "- Host: \`$HOSTF\`"
  echo "- Time: \`$TS\`"
  echo "- OK=$OK WARN=$WARN FAIL=$FAIL"
  echo
  echo "| Status | Check | Detail |"
  echo "|--------|-------|--------|"
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r st name detail <<<"$r"
    echo "| $st | \`$name\` | $detail |"
  done
  echo
  if [[ "$FAIL" -eq 0 ]]; then
    echo "## Next step"
    echo
    echo '```bash'
    echo "sudo bash /root/deploy-api-main.sh"
    echo '# or after curl:'
    echo "curl -fsSL -o /root/deploy-api-main.sh \\"
    echo "  'https://raw.githubusercontent.com/dsactivi-2/dograhV2/main/deploy/voiceeu/deploy-api-main.sh'"
    echo "chmod +x /root/deploy-api-main.sh && sudo bash /root/deploy-api-main.sh"
    echo '```'
  else
    echo "## Blocked"
    echo
    echo "Fix FAIL items before running deploy-api-main.sh."
  fi
} >"$OUT_MD"

printf '\nWrote %s\n' "$OUT_MD"
printf 'Wrote %s\n' "$OUT_ENV"
printf 'Wrote %s\n' "$RAW"

if [[ "$FAIL" -eq 0 ]]; then
  printf '\nPREFLIGHT_OK=yes — safe to run deploy-api-main.sh\n'
  exit 0
fi
printf '\nPREFLIGHT_OK=no — fix FAIL items first\n'
exit 1
