# voiceeu Rollback & Deploy-Log

**Host:** DograhEUV2 → https://voiceeu.activi.io  
**Compose-Dir:** `/root/dograh/dograh`  
**Dieses Verzeichnis auf dem Server:** `/root/dograh/dograh/rollback/`  
**Repo-Spiegel:** `deploy/voiceeu/rollback/` in [dsactivi-2/dograhV2](https://github.com/dsactivi-2/dograhV2)

---

## Inhaltsverzeichnis

1. [Schnell-Rollback (API)](#schnell-rollback-api)
2. [Deploy-Historie](#deploy-historie)
3. [Was wurde geändert (Deepgram EU)](#was-wurde-geändert-deepgram-eu)
4. [Images & Tags](#images--tags)
5. [Backups auf dem Server](#backups-auf-dem-server)
6. [Verify nach Rollback / Deploy](#verify)
7. [Dateien in diesem Ordner](#dateien-in-diesem-ordner)

---

## Schnell-Rollback (API)

Zurück auf **vor** Deepgram-EU (Image `dograhai/dograh-api:1.43.0`):

```bash
# auf dem Server (ssh dograh-vps)
cd /root/dograh/dograh/rollback
sudo ./rollback-api-to-pre-dg-eu.sh
```

Oder manuell:

```bash
cd /root/dograh/dograh
# Image-Zeile der Service "api" zurücksetzen
sed -i.bak-manual-rollback \
  -E 's|image: dograhv2-api:dg-eu.*|image: dograhai/dograh-api:1.43.0|; s|image: dograhv2-api:dg-eu-83d960f|image: dograhai/dograh-api:1.43.0|' \
  docker-compose.yaml
# Fallback-Tag (identisch zu 1.43.0):
# image: dograhai/dograh-api:rollback-pre-dg-eu

docker compose up -d --no-deps api
docker compose ps api
curl -fsS https://voiceeu.activi.io/api/v1/health
```

**Datenverlust:** nein — nur API-Container wird neu gestartet. Postgres/Redis/MinIO/`.env` bleiben.

---

## Deploy-Historie

| Wann (UTC) | Was | Image API | Image UI | Commit/Quelle | Wer | Rollback |
|------------|-----|-----------|----------|---------------|-----|----------|
| 2026-07-29 ~20:42 | Baseline voiceeu OSS prebuilt | `dograhai/dograh-api:1.43.0` | `dograhai/dograh-ui:1.43.0` | Docker Hub dograhai | update_remote | — |
| **2026-07-30 ~01:04–01:14** | **Deepgram EU inference** | **`dograhv2-api:dg-eu`** (= `dg-eu-83d960f`) | unverändert `1.43.0` | dograhV2 `main` @ **`83d960f`** (PR #6) | Hermes Deploy nach Freigabe | `./rollback-api-to-pre-dg-eu.sh` |

### Details Deploy 2026-07-30 (Deepgram EU)

| Feld | Wert |
|------|------|
| Grund | STT/TTS/Flux Inference auf `api.eu.deepgram.com` (EU-Residenz) |
| Repo | https://github.com/dsactivi-2/dograhV2 |
| Merge | PR #6 `feat(deepgram): EU regional inference for all models` |
| Build | Server-side `docker build` (ohne BuildKit; Dockerfile mounts entfernt nur für Build) |
| Compose | Service `api` → `image: dograhv2-api:dg-eu` |
| Env | `DEEPGRAM_BASE_URL=api.eu.deepgram.com` in `.env` ergänzt |
| Nicht geändert | UI, Postgres-Volume, Redis, MinIO, Workflows, Org-Config Keys |
| Verify | Health 200; Container `DEEPGRAM_BASE_URL=api.eu.deepgram.com`; `_deepgram_inference_urls` OK |

---

## Was wurde geändert (Deepgram EU)

| Datei (im Image / Code) | Änderung |
|-------------------------|----------|
| `api/constants.py` | `DEEPGRAM_BASE_URL` default `api.eu.deepgram.com` |
| `api/services/pipecat/service_factory.py` | `_deepgram_inference_urls()`; STT/Flux/TTS nutzen EU-Host |
| `api/services/configuration/check_validity.py` | Key-Validierung bleibt global `api.deepgram.com` |
| Tests/Evals | angepasste Deepgram-Provider-URLs |

**Runtime-Effekt:** Wenn Org-STT = Deepgram → Audio-Inference EU.  
Speechmatics/Azure STT unverändert. TTS Vesna unverändert.

---

## Images & Tags

| Tag | Bedeutung |
|-----|-----------|
| `dograhai/dograh-api:1.43.0` | Offizielles Hub-Image (Pre-EU) |
| `dograhai/dograh-api:rollback-pre-dg-eu` | Alias auf dasselbe Image (Rollback-Ziel) |
| `dograhv2-api:dg-eu` | Aktuell deployed (EU-Patch) |
| `dograhv2-api:dg-eu-83d960f` | Gleicher Build, SHA-pin |

---

## Backups auf dem Server

Unter `/root/dograh/dograh/`:

| Datei | Zweck |
|-------|--------|
| `docker-compose.yaml.bak.pre-switch-dg-eu` | Compose vor Image-Pin |
| `docker-compose.yaml.bak.20260730-010440` | Compose bei Rollback-Prepare |
| `.env.bak.20260730-010440` | Env-Backup |
| `rollback-meta.20260730-010440.txt` | Image-ID vor Deploy |
| `rollback/` | **Dieses Verzeichnis** (Log + Scripts) |

---

## Verify

```bash
# Health
curl -fsS https://voiceeu.activi.io/api/v1/health

# Welches API-Image läuft?
docker inspect dograh-api-1 --format '{{.Config.Image}} health={{.State.Health.Status}}'

# EU-Constant (nur sinnvoll nach EU-Deploy)
docker exec dograh-api-1 python -c "from api.constants import DEEPGRAM_BASE_URL; print(DEEPGRAM_BASE_URL)"
```

Nach Rollback erwartet: Image `…:1.43.0` oder `…:rollback-pre-dg-eu`; `DEEPGRAM_BASE_URL` Import schlägt fehl / fehlt (altes Image).

---

## Dateien in diesem Ordner

| Datei | Inhalt |
|-------|--------|
| `README.md` | Dieses Inhaltsverzeichnis + Historie |
| `rollback-api-to-pre-dg-eu.sh` | Ein-Befehl-Rollback API → 1.43.0 |
| `verify-current.sh` | Health + Image + optional EU-Check |
| `DEPLOYMENT_LOG.md` | Append-only Kurzlog (neueste oben) |
