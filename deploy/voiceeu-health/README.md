# Dograh full stack health (voiceeu)

## Flow

```text
00_preflight_full.sh  →  inventory (paths, IDs, URLs, env flags)
10_health_full.sh     →  PASS / WARN / FAIL on every critical point
```

## On the server

```bash
mkdir -p /root/dograh-eu-verify
cd /root/dograh-eu-verify

curl -fsSL -o 00_preflight_full.sh \
  'https://raw.githubusercontent.com/dsactivi-2/dograhV2/main/deploy/voiceeu-health/00_preflight_full.sh'
curl -fsSL -o 10_health_full.sh \
  'https://raw.githubusercontent.com/dsactivi-2/dograhV2/main/deploy/voiceeu-health/10_health_full.sh'
chmod +x 00_preflight_full.sh 10_health_full.sh

sudo bash 00_preflight_full.sh
sudo bash 10_health_full.sh
echo exit:$?
cat health-full-report.md
```

## What is checked

| Area | Examples |
|------|----------|
| Host | disk, memory, load |
| Containers | postgres, redis, minio, api, ui, nginx, coturn, cloudflared — running, health, restarts, OOM |
| API image | tag, Deepgram EU constant + factory + runtime URLs |
| HTTP | `/api/v1/health` JSON, local :8000, UI public + :3010 |
| Datastores | pg_isready, redis PING, minio /health/live |
| Processes | uvicorn, arq, campaign_orchestrator, ari_manager |
| Ports | 80,443,8000,3010,5432,6379,3478,5349 tcp/udp |
| TLS | cert expiry days |
| Env | TURN_SECRET, TURN_HOST, OSS_JWT, PUBLIC_BASE_URL, DEEPGRAM |
| Logs | Traceback / startup failed / TURN warnings |
| Stats | docker stats CPU pressure |
| Volumes | postgres/redis/minio data |

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | no FAIL (WARN allowed) |
| 1 | at least one FAIL |

## Reports

- `preflight-full.env` / `.md` / `.json`
- `health-full-report.md` / `.env`
