#!/usr/bin/env bash
# =============================================================================
# deploy-api-main.sh — Redeploy ONLY the Dograh API on DograhEUV2 / voiceeu
#
# Verified against preflight on DograhEUV2 (2026-08-03):
#   SRC         = /root/src/dograhV2
#   STACK       = /root/dograh/dograh
#   COMPOSE     = /root/dograh/dograh/docker-compose.yaml
#   API image   = dograhv2-api:dg-eu-fish
#   API name    = dograh-api-1
#   Health      = https://voiceeu.activi.io/api/v1/health
#
# What it does:
#   1. git fetch + checkout branch (default: main) in source tree
#   2. optional sanity checks (Deepgram 2/3 present in source)
#   3. docker build API image (tags dg-eu-fish + sha)
#   4. force-recreate ONLY service "api" (no volume wipe, no .env change)
#   5. health + Deepgram 2/3 import verify inside container
#
# What it does NOT do:
#   - touch postgres/redis/minio volumes
#   - rebuild UI
#   - change secrets / .env
#
# Usage (on the server as root):
#   curl -fsSL -o /root/deploy-api-main.sh \
#     'https://raw.githubusercontent.com/dsactivi-2/dograhV2/main/deploy/voiceeu/deploy-api-main.sh'
#   chmod +x /root/deploy-api-main.sh
#   sudo bash /root/deploy-api-main.sh
#
# Options:
#   --branch NAME     git branch/ref to deploy (default: main)
#   --skip-verify-src skip grep for Deepgram 2/3 in source before build
#   --no-rollback-tag do not tag current image as dograhv2-api:previous
#   --dry-run         print actions only
# =============================================================================
set -euo pipefail

SRC="${DOGRAH_SRC:-/root/src/dograhV2}"
STACK="${DOGRAH_ROOT:-/root/dograh/dograh}"
COMPOSE_FILE="${DOGRAH_COMPOSE:-$STACK/docker-compose.yaml}"
HEALTH_URL="${DOGRAH_HEALTH_URL:-https://voiceeu.activi.io/api/v1/health}"
LOCAL_HEALTH_URL="${DOGRAH_LOCAL_HEALTH_URL:-http://127.0.0.1:8000/api/v1/health}"
IMAGE_TAG="${DOGRAH_API_IMAGE:-dograhv2-api:dg-eu-fish}"
REPO_URL="${DOGRAH_REPO_URL:-https://github.com/dsactivi-2/dograhV2.git}"
REMOTE_NAME="${DOGRAH_REMOTE:-origin}"
BRANCH="main"
SKIP_VERIFY_SRC=0
NO_ROLLBACK_TAG=0
DRY_RUN=0
API_SERVICE="${DOGRAH_API_SERVICE:-api}"
API_CONTAINER="${DOGRAH_API_CONTAINER:-dograh-api-1}"

usage() {
  sed -n '2,40p' "$0" | sed 's/^# \?//'
  cat <<EOF

Environment overrides:
  DOGRAH_SRC DOGRAH_ROOT DOGRAH_COMPOSE DOGRAH_HEALTH_URL
  DOGRAH_API_IMAGE DOGRAH_REPO_URL DOGRAH_REMOTE DOGRAH_API_SERVICE
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)
      [[ $# -ge 2 ]] || { echo "ERROR: --branch needs a value" >&2; exit 2; }
      BRANCH="$2"; shift 2 ;;
    --skip-verify-src) SKIP_VERIFY_SRC=1; shift ;;
    --no-rollback-tag) NO_ROLLBACK_TAG=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "ERROR: unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

log()  { printf '==> %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
die()  { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '[dry-run]'; printf ' %q' "$@"; printf '\n'
  else
    "$@"
  fi
}

need_cmd() { command -v "$1" >/dev/null 2>&1 || die "missing command: $1"; }

need_cmd git
need_cmd docker
need_cmd curl
docker compose version >/dev/null 2>&1 || die "docker compose not available"

[[ "$(id -u)" -eq 0 ]] || warn "not running as root — docker/git paths may fail"

log "0) Pre-check paths"
[[ -f "$COMPOSE_FILE" ]] || die "compose file missing: $COMPOSE_FILE"
[[ -d "$STACK" ]] || die "stack dir missing: $STACK"

if [[ ! -d "$SRC/.git" ]]; then
  log "Source missing at $SRC — cloning $REPO_URL"
  run mkdir -p "$(dirname "$SRC")"
  run git clone --recurse-submodules "$REPO_URL" "$SRC"
fi
[[ -d "$SRC/.git" ]] || die "source is not a git repo: $SRC"

if [[ "$DRY_RUN" -eq 0 ]]; then
  curl -fsS -o /dev/null --max-time 10 "$HEALTH_URL" \
    && log "Health before deploy: OK ($HEALTH_URL)" \
    || warn "Health before deploy: not OK ($HEALTH_URL) — continuing"
fi

log "1) Update source → $REMOTE_NAME/$BRANCH"
run bash -c "cd $(printf %q "$SRC") && git fetch $(printf %q "$REMOTE_NAME")"
# Prefer exact ref from remote; fall back to local branch name
if git -C "$SRC" rev-parse --verify "refs/remotes/$REMOTE_NAME/$BRANCH" >/dev/null 2>&1; then
  run git -C "$SRC" checkout --force -B "$BRANCH" "$REMOTE_NAME/$BRANCH"
elif git -C "$SRC" rev-parse --verify "refs/heads/$BRANCH" >/dev/null 2>&1; then
  run git -C "$SRC" checkout --force "$BRANCH"
  run git -C "$SRC" pull --ff-only "$REMOTE_NAME" "$BRANCH" || true
else
  die "branch/ref not found: $BRANCH (remote $REMOTE_NAME)"
fi
run git -C "$SRC" submodule update --init --recursive

if [[ "$DRY_RUN" -eq 1 ]]; then
  SHA="dryrun"
  FULL="dryrun"
else
  SHA="$(git -C "$SRC" rev-parse --short HEAD)"
  FULL="$(git -C "$SRC" rev-parse HEAD)"
fi
log "Building from $SHA ($FULL) branch=$BRANCH"

if [[ "$SKIP_VERIFY_SRC" -eq 0 ]]; then
  log "1b) Sanity: Deepgram 2/3 present in source"
  if [[ "$DRY_RUN" -eq 0 ]]; then
    grep -q 'DEEPGRAM_2' "$SRC/api/services/configuration/registry.py" \
      || die "DEEPGRAM_2 missing in registry.py — wrong tree?"
    grep -q 'DEEPGRAM_3' "$SRC/api/services/configuration/registry.py" \
      || die "DEEPGRAM_3 missing in registry.py — wrong tree?"
    grep -q 'Deepgram3STTConfiguration' "$SRC/api/services/configuration/registry.py" \
      || die "Deepgram3STTConfiguration missing — wrong tree?"
    log "Source contains Deepgram 2 + Deepgram 3"
  fi
fi

if [[ "$NO_ROLLBACK_TAG" -eq 0 ]]; then
  log "2) Keep rollback image tag (dograhv2-api:previous)"
  if docker image inspect "$IMAGE_TAG" >/dev/null 2>&1; then
    run docker tag "$IMAGE_TAG" dograhv2-api:previous
  else
    warn "current image $IMAGE_TAG not found — skip previous tag"
  fi
fi

log "3) Docker build API image → $IMAGE_TAG (+ sha tag)"
export DOCKER_BUILDKIT=1
run docker build -f "$SRC/api/Dockerfile" \
  -t "$IMAGE_TAG" \
  -t "dograhv2-api:dg-eu-fish-$SHA" \
  -t "dograhv2-api:dg-eu" \
  "$SRC"

log "4) Compose: recreate only service '$API_SERVICE'"
BAK="$COMPOSE_FILE.bak.manual-$(date -u +%Y%m%d-%H%M%S)"
run cp -a "$COMPOSE_FILE" "$BAK"
log "Compose backup: $BAK"

# Align any dograhv2-api:* tag line to the rolling tag we just built
if [[ "$DRY_RUN" -eq 1 ]]; then
  printf '[dry-run] sed -i -E s|image:[[:space:]]*dograhv2-api:[^[:space:]]+|image: %s|g %s\n' \
    "$IMAGE_TAG" "$COMPOSE_FILE"
else
  sed -i -E "s|image:[[:space:]]*dograhv2-api:[^[:space:]]+|image: ${IMAGE_TAG}|g" "$COMPOSE_FILE"
fi

run bash -c "cd $(printf %q "$STACK") && docker compose up -d --no-deps --force-recreate $(printf %q "$API_SERVICE")"

log "5) Wait for healthy + verify"
if [[ "$DRY_RUN" -eq 1 ]]; then
  log "dry-run complete — no container recreated"
  exit 0
fi

# Wait up to ~3 minutes for health (fresh image can take longer than 20s)
ok=0
for i in $(seq 1 36); do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$API_CONTAINER" 2>/dev/null || echo missing)"
  if [[ "$status" == "healthy" ]] || curl -fsS -o /dev/null --max-time 5 "$LOCAL_HEALTH_URL" 2>/dev/null; then
    ok=1
    break
  fi
  sleep 5
done

docker compose -f "$COMPOSE_FILE" ps "$API_SERVICE" || true
echo "--- local health ---"
curl -fsS -w "\nHTTP %{http_code}\n" --max-time 15 "$LOCAL_HEALTH_URL" || true
echo "--- public health ---"
curl -fsS -w "\nHTTP %{http_code}\n" --max-time 15 "$HEALTH_URL" || true

if [[ "$ok" -ne 1 ]]; then
  warn "API not healthy yet — last 80 log lines:"
  docker logs "$API_CONTAINER" --tail 80 || true
  die "deploy finished but API health check failed"
fi

log "5b) Deepgram 2/3 import check inside container"
docker exec "$API_CONTAINER" python -c "
from api.services.configuration.registry import (
    ServiceProviders,
    Deepgram2STTConfiguration,
    Deepgram3STTConfiguration,
)
print('DEEPGRAM_2', ServiceProviders.DEEPGRAM_2.value)
print('DEEPGRAM_3', ServiceProviders.DEEPGRAM_3.value)
print('title2', Deepgram2STTConfiguration.model_json_schema().get('title'))
print('title3', Deepgram3STTConfiguration.model_json_schema().get('title'))
"

log "Deploy OK"
echo "  SHA:       $SHA"
echo "  FULL:      $FULL"
echo "  IMAGE:     $IMAGE_TAG"
echo "  BRANCH:    $BRANCH"
echo "  BACKUP:    $BAK"
echo "  ROLLBACK:  docker tag dograhv2-api:previous $IMAGE_TAG && cd $STACK && docker compose up -d --no-deps --force-recreate $API_SERVICE"
