# Delta-Vergleich: dograhV2 vs. dograhEU_last

**Erstellt:** 2026-08-14  
**Aktualisiert:** 2026-08-14 (Kategorie-1-Verifizierung + Abhängigkeitsanalyse + Brückenanalyse)  
**Vergleich:** `dsactivi-2/dograhV2` (main) ↔ `dsactivi-2/dograhEU_last` (main)

---

## Kategorie-1-Verifizierung (2026-08-14)

### Methode

Für jede Datei in Kategorie 1 wurde geprüft:

```bash
git diff --quiet 69db8a3..main -- "<datei>"
```

- **Exit 0** = Datei unverändert auf V2 seit Merge-Base → korrekt in Kategorie 1
- **Exit 1** = Datei wurde auf V2 geändert → fälschlich kategorisiert

### Ergebnis

| Liste | Anzahl | Beschreibung |
|-------|--------|--------------|
| **A) Wirklich unberührt auf V2** | 219 | Nur ältere Originalversion, Fork ist neuer |
| **B) Auch auf V2 geändert (fälschlich kategorisiert)** | 0 | — |

### Urteil

**✅ Kategorie 1 ist unberührt: JA**

Alle 219 Dateien in Kategorie 1 sind wirklich unberührt auf dograhV2 seit der Merge-Base `69db8a3`. Die ursprüngliche Kategorisierung war korrekt.

### Bestätigung der 70 "in beiden geändert" Dateien

Die 70 Dateien in der Sektion "Dateien mit Änderungen in beiden Branches" sind:
- **NICHT in Liste A** (per Definition — sie bilden eine separate Kategorie)
- Dies sind die **einzigen** Dateien, die Den_is mit Upstream teilt und selbst geändert hat
- Anzahl bestätigt: **70 Dateien**

---

## Abhängigkeitsanalyse: Auto-PR der 219 Kategorie-1-Dateien (2026-08-14)

### Fragestellung

Kann ein Auto-PR der 219 Kategorie-1-Dateien (unberührt auf V2) die Funktionen treffen, die Den_is in den 70 Overlap-Dateien und/oder den 231 Kategorie-2-Dateien (local-only) angepasst hat?

### Methode

1. Für alle V2-geänderten Python-Dateien (82 API-Dateien): Import-Statements extrahiert
2. Geprüft, welche Kategorie-1-Module direkt importiert werden
3. Für UI-Dateien: TypeScript-Imports auf K1-Typen/Komponenten geprüft
4. Hochkoppelnde Bereiche priorisiert: Telephony, LLM, DTO, Schemas, Migrationen

### Urteil

**⚠️ JA — Auto-PR der 219 kann angepasste Funktionen treffen.**

Von den 219 Kategorie-1-Dateien werden **30 Dateien** direkt von V2-geändertem Code importiert oder referenziert. Diese Dateien haben **Breaking-Change-Potenzial**.

| Liste | Anzahl | Beschreibung |
|-------|--------|--------------|
| **C) Runtime-safe** | 189 | Keine Inbound-Nutzung von V2-Code, isoliert (Docs, CI, Tests, neue Features) |
| **D) V2-Code hängt davon ab** | 30 | Import-, API-, Config- oder Prozess-Kopplung mit V2-geändertem Code |

---

## Brückenanalyse: Ist die Isolation der 189 echt? (2026-08-14)

### Fragestellung

Die 189 Dateien (Liste C) haben keine DIREKTE Inbound-Nutzung von V2-geändertem Code. Die 30 (Liste D) koppeln mit V2. Aber: **Ist die Isolation eine Illusion, weil die 30 in der Mitte sitzen?**

### Analyse-Richtungen

1. **30 → 189**: Importieren die upstream-Versionen der 30 D-Dateien etwas aus den 189 C-Dateien?
2. **189 → 30**: Importieren die 189 C-Dateien etwas aus den 30 D-Dateien?

### Urteil

**⚠️ NEIN — Die Isolation der 189 ist NICHT echt. Es gibt eine Brücke.**

| Liste | Anzahl | Beschreibung |
|-------|--------|--------------|
| **E) C-Dateien die D-Dateien importieren (189 → 30)** | 44 | Diese C-Dateien brechen, wenn D für V2 angepasst wird |
| **F) D-Dateien die C-Dateien importieren (30 → 189)** | 11 | Upstream-D braucht diese C-Dateien zum Funktionieren |

**Schlussfolgerung**: Wenn die 30 D-Dateien für V2 angepasst werden (statt verbatim von upstream zu übernehmen), dann sind **44 der 189 C-Dateien** bei späterem Auto-PR nicht mehr sicher — sie erwarten das unveränderte upstream-D.

---

## Was sich in den 30 D-Dateien geändert hat (thematisch)

### 1. Pre-Call-Fetch-Migration (`dto.py`, `types.ts`, `workflow-configurations.ts`)

| Alt | Neu | Impact |
|-----|-----|--------|
| `pre_call_fetch_enabled: bool` | `pre_call_fetch_mode: "disabled" \| "always" \| "inbound" \| "outbound"` | V2-Code nutzt noch das alte Boolean-Feld |

### 2. Telephony-Inactive-Status (`db/models.py`, Migration)

| Alt | Neu | Impact |
|-----|-----|--------|
| — | `inactive`, `inactive_since`, `inactive_reason` Spalten | Migration muss vor Code laufen; V2-Provider-Code kennt diese Felder nicht |

### 3. Organization-Bootstrap (`auth/depends.py`, `organization_bootstrap.py`)

| Alt | Neu | Impact |
|-----|-----|--------|
| Kein automatisches Bootstrapping | `ensure_organization_bootstrapped()` bei Auth | Org-Provisioning passiert automatisch; V2 hat eigene Auth-Logik |

### 4. Tracing-Konfiguration (`tracing_config.py`)

| Alt | Neu | Impact |
|-----|-----|--------|
| `register_org(org_id, host, pk, sk)` | `register_org(org_id, host, pk, sk, project_id=None)` | Signatur geändert; `normalize_langfuse_host()` hinzugefügt |

### 5. Template-Renderer (`template_renderer.py`)

| Alt | Neu | Impact |
|-----|-----|--------|
| Einfache String-Substitution | `_resolve_template_value()` mit Filter-Support, URL-Encoding | Mehr Funktionalität; V2-Code könnte inkompatible Variablen erwarten |

### 6. Text-Chat-Session (`text_chat_session_service.py`)

| Alt | Neu | Impact |
|-----|-----|--------|
| Einfache Session-Verwaltung | `complete_text_chat_session()` mit Artifact-Upload | 190 Zeilen geändert; V2-Text-Chat-Code könnte inkompatibel sein |

### 7. Gemini-Adapter (`gemini_json_schema_adapter.py`)

| Alt | Neu | Impact |
|-----|-----|--------|
| Nur `DograhGeminiJSONSchemaAdapter` | + `DograhGeminiLiveJSONSchemaAdapter` | Neue Klasse für Gemini Live; V2-Realtime-Code könnte diese erwarten |

### 8. ARQ-Tasks (`arq.py`, `function_names.py`)

| Alt | Neu | Impact |
|-----|-----|--------|
| Vorherige Task-Liste | Neue Tasks: `text_chat_inactivity`, etc. | Background-Task-Registrierung geändert |

### 9. Router-Änderungen (`routes/auth.py`, `workflow.py`, etc.)

| Alt | Neu | Impact |
|-----|-----|--------|
| Vorherige Endpunkte | Neue Parameter, Bootstrap-Integration | V2 hat eigene Route-Erweiterungen in main.py |

### 10. Workflow-Configurations-Schema (`schemas/workflow_configurations.py`)

| Alt | Neu | Impact |
|-----|-----|--------|
| Vorheriges Schema | `text_chat_inactivity_timeout_seconds`, `external_pbx_lead_headers` | Neue Felder; V2-Code könnte diese nicht validieren |

---

## Liste E: C-Dateien die D-Dateien importieren (44 Dateien)

Diese Dateien aus Liste C sind **nicht mehr safe für Auto-PR**, wenn die 30 D-Dateien für V2 angepasst werden.

### API / Services (12 Dateien)

| C-Datei | Importiert D-Datei | Kopplungsart |
|---------|-------------------|--------------|
| `api/db/organization_configuration_client.py` | `db/models.py` | Import |
| `api/db/telephony_phone_number_client.py` | `db/models.py` | Import |
| `api/db/workflow_client.py` | `db/models.py` | Import |
| `api/db/workflow_run_text_session_client.py` | `db/models.py` | Import |
| `api/schemas/tool.py` | `enums.py` | Import |
| `api/services/pipecat/realtime/gemini_live.py` | `gemini_json_schema_adapter.py` | Import |
| `api/services/telephony/ari_manager.py` | `enums.py`, `logging_config.py` | Import |
| `api/services/tool_management.py` | `db/models.py`, `enums.py` | Import |
| `api/services/workflow/tools/custom_tool.py` | `template_renderer.py` | Import |
| `api/services/workflow/tools/transfer_resolver.py` | `template_renderer.py` | Import |
| `api/tasks/run_integrations.py` | `db/models.py`, `dto.py`, `tracing_config.py`, `function_names.py`, `template_renderer.py` | Import |
| `api/tasks/webhook_delivery.py` | `db/models.py`, `function_names.py` | Import |

### API / Tests (17 Dateien)

| C-Datei | Importiert D-Datei |
|---------|-------------------|
| `api/tests/integrations/test_run_pipeline.py` | `enums.py` |
| `api/tests/integrations/test_run_pipeline_text_greeting.py` | `enums.py` |
| `api/tests/test_ai_model_configuration_v2.py` | `ai_model_configuration.py` |
| `api/tests/test_custom_tools.py` | `enums.py`, `pipecat_engine_custom_tools.py` |
| `api/tests/test_gemini_json_schema_adapter.py` | `gemini_json_schema_adapter.py` |
| `api/tests/test_masked_key_rejection.py` | `routes/user.py`, `auth/depends.py`, `ai_model_configuration.py` |
| `api/tests/test_mcp_tool_route.py` | `routes/tool.py` |
| `api/tests/test_node_specs.py` | `dto.py` |
| `api/tests/test_pipecat_engine_end_call.py` | `enums.py`, `dto.py`, `pipecat_engine_custom_tools.py` |
| `api/tests/test_realtime_feedback_observer.py` | `realtime_feedback_observer.py` |
| `api/tests/test_run_integrations_webhook.py` | `db/models.py`, `dto.py` |
| `api/tests/test_text_and_audio_playback.py` | `dto.py`, `pipecat_engine_custom_tools.py` |
| `api/tests/test_text_chat_session_service.py` | `db/models.py`, `text_chat_session_service.py` |
| `api/tests/test_user_configuration_validation.py` | `ai_model_configuration.py` |
| `api/tests/test_workflow_configurations_schema.py` | `workflow_configurations.py` |
| `api/tests/test_workflow_create_route.py` | `routes/workflow.py`, `auth/depends.py` |
| `api/tests/test_workflow_versioning.py` | `db/models.py` |

### UI (15 Dateien)

| C-Datei | Importiert D-Datei | Kopplungsart |
|---------|-------------------|--------------|
| `ui/src/app/telephony-configurations/[configId]/page.tsx` | `ConfigFormDialog.tsx` | Import |
| `ui/src/app/telephony-configurations/page.tsx` | `ConfigFormDialog.tsx` | Import |
| `ui/src/app/tools/[toolUuid]/components/HttpApiToolConfig.tsx` | `http/index.ts` | Import |
| `ui/src/app/tools/[toolUuid]/components/http-tool-test/helpers.ts` | `http/index.ts` | Type-Import |
| `ui/src/app/tools/[toolUuid]/components/http-tool-test/HttpToolTestDialog.tsx` | `http/index.ts` | Type-Import |
| `ui/src/app/tools/[toolUuid]/components/TransferCallToolConfig.tsx` | `http/index.ts` | Import |
| `ui/src/app/tools/[toolUuid]/page.tsx` | `http/index.ts` | Import |
| `ui/src/app/workflow/[workflowId]/components/ConfigurationsDialog.tsx` | `workflow-configurations.ts` | Type-Import |
| `ui/src/app/workflow/[workflowId]/hooks/useWorkflowState.ts` | `flow/types.ts` | Type-Import |
| `ui/src/app/workflow/[workflowId]/page.tsx` | `flow/types.ts`, `workflow-configurations.ts` | Type-Import |
| `ui/src/app/workflow/[workflowId]/RenderWorkflow.tsx` | `flow/types.ts`, `workflow-configurations.ts` | Type-Import |
| `ui/src/app/workflow/[workflowId]/run/[runId]/hooks/useWebSocketRTC.tsx` | `flow/types.ts` | Type-Import |
| `ui/src/app/workflow/[workflowId]/settings/page.tsx` | `flow/types.ts`, `workflow-configurations.ts` | Type-Import |
| `ui/src/components/flow/nodes/GenericNode.tsx` | `flow/types.ts` | Type-Import |
| `ui/src/components/ServiceConfigurationForm.tsx` | `workflow-configurations.ts` | Type-Import |

---

## Liste F: D-Dateien die C-Dateien importieren (11 Dateien)

Die upstream-Versionen dieser D-Dateien **brauchen** die folgenden C-Dateien zum Funktionieren:

| D-Datei | Braucht aus Liste C |
|---------|---------------------|
| `api/routes/auth.py` | `services/organization_bootstrap.py` |
| `api/routes/telephony.py` | `errors/failure.py`, `errors/telephony_errors.py` |
| `api/routes/tool.py` | `schemas/tool.py`, `services/tool_management.py`, `workflow/tools/custom_tool.py` |
| `api/routes/user.py` | `errors/failure.py`, `errors/mps.py`, `schemas/widget_texts.py` |
| `api/routes/workflow.py` | `services/workflow/configuration_policy.py` |
| `api/schemas/telephony_config.py` | `telephony/providers/cloudonix/config.py` |
| `api/services/auth/depends.py` | `services/organization_bootstrap.py` |
| `api/services/pipecat/realtime_feedback_observer.py` | `errors/failure.py` |
| `api/services/workflow/pipecat_engine_custom_tools.py` | `workflow/tools/custom_tool.py`, `workflow/tools/transfer_resolver.py` |
| `api/services/workflow/text_chat_session_service.py` | `db/workflow_run_text_session_client.py` |
| `api/tasks/arq.py` | `tasks/run_integrations.py`, `tasks/text_chat_inactivity.py`, `tasks/webhook_delivery.py` |

---

## Zusammenfassung: Welche der 189 sind wirklich safe?

| Kategorie | Anzahl | Beschreibung |
|-----------|--------|--------------|
| **Wirklich safe (C ohne E)** | 145 | Keine Brücke — Docs, CI, reine neue Features, Tests ohne D-Imports |
| **Brücke vorhanden (Liste E)** | 44 | Importieren D-Dateien — brechen wenn D für V2 angepasst wird |

### Wirklich safe für Auto-PR (145 Dateien)

Die verbleibenden **145 Dateien** aus Liste C, die NICHT in Liste E sind:
- Alle Dokumentation (docs/)
- Alle CI/GitHub-Workflows (.github/)
- Alle SDK-Dateien (sdk/)
- Alle VSCode-Config (.vscode/)
- Alle Agents/Skills (.agents/)
- Neue isolierte Features (Noveum, VICIdial, Cloudonix-Provisioning, etc.)
- Tests die nur C-Module testen (nicht D)

---

## Liste C: Runtime-safe für Auto-PR (189 Dateien)

Diese Dateien können sicher automatisch angewendet werden — keine V2-geänderte Datei importiert oder referenziert sie direkt.

<details>
<summary>Vollständige Liste C anzeigen (klicken zum Aufklappen)</summary>

### Dokumentation / CI / Config (24 Dateien)
- `.agents/skills/merge-pipecat-upstream/SKILL.md`
- `.agents/skills/review-agents-md/references/dograh-seams.md`
- `.agents/skills/review-agents-md/scripts/inventory_agents_md.py`
- `.agents/skills/review-pr/SKILL.md`
- `.github/workflows/docker-image.yml`
- `.github/workflows/release-deployment.yml`
- `.vscode/launch.json`
- `.vscode/tasks.json`
- `api/AGENTS.md`
- `docs/api-reference/campaigns/upload-contacts.mdx`
- `docs/api-reference/runs/trigger.mdx`
- `docs/api-reference/runs/trigger-workflow.mdx`
- `docs/core-concepts/campaigns.mdx`
- `docs/images/noveum-api-key.png`
- `docs/images/noveum-edit-modal.png`
- `docs/images/noveum-integrations-panel.png`
- `docs/images/noveum-node-configured.png`
- `docs/images/noveum-trace-detail.png`
- `docs/integrations/noveum.mdx`
- `docs/integrations/telephony/vicidial.mdx`
- `docs/voice-agent/api-trigger.mdx`
- `docs/voice-agent/pre-call-data-fetch.mdx`
- `docs/voice-agent/start-call.mdx`
- `docs/voice-agent/template-variables.mdx`
- `docs/voice-agent/tools/call-transfer.mdx`

### Scripts (6 Dateien)
- `scripts/fix_broken_langfuse_trace_urls.py`
- `scripts/rolling_update.sh`
- `scripts/start_services.sh`
- `scripts/start_services_docker.sh`
- `scripts/worktree-assign-port.sh`
- `scripts/worktree-sync-env.sh`

### SDK (11 Dateien)
- `sdk/python/src/dograh_sdk/typed/__init__.py`
- `sdk/python/src/dograh_sdk/typed/noveum.py`
- `sdk/python/src/dograh_sdk/typed/start_call.py`
- `sdk/python/src/dograh_sdk/typed/trigger.py`
- `sdk/python/src/dograh_sdk/typed/webhook.py`
- `sdk/typescript/src/_generated_models.ts`
- `sdk/typescript/src/typed/index.ts`
- `sdk/typescript/src/typed/noveum.ts`
- `sdk/typescript/src/typed/start-call.ts`
- `sdk/typescript/src/typed/trigger.ts`
- `sdk/typescript/src/typed/webhook.ts`

### API / Neue Features ohne V2-Abhängigkeiten (39 Dateien)
- `api/db/organization_configuration_client.py`
- `api/db/telephony_phone_number_client.py`
- `api/db/workflow_client.py`
- `api/db/workflow_run_text_session_client.py`
- `api/errors/failure.py`
- `api/errors/mps.py`
- `api/errors/telephony_errors.py`
- `api/requirements.txt`
- `api/schemas/tool.py`
- `api/schemas/widget_texts.py`
- `api/services/campaign/sources/csv.py`
- `api/services/configuration/options/sarvam.py`
- `api/services/integrations/noveum/__init__.py`
- `api/services/integrations/noveum/client.py`
- `api/services/integrations/noveum/collector.py`
- `api/services/integrations/noveum/completion.py`
- `api/services/integrations/noveum/node.py`
- `api/services/integrations/noveum/runtime.py`
- `api/services/integrations/registry.py`
- `api/services/organization_bootstrap.py`
- `api/services/pipecat/realtime/gemini_live.py`
- `api/services/telephony/ari_manager.py`
- `api/services/telephony/failure_reporting.py`
- `api/services/telephony/providers/ari/external_pbx/base.py`
- `api/services/telephony/providers/ari/external_pbx/vicidial.py`
- `api/services/telephony/providers/cloudonix/__init__.py`
- `api/services/telephony/providers/cloudonix/config.py`
- `api/services/telephony/providers/cloudonix/provisioning.py`
- `api/services/telephony/providers/cloudonix/regions.py`
- `api/services/telephony/providers/twilio/strategies.py`
- `api/services/telephony/registry.py`
- `api/services/tool_management.py`
- `api/services/workflow/configuration_policy.py`
- `api/services/workflow/tools/custom_tool.py`
- `api/services/workflow/tools/transfer_resolver.py`
- `api/services/workflow_run_billing.py`
- `api/tasks/run_integrations.py`
- `api/tasks/text_chat_inactivity.py`
- `api/tasks/webhook_delivery.py`

### API / Tests (61 Dateien)
- `api/tests/integrations/test_run_pipeline.py`
- `api/tests/integrations/test_run_pipeline_text_greeting.py`
- `api/tests/pipecat_test_utils.py`
- `api/tests/telephony/cloudonix/test_provider.py`
- `api/tests/telephony/cloudonix/test_provisioning.py`
- `api/tests/telephony/providers/ari/test_external_pbx.py`
- `api/tests/telephony/test_ari_deactivation.py`
- `api/tests/telephony/test_external_pbx_configuration.py`
- `api/tests/telephony/test_failure_reporting.py`
- `api/tests/telephony/test_inactive_config_routing.py`
- `api/tests/telephony/twilio/test_strategies.py`
- `api/tests/test_ai_model_configuration_v2.py`
- `api/tests/test_auth_depends.py`
- `api/tests/test_backfill_org_model_configuration_v2_migration.py`
- `api/tests/test_campaign_greeting_override.py`
- `api/tests/test_custom_tools.py`
- `api/tests/test_db_layer_boundary.py`
- `api/tests/test_dograh_managed_correlation.py`
- `api/tests/test_failure_classification.py`
- `api/tests/test_failure_emission_seams.py`
- `api/tests/test_gemini_json_schema_adapter.py`
- `api/tests/test_gemini_live_temperature.py`
- `api/tests/test_google_vertex_llm_service_factory.py`
- `api/tests/test_greeting_override.py`
- `api/tests/test_logging_config.py`
- `api/tests/test_masked_key_rejection.py`
- `api/tests/test_mcp_tool_route.py`
- `api/tests/test_md_document_upload.py`
- `api/tests/test_migrate_gemini_2_5_flash_migration.py`
- `api/tests/test_model_configuration_pricing.py`
- `api/tests/test_mps_failure_http.py`
- `api/tests/test_node_specs.py`
- `api/tests/test_noveum_integration.py`
- `api/tests/test_organization_bootstrap.py`
- `api/tests/test_organization_configuration_lease.py`
- `api/tests/test_pipecat_engine_context_update.py`
- `api/tests/test_pipecat_engine_end_call.py`
- `api/tests/test_pipecat_engine_node_switch_with_user_speech.py`
- `api/tests/test_pipecat_engine_tool_calls.py`
- `api/tests/test_pipecat_engine_transition_mute.py`
- `api/tests/test_pipeline_error_handling.py`
- `api/tests/test_qa_llm_config.py`
- `api/tests/test_realtime_feedback_observer.py`
- `api/tests/test_resolve_effective_config.py`
- `api/tests/test_run_integrations_webhook.py`
- `api/tests/test_sarvam_service_factory.py`
- `api/tests/test_service_factory_failure_reporting.py`
- `api/tests/test_text_and_audio_playback.py`
- `api/tests/test_text_chat_inactivity.py`
- `api/tests/test_text_chat_session_service.py`
- `api/tests/test_tool_schema.py`
- `api/tests/test_transfer_context_mapping.py`
- `api/tests/test_transfer_message_playback.py`
- `api/tests/test_tts_endframe_with_audio_write_failure.py`
- `api/tests/test_user_configuration_validation.py`
- `api/tests/test_user_idle_handler.py`
- `api/tests/test_user_muting_during_bot_speech.py`
- `api/tests/test_webrtc_signaling_ice_filter_policies.py`
- `api/tests/test_widget_texts_schema.py`
- `api/tests/test_workflow_configuration_policy.py`
- `api/tests/test_workflow_configurations_schema.py`
- `api/tests/test_workflow_create_route.py`
- `api/tests/test_workflow_run_billing.py`
- `api/tests/test_workflow_versioning.py`

### UI / Neue Komponenten ohne direkte V2-Abhängigkeiten (48 Dateien)
- `ui/.env.example`
- `ui/openapi-ts.config.ts`
- `ui/package-lock.json`
- `ui/scripts/dev-server.mjs`
- `ui/src/app/files/DocumentUpload.tsx`
- `ui/src/app/superadmin/runs/page.tsx`
- `ui/src/app/telephony-configurations/[configId]/page.tsx`
- `ui/src/app/telephony-configurations/page.tsx`
- `ui/src/app/tools/[toolUuid]/components/HttpApiToolConfig.tsx`
- `ui/src/app/tools/[toolUuid]/components/http-tool-test/helpers.test.ts`
- `ui/src/app/tools/[toolUuid]/components/http-tool-test/helpers.ts`
- `ui/src/app/tools/[toolUuid]/components/http-tool-test/HttpToolTestDialog.tsx`
- `ui/src/app/tools/[toolUuid]/components/TransferCallToolConfig.test.tsx`
- `ui/src/app/tools/[toolUuid]/components/TransferCallToolConfig.tsx`
- `ui/src/app/tools/[toolUuid]/page.tsx`
- `ui/src/app/tools/config.tsx`
- `ui/src/app/workflow/[workflowId]/components/ConfigurationsDialog.tsx`
- `ui/src/app/workflow/[workflowId]/components/VersionHistoryPanel.test.tsx`
- `ui/src/app/workflow/[workflowId]/components/VersionHistoryPanel.tsx`
- `ui/src/app/workflow/[workflowId]/components/workflow-tester/ChatComposer.tsx`
- `ui/src/app/workflow/[workflowId]/components/workflow-tester/EmbeddedVoiceTester.test.tsx`
- `ui/src/app/workflow/[workflowId]/components/workflow-tester/EmbeddedVoiceTester.tsx`
- `ui/src/app/workflow/[workflowId]/components/workflow-tester/ManualTextChatPanel.tsx`
- `ui/src/app/workflow/[workflowId]/components/workflow-tester/useTextChatSession.ts`
- `ui/src/app/workflow/[workflowId]/components/WorkflowVersionDiffDialog.test.tsx`
- `ui/src/app/workflow/[workflowId]/components/WorkflowVersionDiffDialog.tsx`
- `ui/src/app/workflow/[workflowId]/hooks/useWorkflowState.ts`
- `ui/src/app/workflow/[workflowId]/page.tsx`
- `ui/src/app/workflow/[workflowId]/RenderWorkflow.tsx`
- `ui/src/app/workflow/[workflowId]/run/[runId]/hooks/useWebSocketRTC.tsx`
- `ui/src/app/workflow/[workflowId]/settings/page.tsx`
- `ui/src/app/workflow/[workflowId]/utils/workflowVersionDiff.test.ts`
- `ui/src/app/workflow/[workflowId]/utils/workflowVersionDiff.ts`
- `ui/src/components/flow/AddNodePanel.tsx`
- `ui/src/components/flow/nodes/GenericNode.tsx`
- `ui/src/components/http/body-template-editor.tsx`
- `ui/src/components/http/url-input.test.ts`
- `ui/src/components/http/url-input.tsx`
- `ui/src/components/ServiceConfigurationForm.tsx`
- `ui/src/components/TelemetrySection.tsx`
- `ui/src/components/telephony/CloudonixOutboundTrunkForm.tsx`
- `ui/src/components/telephony/SipConnectivityCard.test.tsx`
- `ui/src/components/telephony/SipConnectivityCard.tsx`
- `ui/src/lib/auth/providers/StackProviderWrapper.tsx`

</details>

---

## Liste D: V2-Code hängt davon ab (30 Dateien)

Diese Dateien werden direkt von V2-geändertem Code importiert oder referenziert. **Auto-Anwendung kann zu Breaking Changes führen.**

### API / Core-Module mit V2-Abhängigkeiten (24 Dateien)

| Pfad | Wer hängt ab | Kopplungsart | Änderung |
|------|--------------|--------------|----------|
| `api/db/models.py` | 15+ V2-Dateien | Import | Neue Spalten in `TelephonyConfigurationModel`: `inactive`, `inactive_since`, `inactive_reason` |
| `api/db/telephony_configuration_client.py` | `routes/organization.py` | Import | `TelephonyConfigurationInUseError` Exception |
| `api/enums.py` | 12+ V2-Dateien | Import | Neuer Enum-Wert `ORGANIZATION_BOOTSTRAP` |
| `api/logging_config.py` | `app.py` | Import | Logging-Setup-Änderungen |
| `api/routes/auth.py` | `routes/main.py` | Router-Import | Auth-Route-Änderungen |
| `api/routes/campaign.py` | `routes/main.py` | Router-Import | Kampagnen-Route-Änderungen |
| `api/routes/telephony.py` | `routes/main.py` | Router-Import | Telephony-Route-Änderungen |
| `api/routes/tool.py` | `routes/main.py` | Router-Import | Tool-Route-Änderungen |
| `api/routes/user.py` | `routes/main.py` | Router-Import | User-Route-Änderungen |
| `api/routes/workflow.py` | `routes/main.py` | Router-Import | Workflow-Route-Änderungen |
| `api/schemas/telephony_config.py` | `routes/organization.py` | Import | Telephony-Schema-Änderungen |
| `api/schemas/workflow_configurations.py` | `pipecat/run_pipeline.py` | Import | **Neue Felder**: `text_chat_inactivity_timeout_seconds`, `external_pbx_lead_headers` |
| `api/services/auth/depends.py` | 4+ V2-Dateien | Import | Auth-Dependency-Änderungen |
| `api/services/configuration/ai_model_configuration.py` | `routes/organization.py`, `quota_service.py` | Import | AI-Modell-Config-Änderungen |
| `api/services/configuration/options/google.py` | `configuration/registry.py` | Import | `GOOGLE_VERTEX_MODELS` |
| `api/services/pipecat/gemini_json_schema_adapter.py` | `pipecat/service_factory.py` | Import | Neue Klasse `DograhGeminiLiveJSONSchemaAdapter` |
| `api/services/pipecat/realtime_feedback_observer.py` | `pipecat/run_pipeline.py` | Import | Realtime-Feedback-Änderungen |
| `api/services/pipecat/tracing_config.py` | 5+ V2-Dateien | Import | **Signatur-Änderung**: `register_org()` hat neuen Parameter `project_id` |
| `api/services/workflow/dto.py` | 7+ V2-Dateien | Import | **Breaking**: `pre_call_fetch_enabled` → `pre_call_fetch_mode` Migration |
| `api/services/workflow/pipecat_engine_custom_tools.py` | `workflow/pipecat_engine.py` | Import | Custom-Tools-Engine-Änderungen |
| `api/services/workflow/text_chat_session_service.py` | `routes/workflow_text_chat.py` | Import | Text-Chat-Session-Änderungen |
| `api/tasks/arq.py` | `app.py`, `pipecat/event_handlers.py` | Import | ARQ-Task-Änderungen |
| `api/tasks/function_names.py` | `pipecat/event_handlers.py` | Import | Task-Funktionsnamen-Änderungen |
| `api/utils/template_renderer.py` | 2+ V2-Dateien | Import | Template-Renderer-Änderungen |

### Alembic-Migrationen (2 Dateien)

| Pfad | Kopplungsart | Änderung |
|------|--------------|----------|
| `api/alembic/versions/b41f7c9d2e05_migrate_gemini_2_5_flash_to_3_5_flash.py` | DB-Schema | Gemini-Modell-Migration |
| `api/alembic/versions/c7a1e4f93b26_add_telephony_configuration_inactive.py` | DB-Schema | Fügt `inactive`-Spalten zur DB hinzu |

### UI / Typen mit V2-Abhängigkeiten (4 Dateien)

| Pfad | Wer hängt ab | Kopplungsart | Änderung |
|------|--------------|--------------|----------|
| `ui/src/components/flow/types.ts` | 10+ UI-Dateien | Type-Import | **Neuer Typ**: `pre_call_fetch_mode` |
| `ui/src/types/workflow-configurations.ts` | 5+ UI-Dateien | Type-Import | **Neue Felder**: `text_chat_inactivity_timeout_seconds`, `external_pbx_lead_headers` |
| `ui/src/components/http/index.ts` | 5+ UI-Dateien | Re-Export | HTTP-Komponenten-Index |
| `ui/src/components/telephony/ConfigFormDialog.tsx` | Telephony-Pages | Import | Config-Dialog-Änderungen |

---

## Konkrete Beispiele für Breaking-Change-Risiken

### Beispiel 1: `pre_call_fetch_enabled` → `pre_call_fetch_mode`

**K1-Änderung** (`api/services/workflow/dto.py`):
```python
# ALT (noch in V2 verwendet)
pre_call_fetch_enabled: bool = spec_field(default=False)

# NEU (K1)
pre_call_fetch_enabled: bool = spec_field(default=False, spec_exclude=True)  # Legacy
pre_call_fetch_mode: Optional[PreCallFetchMode] = spec_field(default=None)
```

**V2-Code der betroffen ist** (`api/services/pipecat/run_pipeline.py`):
```python
if start_node.pre_call_fetch_enabled:  # Noch der alte Weg
```

**Risiko**: Ohne den Model-Validator könnte V2-Code `pre_call_fetch_enabled=True` setzen, aber der K1-Code erwartet `pre_call_fetch_mode`.

### Beispiel 2: `TelephonyConfigurationModel` neue Spalten

**K1-Änderung** (`api/db/models.py`):
```python
inactive = Column(Boolean, nullable=False, default=False)
inactive_since = Column(DateTime(timezone=True), nullable=True)
inactive_reason = Column(String(255), nullable=True)
```

**Risiko**: Migration `c7a1e4f93b26` muss vor dem Code-Update ausgeführt werden, sonst Fehler bei DB-Queries.

### Beispiel 3: `tracing_config.register_org()` Signatur

**K1-Änderung** (`api/services/pipecat/tracing_config.py`):
```python
# ALT
def register_org(self, org_id, host, public_key, secret_key):

# NEU
def register_org(self, org_id, host, public_key, secret_key, project_id=None):
```

**Risiko**: Abwärtskompatibel (neuer Parameter ist optional), aber Code der `register_org` direkt aufruft, bekommt ggf. unerwartetes Verhalten wenn `project_id` relevant wird.

---

## Liste A: Wirklich unberührt auf V2 (219 Dateien)

<details>
<summary>Vollständige Liste anzeigen (klicken zum Aufklappen)</summary>

### Agents / Skills
- `.agents/skills/merge-pipecat-upstream/SKILL.md`
- `.agents/skills/review-agents-md/references/dograh-seams.md`
- `.agents/skills/review-agents-md/scripts/inventory_agents_md.py`
- `.agents/skills/review-pr/SKILL.md`

### API / Backend
- `api/AGENTS.md`
- `api/alembic/versions/b41f7c9d2e05_migrate_gemini_2_5_flash_to_3_5_flash.py`
- `api/alembic/versions/c7a1e4f93b26_add_telephony_configuration_inactive.py`
- `api/db/models.py`
- `api/db/organization_configuration_client.py`
- `api/db/telephony_configuration_client.py`
- `api/db/telephony_phone_number_client.py`
- `api/db/workflow_client.py`
- `api/db/workflow_run_text_session_client.py`
- `api/enums.py`
- `api/errors/failure.py`
- `api/errors/mps.py`
- `api/errors/telephony_errors.py`
- `api/logging_config.py`
- `api/requirements.txt`
- `api/routes/auth.py`
- `api/routes/campaign.py`
- `api/routes/telephony.py`
- `api/routes/tool.py`
- `api/routes/user.py`
- `api/routes/workflow.py`
- `api/schemas/telephony_config.py`
- `api/schemas/tool.py`
- `api/schemas/widget_texts.py`
- `api/schemas/workflow_configurations.py`

### API / Services
- `api/services/auth/depends.py`
- `api/services/campaign/sources/csv.py`
- `api/services/configuration/ai_model_configuration.py`
- `api/services/configuration/options/google.py`
- `api/services/configuration/options/sarvam.py`
- `api/services/integrations/noveum/__init__.py`
- `api/services/integrations/noveum/client.py`
- `api/services/integrations/noveum/collector.py`
- `api/services/integrations/noveum/completion.py`
- `api/services/integrations/noveum/node.py`
- `api/services/integrations/noveum/runtime.py`
- `api/services/integrations/registry.py`
- `api/services/organization_bootstrap.py`
- `api/services/pipecat/gemini_json_schema_adapter.py`
- `api/services/pipecat/realtime/gemini_live.py`
- `api/services/pipecat/realtime_feedback_observer.py`
- `api/services/pipecat/tracing_config.py`
- `api/services/telephony/ari_manager.py`
- `api/services/telephony/failure_reporting.py`
- `api/services/telephony/providers/ari/external_pbx/base.py`
- `api/services/telephony/providers/ari/external_pbx/vicidial.py`
- `api/services/telephony/providers/cloudonix/__init__.py`
- `api/services/telephony/providers/cloudonix/config.py`
- `api/services/telephony/providers/cloudonix/provisioning.py`
- `api/services/telephony/providers/cloudonix/regions.py`
- `api/services/telephony/providers/twilio/strategies.py`
- `api/services/telephony/registry.py`
- `api/services/tool_management.py`
- `api/services/workflow/configuration_policy.py`
- `api/services/workflow/dto.py`
- `api/services/workflow/pipecat_engine_custom_tools.py`
- `api/services/workflow/text_chat_session_service.py`
- `api/services/workflow/tools/custom_tool.py`
- `api/services/workflow/tools/transfer_resolver.py`
- `api/services/workflow_run_billing.py`
- `api/tasks/arq.py`
- `api/tasks/function_names.py`
- `api/tasks/run_integrations.py`
- `api/tasks/text_chat_inactivity.py`
- `api/tasks/webhook_delivery.py`
- `api/utils/template_renderer.py`

### API / Tests (60+ Dateien)
- `api/tests/integrations/test_run_pipeline.py`
- `api/tests/integrations/test_run_pipeline_text_greeting.py`
- `api/tests/pipecat_test_utils.py`
- `api/tests/telephony/cloudonix/test_provider.py`
- `api/tests/telephony/cloudonix/test_provisioning.py`
- `api/tests/telephony/providers/ari/test_external_pbx.py`
- `api/tests/telephony/test_ari_deactivation.py`
- `api/tests/telephony/test_external_pbx_configuration.py`
- `api/tests/telephony/test_failure_reporting.py`
- `api/tests/telephony/test_inactive_config_routing.py`
- `api/tests/telephony/twilio/test_strategies.py`
- `api/tests/test_ai_model_configuration_v2.py`
- `api/tests/test_auth_depends.py`
- `api/tests/test_backfill_org_model_configuration_v2_migration.py`
- `api/tests/test_campaign_greeting_override.py`
- `api/tests/test_custom_tools.py`
- `api/tests/test_db_layer_boundary.py`
- `api/tests/test_dograh_managed_correlation.py`
- `api/tests/test_failure_classification.py`
- `api/tests/test_failure_emission_seams.py`
- `api/tests/test_gemini_json_schema_adapter.py`
- `api/tests/test_gemini_live_temperature.py`
- `api/tests/test_google_vertex_llm_service_factory.py`
- `api/tests/test_greeting_override.py`
- `api/tests/test_logging_config.py`
- `api/tests/test_masked_key_rejection.py`
- `api/tests/test_mcp_tool_route.py`
- `api/tests/test_md_document_upload.py`
- `api/tests/test_migrate_gemini_2_5_flash_migration.py`
- `api/tests/test_model_configuration_pricing.py`
- `api/tests/test_mps_failure_http.py`
- `api/tests/test_node_specs.py`
- `api/tests/test_noveum_integration.py`
- `api/tests/test_organization_bootstrap.py`
- `api/tests/test_organization_configuration_lease.py`
- `api/tests/test_pipecat_engine_context_update.py`
- `api/tests/test_pipecat_engine_end_call.py`
- `api/tests/test_pipecat_engine_node_switch_with_user_speech.py`
- `api/tests/test_pipecat_engine_tool_calls.py`
- `api/tests/test_pipecat_engine_transition_mute.py`
- `api/tests/test_pipeline_error_handling.py`
- `api/tests/test_qa_llm_config.py`
- `api/tests/test_realtime_feedback_observer.py`
- `api/tests/test_resolve_effective_config.py`
- `api/tests/test_run_integrations_webhook.py`
- `api/tests/test_sarvam_service_factory.py`
- `api/tests/test_service_factory_failure_reporting.py`
- `api/tests/test_text_and_audio_playback.py`
- `api/tests/test_text_chat_inactivity.py`
- `api/tests/test_text_chat_session_service.py`
- `api/tests/test_tool_schema.py`
- `api/tests/test_transfer_context_mapping.py`
- `api/tests/test_transfer_message_playback.py`
- `api/tests/test_tts_endframe_with_audio_write_failure.py`
- `api/tests/test_user_configuration_validation.py`
- `api/tests/test_user_idle_handler.py`
- `api/tests/test_user_muting_during_bot_speech.py`
- `api/tests/test_webrtc_signaling_ice_filter_policies.py`
- `api/tests/test_widget_texts_schema.py`
- `api/tests/test_workflow_configuration_policy.py`
- `api/tests/test_workflow_configurations_schema.py`
- `api/tests/test_workflow_create_route.py`
- `api/tests/test_workflow_run_billing.py`
- `api/tests/test_workflow_versioning.py`

### Dokumentation
- `docs/api-reference/campaigns/upload-contacts.mdx`
- `docs/api-reference/runs/trigger.mdx`
- `docs/api-reference/runs/trigger-workflow.mdx`
- `docs/core-concepts/campaigns.mdx`
- `docs/images/noveum-api-key.png`
- `docs/images/noveum-edit-modal.png`
- `docs/images/noveum-integrations-panel.png`
- `docs/images/noveum-node-configured.png`
- `docs/images/noveum-trace-detail.png`
- `docs/integrations/noveum.mdx`
- `docs/integrations/telephony/vicidial.mdx`
- `docs/voice-agent/api-trigger.mdx`
- `docs/voice-agent/pre-call-data-fetch.mdx`
- `docs/voice-agent/start-call.mdx`
- `docs/voice-agent/template-variables.mdx`
- `docs/voice-agent/tools/call-transfer.mdx`

### GitHub / CI
- `.github/workflows/docker-image.yml`
- `.github/workflows/release-deployment.yml`

### Scripts
- `scripts/fix_broken_langfuse_trace_urls.py`
- `scripts/rolling_update.sh`
- `scripts/start_services.sh`
- `scripts/start_services_docker.sh`
- `scripts/worktree-assign-port.sh`
- `scripts/worktree-sync-env.sh`

### SDK / Python
- `sdk/python/src/dograh_sdk/typed/__init__.py`
- `sdk/python/src/dograh_sdk/typed/noveum.py`
- `sdk/python/src/dograh_sdk/typed/start_call.py`
- `sdk/python/src/dograh_sdk/typed/trigger.py`
- `sdk/python/src/dograh_sdk/typed/webhook.py`

### SDK / TypeScript
- `sdk/typescript/src/_generated_models.ts`
- `sdk/typescript/src/typed/index.ts`
- `sdk/typescript/src/typed/noveum.ts`
- `sdk/typescript/src/typed/start-call.ts`
- `sdk/typescript/src/typed/trigger.ts`
- `sdk/typescript/src/typed/webhook.ts`

### UI / Frontend
- `ui/.env.example`
- `ui/openapi-ts.config.ts`
- `ui/package-lock.json`
- `ui/scripts/dev-server.mjs`
- `ui/src/app/files/DocumentUpload.tsx`
- `ui/src/app/superadmin/runs/page.tsx`
- `ui/src/app/telephony-configurations/[configId]/page.tsx`
- `ui/src/app/telephony-configurations/page.tsx`
- `ui/src/app/tools/[toolUuid]/components/HttpApiToolConfig.tsx`
- `ui/src/app/tools/[toolUuid]/components/http-tool-test/helpers.test.ts`
- `ui/src/app/tools/[toolUuid]/components/http-tool-test/helpers.ts`
- `ui/src/app/tools/[toolUuid]/components/http-tool-test/HttpToolTestDialog.tsx`
- `ui/src/app/tools/[toolUuid]/components/TransferCallToolConfig.test.tsx`
- `ui/src/app/tools/[toolUuid]/components/TransferCallToolConfig.tsx`
- `ui/src/app/tools/[toolUuid]/page.tsx`
- `ui/src/app/tools/config.tsx`
- `ui/src/app/workflow/[workflowId]/components/ConfigurationsDialog.tsx`
- `ui/src/app/workflow/[workflowId]/components/VersionHistoryPanel.test.tsx`
- `ui/src/app/workflow/[workflowId]/components/VersionHistoryPanel.tsx`
- `ui/src/app/workflow/[workflowId]/components/workflow-tester/ChatComposer.tsx`
- `ui/src/app/workflow/[workflowId]/components/workflow-tester/EmbeddedVoiceTester.test.tsx`
- `ui/src/app/workflow/[workflowId]/components/workflow-tester/EmbeddedVoiceTester.tsx`
- `ui/src/app/workflow/[workflowId]/components/workflow-tester/ManualTextChatPanel.tsx`
- `ui/src/app/workflow/[workflowId]/components/workflow-tester/useTextChatSession.ts`
- `ui/src/app/workflow/[workflowId]/components/WorkflowVersionDiffDialog.test.tsx`
- `ui/src/app/workflow/[workflowId]/components/WorkflowVersionDiffDialog.tsx`
- `ui/src/app/workflow/[workflowId]/hooks/useWorkflowState.ts`
- `ui/src/app/workflow/[workflowId]/page.tsx`
- `ui/src/app/workflow/[workflowId]/RenderWorkflow.tsx`
- `ui/src/app/workflow/[workflowId]/run/[runId]/hooks/useWebSocketRTC.tsx`
- `ui/src/app/workflow/[workflowId]/settings/page.tsx`
- `ui/src/app/workflow/[workflowId]/utils/workflowVersionDiff.test.ts`
- `ui/src/app/workflow/[workflowId]/utils/workflowVersionDiff.ts`
- `ui/src/components/flow/AddNodePanel.tsx`
- `ui/src/components/flow/nodes/GenericNode.tsx`
- `ui/src/components/flow/types.ts`
- `ui/src/components/http/body-template-editor.tsx`
- `ui/src/components/http/index.ts`
- `ui/src/components/http/url-input.test.ts`
- `ui/src/components/http/url-input.tsx`
- `ui/src/components/ServiceConfigurationForm.tsx`
- `ui/src/components/TelemetrySection.tsx`
- `ui/src/components/telephony/CloudonixOutboundTrunkForm.tsx`
- `ui/src/components/telephony/ConfigFormDialog.tsx`
- `ui/src/components/telephony/SipConnectivityCard.test.tsx`
- `ui/src/components/telephony/SipConnectivityCard.tsx`
- `ui/src/lib/auth/providers/StackProviderWrapper.tsx`
- `ui/src/types/workflow-configurations.ts`

### VSCode
- `.vscode/launch.json`
- `.vscode/tasks.json`

</details>

---

## Liste B: Auch auf V2 geändert — fälschlich kategorisiert

**Leer.** Keine Dateien wurden fälschlich in Kategorie 1 eingeordnet.

---

## Merge-Base Ermittlung

| Eigenschaft | Wert |
|-------------|------|
| **Merge-Base Commit** | `69db8a3` |
| **Commit-Datum** | 2026-08-01 18:19:21 +0530 |
| **Commit-Nachricht** | `fix(telephony): carry the media-WS token in the path, not the query string (#610)` |
| **Früher zitierter Commit** | `b7bb336` (2026-07-28) — ist Vorfahr von `69db8a3`, aber nicht die tatsächliche Merge-Base |

**Methode:** `git merge-base main comparison/main` nach Hinzufügen von `dograhEU_last` als Remote.

---

## Statistik-Zusammenfassung

| Kategorie | Commits | Geänderte Dateien |
|-----------|---------|-------------------|
| Upstream-only (Fork hat neuere Updates) | 34 | 219 |
| Local-only (dograhV2 hat, Fork nicht) | 140 | 231 |
| In beiden geändert (Konfliktpotenzial) | — | 70 |

---

## Kategorie 1: Upstream-only (Fork hat neuere Updates)

Diese Änderungen existieren in `dograhEU_last` (aktueller Upstream-Snapshot), aber nicht in `dograhV2`.

### API / Backend

| Pfad | Änderung |
|------|----------|
| `api/AGENTS.md` | Neu: Agent-Dokumentation |
| `api/alembic/versions/b41f7c9d2e05_migrate_gemini_2_5_flash_to_3_5_flash.py` | Migration: Gemini 2.5 → 3.5 Flash |
| `api/alembic/versions/c7a1e4f93b26_add_telephony_configuration_inactive.py` | Telephony-Config: Inactive-Status |
| `api/db/models.py` | DB-Modell-Erweiterungen |
| `api/db/organization_configuration_client.py` | Org-Config-Client-Updates |
| `api/db/telephony_configuration_client.py` | Telephony-Config-Client |
| `api/db/telephony_phone_number_client.py` | Telefonnummern-Client |
| `api/db/workflow_client.py` | Workflow-Client-Updates |
| `api/db/workflow_run_text_session_client.py` | Text-Session-Client |
| `api/enums.py` | Enum-Erweiterungen |
| `api/errors/failure.py` | Fehler-Klassifizierung |
| `api/errors/mps.py` | MPS-Fehlerbehandlung |
| `api/errors/telephony_errors.py` | Telephony-Fehler |
| `api/logging_config.py` | Logging-Konfiguration |
| `api/requirements.txt` | Abhängigkeits-Updates |
| `api/routes/auth.py` | Auth-Route-Änderungen |
| `api/routes/campaign.py` | Kampagnen-Route |
| `api/routes/telephony.py` | Telephony-Route |
| `api/routes/tool.py` | Tool-Route |
| `api/routes/user.py` | User-Route |
| `api/routes/workflow.py` | Workflow-Route |
| `api/schemas/telephony_config.py` | Telephony-Config-Schema |
| `api/schemas/tool.py` | Tool-Schema |
| `api/schemas/widget_texts.py` | Widget-Texte-Schema |
| `api/schemas/workflow_configurations.py` | Workflow-Config-Schema |

### API / Services

| Pfad | Änderung |
|------|----------|
| `api/services/auth/depends.py` | Auth-Dependencies |
| `api/services/campaign/sources/csv.py` | CSV-Kampagnen-Quelle |
| `api/services/configuration/ai_model_configuration.py` | AI-Modell-Konfiguration |
| `api/services/configuration/options/google.py` | Google-Config-Optionen |
| `api/services/configuration/options/sarvam.py` | Sarvam-Config-Optionen |
| `api/services/integrations/noveum/*` | **NEU: Noveum-Integration** (Client, Collector, Completion, Node, Runtime) |
| `api/services/integrations/registry.py` | Integrations-Registry |
| `api/services/organization_bootstrap.py` | Org-Bootstrap: SIP-Endpoints |
| `api/services/pipecat/gemini_json_schema_adapter.py` | Gemini JSON-Schema |
| `api/services/pipecat/realtime_feedback_observer.py` | Realtime-Feedback |
| `api/services/pipecat/realtime/gemini_live.py` | Gemini Live: Temperatur-Config |
| `api/services/pipecat/tracing_config.py` | Tracing-Config |
| `api/services/telephony/ari_manager.py` | ARI-Manager: Deaktivierung bei Fehlern |
| `api/services/telephony/failure_reporting.py` | Fehler-Reporting |
| `api/services/telephony/providers/ari/external_pbx/*` | External PBX: VICIdial-Support |
| `api/services/telephony/providers/cloudonix/*` | **Cloudonix-Erweiterungen**: Provisioning, Regionen |
| `api/services/telephony/providers/twilio/strategies.py` | Twilio-Strategien |
| `api/services/telephony/registry.py` | Telephony-Registry |
| `api/services/tool_management.py` | Tool-Verwaltung |
| `api/services/workflow/configuration_policy.py` | Config-Policy |
| `api/services/workflow/dto.py` | Workflow-DTOs |
| `api/services/workflow/pipecat_engine_custom_tools.py` | Custom-Tools-Engine |
| `api/services/workflow/text_chat_session_service.py` | Text-Chat-Session |
| `api/services/workflow/tools/custom_tool.py` | Custom-Tool: Body-Template |
| `api/services/workflow/tools/transfer_resolver.py` | Transfer-Resolver: Context-Mapping |
| `api/services/workflow_run_billing.py` | Billing-Service |
| `api/tasks/arq.py` | ARQ-Tasks |
| `api/tasks/function_names.py` | Task-Funktionsnamen |
| `api/tasks/run_integrations.py` | Integrations-Tasks |
| `api/tasks/text_chat_inactivity.py` | Text-Chat-Inaktivität |
| `api/tasks/webhook_delivery.py` | Webhook-Delivery |
| `api/utils/template_renderer.py` | Template-Renderer: Hostname-Variablen |

### API / Tests (neu/geändert)

Über 60 neue Tests, darunter:
- `test_noveum_integration.py` — Noveum-Integration
- `test_gemini_live_temperature.py` — Gemini-Temperatur
- `test_transfer_context_mapping.py` — Transfer-Context-Mapping
- `test_workflow_version_diff.py` — Workflow-Versionierung
- `test_organization_bootstrap.py` — SIP-Provisioning
- `test_ari_deactivation.py` — ARI-Deaktivierung bei Fehlern

### UI / Frontend

| Pfad | Änderung |
|------|----------|
| `ui/src/app/telephony-configurations/[configId]/page.tsx` | SIP-Connectivity-Anzeige |
| `ui/src/app/telephony-configurations/page.tsx` | Telephony-Config-Seite |
| `ui/src/app/tools/[toolUuid]/components/HttpApiToolConfig.tsx` | HTTP-Tool: Body-Template |
| `ui/src/app/tools/[toolUuid]/components/TransferCallToolConfig.tsx` | **Transfer-Tool: Context-Mapping** |
| `ui/src/app/workflow/[workflowId]/components/WorkflowVersionDiffDialog.tsx` | **NEU: Workflow-Version-Diff-Viewer** |
| `ui/src/app/workflow/[workflowId]/utils/workflowVersionDiff.ts` | Diff-Utilities |
| `ui/src/components/flow/AddNodePanel.tsx` | Node-Panel: Noveum-Node |
| `ui/src/components/http/body-template-editor.tsx` | **NEU: Body-Template-Editor** |
| `ui/src/components/http/url-input.tsx` | URL-Input: Inline-Path-Parameter |
| `ui/src/components/telephony/CloudonixOutboundTrunkForm.tsx` | **NEU: Cloudonix-Outbound-Trunk** |
| `ui/src/components/telephony/SipConnectivityCard.tsx` | **NEU: SIP-Connectivity-Card** |
| `ui/src/components/ServiceConfigurationForm.tsx` | Service-Config-Form |
| `ui/src/components/TelemetrySection.tsx` | Telemetrie-Section |

### SDK

| Pfad | Änderung |
|------|----------|
| `sdk/python/src/dograh_sdk/typed/noveum.py` | **NEU: Noveum-SDK-Typen** |
| `sdk/python/src/dograh_sdk/typed/start_call.py` | Start-Call: Caller-ID-Auswahl |
| `sdk/python/src/dograh_sdk/typed/trigger.py` | Trigger: Caller-ID-Parameter |
| `sdk/typescript/src/typed/noveum.ts` | **NEU: Noveum-TypeScript-SDK** |
| `sdk/typescript/src/typed/start-call.ts` | Start-Call-Typen |
| `sdk/typescript/src/typed/trigger.ts` | Trigger-Typen |

### Dokumentation

| Pfad | Änderung |
|------|----------|
| `docs/integrations/noveum.mdx` | **NEU: Noveum-Integrationsdoku** |
| `docs/integrations/telephony/vicidial.mdx` | VICIdial-Doku-Erweiterung |
| `docs/voice-agent/api-trigger.mdx` | API-Trigger: Caller-ID-Doku |
| `docs/voice-agent/tools/call-transfer.mdx` | Transfer: Context-Mapping-Doku |
| `docs/images/noveum-*.png` | Noveum-Screenshots (5 Bilder) |

### Scripts / DevOps

| Pfad | Änderung |
|------|----------|
| `scripts/fix_broken_langfuse_trace_urls.py` | **NEU: Langfuse-URL-Reparatur** |
| `scripts/rolling_update.sh` | Rolling-Update-Erweiterungen |
| `scripts/start_services.sh` | Service-Start-Updates |
| `scripts/worktree-sync-env.sh` | **NEU: Worktree-Env-Sync** |
| `.github/workflows/docker-image.yml` | Docker-Build-Workflow |
| `.github/workflows/release-deployment.yml` | Release-Deployment |

### Agents / Skills

| Pfad | Änderung |
|------|----------|
| `.agents/skills/merge-pipecat-upstream/SKILL.md` | Pipecat-Merge-Skill |
| `.agents/skills/review-agents-md/references/dograh-seams.md` | Dograh-Seams-Referenz |
| `.agents/skills/review-agents-md/scripts/inventory_agents_md.py` | Inventory-Script |
| `.agents/skills/review-pr/SKILL.md` | PR-Review-Skill |

---

## Kategorie 2: Local-only (dograhV2 hat, Fork nicht)

Diese Änderungen existieren nur in `dograhV2` (Den_is Anpassungen).

### Kernkonfiguration / Branding

| Pfad | Änderung |
|------|----------|
| `AGENTS.md` | Projekt-Root-Agent-Dokumentation |
| `.agents/prompts/dograhv2-agent-system.md` | DograhV2-Agent-System-Prompt |
| `.agents/prompts/references/knowledge-loop.md` | Knowledge-Loop-Referenz |
| `.agents/skills/dograhV2/SKILL.md` | DograhV2-Skill-Definition |
| `.agents/skills/dograhV2/agents/openai.yaml` | OpenAI-Agent-Config |
| `.claude/*` | Claude-Agent-Integration (ECC-Tools, Homunculus, Identity) |
| `.codex/*` | Codex-Agent-Konfiguration |
| `README.ja-JP.md` | Japanische README |
| `README.zh-CN.md` | Chinesische README |
| `SECURITY.md` | Security-Policy |

### API / Backend

| Pfad | Änderung |
|------|----------|
| `api/Dockerfile` | API-Dockerfile-Anpassungen |
| `api/db/embed_token_client.py` | Embed-Token-Client |
| `api/mcp_server/auth.py` | MCP-Auth |
| `api/mcp_server/instructions.py` | MCP-Instruktionen |
| `api/mcp_server/oauth_middleware.py` | MCP-OAuth-Middleware |
| `api/routes/agent_stream.py` | **Agent-Stream-Route** |
| `api/routes/main.py` | Haupt-Route |
| `api/routes/mcp_oauth.py` | MCP-OAuth-Route |
| `api/routes/turn_credentials.py` | TURN-Credentials-Route |
| `api/routes/workflow_embed.py` | Workflow-Embed-Route |
| `api/services/auth/mcp_oauth.py` | MCP-OAuth-Service |
| `api/services/call_concurrency/*` | **Call-Concurrency-Rate-Limiter** |
| `api/services/configuration/options/deepgram.py` | Deepgram-Config-Optionen |
| `api/services/pipecat/realtime/ultravox_realtime.py` | **Ultravox-Realtime-Wrapper** |
| `api/services/telephony/providers/plivo/provider.py` | Plivo-Provider |
| `api/services/telephony/providers/twilio/provider.py` | Twilio-Provider-Anpassungen |
| `api/services/telephony/providers/vonage/provider.py` | Vonage-Provider |
| `api/services/workflow/embed_chat_limiter.py` | Embed-Chat-Limiter |
| `api/services/workflow/embed_context.py` | Embed-Context |
| `api/services/workflow/embed_session_service.py` | Embed-Session-Service |
| `api/services/workflow/pipecat_engine_variable_extractor.py` | Variable-Extraktor |

### API / Tests (lokale Anpassungen)

| Pfad | Änderung |
|------|----------|
| `api/tests/test_agent_stream_route.py` | Agent-Stream-Tests |
| `api/tests/test_atlascloud_llm_provider.py` | AtlasCloud-LLM-Tests |
| `api/tests/test_deepgram_flux_service_factory.py` | Deepgram-Flux-Tests |
| `api/tests/test_dograh_llm_service_factory.py` | Dograh-LLM-Tests |
| `api/tests/test_embed_*.py` | Embed-Feature-Tests |
| `api/tests/test_fish_audio_tts_service_factory.py` | Fish-Audio-TTS-Tests |
| `api/tests/test_mcp_auth.py` | MCP-Auth-Tests |
| `api/tests/test_mcp_oauth.py` | MCP-OAuth-Tests |
| `api/tests/test_public_embed_cors.py` | Embed-CORS-Tests |
| `api/tests/test_public_signaling_origin.py` | Signaling-Origin-Tests |
| `api/tests/test_quota_service.py` | Quota-Service-Tests |
| `api/tests/test_ultravox_realtime_wrapper.py` | Ultravox-Tests |

### Ops-Dashboard (komplett neu)

**Vollständige neue Anwendung** für Betriebsüberwachung und Optimierung:

| Bereich | Beschreibung |
|---------|--------------|
| `ops-dashboard/src/components/calls/*` | Audio-Player, Context-Viewer, Node-Timeline, Transcript |
| `ops-dashboard/src/components/campaigns/*` | Kampagnen-Widget, Disposition-Chart, Runs-Table |
| `ops-dashboard/src/components/optimize/*` | Eval-Tools-Panel, Node-Dropoff, Scoreboard, Worst-Runs-Table |
| `ops-dashboard/src/components/overview/*` | Stats-Bar |
| `ops-dashboard/src/lib/auth/*` | Vollständige Auth-Implementierung |
| `ops-dashboard/src/lib/dograh/*` | Dograh-API-Client, Langfuse-Integration, QA-Analyse |
| `ops-dashboard/src/lib/eval/*` | Evaluation-Config, Langfuse-Metriken |
| `ops-dashboard/src/lib/multiplayer/*` | P2P-Multiplayer-Funktionalität |
| `ops-dashboard/src/routes/*` | TanStack-Router-Routen |
| `ops-dashboard/eval/*` | Promptfoo-Evaluation, DeepEval, RAGAS |
| `ops-dashboard/docs/*` | Umfangreiche Dokumentation |

### Deployment / Infrastructure

| Pfad | Änderung |
|------|----------|
| `deploy/helm/dograh/Chart.yaml` | Helm-Chart |
| `deploy/helm/dograh/templates/secret.yaml` | Secret-Template |
| `deploy/hostinger/docker-compose.yaml` | Hostinger-Deployment |
| `deploy/voiceeu/*` | **VoiceEU-Deployment-Scripts** |
| `deploy/voiceeu-deepgram-eu/*` | Deepgram-EU-Verification |
| `deploy/voiceeu-health/*` | Health-Check-Scripts |
| `deploy/voiceeu/rollback/*` | Rollback-Prozeduren |

### Dokumentation (lokal)

| Pfad | Änderung |
|------|----------|
| `docs/api-reference/authentication.mdx` | Auth-Dokumentation |
| `docs/contribution/reference.mdx` | Contributor-Referenz |
| `docs/contribution/setup.mdx` | Setup-Dokumentation |
| `docs/deployment/custom-domain.mdx` | Custom-Domain-Doku |
| `docs/deployment/docker.mdx` | Docker-Deployment-Doku |
| `docs/deployment/update.mdx` | Update-Dokumentation |
| `docs/developer/environment-variables.mdx` | Env-Vars-Dokumentation |
| `docs/getting-started/index.mdx` | Getting-Started-Guide |
| `docs/integrations/mcp.mdx` | MCP-Integrationsdoku |
| `docs/integrations/overview.mdx` | Integrations-Übersicht |
| `docs/integrations/telephony/agent-stream.mdx` | **Agent-Stream-Doku** |
| `docs/integrations/telephony/webhooks.mdx` | Webhooks-Doku |

### Scripts / DevOps (lokal)

| Pfad | Änderung |
|------|----------|
| `scripts/dump_docs_openapi.py` | OpenAPI-Dump-Script |
| `scripts/lib/setup_common.sh` | Setup-Common-Library |
| `scripts/setup_custom_domain.sh` | Custom-Domain-Setup |
| `scripts/setup_local.ps1` | Windows-Local-Setup |
| `scripts/setup_local.sh` | Linux-Local-Setup |
| `scripts/setup_remote.sh` | Remote-Setup |
| `scripts/setup_requirements.sh` | Requirements-Setup |
| `scripts/update_remote.sh` | Remote-Update |
| `scripts/update_source_build.sh` | **Source-Build-Update** |
| `remote_up.sh` | Remote-Up-Script |

### GitHub / CI

| Pfad | Änderung |
|------|----------|
| `.github/BRANCHING.md` | Branching-Strategie |
| `.github/CODEOWNERS` | Code-Owners |
| `.github/dependabot.yml` | Dependabot-Config |
| `.github/workflows/auto-pr-to-main.yml` | Auto-PR-Workflow |
| `.github/workflows/deploy-api-dograheuv2.yml` | **DograhEU-V2-Deployment** |
| `.github/workflows/pr-safety-checks.yml` | PR-Safety-Checks |
| `.github/workflows/sync-upstream-original.yml` | Upstream-Sync-Workflow |

### Evals / STT

| Pfad | Änderung |
|------|----------|
| `evals/stt/providers/deepgram_flux_provider.py` | Deepgram-Flux-Provider |
| `evals/stt/providers/deepgram_provider.py` | Deepgram-Provider |

### UI-Anpassungen

| Pfad | Änderung |
|------|----------|
| `ui/src/app/overview/page.tsx` | Overview-Seite |
| `ui/src/components/layout/GitHubStarBadge.tsx` | GitHub-Star-Badge (Repository-URL) |
| `ui/src/components/MCPSection.tsx` | MCP-Section |
| `ui/src/middleware.ts` | Middleware-Anpassungen |

---

## Dateien mit Änderungen in beiden Branches (Konfliktpotenzial)

Diese 70 Dateien wurden in **beiden** Branches seit der Merge-Base geändert:

### API

- `api/app.py`
- `api/constants.py`
- `api/.env.example`
- `api/pyproject.toml`
- `api/routes/organization.py`
- `api/routes/public_agent.py`
- `api/routes/public_embed_chat.py`
- `api/routes/public_embed.py`
- `api/routes/webrtc_signaling.py`
- `api/routes/workflow_text_chat.py`
- `api/schemas/embed_chat.py`
- `api/services/campaign/campaign_call_dispatcher.py`
- `api/services/configuration/check_validity.py`
- `api/services/configuration/registry.py`
- `api/services/mps_service_key_client.py`
- `api/services/pipecat/event_handlers.py`
- `api/services/pipecat/pre_call_fetch.py`
- `api/services/pipecat/run_pipeline.py`
- `api/services/pipecat/service_factory.py`
- `api/services/quota_service.py`
- `api/services/telephony/base.py`
- `api/services/telephony/factory.py`
- `api/services/telephony/providers/ari/provider.py`
- `api/services/telephony/providers/cloudonix/provider.py`
- `api/services/telephony/providers/telnyx/provider.py`
- `api/services/telephony/providers/vobiz/provider.py`
- `api/services/workflow/embed_text_chat_service.py`
- `api/services/workflow/initial_context.py`
- `api/services/workflow/pipecat_engine.py`
- `api/services/workflow/qa/analysis.py`
- `api/services/workflow/qa/llm_config.py`
- `api/services/workflow/qa/node_summary.py`
- `api/services/workflow/text_chat_runner.py`
- `api/services/workflow/workflow_graph.py`
- `api/tests/telephony/test_phone_number_validation.py`
- `api/tests/test_mps_service_key_client.py`
- `api/tests/test_pipecat_engine_variable_extraction.py`
- `api/tests/test_pre_call_fetch.py`
- `api/tests/test_public_agent_routes.py`
- `api/tests/test_public_embed_chat.py`
- `api/tests/test_qa_analysis_non_dict_response.py`
- `api/tests/test_qa_usage_context.py`
- `api/tests/test_telephony_factory.py`
- `api/tests/test_voicemail_detector.py`
- `api/tests/test_workflow_text_chat.py`

### Projekt-Root

- `CHANGELOG.md`
- `CONTRIBUTING.md`
- `README.md`
- `.release-please-manifest.json`

### Deployment

- `deploy/helm/dograh/templates/configmap.yaml`
- `deploy/helm/dograh/values.yaml`
- `docker-compose.yaml`

### Dokumentation

- `docs/api-reference/openapi.json`
- `docs/docs.json`
- `docs/voice-agent/add-to-website.mdx`

### CI/CD

- `.github/workflows/api-tests.yml`
- `.github/workflows/pre-pr-drift-check.yml`

### Submodule

- `pipecat` (unterschiedliche Commits)

### Scripts

- `scripts/AGENTS.md`

### SDK

- `sdk/python/src/dograh_sdk/_generated_models.py`

### UI

- `ui/package.json`
- `ui/public/embed/dograh-widget.js`
- `ui/src/app/workflow/[workflowId]/components/EmbedDialog.tsx`
- `ui/src/client/index.ts`
- `ui/src/client/sdk.gen.ts`
- `ui/src/client/types.gen.ts`
- `ui/src/constants/documentation.ts`
- `ui/src/constants/embedExamples.test.ts`
- `ui/src/constants/embedExamples.ts`
- `ui/src/lib/publicEmbedWidget.test.ts`

---

## Zusammenfassung der Hauptunterschiede

### Upstream hat neu (in dograhEU_last):

1. **Noveum-Integration** — Kompletter Tracing-Service mit SDK-Support
2. **Workflow-Version-Diff-Viewer** — UI zum Vergleichen von Workflow-Versionen
3. **Context-Mapping für Call-Transfer** — Kontext an übertragene Anrufe weitergeben
4. **Cloudonix-Erweiterungen** — Outbound-Trunk-Konfiguration, SIP-Connectivity
5. **Gemini 2.5 → 3.5 Flash Migration** — Model-Upgrade
6. **HTTP-Tool Body-Template** — Nested JSON-Support
7. **VICIdial External-PBX Support** — ARI-Integration für VICIdial
8. **Caller-ID-Auswahl bei API-Trigger** — Outbound-Caller-ID konfigurierbar
9. **ARI-Deaktivierung bei Fehlern** — Automatische Deaktivierung nach wiederholten Verbindungsfehlern
10. **Gemini/OpenAI Realtime Temperatur** — Temperatur-Parameter für Realtime-APIs

### dograhV2 hat exklusiv (Den_is Anpassungen):

1. **Ops-Dashboard** — Vollständige Betriebsüberwachungs-App mit Kampagnen-Analyse, QA, Evaluations
2. **Agent-Stream-API** — Streaming-API für Agent-Interaktionen
3. **MCP-OAuth-Integration** — OAuth-Browser-Flow für MCP
4. **VoiceEU-Deployment** — EU-spezifische Deployment-Scripts und Rollback
5. **Ultravox-Realtime-Wrapper** — Alternative Realtime-Implementation
6. **Call-Concurrency-Rate-Limiter** — Anruf-Gleichzeitigkeits-Begrenzung
7. **Embed-Chat-Limiter** — Rate-Limiting für Embed-Chat
8. **Deepgram-Flux-Provider** — Alternative STT-Provider
9. **Claude/Codex-Agent-Integration** — AI-Agent-Konfigurationen
10. **Umfangreiche lokale Dokumentation** — Setup, Deployment, Contributor-Guides
