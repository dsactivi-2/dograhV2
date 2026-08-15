#!/usr/bin/env bash

# Safely update a remote Dograh source-build installation. This is deliberately
# separate from update_remote.sh, which is only for prebuilt-image deployments.

set -euo pipefail

DEFAULT_BRANCH="main"
BRANCH="$DEFAULT_BRANCH"
REMOTE_NAME="origin"

usage() {
    cat <<'EOF'
Usage: ./scripts/update_source_build.sh [--branch NAME] [--remote NAME]

Updates a clean source-build checkout from its configured Git remote, updates
submodules, validates the remote Docker configuration, and rebuilds the stack.

Examples:
  ./scripts/update_source_build.sh
  ./scripts/update_source_build.sh --branch agent/deepgram-2-stt-profile

This script never changes .env, Docker volumes, or deployment secrets.
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --branch)
            [[ $# -ge 2 ]] || { echo "ERROR: --branch needs a value." >&2; exit 2; }
            BRANCH="$2"
            shift 2
            ;;
        --remote)
            [[ $# -ge 2 ]] || { echo "ERROR: --remote needs a value." >&2; exit 2; }
            REMOTE_NAME="$2"
            shift 2
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            echo "ERROR: Unknown option: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

fail() {
    echo "ERROR: $*" >&2
    exit 1
}

command -v git >/dev/null 2>&1 || fail "git is required."
command -v docker >/dev/null 2>&1 || fail "docker is required."
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Run this inside a Git checkout."
git remote get-url "$REMOTE_NAME" >/dev/null 2>&1 || fail "Git remote '$REMOTE_NAME' does not exist."
[[ -f docker-compose.override.yaml ]] || fail "docker-compose.override.yaml is missing; this is not a source-build install."
[[ -f .env ]] || fail ".env is missing; refusing to start an unconfigured deployment."
[[ -x ./remote_up.sh ]] || fail "remote_up.sh is missing or not executable."

# Source deployments create untracked files such as docker-compose.override.yaml
# and certificates. They are not overwritten by a fast-forward update. Tracked
# source edits or staged changes, however, must be resolved intentionally first.
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Refusing to update because the checkout has tracked local changes:" >&2
    git status --short >&2
    echo "Commit, stash, or discard those changes before retrying." >&2
    exit 1
fi

CURRENT_REF="$(git rev-parse HEAD)"
BACKUP_TAG="source-build-before-update-$(date -u +%Y%m%dT%H%M%SZ)"

echo "Fetching $REMOTE_NAME/$BRANCH ..."
git fetch --prune "$REMOTE_NAME" "$BRANCH"

REMOTE_REF="refs/remotes/$REMOTE_NAME/$BRANCH"
git rev-parse --verify "$REMOTE_REF" >/dev/null 2>&1 || fail "Remote branch '$REMOTE_NAME/$BRANCH' was not fetched."

read -r BEHIND AHEAD < <(git rev-list --left-right --count "$REMOTE_REF...HEAD")
if [[ "$AHEAD" != "0" ]]; then
    fail "Local commits are not on '$REMOTE_NAME/$BRANCH'; refusing to replace or merge them automatically."
fi

git tag "$BACKUP_TAG" "$CURRENT_REF"
echo "Created local rollback tag: $BACKUP_TAG ($CURRENT_REF)"

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git switch "$BRANCH"
    git merge --ff-only "$REMOTE_REF"
else
    git switch --track -c "$BRANCH" "$REMOTE_REF"
fi

git submodule update --init --recursive

echo "Running deployment preflight ..."
./remote_up.sh --preflight-only

echo "Building and restarting the source build ..."
./remote_up.sh --build

echo
echo "PASS: Source build updated to $(git rev-parse --short HEAD)."
echo "Rollback source reference, if needed: git switch --detach $BACKUP_TAG"
echo "Note: do not roll back across database migrations without checking compatibility."
