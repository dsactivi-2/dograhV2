#!/usr/bin/env bash
# Verify current voiceeu API deploy state.
set -euo pipefail

echo "=== container ==="
docker ps --filter name=dograh-api --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
echo
echo "=== image id ==="
docker inspect dograh-api-1 --format 'Config.Image={{.Config.Image}} ID={{.Image}} Health={{.State.Health.Status}}' 2>/dev/null || true
echo
echo "=== health public ==="
curl -fsS -w "\nHTTP %{http_code}\n" https://voiceeu.activi.io/api/v1/health 2>&1 | tail -5
echo
echo "=== DEEPGRAM_BASE_URL (empty/missing = pre-EU image) ==="
docker exec dograh-api-1 python -c "from api.constants import DEEPGRAM_BASE_URL as u; print(u)" 2>&1 || echo "(no DEEPGRAM_BASE_URL — likely stock 1.43.0)"
