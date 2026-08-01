# Branching & protection (dograhV2)

## Branches

| Branch | Role |
|--------|------|
| `main` | Production-ready fork line. **PR-only**, protected. |
| `upstream/original` | Force-mirror of `dograh-hq/dograh@main`. Never deploy directly. |
| `feat/*`, `fix/*`, `chore/*` | Development. Auto-PR bot may open PRs into `main` when merge-clean. |
| `sync/upstream-YYYYMMDD` | Integration branch: `main` + upstream mirror. |

## Rules

1. **No direct pushes to `main`** (branch protection).
2. Original upstream updates land only on `upstream/original`.
3. Your work stays on feature branches.
4. Automation may **open** PRs to `main` after a clean merge-tree check; **you merge** when checks are green.
5. Deploy (DograhEUV2 API image) only from `main` SHAs you intentionally ship.

## Workflows

| Workflow | Purpose |
|----------|---------|
| `sync-upstream-original.yml` | Mirror upstream → `upstream/original` |
| `auto-pr-to-main.yml` | If merge-clean, open/update PR into `main` |
| `pr-safety-checks.yml` | merge-dry-run, path-risk labels, gitleaks |
| `api-tests.yml` | Existing API pytest suite on PRs |

## Manual triggers

- Actions → **Sync upstream/original** → Run workflow
- Actions → **Auto PR to main** → Run workflow (optional source branch)
