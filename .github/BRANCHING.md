# Branching & protection (dograhV2)

## Branches

| Branch | Role |
|--------|------|
| `main` | Production-ready fork line. **PR-only**, protected (ruleset). |
| `upstream/original` | Force-mirror of `dograh-hq/dograh@main`. Never deploy directly. |
| `feat/*`, `fix/*`, `chore/*` | Development. Auto-PR bot may open PRs into `main` when merge-clean. |
| `sync/upstream-YYYYMMDD` | Integration branch: `main` + upstream mirror. |

## Rules

1. **No direct pushes to `main`** (repository ruleset + classic backup).
2. Original upstream updates land only on `upstream/original`.
3. Your work stays on feature branches.
4. Automation may **open** PRs to `main` after a clean merge-tree check; **you merge** when checks are green.
5. Deploy (DograhEUV2 API image) only from `main` SHAs (manual today; optional Actions when armed).
6. PRs that touch `pipecat/` get `risk:pipecat` and need label **`safe-to-merge-pipecat`** before merge.

## Required status checks (main)

| Check | Meaning |
|-------|---------|
| `merge-dry-run` | Git merge into main is conflict-free |
| `secret-scan` | Gitleaks |
| `path-risk` | Applies `risk:*` labels |
| `api-tests` | Pytest when API paths change; always reports |
| `pipecat-merge-gate` | Blocks `risk:pipecat` without `safe-to-merge-pipecat` |

## Reviews

- **1 approving review** required on `main` (ruleset).
- Solo: approve your own PR in the UI, or use admin bypass only in emergencies.

## Deploy automation (optional)

1. Repo **variable** `DOGRAH_DEPLOY_ENABLED=true`
2. Secrets: `DOGRAH_DEPLOY_HOST`, `DOGRAH_DEPLOY_USER`, `DOGRAH_DEPLOY_SSH_KEY` (optional `DOGRAH_DEPLOY_SSH_PORT`)
3. Workflow `Deploy API (DograhEUV2)` builds on the server and recreates only `api`.

## Workflows

| Workflow | Purpose |
|----------|---------|
| `sync-upstream-original.yml` | Mirror upstream → `upstream/original` |
| `auto-pr-to-main.yml` | If merge-clean, open/update PR into `main` |
| `pr-safety-checks.yml` | merge-dry-run, path-risk, gitleaks, pipecat gate |
| `api-tests.yml` | Pytest + always-green `api-tests` gate |
| `deploy-api-dograheuv2.yml` | Optional SSH redeploy |

## Manual triggers

- Actions → **Sync upstream/original** → Run workflow
- Actions → **Auto PR to main** → Run workflow
- Actions → **Deploy API (DograhEUV2)** → Run workflow (when armed)
