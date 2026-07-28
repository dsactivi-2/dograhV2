# Voice-Ops Tools Roadmap (dsactivi-2/dograh)

| Phase | Status | Deliverable |
|-------|--------|-------------|
| Config-Inventar | **done** | `docs/internal/config-defaults-inventory.md` |
| Data-Inventar Runs | **done** | `docs/internal/data-inventory-workflow-runs.md` |
| **P0** Outcomes + QA Schema | **MVP** | `/api/v1/outcomes/*`, Normalizer schema v1, UI `/analytics` |
| **P1** Script-Bibliothek | planned | `/scripts` + storage reuse Folders/KB |
| **P2** Prompt-Varianten Text | planned | Text-Chat harness |
| **P3** Campaign Tower + Cost | planned | reuse Campaign + cost_info |
| **P4** QA Center + Compliance | planned | extend annotations + taxonomy |
| **P5** Schulung MVP | planned | `/training` shadow + text |
| **P6** Voice-Eval | later | full voice training |

## P0 Endpoints
- `GET /api/v1/outcomes/health`
- `GET /api/v1/outcomes/summary`
- `GET /api/v1/outcomes/runs`
- `GET /api/v1/outcomes/runs/{id}/qa`

## Reuse
Postgres JSON · ARQ post-call QA · Reports disposition · Org auth · Superuser unchanged
