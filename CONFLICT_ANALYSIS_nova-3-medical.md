# Konfliktanalyse: Upstream `nova-3-medical` Port nach DograhV2 pre-pre-main

**Status:** READ-ONLY Draft-Analyse  
**Upstream:** dograh-hq/dograh main commit `ba2bcf0` (Abhishek Kumar, 2026-07-31)  
**Titel:** "feat: add nova-3-medical in Deepgram"  
**Ziel-Branch:** pre-pre-main (Activi Fork)

---

## Verdict: KEIN KONFLIKT / LOW RISK

Der upstream Port von `nova-3-medical` würde **nicht** mit den bestehenden Activi Deepgram 2/3 Provider-Profilen kollidieren. Es handelt sich um eine rein additive Änderung - ein neues Model wird zur Dropdown-Liste hinzugefügt.

---

## Analyse-Zusammenfassung

### 1. Aktuelle Architektur der Deepgram-Provider

Activi hat drei separate Deepgram STT Provider im `ServiceProviders` Enum:

| Provider | Enum Value | UI Titel | Quelle |
|----------|------------|----------|--------|
| `ServiceProviders.DEEPGRAM` | `"deepgram"` | "Deepgram" | Upstream |
| `ServiceProviders.DEEPGRAM_2` | `"deepgram_2"` | "Deepgram 2" | Activi PR #38 |
| `ServiceProviders.DEEPGRAM_3` | `"deepgram_3"` | "Deepgram 3" | Activi PR #39/#46 |

**Wichtig:** Diese drei Provider sind **unabhängige Einträge** in der Registry. Sie teilen sich denselben `DEEPGRAM_STT_MODELS` Tuple für die Model-Auswahl, aber jeder Provider hat eigene Konfigurationsklassen und Factory-Logik.

### 2. Aktueller Stand von `DEEPGRAM_STT_MODELS`

Datei: `api/services/configuration/options/deepgram.py`

```python
DEEPGRAM_FLUX_MODELS = ("flux-general-en", "flux-general-multi")
DEEPGRAM_STT_MODELS = ("nova-3-general", *DEEPGRAM_FLUX_MODELS)
# Ergebnis: ("nova-3-general", "flux-general-en", "flux-general-multi")
```

`nova-3-medical` existiert **nicht** im aktuellen pre-pre-main Branch.

### 3. Upstream-Änderung (ba2bcf0)

Der upstream Commit würde hinzufügen:

**In `api/services/configuration/options/deepgram.py`:**
```python
DEEPGRAM_STT_MODELS = ("nova-3-general", "nova-3-medical", *DEEPGRAM_FLUX_MODELS)
```

**In `api/services/configuration/registry.py`:**
```python
# model_options Mapping für Language-Dropdown
"model_options": {
    "nova-3-general": DEEPGRAM_LANGUAGES,
    "nova-3-medical": DEEPGRAM_LANGUAGES,  # NEU
    "flux-general-en": ("en",),
    "flux-general-multi": DEEPGRAM_FLUX_MULTILINGUAL_LANGUAGE_OPTIONS,
}
```

### 4. Factory Routing Analyse

Datei: `api/services/pipecat/service_factory.py`

Das Factory Routing unterscheidet **nach Provider und Model-Typ**, nicht nach Model-Name:

```python
if user_config.stt.provider in {
    ServiceProviders.DEEPGRAM.value,
    ServiceProviders.DEEPGRAM_2.value,
    ServiceProviders.DEEPGRAM_3.value,
}:
    if user_config.stt.model in DEEPGRAM_FLUX_MODELS:
        # → DeepgramFluxSTTService (für flux-general-en, flux-general-multi)
    else:
        # → DeepgramSTTService (für nova-3-general, nova-3-medical)
```

**Entscheidend:** `nova-3-medical` ist NICHT in `DEEPGRAM_FLUX_MODELS`, daher würde es automatisch korrekt als Nova-3 Model geroutet werden → `DeepgramSTTService`.

### 5. Deepgram 2 und Deepgram 3 Unterschiede

Die drei Provider unterscheiden sich in der **Settings-Konfiguration**, nicht im Model-Routing:

| Provider | Unterschied |
|----------|-------------|
| DEEPGRAM | Basis-Konfiguration: `endpointing=100`, keyterm support |
| DEEPGRAM_2 | + `smart_format=True`, `interim_results=True`, `punctuate=True` |
| DEEPGRAM_3 | + `numerals=True`, `interim_results=False`, `diarize=False`, `endpointing=400`, `vad_events=True` |

**Alle drei Provider können alle Models aus `DEEPGRAM_STT_MODELS` verwenden** - das schließt `nova-3-medical` ein.

---

## Dateien die ein späterer Port ändern würde

| Datei | Änderung |
|-------|----------|
| `api/services/configuration/options/deepgram.py` | `nova-3-medical` zu `DEEPGRAM_STT_MODELS` hinzufügen |
| `api/services/configuration/registry.py` | `model_options` Mapping für alle drei Deepgram STT Konfigurationen aktualisieren (3x) |
| `docs/api-reference/openapi.json` | Auto-regeneriert nach Backend-Änderung |
| `ui/src/client/types.gen.ts` | Auto-regeneriert nach OpenAPI-Änderung |

**Keine Änderungen an:**
- `api/services/pipecat/service_factory.py` (Factory erkennt nova-3-medical automatisch korrekt)
- Provider-Enum oder Provider-Klassen
- Base-URL oder EU-Endpoint Konfiguration
- Bestehende Workflow-Defaults

---

## Beantwortung der Kernfragen

### Würde nova-3-medical Defaults für bestehende Workflows ändern?

**NEIN.** Bestehende Workflows die Deepgram / Deepgram 2 / Deepgram 3 mit `nova-3-general` oder Flux-Models nutzen, bleiben vollständig unverändert. Der neue Model-Eintrag ist rein additiv.

### Würde Factory-Code nova-3-medical als Deepgram 3 behandeln?

Das Model-Routing ist **Provider-agnostisch**. Alle drei Provider (DEEPGRAM, DEEPGRAM_2, DEEPGRAM_3) könnten nova-3-medical nutzen. Das Model wird als Nova-3 (nicht Flux) erkannt und korrekt an `DeepgramSTTService` geroutet.

### Würde Deepgram 3 Routing brechen?

**NEIN.** Deepgram 3 Routing basiert auf `provider == ServiceProviders.DEEPGRAM_3.value`, nicht auf dem Model-Namen. Deepgram 3 würde nova-3-medical genauso behandeln wie nova-3-general (mit seinen spezifischen Settings: `numerals=True`, `interim_results=False`, etc.).

### UI/Schema Impact?

- **Model-Dropdown:** Ein neuer Eintrag "nova-3-medical" erscheint in allen drei Deepgram STT Provider-Dropdowns
- **Language-Dropdown:** Model-spezifische Sprachen für nova-3-medical (gleich wie nova-3-general)
- **Kein Breaking Change:** Existing configs validieren weiterhin

---

## Was wurde NICHT geändert (Constraints eingehalten)

- ✅ Kein STT-Code modifiziert
- ✅ Keine Registry-Änderungen
- ✅ Keine Factory-Änderungen
- ✅ Keine UI-Änderungen
- ✅ Keine Workflow-Defaults geändert
- ✅ Kein Merge durchgeführt
- ✅ pre-main und main nicht berührt
- ✅ Activi Customizations (deepgram_2, deepgram_3, base URL, EU, branding) bleiben erhalten

---

## Residual Risk bei späterem Port

| Risiko | Wahrscheinlichkeit | Mitigierung |
|--------|-------------------|-------------|
| Model-Name Typo bei Port | Niedrig | String exakt aus upstream übernehmen: `"nova-3-medical"` |
| Vergessene model_options Zeile | Niedrig | Alle 3 STT Configs aktualisieren (DeepgramSTTConfiguration, Deepgram2STTConfiguration, Deepgram3STTConfiguration) |
| OpenAPI/Types nicht regeneriert | Niedrig | Nach Backend-Änderung `scripts/dump_docs_openapi` ausführen |
| Language support abweicht von upstream | Minimal | Upstream nutzt `DEEPGRAM_LANGUAGES` - identisch zu nova-3-general |

---

## Empfehlung

Der Port kann bei Bedarf **sicher durchgeführt** werden. Die Änderung ist minimal, additiv, und beeinflusst keine bestehenden Workflows oder Activi-spezifischen Anpassungen.

**Vorgeschlagene Port-Reihenfolge:**
1. `api/services/configuration/options/deepgram.py` - Model hinzufügen
2. `api/services/configuration/registry.py` - 3x model_options aktualisieren
3. OpenAPI und Types regenerieren
4. Tests für nova-3-medical in `api/tests/test_deepgram_flux_service_factory.py` hinzufügen

---

*Analyse erstellt: 2026-08-18*  
*Branch: cursor/nova-3-medical-conflict-analysis-2fb1*  
*Base: pre-pre-main*
