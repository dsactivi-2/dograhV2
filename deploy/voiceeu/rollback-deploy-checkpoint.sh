#!/usr/bin/env bash
# Restore a checkpoint made by create-deploy-checkpoint.sh.
# Default mode is a read-only plan. --apply is required to make changes.
set -euo pipefail
umask 077

DEPLOY_DIR="${DEPLOY_DIR:-/root/dograh/dograh}"
SOURCE_DIR="${SOURCE_DIR:-/root/src/dograhV2}"
BACKUP_ROOT="${BACKUP_ROOT:-/root/dograh-rollback}"
APPLY=false
RESTORE_DB=false
CHECKPOINT=""

usage() {
  cat <<'EOF'
Usage:
  sudo bash rollback-deploy-checkpoint.sh [CHECKPOINT_PATH] [--apply] [--restore-db]

Without --apply, only validates and prints the rollback plan.
--apply restores deployment files, source checkout, recorded Docker image tags,
then recreates the Compose services.
--restore-db additionally restores PostgreSQL from the checkpoint. This overwrites
current application database data and is intentionally separate.
EOF
}

fail() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "INFO: $*"; }

for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=true ;;
    --restore-db) RESTORE_DB=true ;;
    -h|--help) usage; exit 0 ;;
    -*) fail "Unknown option: $arg" ;;
    *) [[ -z "$CHECKPOINT" ]] || fail "Only one checkpoint path is allowed"; CHECKPOINT="$arg" ;;
  esac
done

if [[ -z "$CHECKPOINT" ]]; then
  CHECKPOINT="$(find "$BACKUP_ROOT" -maxdepth 1 -type d -name 'checkpoint-*' -print 2>/dev/null | sort | tail -n 1 || true)"
fi

[[ "${EUID}" -eq 0 ]] || fail "Run as root (sudo bash $0)."
[[ -n "$CHECKPOINT" && -d "$CHECKPOINT" ]] || fail "Checkpoint not found."
[[ "$CHECKPOINT" == "$BACKUP_ROOT"/checkpoint-* ]] || fail "Checkpoint must be below $BACKUP_ROOT."
[[ -f "$CHECKPOINT/SHA256SUMS" ]] || fail "Checkpoint manifest missing."
[[ -f "$CHECKPOINT/deploy-tree.tar.gz" && -f "$CHECKPOINT/source-tree.tar.gz" ]] || fail "Checkpoint archives missing."
command -v docker >/dev/null || fail "docker is required"
command -v rsync >/dev/null || fail "rsync is required for an exact restore"

(
  cd "$CHECKPOINT"
  sha256sum -c SHA256SUMS
)

echo "Rollback plan:"
echo "  checkpoint: $CHECKPOINT"
echo "  deployment: $DEPLOY_DIR"
echo "  source:     $SOURCE_DIR"
echo "  database:   $([[ "$RESTORE_DB" == true ]] && echo WILL be restored || echo unchanged)"
echo "  services:   Docker Compose services will be recreated"
echo "  image IDs:  $(wc -l < "$CHECKPOINT/image-ids.tsv") recorded"

if [[ "$APPLY" != true ]]; then
  echo "Dry run only. Re-run with --apply to execute this rollback."
  exit 0
fi

TMP="$(mktemp -d)"
cleanup() { rm -rf "$TMP"; }
trap cleanup EXIT

info "Extracting checkpoint archives."
mkdir -p "$TMP/deploy-parent" "$TMP/source-parent"
tar -C "$TMP/deploy-parent" -xzf "$CHECKPOINT/deploy-tree.tar.gz"
tar -C "$TMP/source-parent" -xzf "$CHECKPOINT/source-tree.tar.gz"

# Reapply the immutable image IDs saved before deployment.
while IFS=$'\t' read -r image image_id; do
  [[ -n "$image" && -n "$image_id" ]] || continue
  docker image inspect "$image_id" >/dev/null 2>&1 || fail "Saved image is gone: $image_id. Do not prune images before rollback."
  docker tag "$image_id" "$image"
done < "$CHECKPOINT/image-ids.tsv"

info "Stopping application services before restoring files."
docker compose -f "$DEPLOY_DIR/docker-compose.yaml" stop api ui 2>/dev/null || true

info "Restoring deployment and source trees."
mkdir -p "$DEPLOY_DIR" "$SOURCE_DIR"
rsync -a --delete "$TMP/deploy-parent/" "$DEPLOY_DIR/"
rsync -a --delete "$TMP/source-parent/" "$(dirname "$SOURCE_DIR")/"

docker compose -f "$DEPLOY_DIR/docker-compose.yaml" config -q

if [[ "$RESTORE_DB" == true ]]; then
  [[ -f "$CHECKPOINT/postgres.sql.gz" ]] || fail "Database backup missing."
  info "Restoring PostgreSQL database."
  docker compose -f "$DEPLOY_DIR/docker-compose.yaml" up -d postgres
  gzip -cd "$CHECKPOINT/postgres.sql.gz" | docker compose -f "$DEPLOY_DIR/docker-compose.yaml" exec -T postgres sh -ceu '
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB"
  '
fi

info "Recreating services from the restored checkpoint."
docker compose -f "$DEPLOY_DIR/docker-compose.yaml" up -d --force-recreate
docker compose -f "$DEPLOY_DIR/docker-compose.yaml" ps
echo "Rollback completed from: $CHECKPOINT"
