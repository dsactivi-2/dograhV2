#!/usr/bin/env bash
# Create a local, application-level rollback checkpoint before a source-build deploy.
# This script does not deploy or restart services.
set -euo pipefail
umask 077

DEPLOY_DIR="${DEPLOY_DIR:-/root/dograh/dograh}"
SOURCE_DIR="${SOURCE_DIR:-/root/src/dograhV2}"
BACKUP_ROOT="${BACKUP_ROOT:-/root/dograh-rollback}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
CHECKPOINT="$BACKUP_ROOT/checkpoint-$STAMP"

fail() { echo "ERROR: $*" >&2; exit 1; }
info() { echo "INFO: $*"; }

[[ "${EUID}" -eq 0 ]] || fail "Run as root (sudo bash $0)."
[[ -f "$DEPLOY_DIR/docker-compose.yaml" ]] || fail "Missing $DEPLOY_DIR/docker-compose.yaml"
[[ -d "$SOURCE_DIR/.git" ]] || fail "Missing source checkout: $SOURCE_DIR"
command -v docker >/dev/null || fail "docker is required"
command -v tar >/dev/null || fail "tar is required"
command -v gzip >/dev/null || fail "gzip is required"

mkdir -p "$CHECKPOINT"
chmod 700 "$BACKUP_ROOT" "$CHECKPOINT"
info "Creating checkpoint: $CHECKPOINT"
df -h "$BACKUP_ROOT"

git -C "$SOURCE_DIR" rev-parse HEAD > "$CHECKPOINT/source-commit.txt"
git -C "$SOURCE_DIR" status --short > "$CHECKPOINT/source-status.txt" || true
git -C "$SOURCE_DIR" diff --binary > "$CHECKPOINT/source-working-tree.patch" || true

# Includes .env and local Compose/script customizations. Backups stay root-only.
tar -C "$DEPLOY_DIR" -czf "$CHECKPOINT/deploy-tree.tar.gz" .
tar -C "$(dirname "$SOURCE_DIR")" -czf "$CHECKPOINT/source-tree.tar.gz" "$(basename "$SOURCE_DIR")"

docker compose -f "$DEPLOY_DIR/docker-compose.yaml" config > "$CHECKPOINT/compose.resolved.yaml"
docker compose -f "$DEPLOY_DIR/docker-compose.yaml" ps > "$CHECKPOINT/compose.ps.txt" || true
docker compose -f "$DEPLOY_DIR/docker-compose.yaml" config --images | sort -u > "$CHECKPOINT/images.txt"

: > "$CHECKPOINT/image-ids.tsv"
while IFS= read -r image; do
  [[ -n "$image" ]] || continue
  if docker image inspect "$image" >/dev/null 2>&1; then
    image_id="$(docker image inspect --format '{{.Id}}' "$image")"
    printf '%s\t%s\n' "$image" "$image_id" >> "$CHECKPOINT/image-ids.tsv"
  else
    printf 'WARN missing local image: %s\n' "$image" >> "$CHECKPOINT/warnings.txt"
  fi
done < "$CHECKPOINT/images.txt"

# Database backup is written locally and never printed.
docker compose -f "$DEPLOY_DIR/docker-compose.yaml" exec -T postgres sh -ceu '
  pg_dump --clean --if-exists --no-owner --no-privileges \
    -U "$POSTGRES_USER" "$POSTGRES_DB"
' | gzip -c > "$CHECKPOINT/postgres.sql.gz"

cat > "$CHECKPOINT/scope.txt" <<EOF
Checkpoint scope:
- complete source checkout and live deployment directory (including .env)
- resolved Compose configuration and currently referenced local image IDs
- PostgreSQL schema and data dump
Not included:
- host operating-system state, external PBX/provider state, or MinIO objects created after this checkpoint
For a whole-VPS rollback, also create a Hetzner Cloud Snapshot before deployment.
Do not run docker image prune before accepting the deployment; rollback needs the saved image IDs.
EOF

(
  cd "$CHECKPOINT"
  sha256sum deploy-tree.tar.gz source-tree.tar.gz postgres.sql.gz > SHA256SUMS
)

info "Checkpoint complete."
echo "CHECKPOINT=$CHECKPOINT"
echo "Next: deploy only after recording this path."
