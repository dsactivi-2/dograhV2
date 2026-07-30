#!/usr/bin/env bash
# Rollback voiceeu API to pre-Deepgram-EU image.
# Safe: only recreates the api service. Postgres/UI/volumes untouched.
#
# Usage (on server):
#   cd /root/dograh/dograh/rollback && ./rollback-api-to-pre-dg-eu.sh
#
# Override image:
#   TARGET_IMAGE=dograhai/dograh-api:1.43.0 ./rollback-api-to-pre-dg-eu.sh
set -euo pipefail

HOST_DIR="${HOST_DIR:-/root/dograh/dograh}"
SERVICE="${SERVICE:-api}"
TARGET_IMAGE="${TARGET_IMAGE:-}"

if [[ -z "$TARGET_IMAGE" ]]; then
  if docker image inspect dograhai/dograh-api:rollback-pre-dg-eu >/dev/null 2>&1; then
    TARGET_IMAGE="dograhai/dograh-api:rollback-pre-dg-eu"
  else
    TARGET_IMAGE="dograhai/dograh-api:1.43.0"
  fi
fi

cd "$HOST_DIR"
TS=$(date -u +%Y%m%d-%H%M%S)

echo "[rollback] dir=$HOST_DIR service=$SERVICE → $TARGET_IMAGE"

cp -a docker-compose.yaml "docker-compose.yaml.bak.rollback-$TS"

# Pin only dograhv2 custom API image back to rollback target
if grep -qE 'image:[[:space:]]*dograhv2-api:' docker-compose.yaml; then
  sed -i -E "s|image:[[:space:]]*dograhv2-api:[^[:space:]]+|image: ${TARGET_IMAGE}|g" docker-compose.yaml
elif grep -qE 'image:.*dograh-api:' docker-compose.yaml; then
  # already hub-style; force first api occurrence (line under service api)
  sed -i -E "0,/image:.*dograh-api:[^[:space:]]+/s||image: ${TARGET_IMAGE}|" docker-compose.yaml
else
  echo "[rollback] ERROR: no dograh api image line found" >&2
  exit 1
fi

echo "[rollback] image lines:"
grep -nE 'image:.*(dograh|dg-eu)' docker-compose.yaml || true

docker compose up -d --no-deps "$SERVICE"

echo "[rollback] waiting for health..."
for i in $(seq 1 30); do
  st=$(docker inspect dograh-api-1 --format '{{.State.Health.Status}}' 2>/dev/null || echo none)
  if [[ "$st" == "healthy" ]]; then
    echo "[rollback] healthy"
    break
  fi
  if [[ "$st" == "unhealthy" ]]; then
    echo "[rollback] UNHEALTHY — check logs: docker logs dograh-api-1 --tail 80" >&2
    exit 1
  fi
  sleep 2
done

docker ps --filter name=dograh-api --format '{{.Names}} {{.Image}} {{.Status}}'
curl -fsS -o /dev/null -w "[rollback] local health HTTP %{http_code}\n" http://127.0.0.1:8000/api/v1/health \
  || curl -fsS -o /dev/null -w "[rollback] local health HTTP %{http_code}\n" http://127.0.0.1:8000/health \
  || true

# Append log
LOG_DIR="$(cd "$(dirname "$0")" && pwd)"
if [[ -w "$LOG_DIR/DEPLOYMENT_LOG.md" ]] || [[ -w "$LOG_DIR" ]]; then
  {
    echo ""
    echo "### Rollback $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "- Action: API → \`$TARGET_IMAGE\`"
    echo "- Host dir: \`$HOST_DIR\`"
    echo "- Compose backup: \`docker-compose.yaml.bak.rollback-$TS\`"
  } >> "$LOG_DIR/DEPLOYMENT_LOG.md"
fi

echo "[rollback] DONE → $TARGET_IMAGE"
echo "[rollback] Public check: curl -fsS https://voiceeu.activi.io/api/v1/health"
