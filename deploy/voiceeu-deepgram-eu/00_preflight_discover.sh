#!/usr/bin/env bash
# =============================================================================
# 00_preflight_discover.sh
# -----------------------------------------------------------------------------
# Run ON the Dograh server (e.g. voiceeu) as root or docker-capable user.
# Discovers compose project, paths, container layout, health URL, and where
# Deepgram EU constants live INSIDE the API image.
#
# Outputs (same directory as this script, or $REPORT_DIR):
#   preflight-report.env   — machine-readable KEY=value for verify script
#   preflight-report.md    — human-readable report
#   preflight-report.json  — structured dump (if python3 available)
#
# Does NOT change any containers, images, or config (read-only).
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_DIR="${REPORT_DIR:-$SCRIPT_DIR}"
TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
HOSTNAME_F="$(hostname -f 2>/dev/null || hostname)"

mkdir -p "$REPORT_DIR"
ENV_OUT="$REPORT_DIR/preflight-report.env"
MD_OUT="$REPORT_DIR/preflight-report.md"
JSON_OUT="$REPORT_DIR/preflight-report.json"
RAW_OUT="$REPORT_DIR/preflight-raw.log"

exec > >(tee "$RAW_OUT") 2>&1

echo "=============================================="
echo " Dograh Deepgram-EU Preflight Discovery"
echo " Host: $HOSTNAME_F"
echo " Time: $TS"
echo "=============================================="
echo

# --- helpers ---------------------------------------------------------------
have() { command -v "$1" >/dev/null 2>&1; }

kv() { # kv KEY value  → accumulate for .env report
  local k="$1"; shift
  local v="$*"
  # escape for single-line env
  v="${v//$'\n'/\\n}"
  printf '%s=%s\n' "$k" "$v" >>"$ENV_OUT.tmp"
  printf '  %-28s %s\n' "$k" "$v"
}

: >"$ENV_OUT.tmp"
kv PREFLIGHT_TS "$TS"
kv PREFLIGHT_HOST "$HOSTNAME_F"

# --- 0) basics -------------------------------------------------------------
echo "=== 0) Host / Docker ==="
kv WHOAMI "$(whoami)"
kv PWD_START "$(pwd)"
if have docker; then
  kv DOCKER_OK yes
  kv DOCKER_VERSION "$(docker version --format '{{.Server.Version}}' 2>/dev/null || docker -v)"
else
  kv DOCKER_OK no
  echo "ERROR: docker not found" >&2
fi
if docker compose version >/dev/null 2>&1; then
  kv COMPOSE_CMD "docker compose"
  COMPOSE=(docker compose)
elif have docker-compose; then
  kv COMPOSE_CMD "docker-compose"
  COMPOSE=(docker-compose)
else
  kv COMPOSE_CMD ""
  COMPOSE=()
  echo "WARN: docker compose not found"
fi
echo

# --- 1) find dograh root ---------------------------------------------------
echo "=== 1) Locate Dograh project root ==="
CANDIDATES=()
# explicit override
if [[ -n "${DOGRAH_ROOT:-}" ]]; then
  CANDIDATES+=("$DOGRAH_ROOT")
fi
# common voiceeu / docs paths
CANDIDATES+=(
  /root/dograh/dograh
  /root/dograh
  /opt/dograh
  /opt/dograh/dograh
  /home/*/dograh
  /home/*/dograh/dograh
  "$HOME/dograh"
  "$HOME/dograh/dograh"
  /srv/dograh
  /var/lib/dograh
)
# search shallow for compose with dograh-api
while IFS= read -r f; do
  CANDIDATES+=("$(dirname "$f")")
done < <(find /root /opt /home /srv /var/lib -maxdepth 4 -type f \( -name 'docker-compose.yaml' -o -name 'docker-compose.yml' \) 2>/dev/null | head -40)

# de-dup
declare -A SEEN=()
UNIQ=()
for c in "${CANDIDATES[@]}"; do
  # expand globs
  for e in $c; do
    [[ -d "$e" ]] || continue
    [[ -n "${SEEN[$e]:-}" ]] && continue
    SEEN[$e]=1
    UNIQ+=("$e")
  done
done

FOUND_ROOT=""
FOUND_COMPOSE=""
echo "Scanning ${#UNIQ[@]} candidate dirs..."
for d in "${UNIQ[@]}"; do
  for name in docker-compose.yaml docker-compose.yml compose.yaml; do
    if [[ -f "$d/$name" ]]; then
      # score: looks like dograh if mentions dograh-api or service api + ui
      if grep -qE 'dograh-api|dograhai/|services:|container_name:.*api' "$d/$name" 2>/dev/null; then
        echo "  candidate: $d/$name"
        if grep -qE 'dograh-api|dograhai/dograh' "$d/$name" 2>/dev/null || \
           { grep -qE '^\s+api:' "$d/$name" && grep -qE '^\s+ui:' "$d/$name"; }; then
          FOUND_ROOT="$d"
          FOUND_COMPOSE="$d/$name"
          break 2
        fi
      fi
    fi
  done
done

# fallback: running container labels
if [[ -z "$FOUND_ROOT" ]] && have docker; then
  echo "Fallback: inspect running containers for compose working_dir..."
  while IFS= read -r cid; do
    [[ -z "$cid" ]] && continue
    wdir="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$cid" 2>/dev/null || true)"
    proj="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$cid" 2>/dev/null || true)"
    svc="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$cid" 2>/dev/null || true)"
    img="$(docker inspect -f '{{.Config.Image}}' "$cid" 2>/dev/null || true)"
    echo "  cid=$cid svc=$svc proj=$proj wdir=$wdir img=$img"
    if [[ "$svc" == "api" || "$img" == *dograh-api* || "$img" == *dograhv2-api* ]]; then
      if [[ -n "$wdir" && -d "$wdir" ]]; then
        FOUND_ROOT="$wdir"
        for name in docker-compose.yaml docker-compose.yml compose.yaml; do
          [[ -f "$wdir/$name" ]] && FOUND_COMPOSE="$wdir/$name" && break
        done
        break
      fi
    fi
  done < <(docker ps -q 2>/dev/null)
fi

kv DOGRAH_ROOT "${FOUND_ROOT:-}"
kv COMPOSE_FILE "${FOUND_COMPOSE:-}"
if [[ -z "$FOUND_ROOT" ]]; then
  echo "ERROR: could not locate Dograh compose project. Set DOGRAH_ROOT=/path and re-run."
  kv PREFLIGHT_OK no
  kv PREFLIGHT_ERROR "DOGRAH_ROOT not found"
else
  echo "FOUND root: $FOUND_ROOT"
  echo "FOUND compose: $FOUND_COMPOSE"
fi
echo

# --- 2) compose project / services -----------------------------------------
echo "=== 2) Compose project & services ==="
API_SERVICE=""
UI_SERVICE=""
PROJECT_NAME=""
if [[ -n "$FOUND_COMPOSE" && ${#COMPOSE[@]} -gt 0 ]]; then
  cd "$FOUND_ROOT"
  # project name
  PROJECT_NAME="$( "${COMPOSE[@]}" -f "$FOUND_COMPOSE" config --format json 2>/dev/null | python3 -c 'import sys,json; print(json.load(sys.stdin).get("name",""))' 2>/dev/null || true)"
  if [[ -z "$PROJECT_NAME" ]]; then
    PROJECT_NAME="$(basename "$FOUND_ROOT" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')"
  fi
  kv COMPOSE_PROJECT "$PROJECT_NAME"

  # list services
  SERVICES="$("${COMPOSE[@]}" -f "$FOUND_COMPOSE" config --services 2>/dev/null || true)"
  kv COMPOSE_SERVICES "$(echo "$SERVICES" | tr '\n' ' ')"
  echo "Services: $SERVICES"

  # detect api/ui service names
  for s in $SERVICES; do
    case "$s" in
      api|dograh-api|backend) API_SERVICE="$s" ;;
      ui|dograh-ui|frontend) UI_SERVICE="$s" ;;
    esac
  done
  # heuristic from compose content
  if [[ -z "$API_SERVICE" ]]; then
    API_SERVICE="$(grep -E '^\s+api:' "$FOUND_COMPOSE" >/dev/null && echo api || true)"
  fi
  if [[ -z "$API_SERVICE" ]]; then
    # pick service whose image contains dograh-api
    while IFS= read -r line; do
      if echo "$line" | grep -qiE 'dograh-api|dograhv2-api'; then
        # previous service key - rough
        :
      fi
    done < "$FOUND_COMPOSE"
    API_SERVICE="${API_SERVICE:-api}"
  fi
  UI_SERVICE="${UI_SERVICE:-ui}"
  kv API_SERVICE "$API_SERVICE"
  kv UI_SERVICE "$UI_SERVICE"

  echo "--- compose ps ---"
  "${COMPOSE[@]}" -f "$FOUND_COMPOSE" ps 2>/dev/null || docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
else
  kv COMPOSE_PROJECT ""
  kv API_SERVICE "api"
  kv UI_SERVICE "ui"
fi
echo

# --- 3) API container identity ---------------------------------------------
echo "=== 3) API container ==="
API_CID=""
API_NAME=""
API_IMAGE=""
API_STATUS=""

if [[ -n "$FOUND_ROOT" && ${#COMPOSE[@]} -gt 0 ]]; then
  cd "$FOUND_ROOT"
  API_CID="$("${COMPOSE[@]}" -f "$FOUND_COMPOSE" ps -q "$API_SERVICE" 2>/dev/null | head -1 || true)"
fi
if [[ -z "$API_CID" ]]; then
  API_CID="$(docker ps --filter "label=com.docker.compose.service=api" -q | head -1 || true)"
fi
if [[ -z "$API_CID" ]]; then
  API_CID="$(docker ps --format '{{.ID}} {{.Image}} {{.Names}}' | grep -iE 'dograh-api|dograhv2-api' | awk '{print $1}' | head -1 || true)"
fi

if [[ -n "$API_CID" ]]; then
  API_NAME="$(docker inspect -f '{{.Name}}' "$API_CID" | sed 's#^/##')"
  API_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$API_CID")"
  API_STATUS="$(docker inspect -f '{{.State.Status}}' "$API_CID")"
  API_WORKDIR="$(docker inspect -f '{{.Config.WorkingDir}}' "$API_CID")"
  API_CMD="$(docker inspect -f '{{json .Config.Cmd}}' "$API_CID")"
  kv API_CONTAINER_ID "$API_CID"
  kv API_CONTAINER_NAME "$API_NAME"
  kv API_IMAGE "$API_IMAGE"
  kv API_STATUS "$API_STATUS"
  kv API_WORKDIR "$API_WORKDIR"
  kv API_CMD "$API_CMD"
  echo "API container: $API_NAME ($API_CID)"
  echo "Image: $API_IMAGE  Status: $API_STATUS"
else
  kv API_CONTAINER_ID ""
  kv API_CONTAINER_NAME ""
  kv API_IMAGE ""
  kv API_STATUS "not_running"
  echo "WARN: no running API container found"
fi
echo

# --- 4) mounts & filesystem inside container -------------------------------
echo "=== 4) Container mounts & code paths ==="
APP_ROOT_IN_CONTAINER=""
CONSTANTS_PATH=""
FACTORY_PATH=""
CHECK_VALIDITY_PATH=""

if [[ -n "$API_CID" ]]; then
  echo "--- mounts ---"
  docker inspect -f '{{range .Mounts}}{{.Type}} {{.Source}} -> {{.Destination}}{{println}}{{end}}' "$API_CID" || true

  echo "--- search code layout inside container ---"
  # common app roots in dograh images
  SEARCH_ROOTS="/app /app/api /code /src /dograh /home/app /usr/src/app"
  for root in $SEARCH_ROOTS; do
    if docker exec "$API_CID" test -d "$root" 2>/dev/null; then
      echo "  dir exists: $root"
    fi
  done

  # find constants.py with DEEPGRAM or api package
  FOUND_CONST="$(docker exec "$API_CID" sh -c 'find /app /code /src /dograh /usr/src/app -name constants.py 2>/dev/null | head -20' || true)"
  echo "constants.py candidates:"
  echo "$FOUND_CONST"
  while IFS= read -r p; do
    [[ -z "$p" ]] && continue
    if docker exec "$API_CID" grep -q 'DEEPGRAM\|DATABASE_URL\|MPS_API' "$p" 2>/dev/null; then
      CONSTANTS_PATH="$p"
      break
    fi
    # prefer .../api/constants.py
    if [[ "$p" == *"/api/constants.py" ]]; then
      CONSTANTS_PATH="$p"
    fi
  done <<< "$FOUND_CONST"

  FOUND_FACTORY="$(docker exec "$API_CID" sh -c 'find /app /code /src /dograh /usr/src/app -path "*pipecat*service_factory.py" 2>/dev/null | head -10' || true)"
  echo "service_factory.py candidates:"
  echo "$FOUND_FACTORY"
  FACTORY_PATH="$(echo "$FOUND_FACTORY" | head -1)"

  FOUND_CV="$(docker exec "$API_CID" sh -c 'find /app /code /src /dograh /usr/src/app -name check_validity.py 2>/dev/null | head -10' || true)"
  CHECK_VALIDITY_PATH="$(echo "$FOUND_CV" | head -1)"

  # derive APP_ROOT: parent of api/ package
  if [[ -n "$CONSTANTS_PATH" ]]; then
    # /app/api/constants.py → /app
    APP_ROOT_IN_CONTAINER="$(dirname "$(dirname "$CONSTANTS_PATH")")"
    if docker exec "$API_CID" test -d "$APP_ROOT_IN_CONTAINER/api" 2>/dev/null; then
      :
    else
      APP_ROOT_IN_CONTAINER="$(dirname "$CONSTANTS_PATH")"
    fi
  elif docker exec "$API_CID" test -d /app/api 2>/dev/null; then
    APP_ROOT_IN_CONTAINER="/app"
    CONSTANTS_PATH="/app/api/constants.py"
    FACTORY_PATH="/app/api/services/pipecat/service_factory.py"
  fi

  kv APP_ROOT_IN_CONTAINER "$APP_ROOT_IN_CONTAINER"
  kv CONSTANTS_PATH "$CONSTANTS_PATH"
  kv FACTORY_PATH "$FACTORY_PATH"
  kv CHECK_VALIDITY_PATH "$CHECK_VALIDITY_PATH"

  echo "Resolved:"
  echo "  APP_ROOT_IN_CONTAINER=$APP_ROOT_IN_CONTAINER"
  echo "  CONSTANTS_PATH=$CONSTANTS_PATH"
  echo "  FACTORY_PATH=$FACTORY_PATH"

  # snippet: does EU code exist?
  if [[ -n "$CONSTANTS_PATH" ]]; then
    echo "--- DEEPGRAM lines in constants ---"
    docker exec "$API_CID" grep -n 'DEEPGRAM' "$CONSTANTS_PATH" 2>/dev/null || echo "(no DEEPGRAM in constants — old image)"
    HAS_EU_CONST=no
    if docker exec "$API_CID" grep -q 'api.eu.deepgram.com' "$CONSTANTS_PATH" 2>/dev/null; then
      HAS_EU_CONST=yes
    fi
    kv HAS_DEEPGRAM_EU_CONSTANT "$HAS_EU_CONST"
  else
    kv HAS_DEEPGRAM_EU_CONSTANT unknown
  fi

  if [[ -n "$FACTORY_PATH" ]]; then
    echo "--- Deepgram URL wiring in factory ---"
    docker exec "$API_CID" grep -nE '_deepgram_inference|base_url=stt|url=flux|base_url=tts|DeepgramSTTService|api.eu.deepgram' "$FACTORY_PATH" 2>/dev/null || echo "(no EU factory wiring — old image)"
    HAS_EU_FACTORY=no
    if docker exec "$API_CID" grep -q '_deepgram_inference_urls' "$FACTORY_PATH" 2>/dev/null; then
      HAS_EU_FACTORY=yes
    fi
    kv HAS_DEEPGRAM_EU_FACTORY "$HAS_EU_FACTORY"
  else
    kv HAS_DEEPGRAM_EU_FACTORY unknown
  fi

  # python import path test
  echo "--- python import probe ---"
  IMPORT_OK=no
  if docker exec "$API_CID" python -c 'import api.constants' 2>/dev/null; then
    IMPORT_OK=yes
    echo "import api.constants → OK"
    docker exec "$API_CID" python -c '
try:
  from api.constants import DEEPGRAM_BASE_URL
  print("DEEPGRAM_BASE_URL=", DEEPGRAM_BASE_URL)
except Exception as e:
  print("DEEPGRAM_BASE_URL missing:", type(e).__name__, e)
' 2>/dev/null || true
  else
    echo "import api.constants failed (try PYTHONPATH)"
    docker exec "$API_CID" sh -c 'echo PYTHONPATH=$PYTHONPATH; ls /app 2>/dev/null; ls /app/api 2>/dev/null | head'
  fi
  kv PYTHON_IMPORT_API_OK "$IMPORT_OK"

  # exec user
  kv API_USER "$(docker inspect -f '{{.Config.User}}' "$API_CID")"
else
  kv APP_ROOT_IN_CONTAINER ""
  kv CONSTANTS_PATH ""
  kv FACTORY_PATH ""
  kv HAS_DEEPGRAM_EU_CONSTANT no
  kv HAS_DEEPGRAM_EU_FACTORY no
  kv PYTHON_IMPORT_API_OK no
fi
echo

# --- 5) host .env / public URL ---------------------------------------------
echo "=== 5) Host env / public URL ==="
ENV_FILE=""
for f in "$FOUND_ROOT/.env" "$FOUND_ROOT/../.env" /root/dograh/.env; do
  [[ -n "$FOUND_ROOT" && -f "$f" ]] && ENV_FILE="$f" && break
done
kv ENV_FILE "${ENV_FILE:-}"

PUBLIC_HOST=""
PUBLIC_BASE_URL=""
BACKEND_API_ENDPOINT=""
HEALTH_URL=""
if [[ -n "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set +u
  # parse without sourcing secrets into shell dump fully — extract keys only
  PUBLIC_HOST="$(grep -E '^PUBLIC_HOST=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  PUBLIC_BASE_URL="$(grep -E '^PUBLIC_BASE_URL=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  BACKEND_API_ENDPOINT="$(grep -E '^BACKEND_API_ENDPOINT=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  DEEPGRAM_ENV="$(grep -E '^DEEPGRAM_BASE_URL=' "$ENV_FILE" | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
  set -u
  kv PUBLIC_HOST "$PUBLIC_HOST"
  kv PUBLIC_BASE_URL "$PUBLIC_BASE_URL"
  kv BACKEND_API_ENDPOINT "$BACKEND_API_ENDPOINT"
  kv DEEPGRAM_BASE_URL_IN_ENV "${DEEPGRAM_ENV:-}"
  echo "PUBLIC_HOST=$PUBLIC_HOST"
  echo "PUBLIC_BASE_URL=$PUBLIC_BASE_URL"
  echo "DEEPGRAM_BASE_URL in .env: ${DEEPGRAM_ENV:-<unset>}"
else
  kv PUBLIC_HOST ""
  kv PUBLIC_BASE_URL ""
  kv BACKEND_API_ENDPOINT ""
  kv DEEPGRAM_BASE_URL_IN_ENV ""
  echo "No .env found"
fi

# build health URL candidates
HEALTH_CANDIDATES=()
[[ -n "$PUBLIC_BASE_URL" ]] && HEALTH_CANDIDATES+=("${PUBLIC_BASE_URL%/}/api/v1/health")
[[ -n "$BACKEND_API_ENDPOINT" ]] && HEALTH_CANDIDATES+=("${BACKEND_API_ENDPOINT%/}/api/v1/health")
[[ -n "$PUBLIC_HOST" ]] && HEALTH_CANDIDATES+=("https://${PUBLIC_HOST}/api/v1/health")
HEALTH_CANDIDATES+=("http://127.0.0.1:8000/api/v1/health" "http://localhost:8000/api/v1/health")

# published ports from api container
if [[ -n "$API_CID" ]]; then
  echo "--- published ports ---"
  docker port "$API_CID" 2>/dev/null || true
  # try host port mapped to 8000
  HOSTPORT="$(docker inspect -f '{{(index (index .NetworkSettings.Ports "8000/tcp") 0).HostPort}}' "$API_CID" 2>/dev/null || true)"
  if [[ -n "$HOSTPORT" && "$HOSTPORT" != "<no value>" ]]; then
    HEALTH_CANDIDATES+=("http://127.0.0.1:${HOSTPORT}/api/v1/health")
    kv API_HOST_PORT_8000 "$HOSTPORT"
  else
    kv API_HOST_PORT_8000 ""
  fi
fi

echo "--- health URL probe ---"
HEALTH_URL=""
for u in "${HEALTH_CANDIDATES[@]}"; do
  [[ -z "$u" ]] && continue
  code="$(curl -sk -o /tmp/pf_health.body -w '%{http_code}' --max-time 5 "$u" || echo 000)"
  echo "  $u → HTTP $code"
  if [[ "$code" == "200" && -z "$HEALTH_URL" ]]; then
    HEALTH_URL="$u"
  fi
done
kv HEALTH_URL "$HEALTH_URL"
echo "Selected HEALTH_URL=$HEALTH_URL"
echo

# --- 6) volumes / data persistence hints -----------------------------------
echo "=== 6) Volumes (data locations) ==="
if [[ -n "$FOUND_COMPOSE" ]]; then
  grep -E '^\s+[a-zA-Z0-9_-]+:|volumes:|device:|source:' "$FOUND_COMPOSE" | head -80 || true
fi
if have docker; then
  echo "--- docker volumes (dograh/postgres/minio/redis) ---"
  docker volume ls --format '{{.Name}}' | grep -iE 'dograh|postgres|minio|redis|voice' || docker volume ls
fi
echo

# --- 7) image tags for rollback awareness ----------------------------------
echo "=== 7) Local dograh-api images ==="
docker images --format '{{.Repository}}:{{.Tag}}  {{.ID}}  {{.CreatedSince}}' 2>/dev/null | grep -iE 'dograh-api|dograhv2-api' | head -20 || true
echo

# --- 8) recommendations for verify script ----------------------------------
echo "=== 8) How verify script must be configured ==="
cat <<EOF
Based on discovery, the FINAL verify script should:

  DOGRAH_ROOT=$FOUND_ROOT
  COMPOSE_FILE=$FOUND_COMPOSE
  COMPOSE_CMD=\${COMPOSE_CMD:-docker compose}
  API_SERVICE=$API_SERVICE
  API_CONTAINER=\${API_CONTAINER_ID or name}
  CONSTANTS_PATH=$CONSTANTS_PATH
  FACTORY_PATH=$FACTORY_PATH
  HEALTH_URL=$HEALTH_URL
  EXPECT_DEEPGRAM_BASE=api.eu.deepgram.com

  Exec pattern:
    docker exec \$API_CID grep ... \$CONSTANTS_PATH
    docker exec \$API_CID python -c 'from api.constants import DEEPGRAM_BASE_URL; ...'

  Compose pattern:
    cd \$DOGRAH_ROOT && docker compose -f \$COMPOSE_FILE ps api
EOF

# preflight OK?
PREFLIGHT_OK=yes
[[ -n "$FOUND_ROOT" ]] || PREFLIGHT_OK=no
[[ -n "$API_CID" ]] || PREFLIGHT_OK=no
kv PREFLIGHT_OK "$PREFLIGHT_OK"

# write env file
mv "$ENV_OUT.tmp" "$ENV_OUT"
echo
echo "Wrote: $ENV_OUT"

# markdown report
{
  echo "# Preflight report — $HOSTNAME_F — $TS"
  echo
  echo "## Summary"
  echo
  echo "| Key | Value |"
  echo "|-----|-------|"
  while IFS= read -r line; do
    k="${line%%=*}"; v="${line#*=}"
    echo "| \`$k\` | \`$v\` |"
  done < "$ENV_OUT"
  echo
  echo "## Next step"
  echo
  echo "Copy \`preflight-report.env\` next to \`04_verify_deepgram_eu.sh\` and run:"
  echo
  echo '```bash'
  echo "sudo bash 04_verify_deepgram_eu.sh"
  echo '```'
  echo
  echo "Or re-run discovery + verify:"
  echo
  echo '```bash'
  echo "sudo bash 00_preflight_discover.sh && sudo bash 04_verify_deepgram_eu.sh"
  echo '```'
} >"$MD_OUT"
echo "Wrote: $MD_OUT"

# json if python
if have python3; then
  python3 - <<PY
import json
from pathlib import Path
env = {}
for line in Path("$ENV_OUT").read_text().splitlines():
    if not line or "=" not in line: continue
    k,v = line.split("=",1)
    env[k]=v
Path("$JSON_OUT").write_text(json.dumps(env, indent=2))
print("Wrote: $JSON_OUT")
PY
fi

echo
echo "=============================================="
if [[ "$PREFLIGHT_OK" == "yes" ]]; then
  echo " PREFLIGHT_OK=yes — ready for verify script"
  echo " Paste preflight-report.md back if verify needs retuning."
else
  echo " PREFLIGHT_OK=no — fix paths / start API, re-run"
fi
echo "=============================================="
