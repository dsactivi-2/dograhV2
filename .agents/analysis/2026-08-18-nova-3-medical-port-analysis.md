# Analyse: Port von Upstream-Commit ba2bcf0 ("feat: add nova-3-medical in Deepgram")

**Datum:** 2026-08-18  
**Auftraggeber:** Den_is  
**Typ:** READ-ONLY Untersuchung (kein Merge, keine Code-Änderungen)

---

## Zusammenfassung

| Frage | Antwort |
|-------|---------|
| **Ändert ba2bcf0 irgendeine Deepgram Base-URL / Host / EU-Endpoint?** | **NEIN** |
| **Würden Deepgram 2 / Deepgram 3 Activi-Anpassungen überschrieben?** | **NEIN** |
| **Sind Deepgram 2 / Deepgram 3 im Upstream vorhanden?** | **NEIN** (Activi-spezifisch) |

---

## Commit-Details

**Upstream-Commit:** `ba2bcf0ecf57d402dccbbede21fd9c886272fa0f`  
**Repository:** dograh-hq/dograh  
**Autor:** Abhishek Kumar  
**Datum:** 2026-07-31T16:35:00Z  
**Message:** `feat: add nova-3-medical in Deepgram`

### Geänderte Dateien im Upstream-Commit

| Datei | Status | Änderungen |
|-------|--------|------------|
| `api/services/configuration/options/deepgram.py` | modified | +1 -1 |
| `api/services/configuration/registry.py` | modified | +3 -1 |

---

## Base-URL Analyse

### Frage 1: Würde ba2bcf0 irgendeine Deepgram Base-URL ändern?

**Antwort: NEIN**

#### Beweis 1: ba2bcf0 berührt KEINE URL-Konfigurationen

Der Commit ändert NUR:

1. **`deepgram.py`** - Fügt Model zur Liste hinzu:
```diff
-DEEPGRAM_STT_MODELS = ("nova-3-general", *DEEPGRAM_FLUX_MODELS)
+DEEPGRAM_STT_MODELS = ("nova-3-general", "nova-3-medical", *DEEPGRAM_FLUX_MODELS)
```

2. **`registry.py`** - Fügt `allow_custom_input` und Model-Option hinzu:
```diff
 model: str = Field(
     default="nova-3-general",
     description="Deepgram STT model.",
-    json_schema_extra={"examples": DEEPGRAM_STT_MODELS},
+    json_schema_extra={"examples": DEEPGRAM_STT_MODELS, "allow_custom_input": True},
 )
 language: str = Field(
     ...
     json_schema_extra={
         "examples": DEEPGRAM_LANGUAGES,
+        "allow_custom_input": True,
         "model_options": {
             "nova-3-general": DEEPGRAM_LANGUAGES,
+            "nova-3-medical": DEEPGRAM_LANGUAGES,
             "flux-general-en": ("en",),
             "flux-general-multi": DEEPGRAM_FLUX_MULTILINGUAL_LANGUAGE_OPTIONS,
         },
```

#### Beweis 2: Activi EU-Konfiguration ist NICHT im Upstream

**Activi pre-pre-main** hat folgende EU-spezifische Konfiguration, die NICHT im Upstream existiert:

**`api/constants.py` (Zeilen 60-66):**
```python
# Deepgram regional inference endpoint (STT / TTS / Flux WebSocket + REST).
# Default targets the EU data residency host. Override with DEEPGRAM_BASE_URL
# (hostname, or scheme+host). Management APIs (projects/keys validation) still
# use the global api.deepgram.com — EU has no /v1/projects.
DEEPGRAM_BASE_URL = (
    os.getenv("DEEPGRAM_BASE_URL", "api.eu.deepgram.com").strip().rstrip("/")
)
```

**Upstream bei ba2bcf0:** Kein `DEEPGRAM_BASE_URL` in `constants.py` (grep liefert leer)

**`api/services/pipecat/service_factory.py`** - Activi-Funktion `_deepgram_inference_urls()`:
```python
def _deepgram_inference_urls(base_url: str | None = None) -> tuple[str, str, str]:
    raw = (base_url or DEEPGRAM_BASE_URL).strip().rstrip("/")
    host = raw
    # ... URL-Parsing-Logik ...
    return host, f"wss://{host}/v2/listen", f"wss://{host}"
```

**Upstream bei ba2bcf0:** Keine `_deepgram_inference_urls()` Funktion

#### Beweis 3: Aktuelle URLs auf pre-pre-main

| Verwendung | URL | Quelle |
|------------|-----|--------|
| STT Base URL | `api.eu.deepgram.com` | `DEEPGRAM_BASE_URL` constant |
| Flux WebSocket | `wss://api.eu.deepgram.com/v2/listen` | `_deepgram_inference_urls()` |
| TTS WebSocket | `wss://api.eu.deepgram.com` | `_deepgram_inference_urls()` |

Diese URLs werden NICHT von ba2bcf0 berührt.

---

## Impact auf Deepgram 2 (`deepgram_2`) und Deepgram 3 (`deepgram_3`)

### Frage 2: Was würde sich für Activi's Deepgram 2 und Deepgram 3 ändern?

**Antwort:** Minimale Änderung, keine URL/Endpoint-Änderungen

#### Deepgram 2 und 3 existieren NUR bei Activi

**Upstream ba2bcf0:** 0 Treffer für `Deepgram2STTConfiguration` oder `Deepgram3STTConfiguration`

**Activi pre-pre-main:** Beide Klassen existieren in `registry.py`:
- `Deepgram2STTConfiguration` (Zeilen 1527-1555)
- `Deepgram3STTConfiguration` (Zeilen 1559-1587)

#### Was würde sich ändern?

| Komponente | Änderung durch ba2bcf0 |
|------------|------------------------|
| `DEEPGRAM_STT_MODELS` | `nova-3-medical` wird hinzugefügt |
| Deepgram 2 model examples | Zeigt automatisch `nova-3-medical` (referenziert `DEEPGRAM_STT_MODELS`) |
| Deepgram 3 model examples | Zeigt automatisch `nova-3-medical` (referenziert `DEEPGRAM_STT_MODELS`) |
| Deepgram 2 `model_options` | **UNVERÄNDERT** (ba2bcf0 kennt diese Klasse nicht) |
| Deepgram 3 `model_options` | **UNVERÄNDERT** (ba2bcf0 kennt diese Klasse nicht) |
| Deepgram 2/3 Base URL | **UNVERÄNDERT** (EU via `_deepgram_inference_urls()`) |

#### Empfehlung für vollständigen Port

Nach dem ba2bcf0 Port sollten manuell folgende Änderungen ergänzt werden:

**`Deepgram2STTConfiguration.language.json_schema_extra.model_options`:**
```python
"model_options": {
    "nova-3-general": DEEPGRAM_LANGUAGES,
    "nova-3-medical": DEEPGRAM_LANGUAGES,  # <-- hinzufügen
    "flux-general-en": ("en",),
    "flux-general-multi": DEEPGRAM_FLUX_MULTILINGUAL_LANGUAGE_OPTIONS,
},
```

**`Deepgram3STTConfiguration.language.json_schema_extra.model_options`:**
```python
"model_options": {
    "nova-3-general": DEEPGRAM_LANGUAGES,
    "nova-3-medical": DEEPGRAM_LANGUAGES,  # <-- hinzufügen
    "flux-general-en": ("en",),
    "flux-general-multi": DEEPGRAM_FLUX_MULTILINGUAL_LANGUAGE_OPTIONS,
},
```

---

## Datei-Impact-Matrix

### Dateien die ba2bcf0 editieren würde

| Datei | Änderung |
|-------|----------|
| `api/services/configuration/options/deepgram.py` | +1 Model in `DEEPGRAM_STT_MODELS` |
| `api/services/configuration/registry.py` | +`allow_custom_input`, +`nova-3-medical` in `DeepgramSTTConfiguration` |

### Dateien die IDENTISCH bleiben

| Datei | Grund |
|-------|-------|
| `api/constants.py` | NICHT in ba2bcf0 enthalten |
| `api/services/pipecat/service_factory.py` | NICHT in ba2bcf0 enthalten |
| `api/.env.example` | NICHT in ba2bcf0 enthalten |
| `Deepgram2STTConfiguration` | Existiert nicht im Upstream |
| `Deepgram3STTConfiguration` | Existiert nicht im Upstream |
| Alle EU-URL Konfigurationen | NICHT in ba2bcf0 enthalten |

### Würde etwas gelöscht/überschrieben?

**NEIN**

- ba2bcf0 ist ein additiver Commit (fügt nur hinzu)
- Keine Activi-Anpassungen werden entfernt
- `DEEPGRAM_BASE_URL` bleibt `api.eu.deepgram.com`
- `_deepgram_inference_urls()` bleibt intakt
- Deepgram 2 / Deepgram 3 Provider bleiben intakt

---

## Residual Risk

| Risiko | Wahrscheinlichkeit | Mitigation |
|--------|-------------------|------------|
| Merge-Konflikt in `registry.py` | Mittel | Zeilen-Nummern unterscheiden sich (Upstream ~1410, Activi ~1500+) |
| `model_options` Inkonsistenz | Niedrig | Manuell `nova-3-medical` zu Deepgram 2/3 hinzufügen |
| Funktionale Regression | Sehr niedrig | ba2bcf0 ändert keine Logik, nur Konfiguration |

---

## Fazit

Der Port von ba2bcf0 ist **sicher** und **empfohlen**:

1. **Keine URL-Änderungen** - EU-Endpoint (`api.eu.deepgram.com`) bleibt unberührt
2. **Keine Löschungen** - Alle Activi-Anpassungen bleiben intakt
3. **Minimaler Diff** - Nur 2 Dateien, additive Änderungen
4. **Deepgram 2/3 unberührt** - Existieren nicht im Upstream, werden nicht überschrieben

**Empfohlene Schritte für den Port:**
1. Cherry-pick oder manuell patchen: `deepgram.py` und `registry.py`
2. Manuell `nova-3-medical` zu Deepgram 2 und Deepgram 3 `model_options` hinzufügen
3. Tests ausführen
4. Review und Merge

---

*Analyse erstellt als READ-ONLY Untersuchung, keine Code-Änderungen außer diesem Dokument.*
