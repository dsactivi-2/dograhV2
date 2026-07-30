#!/usr/bin/env bash
# =============================================================================
# 00_preflight_full.sh — Dograh voice stack inventory (READ-ONLY)
# Run on the server. Writes preflight-full.env + .json + .md for 10_health_full.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_DIR="${REPORT_DIR:-$SCRIPT_DIR}"
TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
HOSTF="$(hostname -f 2>/dev/null || hostname)"
mkdir -p "$REPORT_DIR"
ENV_OUT="$REPORT_DIR/preflight-full.env"
MD_OUT="$REPORT_DIR/preflight-full.md"
JSON_OUT="$REPORT_DIR/preflight-full.json"
RAW_OUT="$REPORT_DIR/preflight-full.raw.log"
TMP="$REPORT_DIR/.preflight-full.tmp.env"
: >"$TMP"

exec > >(tee "$RAW_OUT") 2>&1

have() { command -v "$1" >/dev/null 2>&1; }

kv() {
  local k="$1"; shift
  local v="$*"
  v="${v//$'\n'/\\n}"
  v="${v//\\/\\\\}"
  v="${v//\"/\\\"}"
  v="${v//\$/\\$}"
  v="${v//\`/\\\`}"
  printf '%s="%s"\n' "$k" "$v" >>"$TMP"
  printf '  %-32s %s\n' "$k" "$v"
}

echo "=============================================="
echo " Dograh FULL Preflight Inventory"
echo " Host: $HOSTF  Time: $TS"
echo "=============================================="
kv PREFLIGHT_TS "$TS"
kv PREFLIGHT_HOST "$HOSTF"
kv WHOAMI "$(whoami)"

# --- Docker / compose ---
echo; echo "=== Docker ==="
if have docker; then
  kv DOCKER_OK yes
  kv DOCKER_VERSION "$(docker version --format '{{.Server.Version}}' 2>/dev/null || true)"
else
  kv DOCKER_OK no
fi
if docker compose version >/dev/null 2>&1; then
  kv COMPOSE_CMD "docker compose"
  COMPOSE=(docker compose)
else
  kv COMPOSE_CMD "docker-compose"
  COMPOSE=(docker-compose)
fi

# --- Find dograh root ---
echo; echo "=== Project root ==="
FOUND_ROOT=""
FOUND_COMPOSE=""
CAND=()
[[ -n "${DOGRAH_ROOT:-}" ]] && CAND+=("$DOGRAH_ROOT")
CAND+=(/root/dograh/dograh /root/dograh /opt/dograh /opt/dograh/dograh)
while IFS= read -r f; do CAND+=("$(dirname "$f")"); done < <(
  find /root /opt /home /srv -maxdepth 4 -type f \( -name docker-compose.yaml -o -name docker-compose.yml \) 2>/dev/null | head -30
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
# fallback via running api label
if [[ -z "$FOUND_ROOT" ]]; then
  cid="$(docker ps --filter label=com.docker.compose.service=api -q | head -1 || true)"
  if [[ -n "$cid" ]]; then
    wdir="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$cid" 2>/dev/null || true)"
    if [[ -n "$wdir" && -d "$wdir" ]]; then
      FOUND_ROOT="$wdir"
      for name in docker-compose.yaml docker-compose.yml; do
        [[ -f "$wdir/$name" ]] && FOUND_COMPOSE="$wdir/$name" && break
      done
    fi
  fi
fi
kv DOGRAH_ROOT "$FOUND_ROOT"
kv COMPOSE_FILE "$FOUND_COMPOSE"

# --- Services / containers ---
echo; echo "=== Services ==="
API_CID=""; UI_CID=""; PG_CID=""; REDIS_CID=""; MINIO_CID=""; NGINX_CID=""; COTURN_CID=""; CF_CID=""
API_IMAGE=""; API_NAME=""; UI_IMAGE=""

if [[ -n "$FOUND_ROOT" && -n "$FOUND_COMPOSE" ]]; then
  cd "$FOUND_ROOT"
  SERVICES="$("${COMPOSE[@]}" -f "$FOUND_COMPOSE" config --services 2>/dev/null | tr '\n' ' ' || true)"
  kv COMPOSE_SERVICES "$SERVICES"
  "${COMPOSE[@]}" -f "$FOUND_COMPOSE" ps 2>/dev/null || docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
fi

# map by name patterns
while IFS= read -r line; do
  id="${line%% *}"
  rest="${line#* }"
  name="$(docker inspect -f '{{.Name}}' "$id" 2>/dev/null | sed 's#^/##')"
  img="$(docker inspect -f '{{.Config.Image}}' "$id" 2>/dev/null)"
  svc="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$id" 2>/dev/null || true)"
  case "$svc-$name-$img" in
    *api*|*-api-*|*dograh-api*|*dograhv2-api*) API_CID="$id"; API_IMAGE="$img"; API_NAME="$name" ;;
  esac
  case "$svc" in
    api) API_CID="$id"; API_IMAGE="$img"; API_NAME="$name" ;;
    ui) UI_CID="$id"; UI_IMAGE="$img" ;;
    postgres) PG_CID="$id" ;;
    redis) REDIS_CID="$id" ;;
    minio) MINIO_CID="$id" ;;
    nginx) NGINX_CID="$id" ;;
    coturn) COTURN_CID="$id" ;;
    cloudflared) CF_CID="$id" ;;
  esac
  # name fallbacks
  [[ "$name" == *postgres* && -z "$PG_CID" ]] && PG_CID="$id"
  [[ "$name" == *redis* && -z "$REDIS_CID" ]] && REDIS_CID="$id"
  [[ "$name" == minio || "$name" == *minio* ]] && MINIO_CID="$id"
  [[ "$name" == *nginx* ]] && NGINX_CID="$id"
  [[ "$name" == *coturn* || "$name" == coturn ]] && COTURN_CID="$id"
  [[ "$name" == *cloudflared* || "$name" == *tunnel* ]] && CF_CID="$id"
  [[ "$name" == *ui* && "$img" == *dograh-ui* ]] && UI_CID="$id" && UI_IMAGE="$img"
done < <(docker ps -q | while read -r id; do echo "$id x"; done)

# stronger discovery
[[ -z "$API_CID" ]] && API_CID="$(docker ps --filter label=com.docker.compose.service=api -q | head -1 || true)"
[[ -z "$API_CID" ]] && API_CID="$(docker ps --format '{{.ID}} {{.Image}}' | grep -iE 'dograh-api|dograhv2-api' | awk '{print $1}' | head -1 || true)"
[[ -z "$UI_CID" ]] && UI_CID="$(docker ps --filter label=com.docker.compose.service=ui -q | head -1 || true)"
[[ -z "$PG_CID" ]] && PG_CID="$(docker ps --filter label=com.docker.compose.service=postgres -q | head -1 || true)"
[[ -z "$REDIS_CID" ]] && REDIS_CID="$(docker ps --filter label=com.docker.compose.service=redis -q | head -1 || true)"
[[ -z "$MINIO_CID" ]] && MINIO_CID="$(docker ps --filter name=minio -q | head -1 || true)"
[[ -z "$NGINX_CID" ]] && NGINX_CID="$(docker ps --filter name=nginx -q | head -1 || true)"
[[ -z "$COTURN_CID" ]] && COTURN_CID="$(docker ps --filter name=coturn -q | head -1 || true)"
[[ -z "$CF_CID" ]] && CF_CID="$(docker ps --filter name=cloudflared -q | head -1 || true)"

if [[ -n "$API_CID" ]]; then
  API_NAME="$(docker inspect -f '{{.Name}}' "$API_CID" | sed 's#^/##')"
  API_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$API_CID")"
fi
[[ -n "$UI_CID" ]] && UI_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$UI_CID")"

kv API_CONTAINER_ID "$API_CID"
kv API_CONTAINER_NAME "$API_NAME"
kv API_IMAGE "$API_IMAGE"
kv UI_CONTAINER_ID "$UI_CID"
kv UI_IMAGE "$UI_IMAGE"
kv PG_CONTAINER_ID "$PG_CID"
kv REDIS_CONTAINER_ID "$REDIS_CID"
kv MINIO_CONTAINER_ID "$MINIO_CID"
kv NGINX_CONTAINER_ID "$NGINX_CID"
kv COTURN_CONTAINER_ID "$COTURN_CID"
kv CLOUDFLARED_CONTAINER_ID "$CF_CID"

# container status dump
echo; echo "=== Container status dump ==="
docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' | head -40

# --- Code paths in API ---
echo; echo "=== API code paths ==="
CONSTANTS_PATH=""; FACTORY_PATH=""
if [[ -n "$API_CID" ]]; then
  CONSTANTS_PATH="$(docker exec "$API_CID" sh -c 'test -f /app/api/constants.py && echo /app/api/constants.py' 2>/dev/null || true)"
  FACTORY_PATH="$(docker exec "$API_CID" sh -c 'test -f /app/api/services/pipecat/service_factory.py && echo /app/api/services/pipecat/service_factory.py' 2>/dev/null || true)"
  HAS_EU=no
  docker exec "$API_CID" grep -q 'api.eu.deepgram.com' "${CONSTANTS_PATH:-/app/api/constants.py}" 2>/dev/null && HAS_EU=yes || true
  HAS_EU_FACTORY=no
  docker exec "$API_CID" grep -q '_deepgram_inference_urls' "${FACTORY_PATH:-/app/api/services/pipecat/service_factory.py}" 2>/dev/null && HAS_EU_FACTORY=yes || true
  kv HAS_DEEPGRAM_EU_CONSTANT "$HAS_EU"
  kv HAS_DEEPGRAM_EU_FACTORY "$HAS_EU_FACTORY"
fi
kv CONSTANTS_PATH "$CONSTANTS_PATH"
kv FACTORY_PATH "$FACTORY_PATH"

# --- .env ---
echo; echo "=== Host .env (keys only, no secret values dumped for sensitive) ==="
ENV_FILE=""
for f in "$FOUND_ROOT/.env" /root/dograh/dograh/.env /root/dograh/.env; do
  [[ -f "$f" ]] && ENV_FILE="$f" && break
done
kv ENV_FILE "$ENV_FILE"
get_env() {
  local key="$1"
  [[ -n "$ENV_FILE" && -f "$ENV_FILE" ]] || { echo ""; return; }
  grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -1 | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' || true
}
PUBLIC_HOST="$(get_env PUBLIC_HOST)"
PUBLIC_BASE_URL="$(get_env PUBLIC_BASE_URL)"
BACKEND_API_ENDPOINT="$(get_env BACKEND_API_ENDPOINT)"
TURN_HOST="$(get_env TURN_HOST)"
TURN_SECRET_SET=no
[[ -n "$(get_env TURN_SECRET)" ]] && TURN_SECRET_SET=yes
FASTAPI_WORKERS="$(get_env FASTAPI_WORKERS)"
DEEPGRAM_ENV="$(get_env DEEPGRAM_BASE_URL)"
POSTGRES_PASSWORD="$(get_env POSTGRES_PASSWORD)"
REDIS_PASSWORD="$(get_env REDIS_PASSWORD)"
OSS_JWT_SET=no
[[ -n "$(get_env OSS_JWT_SECRET)" ]] && OSS_JWT_SET=yes

kv PUBLIC_HOST "$PUBLIC_HOST"
kv PUBLIC_BASE_URL "$PUBLIC_BASE_URL"
kv BACKEND_API_ENDPOINT "$BACKEND_API_ENDPOINT"
kv TURN_HOST "$TURN_HOST"
kv TURN_SECRET_SET "$TURN_SECRET_SET"
kv FASTAPI_WORKERS "${FASTAPI_WORKERS:-1}"
kv DEEPGRAM_BASE_URL_IN_ENV "$DEEPGRAM_ENV"
kv OSS_JWT_SECRET_SET "$OSS_JWT_SET"
# Never write raw DB/Redis passwords into preflight reports (security).
# Health script re-reads them from ENV_FILE at runtime when needed.
kv REDIS_PASSWORD_SET "$([[ -n "$REDIS_PASSWORD" ]] && echo yes || echo no)"
kv POSTGRES_PASSWORD_SET "$([[ -n "$POSTGRES_PASSWORD" ]] && echo yes || echo no)"

# --- Health URL candidates ---
echo; echo "=== Health URL probe ==="
HEALTH_URL=""
for u in \
  "${PUBLIC_BASE_URL%/}/api/v1/health" \
  "${BACKEND_API_ENDPOINT%/}/api/v1/health" \
  "https://${PUBLIC_HOST}/api/v1/health" \
  "http://127.0.0.1:8000/api/v1/health"
do
  [[ -z "$u" || "$u" == "/api/v1/health" || "$u" == "https:///api/v1/health" ]] && continue
  code="$(curl -sk -o /tmp/pf_h.json -w '%{http_code}' --max-time 8 "$u" 2>/dev/null || echo 000)"
  echo "  $u → $code"
  if [[ "$code" == "200" && -z "$HEALTH_URL" ]]; then
    HEALTH_URL="$u"
    # capture body keys
    if have python3; then
      python3 - <<PY 2>/dev/null || true
import json
d=json.load(open('/tmp/pf_h.json'))
open('$TMP','a').write('HEALTH_STATUS="%s"\n' % d.get('status',''))
open('$TMP','a').write('HEALTH_VERSION="%s"\n' % d.get('version',''))
open('$TMP','a').write('HEALTH_TURN_ENABLED="%s"\n' % d.get('turn_enabled',''))
open('$TMP','a').write('HEALTH_DEPLOYMENT_MODE="%s"\n' % d.get('deployment_mode',''))
open('$TMP','a').write('HEALTH_AUTH_PROVIDER="%s"\n' % d.get('auth_provider',''))
print('  parsed status=%s version=%s turn=%s' % (d.get('status'), d.get('version'), d.get('turn_enabled')))
PY
    fi
  fi
done
kv HEALTH_URL "$HEALTH_URL"
UI_URL=""
for u in "${PUBLIC_BASE_URL}" "https://${PUBLIC_HOST}" "http://127.0.0.1:3010"; do
  [[ -z "$u" ]] && continue
  code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 8 "$u" 2>/dev/null || echo 000)"
  echo "  UI $u → $code"
  if [[ "$code" == "200" || "$code" == "307" || "$code" == "302" || "$code" == "304" ]]; then
    [[ -z "$UI_URL" ]] && UI_URL="$u"
  fi
done
kv UI_URL "$UI_URL"

# --- Host resources ---
echo; echo "=== Host resources ==="
DISK_PCT="$(df -P / | awk 'NR==2{gsub(/%/,"",$5); print $5}')"
MEM_PCT="$(free | awk '/Mem:/{printf "%d", $3*100/$2}')"
LOAD="$(cut -d' ' -f1-3 /proc/loadavg)"
NCPU="$(nproc 2>/dev/null || echo 1)"
kv DISK_USE_PCT "$DISK_PCT"
kv MEM_USE_PCT "$MEM_PCT"
kv LOAD_AVG "$LOAD"
kv NCPU "$NCPU"
kv UPTIME "$(uptime -p 2>/dev/null || true)"

# --- Ports ---
echo; echo "=== Listening ports (host) ==="
PORTS_SNAP="$(ss -lntu 2>/dev/null | awk 'NR>1{print $5}' | sed 's/.*://' | sort -n | uniq | tr '\n' ' ')"
kv HOST_LISTEN_PORTS "$PORTS_SNAP"
echo "  $PORTS_SNAP"

# --- Volumes ---
echo; echo "=== Docker volumes ==="
VOLS="$(docker volume ls --format '{{.Name}}' | tr '\n' ' ')"
kv DOCKER_VOLUMES "$VOLS"

# --- Expected services list for health ---
# Core always required; remote profile extras
kv EXPECT_CORE "postgres redis minio api ui"
kv EXPECT_REMOTE "nginx coturn"
kv EXPECT_OPTIONAL "cloudflared"

PREFLIGHT_OK=yes
[[ -n "$FOUND_ROOT" && -n "$API_CID" ]] || PREFLIGHT_OK=no
kv PREFLIGHT_OK "$PREFLIGHT_OK"

mv "$TMP" "$ENV_OUT"
echo; echo "Wrote $ENV_OUT"

# md + json
{
  echo "# Full preflight — $HOSTF — $TS"
  echo
  echo "| Key | Value |"
  echo "|-----|-------|"
  while IFS= read -r line; do
    k="${line%%=*}"; v="${line#*=}"
    v="${v#\"}"; v="${v%\"}"
    echo "| \`$k\` | \`$v\` |"
  done < "$ENV_OUT"
} >"$MD_OUT"
echo "Wrote $MD_OUT"

if have python3; then
  python3 - <<PY
import json
from pathlib import Path
env={}
for line in Path("$ENV_OUT").read_text().splitlines():
    if "=" not in line: continue
    k,v=line.split("=",1)
    if len(v)>=2 and v[0]=='"' and v[-1]=='"':
        v=v[1:-1]
    env[k]=v
Path("$JSON_OUT").write_text(json.dumps(env, indent=2))
print("Wrote $JSON_OUT")
PY
fi

echo
echo "PREFLIGHT_OK=$PREFLIGHT_OK"
echo "Next: sudo bash 10_health_full.sh"
