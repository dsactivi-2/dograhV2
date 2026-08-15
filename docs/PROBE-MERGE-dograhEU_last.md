# Merge Probe: dograhEU_last → dograhV2

**Datum:** 2026-08-15  
**Merge-Basis:** `69db8a35f0e7804e9ad27e95e52bbd0bd26956e9`  
**dograhEU_last HEAD:** `66ab884` (34 Commits seit Merge-Basis)  
**dograhV2 main HEAD:** `ac7c0a3`

## Zusammenfassung

Der Merge wurde mit der Strategie "keep ours" für alle Konflikte durchgeführt, um die dograhV2-Anpassungen zu erhalten. **main wurde NICHT verändert** - dieser Branch ist nur ein Probe-Branch.

### Merge-Statistik
- **250 Dateien geändert**
- +20.646 Zeilen hinzugefügt, -1.892 Zeilen entfernt
- 39 Konflikt-Dateien (29 Inhalts-Konflikte, 10 Delete/Update-Konflikte)

## Konflikt-Auflösung (alle behalten dograhV2/ours)

### Inhalts-Konflikte (UU) - 29 Dateien

| Datei | Kategorie |
|-------|-----------|
| `.github/workflows/api-tests.yml` | CI |
| `.github/workflows/pre-pr-drift-check.yml` | CI |
| `.release-please-manifest.json` | Release |
| `CHANGELOG.md` | Docs |
| `api/pyproject.toml` | Config |
| `api/routes/organization.py` | API |
| `api/routes/public_embed.py` | API |
| `api/routes/webrtc_signaling.py` | API |
| `api/services/pipecat/pre_call_fetch.py` | Pipecat |
| `api/services/pipecat/service_factory.py` | Pipecat |
| `api/services/quota_service.py` | Services |
| `api/services/telephony/base.py` | Telephony |
| `api/services/telephony/providers/cloudonix/provider.py` | Telephony |
| `api/services/workflow/qa/analysis.py` | Workflow |
| `api/services/workflow/qa/node_summary.py` | Workflow |
| `api/services/workflow/text_chat_runner.py` | Workflow |
| `api/tests/test_pipecat_engine_variable_extraction.py` | Tests |
| `api/tests/test_pre_call_fetch.py` | Tests |
| `api/tests/test_qa_analysis_non_dict_response.py` | Tests |
| `api/tests/test_telephony_factory.py` | Tests |
| `docs/api-reference/openapi.json` | Docs |
| `sdk/python/src/dograh_sdk/_generated_models.py` | SDK |
| `ui/package.json` | UI Config |
| `ui/public/embed/dograh-widget.js` | UI |
| `ui/src/app/workflow/[workflowId]/components/EmbedDialog.tsx` | UI |
| `ui/src/client/index.ts` | UI Client |
| `ui/src/client/sdk.gen.ts` | UI Client |
| `ui/src/client/types.gen.ts` | UI Client |
| `pipecat` (Submodule) | Submodule |

### Delete/Update-Konflikte (DU) - 10 Dateien (behalten: gelöscht)

Diese Dateien wurden in dograhV2 gelöscht, aber in dograhEU_last geändert. Sie bleiben gelöscht:

| Datei | Auswirkung |
|-------|------------|
| `api/routes/public_embed_chat.py` | Embed-Chat-Feature entfernt |
| `api/schemas/embed_chat.py` | Embed-Chat-Schemas entfernt |
| `api/services/workflow/embed_text_chat_service.py` | Embed-Text-Chat-Service entfernt |
| `api/services/workflow/initial_context.py` | **⚠️ KRITISCH** - wird von anderem Code referenziert |
| `api/tests/telephony/test_phone_number_validation.py` | Tests entfernt |
| `api/tests/test_public_embed_chat.py` | Tests entfernt |
| `api/tests/test_qa_usage_context.py` | Tests entfernt |
| `ui/src/constants/embedExamples.test.ts` | UI-Tests entfernt |
| `ui/src/constants/embedExamples.ts` | Embed-Beispiele entfernt |
| `ui/src/lib/publicEmbedWidget.test.ts` | UI-Tests entfernt |

## Test- und Build-Ergebnisse

### API Linting (ruff)
```
Status: ⚠️ 3.236 Fehler
```
Die meisten sind automatisch behebbare Formatierungs-Issues (`--fix` verfügbar).

### UI ESLint
```
Status: ✅ BESTANDEN
Keine Fehler oder Warnungen
```

### UI Build (next build)
```
Status: ❌ FEHLGESCHLAGEN

Fehler:
1. '"@/client/sdk.gen"' has no exported member named 
   'reactivateTelephonyConfigurationApiV1OrganizationsTelephonyConfigsConfigIdReactivatePost'
   
2. '"@/client/sdk.gen"' has no exported member named 
   'endTextChatSessionApiV1WorkflowWorkflowIdTextChatSessionsRunIdEndPost'
```

**Ursache:** Das SDK (sdk.gen.ts) wurde bei "keep ours" auf der dograhV2-Version gehalten, aber neuer UI-Code aus dograhEU_last erwartet neue API-Endpunkte, die dort definiert wurden.

### API Tests (pytest)
```
Status: ❌ FEHLGESCHLAGEN

Fehler:
ModuleNotFoundError: No module named 'api.services.workflow.initial_context'
```

**Ursache:** Die Datei `api/services/workflow/pipecat_engine.py` wurde automatisch gemergt und enthält nun einen Import:
```python
from api.services.workflow.initial_context import GREETING_OVERRIDE_CONTEXT_KEY
```

Diese Datei existiert aber nicht, weil sie in dograhV2 gelöscht wurde (DU-Konflikt).

## Kritische Probleme für manuelle Behebung

### 1. Fehlender Import: initial_context.py

**Problem:** `pipecat_engine.py` importiert von einer gelöschten Datei.

**Optionen:**
- A) Die Datei `initial_context.py` wiederherstellen und in V2 integrieren
- B) Den Import entfernen und `GREETING_OVERRIDE_CONTEXT_KEY` inline definieren
- C) Das Feature komplett entfernen, falls nicht benötigt

**Betroffener Code:**
```python
# api/services/workflow/pipecat_engine.py Zeile 44
from api.services.workflow.initial_context import GREETING_OVERRIDE_CONTEXT_KEY

# api/services/workflow/pipecat_engine.py Zeile 692
override = self._call_context_vars.get(GREETING_OVERRIDE_CONTEXT_KEY)
```

### 2. SDK-API-Mismatch

**Problem:** UI-Code erwartet API-Endpunkte, die im SDK nicht generiert wurden.

**Fehlende Exports:**
- `reactivateTelephonyConfigurationApiV1OrganizationsTelephonyConfigsConfigIdReactivatePost`
- `endTextChatSessionApiV1WorkflowWorkflowIdTextChatSessionsRunIdEndPost`

**Optionen:**
- A) SDK neu generieren mit allen API-Endpunkten
- B) Die referenzierenden UI-Komponenten anpassen/entfernen
- C) Die fehlenden Endpunkte manuell in der API implementieren

### 3. Embed-Chat-Feature entfernt

Mehrere Dateien für das Embed-Chat-Feature wurden in V2 gelöscht. Falls dieses Feature upstream aktiv entwickelt wird, muss entschieden werden ob:
- A) Das Feature wieder eingebunden wird
- B) Das Feature bewusst ausgeschlossen bleibt

## Was funktioniert

1. **Git-Status:** Merge-Commit erfolgreich erstellt
2. **UI Linting:** Keine ESLint-Fehler
3. **Dependencies:** Alle npm/pip-Pakete installierbar
4. **Submodule:** pipecat-Submodule auf dograhV2-Version (555a9b2)

## Nächste Schritte (manuell erforderlich)

1. **Import-Fehler beheben:** `initial_context.py` entscheiden
2. **SDK regenerieren:** Oder UI-Code anpassen
3. **Ruff-Fixes anwenden:** `ruff check --fix api/` ausführen
4. **Tests erneut laufen lassen:** Nach Behebung der Import-Fehler

## Hinweis

**main wurde NICHT verändert.** Alle Änderungen sind nur auf dem Probe-Branch `cursor/probe-merge-dograhEU-last-ceb3`. Der Branch kann sicher gelöscht oder für weitere Analyse verwendet werden.
