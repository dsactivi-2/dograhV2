# Voice-Ops Tools Roadmap (dsactivi-2/dograh)

| Phase | Status | Deliverable |
|-------|--------|-------------|
| Config-Inventar | **done** | `docs/internal/config-defaults-inventory.md` |
| Data-Inventar Runs | **done** | `docs/internal/data-inventory-workflow-runs.md` |
| **P0** Outcomes + QA Schema | **MVP** | `/api/v1/outcomes/*`, Normalizer schema v1, UI `/analytics` |
| Disposition Taxonomy | **MVP** | `/api/v1/disposition-taxonomy/*`, Success-Set R/W on workflow |
| **P1** Script-Bibliothek | **MVP** | `/api/v1/scripts/*`, FTS prompt search, definition diff, UI `/scripts` |
| **P2** Text-Chat Eval Harness | **MVP core** | `/api/v1/evals/text/run`, UI `/evals` |
| **P3** Campaign Tower + Cost | **MVP** | `/api/v1/campaign-ops/*`, `/api/v1/cost-attribution/*`, UI `/campaigns/ops` + `/costs` |
| **P4** QA Center + Compliance | planned | extend annotations + taxonomy |
| **P5** Schulung MVP | planned | `/training` shadow + text |
| **P6** Voice-Eval | later | full voice training |

## P0 Endpoints
- `GET /api/v1/outcomes/health`
- `GET /api/v1/outcomes/summary`
- `GET /api/v1/outcomes/runs`
- `GET /api/v1/outcomes/runs/{id}/qa`

## Disposition Taxonomy
- `GET /api/v1/disposition-taxonomy/summary` — org-wide code rollup
- `GET /api/v1/disposition-taxonomy/workflows/{id}`
- `PUT /api/v1/disposition-taxonomy/workflows/{id}` — body: disposition_codes, success_codes, code_meta

Stored on `workflows.call_disposition_codes` (backward-compatible extension).

## P1 Script Library
- `GET/POST /api/v1/scripts`
- `GET/PATCH/DELETE /api/v1/scripts/{id}`
- `GET /api/v1/scripts/search/prompts?q=` — Postgres FTS (`to_tsvector` / `plainto_tsquery`) + node extract
- `GET /api/v1/scripts/diff?definition_a=&definition_b=`
- Table `script_library_entries` (tags, owner, approval_status draft|pending|approved|rejected)
- Approval: owner or superuser
- UI: `/scripts` (cards, filters, FTS, diff, freigabe queue)

## P2 Text Eval
- `POST /api/v1/evals/text/run` — scenario JSON → TEXTCHAT session → assertions
- Assertion types: response_contains, response_not_contains, disposition_equals, gathered_key_exists, gathered_key_equals
- UI: `/evals`

## P3 Campaign Control Tower + Cost Attribution
- `GET /api/v1/campaign-ops/health`
- `GET /api/v1/campaign-ops/summary` — funnel + per-campaign retry/CB/disposition
- `GET /api/v1/campaign-ops/campaigns/{id}`
- `GET /api/v1/cost-attribution/health`
- `GET /api/v1/cost-attribution/summary?group_by=workflow|campaign|definition`
- UI: `/campaigns/ops`, `/costs`
- Docs: `docs/internal/campaign-control-tower.md`, `docs/internal/cost-attribution.md`
- Reuse: `queued_runs` + `workflow_runs` + `cost_info`/`usage_info` + existing CB Redis; no billing engine

## UI typed clients (until OpenAPI regen)
- `ui/src/lib/api/outcomes.ts`
- `ui/src/lib/api/disposition.ts`
- `ui/src/lib/api/scripts.ts`
- `ui/src/lib/api/evals.ts`
- `ui/src/lib/api/campaignOps.ts`
- `ui/src/lib/api/costAttribution.ts`

Regenerate hey-api client when API is running: `cd ui && npm run generate-client`.

## Reuse
Postgres JSON + FTS · ARQ post-call QA · Reports disposition · Org auth · Superuser · Text-chat runner · Campaign queued_runs · cost_info/usage_info · no Meilisearch/Celery
