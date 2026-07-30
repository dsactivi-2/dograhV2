# Deployment log (newest first)

## 2026-07-30T01:14Z — Deepgram EU live on voiceeu

| | |
|--|--|
| Action | Deploy API custom image with EU Deepgram inference |
| Host | DograhEUV2 / https://voiceeu.activi.io |
| API image before | `dograhai/dograh-api:1.43.0` |
| API image after | `dograhv2-api:dg-eu` (`dograhv2-api:dg-eu-83d960f`, id `89b428376254`) |
| UI | unchanged `dograhai/dograh-ui:1.43.0` |
| Source | https://github.com/dsactivi-2/dograhV2 @ `83d960f` (PR #6) |
| Compose | `/root/dograh/dograh/docker-compose.yaml` service `api` |
| Env | `DEEPGRAM_BASE_URL=api.eu.deepgram.com` |
| Data | Postgres/MinIO/Redis volumes not wiped |
| Rollback tag | `dograhai/dograh-api:rollback-pre-dg-eu` |
| Rollback cmd | `cd /root/dograh/dograh/rollback && ./rollback-api-to-pre-dg-eu.sh` |
| Verify | Health 200; `DEEPGRAM_BASE_URL=api.eu.deepgram.com`; factory EU URLs OK |

### Changes in code (summary)

- Default Deepgram inference host → `api.eu.deepgram.com`
- STT Nova / Flux WS / TTS WS routed via `_deepgram_inference_urls()`
- API key validation still uses global `api.deepgram.com`

---

## 2026-07-29 — Baseline (pre-EU)

| | |
|--|--|
| API | `dograhai/dograh-api:1.43.0` |
| UI | `dograhai/dograh-ui:1.43.0` |
| Source | Docker Hub `dograhai` via `update_remote.sh` / dograh-hq releases |
