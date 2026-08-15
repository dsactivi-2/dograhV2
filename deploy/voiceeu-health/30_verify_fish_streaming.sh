#!/usr/bin/env bash
# =============================================================================
# verify_fish_streaming.sh
#
# Verifiziert zu 100% (soweit vom Host möglich), dass Dograh Fish Audio als
#   Pipecat WebSocket-Streaming (WSS + MessagePack + PCM)
# nutzt — NICHT als HTTP One-Shot MP3.
#
# Zwei Prüfpakete:
#   1) Fish Audio API Integration Details
#   2) Pipecat Streaming Architecture / WebSocket-Protokoll
#
# Plus explizite Anti-MP3-Checks (dein Verdacht).
#
# Ausführung (auf dem VPS DograhEUV2):
#   chmod +x verify_fish_streaming.sh
#   sudo bash verify_fish_streaming.sh
#
# Optional:
#   API_CONTAINER=dograh-api-1
#   FISH_API_KEY=sk_...          # Live WSS smoke (kurzer start→text→flush→audio)
#   DO_LIVE_WSS=1                # erzwingt Live-WSS-Test wenn Key gesetzt
#   REPORT_DIR=/root/fish-verify
#   SKIP_DOCKER=1                # nur Source-Pfad ohne Container
#
# Exit: 0 = alle hard checks OK, 1 = mind. 1 FAIL
# =============================================================================
set -euo pipefail

API_CONTAINER="${API_CONTAINER:-dograh-api-1}"
REPORT_DIR="${REPORT_DIR:-$(pwd)/fish-verify-report}"
TS="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
mkdir -p "$REPORT_DIR"
REPORT_MD="$REPORT_DIR/verify-fish-streaming.md"
REPORT_ENV="$REPORT_DIR/verify-fish-streaming.env"

OK=0; WARN=0; FAIL=0; INFO=0
RESULTS=()
STREAMING_SCORE=0
STREAMING_MAX=0
INTEGRATION_SCORE=0
INTEGRATION_MAX=0
ANTIMP3_SCORE=0
ANTIMP3_MAX=0

log()  { printf '%s\n' "$*"; }
ok()   { OK=$((OK+1));   RESULTS+=("OK|$1|$2");   log "  [OK]   $1 — $2"; }
warn() { WARN=$((WARN+1)); RESULTS+=("WARN|$1|$2"); log "  [WARN] $1 — $2"; }
fail() { FAIL=$((FAIL+1)); RESULTS+=("FAIL|$1|$2"); log "  [FAIL] $1 — $2"; }
info() { INFO=$((INFO+1)); RESULTS+=("INFO|$1|$2"); log "  [INFO] $1 — $2"; }

score() {
  # score <bucket> <pass:0|1> <label> <detail>
  local bucket="$1" pass="$2" label="$3" detail="$4"
  case "$bucket" in
    integration) INTEGRATION_MAX=$((INTEGRATION_MAX+1)); [[ "$pass" == "1" ]] && INTEGRATION_SCORE=$((INTEGRATION_SCORE+1)) ;;
    streaming)   STREAMING_MAX=$((STREAMING_MAX+1));     [[ "$pass" == "1" ]] && STREAMING_SCORE=$((STREAMING_SCORE+1)) ;;
    antimp3)     ANTIMP3_MAX=$((ANTIMP3_MAX+1));         [[ "$pass" == "1" ]] && ANTIMP3_SCORE=$((ANTIMP3_SCORE+1)) ;;
  esac
  if [[ "$pass" == "1" ]]; then ok "$label" "$detail"; else fail "$label" "$detail"; fi
}

have() { command -v "$1" >/dev/null 2>&1; }

# ── resolve API container ────────────────────────────────────────────────────
resolve_cid() {
  local cid
  cid="$(docker ps --filter "name=${API_CONTAINER}" --format '{{.ID}}' 2>/dev/null | head -1 || true)"
  if [[ -z "$cid" ]]; then
    cid="$(docker ps --filter label=com.docker.compose.service=api --format '{{.ID}}' 2>/dev/null | head -1 || true)"
  fi
  if [[ -z "$cid" ]]; then
    cid="$(docker ps --format '{{.ID}} {{.Names}}' 2>/dev/null | grep -iE 'dograh.*api' | awk '{print $1}' | head -1 || true)"
  fi
  echo "$cid"
}

dexec() {
  docker exec "$CID" "$@"
}

dexec_py() {
  # python -c body via stdin script for reliability
  docker exec -i "$CID" python - "$@"
}

# ── paths inside container (Dograh image layout) ─────────────────────────────
# Typical: /app/api/... and pipecat installed site-packages
find_paths() {
  REGISTRY_PATH=""
  FACTORY_PATH=""
  FISH_TTS_PATH=""
  VALIDITY_PATH=""

  for base in /app /app/api /workspace; do
    [[ -z "$REGISTRY_PATH" ]] && dexec test -f "$base/services/configuration/registry.py" 2>/dev/null \
      && REGISTRY_PATH="$base/services/configuration/registry.py"
    [[ -z "$FACTORY_PATH" ]] && dexec test -f "$base/services/pipecat/service_factory.py" 2>/dev/null \
      && FACTORY_PATH="$base/services/pipecat/service_factory.py"
    [[ -z "$VALIDITY_PATH" ]] && dexec test -f "$base/services/configuration/check_validity.py" 2>/dev/null \
      && VALIDITY_PATH="$base/services/configuration/check_validity.py"
  done
  # registry sometimes under /app/api/...
  if [[ -z "$REGISTRY_PATH" ]]; then
    REGISTRY_PATH="$(dexec sh -c 'python -c "import api.services.configuration.registry as r,inspect; print(inspect.getfile(r))"' 2>/dev/null || true)"
  fi
  if [[ -z "$FACTORY_PATH" ]]; then
    FACTORY_PATH="$(dexec sh -c 'python -c "import api.services.pipecat.service_factory as f,inspect; print(inspect.getfile(f))"' 2>/dev/null || true)"
  fi
  if [[ -z "$VALIDITY_PATH" ]]; then
    VALIDITY_PATH="$(dexec sh -c 'python -c "import api.services.configuration.check_validity as v,inspect; print(inspect.getfile(v))"' 2>/dev/null || true)"
  fi
  FISH_TTS_PATH="$(dexec sh -c 'python -c "import pipecat.services.fish.tts as t,inspect; print(inspect.getfile(t))"' 2>/dev/null || true)"
}

# =============================================================================
log "=============================================="
log " Fish Streaming Verifier"
log " Time: $TS"
log " Goal: WSS+MessagePack+PCM  ≠  HTTP+MP3 one-shot"
log "=============================================="

if [[ "${SKIP_DOCKER:-0}" == "1" ]]; then
  fail "docker" "SKIP_DOCKER=1 — cannot verify runtime"
  CID=""
else
  if ! have docker; then
    fail "docker" "docker CLI not found — run this ON the VPS"
    CID=""
  else
    CID="$(resolve_cid)"
    if [[ -z "$CID" ]]; then
      fail "api container" "not found (tried name=$API_CONTAINER)"
    else
      IMG="$(docker inspect -f '{{.Config.Image}}' "$CID" 2>/dev/null || echo '?')"
      ST="$(docker inspect -f '{{.State.Status}}' "$CID" 2>/dev/null || echo '?')"
      ok "api container" "id=${CID:0:12} image=$IMG status=$ST"
    fi
  fi
fi

if [[ -n "${CID:-}" ]]; then
  find_paths
  info "path registry" "${REGISTRY_PATH:-MISSING}"
  info "path factory"  "${FACTORY_PATH:-MISSING}"
  info "path fish tts" "${FISH_TTS_PATH:-MISSING}"
  info "path validity" "${VALIDITY_PATH:-MISSING}"
fi

# =============================================================================
log
log "=== 1) Fish Audio API Integration Details ==="

if [[ -n "${CID:-}" ]]; then
  # 1.1 Enum + config class
  if [[ -n "${REGISTRY_PATH:-}" ]] && dexec grep -qE 'FISH_AUDIO\s*=\s*"fish_audio"' "$REGISTRY_PATH" 2>/dev/null; then
    score integration 1 "integration.enum" 'ServiceProviders.FISH_AUDIO = "fish_audio"'
  else
    score integration 0 "integration.enum" "FISH_AUDIO missing in registry"
  fi

  if [[ -n "${REGISTRY_PATH:-}" ]] && dexec grep -q 'class FishAudioTTSConfiguration' "$REGISTRY_PATH" 2>/dev/null; then
    score integration 1 "integration.config_class" "FishAudioTTSConfiguration present"
  else
    score integration 0 "integration.config_class" "FishAudioTTSConfiguration missing"
  fi

  if [[ -n "${REGISTRY_PATH:-}" ]] && dexec grep -q 'FishAudioTTSConfiguration' "$REGISTRY_PATH" 2>/dev/null \
     && dexec grep -q 'TTSConfig' "$REGISTRY_PATH" 2>/dev/null; then
    score integration 1 "integration.tts_union" "FishAudioTTSConfiguration in TTS schema path"
  else
    score integration 0 "integration.tts_union" "not wired into TTSConfig"
  fi

  # required fields for API integration
  for field in model voice latency speed; do
    if [[ -n "${REGISTRY_PATH:-}" ]] && dexec sh -c "awk '/class FishAudioTTSConfiguration/,/^class |^@register_|^TTSConfig/' '$REGISTRY_PATH' | grep -qE '^[[:space:]]+$field:'" 2>/dev/null; then
      score integration 1 "integration.field.$field" "config field present"
    else
      score integration 0 "integration.field.$field" "missing on FishAudioTTSConfiguration"
    fi
  done

  # key validator
  if [[ -n "${VALIDITY_PATH:-}" ]] && dexec grep -q '_check_fish_audio_api_key' "$VALIDITY_PATH" 2>/dev/null; then
    score integration 1 "integration.key_validator" "_check_fish_audio_api_key present"
  else
    score integration 0 "integration.key_validator" "API key validator missing"
  fi

  if [[ -n "${VALIDITY_PATH:-}" ]] && dexec grep -q 'api.fish.audio/model' "$VALIDITY_PATH" 2>/dev/null; then
    score integration 1 "integration.key_url" "validates against https://api.fish.audio/model"
  else
    score integration 0 "integration.key_url" "unexpected key validation URL"
  fi

  # runtime registry registration
  if docker exec -i "$CID" python - <<'PY' 2>/tmp/fish_int_reg.err
from api.services.configuration.registry import REGISTRY, ServiceType
tts = REGISTRY[ServiceType.TTS]
keys = [getattr(k, "value", k) for k in tts.keys()]
assert "fish_audio" in keys, keys
cls = next(v for k,v in tts.items() if getattr(k,"value",k)=="fish_audio")
assert cls.__name__ == "FishAudioTTSConfiguration", cls
print("OK", cls.__name__)
PY
  then
    score integration 1 "integration.runtime_registry" "fish_audio registered at runtime"
  else
    score integration 0 "integration.runtime_registry" "not registered — $(tr '\n' ' ' </tmp/fish_int_reg.err | head -c 180)"
  fi

  # factory branch exists
  if [[ -n "${FACTORY_PATH:-}" ]] && dexec grep -q 'ServiceProviders.FISH_AUDIO' "$FACTORY_PATH" 2>/dev/null; then
    score integration 1 "integration.factory_branch" "create_tts_service has FISH_AUDIO branch"
  else
    score integration 0 "integration.factory_branch" "no FISH_AUDIO branch in factory"
  fi

  # optional live key smoke (HTTP model list — integration only, not streaming)
  if [[ -n "${FISH_API_KEY:-}" ]]; then
    fcode="$(curl -sk -o /tmp/fish_model_list.json -w '%{http_code}' --max-time 15 \
      -H "Authorization: Bearer $FISH_API_KEY" https://api.fish.audio/model 2>/dev/null || echo 000)"
    if [[ "$fcode" == "200" ]]; then
      score integration 1 "integration.live_key" "GET /model → 200 (key accepted by Fish)"
    else
      score integration 0 "integration.live_key" "GET /model → HTTP $fcode"
    fi
  else
    info "integration.live_key" "skipped (set FISH_API_KEY for live auth check)"
  fi
else
  fail "integration.*" "no container — package 1 incomplete"
fi

# =============================================================================
log
log "=== 2) Pipecat Streaming Architecture ==="

if [[ -n "${CID:-}" ]]; then
  # import service + ormsgpack
  if docker exec -i "$CID" python - <<'PY' 2>/tmp/fish_imp.err
from pipecat.services.fish.tts import FishAudioTTSService, FishAudioTTSSettings
import ormsgpack, websockets
from pipecat.services.tts_service import InterruptibleTTSService
assert issubclass(FishAudioTTSService, InterruptibleTTSService)
print("OK", FishAudioTTSService.__name__, ormsgpack.__version__)
PY
  then
    score streaming 1 "streaming.import" "FishAudioTTSService + ormsgpack + websockets + InterruptibleTTS"
  else
    score streaming 0 "streaming.import" "import failed — $(tr '\n' ' ' </tmp/fish_imp.err | head -c 180)"
  fi

  # hardcoded WSS URL in service
  if [[ -n "${FISH_TTS_PATH:-}" ]] && dexec grep -q 'wss://api.fish.audio/v1/tts/live' "$FISH_TTS_PATH" 2>/dev/null; then
    score streaming 1 "streaming.wss_url" "base_url = wss://api.fish.audio/v1/tts/live"
  else
    # runtime inspect
    if docker exec -i "$CID" python - <<'PY' 2>/dev/null
from pipecat.services.fish.tts import FishAudioTTSService
import inspect
src = inspect.getsource(FishAudioTTSService)
assert "wss://api.fish.audio/v1/tts/live" in src
print("OK")
PY
    then
      score streaming 1 "streaming.wss_url" "wss://api.fish.audio/v1/tts/live found in class source"
    else
      score streaming 0 "streaming.wss_url" "Fish live WSS URL NOT found — maybe wrong service"
    fi
  fi

  # MessagePack protocol events in source
  PROTO_OK=1
  for ev in '"event": "start"' '"event": "text"' '"event": "flush"' '"event": "stop"' 'event == "audio"'; do
    if [[ -n "${FISH_TTS_PATH:-}" ]] && dexec grep -qF "$ev" "$FISH_TTS_PATH" 2>/dev/null; then
      score streaming 1 "streaming.protocol.$ev" "present in FishAudioTTSService"
    else
      # fallback inspect
      if dexec python -c "from pipecat.services.fish.tts import FishAudioTTSService as S; import inspect; assert '''$ev''' in inspect.getsource(S)" 2>/dev/null; then
        score streaming 1 "streaming.protocol.$ev" "present via inspect"
      else
        score streaming 0 "streaming.protocol.$ev" "MISSING — protocol incomplete"
        PROTO_OK=0
      fi
    fi
  done

  # ormsgpack pack/unpack
  if [[ -n "${FISH_TTS_PATH:-}" ]] && dexec grep -q 'ormsgpack.packb' "$FISH_TTS_PATH" 2>/dev/null \
     && dexec grep -q 'ormsgpack.unpackb' "$FISH_TTS_PATH" 2>/dev/null; then
    score streaming 1 "streaming.msgpack" "ormsgpack.packb + unpackb (not JSON body)"
  else
    score streaming 0 "streaming.msgpack" "ormsgpack pack/unpack not found"
  fi

  # TTSAudioRawFrame from audio event
  if [[ -n "${FISH_TTS_PATH:-}" ]] && dexec grep -q 'TTSAudioRawFrame' "$FISH_TTS_PATH" 2>/dev/null; then
    score streaming 1 "streaming.pcm_frames" "maps audio events → TTSAudioRawFrame (pipeline PCM frames)"
  else
    score streaming 0 "streaming.pcm_frames" "TTSAudioRawFrame not used — not pipeline streaming?"
  fi

  # factory uses FishAudioTTSService (not raw HTTP)
  if [[ -n "${FACTORY_PATH:-}" ]]; then
    if dexec grep -A40 'FISH_AUDIO.value' "$FACTORY_PATH" 2>/dev/null | grep -q 'FishAudioTTSService('; then
      score streaming 1 "streaming.factory_uses_ws_service" "factory returns FishAudioTTSService(...)"
    else
      score streaming 0 "streaming.factory_uses_ws_service" "factory does not instantiate FishAudioTTSService"
    fi
  fi

  # factory output_format pcm + sample_rate
  if [[ -n "${FACTORY_PATH:-}" ]]; then
    FISH_BRANCH="$(dexec sed -n '/FISH_AUDIO.value/,/elif user_config.tts.provider\|else:/p' "$FACTORY_PATH" 2>/dev/null || true)"
    if echo "$FISH_BRANCH" | grep -q 'output_format="pcm"'; then
      score streaming 1 "streaming.factory_pcm" 'factory sets output_format="pcm"'
    else
      score streaming 0 "streaming.factory_pcm" "factory does NOT force pcm"
    fi
    if echo "$FISH_BRANCH" | grep -q 'transport_out_sample_rate\|sample_rate=audio_config'; then
      score streaming 1 "streaming.factory_sample_rate" "sample_rate from audio_config pipeline"
    else
      score streaming 0 "streaming.factory_sample_rate" "pipeline sample_rate not wired"
    fi
  fi

  # runtime: construct service and inspect defaults (no network)
  if docker exec -i "$CID" python - <<'PY' 2>/tmp/fish_ctor.err
from pipecat.services.fish.tts import FishAudioTTSService, FishAudioTTSSettings
svc = FishAudioTTSService(
    api_key="dummy-key-for-inspect-only",
    sample_rate=16000,
    output_format="pcm",
    settings=FishAudioTTSSettings(voice="test-voice", model="s2-pro", latency="balanced"),
)
assert getattr(svc, "_base_url", None) == "wss://api.fish.audio/v1/tts/live", getattr(svc, "_base_url", None)
assert getattr(svc, "_output_format", None) == "pcm", getattr(svc, "_output_format", None)
# must not look like REST mp3 client
assert "tts/live" in svc._base_url
assert not svc._base_url.startswith("https://"), svc._base_url
print("OK base_url=%s format=%s" % (svc._base_url, svc._output_format))
PY
  then
    score streaming 1 "streaming.runtime_instance" "instance: WSS live URL + output_format=pcm"
  else
    score streaming 0 "streaming.runtime_instance" "construct/inspect failed — $(tr '\n' ' ' </tmp/fish_ctor.err | head -c 180)"
  fi

  # simulate factory path with mock (proves Dograh wiring chooses PCM service)
  if docker exec -i "$CID" python - <<'PY' 2>/tmp/fish_fact.err
from types import SimpleNamespace
from unittest.mock import patch, MagicMock
from api.services.configuration.registry import ServiceProviders
from api.services.pipecat.service_factory import create_tts_service

user_config = SimpleNamespace(
    tts=SimpleNamespace(
        provider=ServiceProviders.FISH_AUDIO.value,
        api_key="k",
        model="s2-pro",
        voice="voice-ref",
        language="en",
        latency="balanced",
        speed=1.0,
        volume=0,
        normalize=True,
    )
)
audio_config = SimpleNamespace(transport_out_sample_rate=16000, transport_in_sample_rate=16000)

with patch("api.services.pipecat.service_factory.FishAudioTTSService") as mock_cls:
    mock_cls.return_value = MagicMock(name="FishAudioTTSService")
    create_tts_service(user_config, audio_config)
    assert mock_cls.call_count == 1
    kw = mock_cls.call_args.kwargs
    assert kw.get("output_format") == "pcm", kw
    assert kw.get("sample_rate") == 16000, kw
    settings = kw.get("settings")
    # settings is FishAudioTTSSettings instance
    voice = getattr(settings, "voice", None)
    assert voice == "voice-ref", settings
    print("OK factory→FishAudioTTSService output_format=pcm sample_rate=16000 voice=%s" % voice)
PY
  then
    score streaming 1 "streaming.factory_path_mock" "create_tts_service → FishAudioTTSService(pcm, sample_rate)"
  else
    score streaming 0 "streaming.factory_path_mock" "factory mock path failed — $(tr '\n' ' ' </tmp/fish_fact.err | head -c 200)"
  fi
else
  fail "streaming.*" "no container — package 2 incomplete"
fi

# =============================================================================
log
log "=== 3) Anti-MP3 / NOT one-shot HTTP checks (your suspicion) ==="

if [[ -n "${CID:-}" ]]; then
  # 3.1 factory must NOT request mp3 for fish
  if [[ -n "${FACTORY_PATH:-}" ]]; then
    FISH_BRANCH="$(dexec sed -n '/FISH_AUDIO.value/,/elif user_config.tts.provider\|else:/p' "$FACTORY_PATH" 2>/dev/null || true)"
    if echo "$FISH_BRANCH" | grep -qE 'output_format\s*=\s*"mp3"'; then
      score antimp3 0 "antimp3.factory_not_mp3" 'FACTORY SETS output_format="mp3" ← THIS IS THE BAD PATH'
    else
      score antimp3 1 "antimp3.factory_not_mp3" 'factory does not set mp3 for Fish'
    fi
    if echo "$FISH_BRANCH" | grep -qiE 'requests\.(post|get)|httpx\.(post|get)|aiohttp.*api.fish.audio/v1/tts[^\w]'; then
      score antimp3 0 "antimp3.factory_no_http_tts" "factory appears to call HTTP TTS directly"
    else
      score antimp3 1 "antimp3.factory_no_http_tts" "no HTTP POST /v1/tts in Fish factory branch"
    fi
  fi

  # 3.2 service default format is pcm, URL is wss live
  if docker exec -i "$CID" python - <<'PY' 2>/tmp/fish_anti.err
from pipecat.services.fish.tts import FishAudioTTSService
import inspect
src = inspect.getsource(FishAudioTTSService)
# default signature
sig = inspect.signature(FishAudioTTSService.__init__)
of = sig.parameters.get("output_format")
assert of is not None
# default may be "pcm"
default = of.default
assert default == "pcm" or str(default) == "pcm", default
assert "wss://api.fish.audio/v1/tts/live" in src
# must send msgpack events not Content-Type audio/mpeg HTTP body as primary path
assert "ormsgpack.packb" in src
assert '"event": "start"' in src or "'event': 'start'" in src
# REST one-shot would typically hit /v1/tts without /live
assert "api.fish.audio/v1/tts/live" in src
print("OK default_format=%s wss_live+msgpack" % default)
PY
  then
    score antimp3 1 "antimp3.service_default_pcm_wss" "FishAudioTTSService default = pcm + WSS live + msgpack"
  else
    score antimp3 0 "antimp3.service_default_pcm_wss" "service defaults wrong — $(tr '\n' ' ' </tmp/fish_anti.err | head -c 180)"
  fi

  # 3.3 ensure Dograh path cannot silently pass format=mp3 unless someone forked factory
  if docker exec -i "$CID" python - <<'PY' 2>/tmp/fish_anti2.err
from types import SimpleNamespace
from unittest.mock import patch, MagicMock
from api.services.configuration.registry import ServiceProviders
from api.services.pipecat.service_factory import create_tts_service

user_config = SimpleNamespace(
    tts=SimpleNamespace(
        provider=ServiceProviders.FISH_AUDIO.value,
        api_key="k", model="s2-pro", voice="v", language="en",
        latency="balanced", speed=1.0, volume=0, normalize=True,
    )
)
audio = SimpleNamespace(transport_out_sample_rate=24000, transport_in_sample_rate=16000)
with patch("api.services.pipecat.service_factory.FishAudioTTSService") as m:
    m.return_value = MagicMock()
    create_tts_service(user_config, audio)
    fmt = m.call_args.kwargs.get("output_format")
    assert fmt == "pcm", "EXPECTED pcm got %r" % (fmt,)
    assert fmt != "mp3"
print("OK factory hard-wires pcm (not mp3)")
PY
  then
    score antimp3 1 "antimp3.factory_hardwires_pcm" "Dograh factory hard-wires output_format=pcm (not user-selectable mp3)"
  else
    score antimp3 0 "antimp3.factory_hardwires_pcm" "could not prove pcm hard-wire — $(tr '\n' ' ' </tmp/fish_anti2.err | head -c 180)"
  fi

  # 3.4 no separate HTTP Fish client module used by factory
  if docker exec -i "$CID" python - <<'PY' 2>/dev/null
import api.services.pipecat.service_factory as f, inspect
src = inspect.getsource(f)
# fish branch must not use requests to fish audio tts non-live
import re
# crude: if both fish and post to api.fish without live
if re.search(r'api\.fish\.audio/v1/tts(?!/live)', src) and "FISH_AUDIO" in src:
    # check it's only in comments
    for line in src.splitlines():
        if "api.fish.audio/v1/tts" in line and "live" not in line and not line.strip().startswith("#"):
            raise SystemExit("found non-live fish HTTP path: " + line.strip()[:120])
print("OK no non-live fish HTTP TTS path in service_factory")
PY
  then
    score antimp3 1 "antimp3.no_rest_tts_path" "service_factory has no non-live /v1/tts HTTP path"
  else
    score antimp3 0 "antimp3.no_rest_tts_path" "possible REST /v1/tts path in factory"
  fi
else
  fail "antimp3.*" "no container"
fi

# =============================================================================
log
log "=== 4) Optional LIVE WSS smoke (real protocol start→text→flush→audio) ==="

LIVE_WSS_RESULT="skipped"
if [[ -n "${FISH_API_KEY:-}" && "${DO_LIVE_WSS:-1}" == "1" && -n "${CID:-}" ]]; then
  # Run short real WSS test INSIDE container (has ormsgpack+websockets)
  if docker exec -i "$CID" env FISH_API_KEY="$FISH_API_KEY" python - <<'PY' > /tmp/fish_live_wss.out 2>/tmp/fish_live_wss.err
import asyncio, os, sys
import ormsgpack
from websockets.asyncio.client import connect as websocket_connect

API_KEY = os.environ["FISH_API_KEY"]
URL = "wss://api.fish.audio/v1/tts/live"
# Use a well-known public voice if user didn't set one — still validates protocol
VOICE = os.environ.get("FISH_VOICE_ID", "c737db0b875d4d0d88af86b7529e8fa1")
MODEL = os.environ.get("FISH_MODEL", "s2-pro")

async def main():
    headers = {"Authorization": f"Bearer {API_KEY}", "model": MODEL}
    async with websocket_connect(URL, additional_headers=headers, open_timeout=15) as ws:
        start = {
            "event": "start",
            "request": {
                "text": "",
                "sample_rate": 16000,
                "latency": "balanced",
                "format": "pcm",
                "normalize": True,
                "prosody": {"speed": 1.0, "volume": 0},
                "reference_id": VOICE,
            },
        }
        await ws.send(ormsgpack.packb(start))
        await ws.send(ormsgpack.packb({"event": "text", "text": "Hello from streaming verify."}))
        await ws.send(ormsgpack.packb({"event": "flush"}))

        got_audio = 0
        audio_bytes = 0
        finish = None
        try:
            while True:
                msg = await asyncio.wait_for(ws.recv(), timeout=20)
                if not isinstance(msg, bytes):
                    continue
                data = ormsgpack.unpackb(msg)
                if not isinstance(data, dict):
                    continue
                ev = data.get("event")
                if ev == "audio":
                    chunk = data.get("audio") or b""
                    if chunk:
                        got_audio += 1
                        audio_bytes += len(chunk)
                        if audio_bytes > 2048:
                            break
                elif ev == "finish":
                    finish = data.get("reason")
                    break
        finally:
            try:
                await ws.send(ormsgpack.packb({"event": "stop"}))
            except Exception:
                pass

        print("LIVE_WSS_OK chunks=%d bytes=%d finish=%s format=pcm protocol=msgpack" % (
            got_audio, audio_bytes, finish))
        if got_audio < 1 or audio_bytes < 512:
            print("LIVE_WSS_WEAK: little/no audio — voice id may be invalid, but socket protocol worked" if got_audio else "LIVE_WSS_FAIL: no audio event", file=sys.stderr)
            sys.exit(2 if got_audio < 1 else 0)

asyncio.run(main())
PY
  then
    LIVE_WSS_RESULT="$(tr '\n' ' ' </tmp/fish_live_wss.out)"
    score streaming 1 "streaming.live_wss_smoke" "$LIVE_WSS_RESULT"
    score antimp3 1 "antimp3.live_received_pcm_events" "live session returned MessagePack audio events (not an mp3 file download)"
  else
    err="$(tr '\n' ' ' </tmp/fish_live_wss.err 2>/dev/null | head -c 240)"
    out="$(tr '\n' ' ' </tmp/fish_live_wss.out 2>/dev/null | head -c 200)"
    if echo "$err$out" | grep -q 'LIVE_WSS_WEAK'; then
      warn "streaming.live_wss_smoke" "protocol OK but little audio — check FISH_VOICE_ID ($err $out)"
      LIVE_WSS_RESULT="weak"
    else
      fail "streaming.live_wss_smoke" "live WSS failed — $err $out"
      LIVE_WSS_RESULT="fail"
    fi
  fi
else
  info "streaming.live_wss_smoke" "skipped — set FISH_API_KEY=... (optional FISH_VOICE_ID) for full live proof"
fi

# =============================================================================
# Verdict
pct() {
  local s="$1" m="$2"
  if [[ "$m" -eq 0 ]]; then echo "n/a"; return; fi
  echo "$(( s * 100 / m ))%"
}

I_PCT="$(pct "$INTEGRATION_SCORE" "$INTEGRATION_MAX")"
S_PCT="$(pct "$STREAMING_SCORE" "$STREAMING_MAX")"
A_PCT="$(pct "$ANTIMP3_SCORE" "$ANTIMP3_MAX")"

log
log "=============================================="
log " SCORES"
log "  1) Fish API Integration : $INTEGRATION_SCORE / $INTEGRATION_MAX  ($I_PCT)"
log "  2) Pipecat Streaming    : $STREAMING_SCORE / $STREAMING_MAX  ($S_PCT)"
log "  3) Anti-MP3 (WS+PCM)    : $ANTIMP3_SCORE / $ANTIMP3_MAX  ($A_PCT)"
log "  Totals: OK=$OK WARN=$WARN FAIL=$FAIL INFO=$INFO"
log "=============================================="

# Human verdict
VERDICT="UNKNOWN"
if [[ "$FAIL" -eq 0 && "$INTEGRATION_SCORE" -eq "$INTEGRATION_MAX" && "$STREAMING_SCORE" -eq "$STREAMING_MAX" && "$ANTIMP3_SCORE" -eq "$ANTIMP3_MAX" ]]; then
  VERDICT="CONFIRMED_STREAMING_PCM_WSS"
elif [[ "$ANTIMP3_SCORE" -eq "$ANTIMP3_MAX" && "$STREAMING_SCORE" -ge $((STREAMING_MAX * 8 / 10)) ]]; then
  VERDICT="LIKELY_STREAMING_PCM_WSS"
elif echo "$RESULTS" | grep -q 'output_format="mp3"\|FACTORY SETS output_format="mp3"'; then
  VERDICT="MP3_OR_HTTP_PATH_DETECTED"
else
  VERDICT="INCOMPLETE_OR_ISSUES"
fi

log " VERDICT: $VERDICT"
case "$VERDICT" in
  CONFIRMED_STREAMING_PCM_WSS)
    log " → Bei dir ist die Streaming-Variante eingerichtet (WSS + MessagePack + PCM)."
    log " → NICHT die curl/MP3 One-Shot-Variante für Voice-Calls."
    ;;
  LIKELY_STREAMING_PCM_WSS)
    log " → Fast sicher Streaming; optional FISH_API_KEY für Live-WSS setzen."
    ;;
  MP3_OR_HTTP_PATH_DETECTED)
    log " → WARNUNG: es sieht nach MP3/HTTP-Pfad aus — Factory prüfen!"
    ;;
  *)
    log " → Es gibt Lücken (siehe FAIL-Zeilen)."
    ;;
esac

{
  echo "SCAN_TS=$TS"
  echo "VERDICT=$VERDICT"
  echo "INTEGRATION=$INTEGRATION_SCORE/$INTEGRATION_MAX"
  echo "STREAMING=$STREAMING_SCORE/$STREAMING_MAX"
  echo "ANTIMP3=$ANTIMP3_SCORE/$ANTIMP3_MAX"
  echo "OK=$OK"
  echo "WARN=$WARN"
  echo "FAIL=$FAIL"
  echo "LIVE_WSS=$LIVE_WSS_RESULT"
  echo "CONTAINER=${CID:-none}"
} >"$REPORT_ENV"

{
  echo "# Fish Streaming Verification — $TS"
  echo
  echo "**Verdict: \`$VERDICT\`**"
  echo
  echo "| Package | Score |"
  echo "|---------|-------|"
  echo "| 1 Fish API Integration | $INTEGRATION_SCORE / $INTEGRATION_MAX ($I_PCT) |"
  echo "| 2 Pipecat Streaming Architecture | $STREAMING_SCORE / $STREAMING_MAX ($S_PCT) |"
  echo "| 3 Anti-MP3 (must be WSS+PCM) | $ANTIMP3_SCORE / $ANTIMP3_MAX ($A_PCT) |"
  echo
  echo "## What \"correct\" means"
  echo
  echo 'Pipecat WebSocket protocol (Fish) = long-lived **WSS** session with **MessagePack** events'
  echo '(`start` → `text`/`flush` → `audio` ← → `stop`), producing **PCM** `TTSAudioRawFrame`s —'
  echo '**not** HTTP `POST /v1/tts` returning one **MP3** file.'
  echo
  echo "## Results"
  echo
  echo "| Status | Check | Detail |"
  echo "|--------|-------|--------|"
  for r in "${RESULTS[@]}"; do
    IFS='|' read -r st name detail <<<"$r"
    detail="${detail//|/\\|}"
    echo "| $st | $name | $detail |"
  done
  echo
  echo "## How to re-run with live protocol proof"
  echo
  echo '```bash'
  echo "export FISH_API_KEY='your-key'"
  echo "export FISH_VOICE_ID='your-reference-id'   # optional"
  echo "export DO_LIVE_WSS=1"
  echo "bash verify_fish_streaming.sh"
  echo '```'
  echo
  echo "Reports: \`$REPORT_MD\` · \`$REPORT_ENV\`"
} >"$REPORT_MD"

log
log "Wrote $REPORT_MD"
log "Wrote $REPORT_ENV"

[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1
