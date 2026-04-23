#!/usr/bin/env bash
set -euo pipefail

# copy-minimal.sh
# Safely copy minimal components from stumble-upon and link-engine into Serendip.bot
# Usage:
#   ./copy-minimal.sh          # dry-run (default)
#   ./copy-minimal.sh --apply  # actually copy files

SRC_STUMBLE="/Users/will/git/stumble-upon"
SRC_LINK_ENGINE="/Users/will/git/link-engine"
DEST="/Users/will/Serendip.bot"

RSYNC_EXCLUDES=(
  --exclude=.env*
  --exclude=node_modules
  --exclude=.venv
  --exclude=runs
  --exclude=dist
  --exclude=build
  --exclude=*.egg-info
  --exclude=__pycache__
  --exclude=.pytest_cache
  --exclude=.mypy_cache
  --exclude=.git
)

DRY_RUN="--dry-run"
if [ "${1:-}" = "--apply" ]; then
  DRY_RUN=""
fi

echo "Destination: ${DEST}"

mkdir -p "${DEST}/apps/web" "${DEST}/apps/api" "${DEST}/packages/db" "${DEST}/packages/types" "${DEST}/services/link-engine"

echo "Copying stumble-upon -> ${DEST} (minimal set)"
rsync -av --progress ${DRY_RUN} "${RSYNC_EXCLUDES[@]}" "${SRC_STUMBLE}/apps/web/" "${DEST}/apps/web/"
rsync -av --progress ${DRY_RUN} "${RSYNC_EXCLUDES[@]}" "${SRC_STUMBLE}/apps/api/" "${DEST}/apps/api/"
rsync -av --progress ${DRY_RUN} "${RSYNC_EXCLUDES[@]}" "${SRC_STUMBLE}/packages/db/" "${DEST}/packages/db/"
rsync -av --progress ${DRY_RUN} "${RSYNC_EXCLUDES[@]}" "${SRC_STUMBLE}/packages/types/" "${DEST}/packages/types/"

echo "Copying link-engine -> ${DEST}/services/link-engine (minimal set)"
rsync -av --progress ${DRY_RUN} "${RSYNC_EXCLUDES[@]}" "${SRC_LINK_ENGINE}/pyproject.toml" "${DEST}/services/link-engine/"
rsync -av --progress ${DRY_RUN} "${RSYNC_EXCLUDES[@]}" "${SRC_LINK_ENGINE}/src/link_engine/" "${DEST}/services/link-engine/src/link_engine/"
rsync -av --progress ${DRY_RUN} "${RSYNC_EXCLUDES[@]}" "${SRC_LINK_ENGINE}/services/discovery_service/" "${DEST}/services/link-engine/services/discovery_service/"
rsync -av --progress ${DRY_RUN} "${SRC_LINK_ENGINE}/.env.example" "${DEST}/services/link-engine/.env.example"
rsync -av --progress ${DRY_RUN} "${RSYNC_EXCLUDES[@]}" "${SRC_LINK_ENGINE}/README.md" "${DEST}/services/link-engine/README.md"
rsync -av --progress ${DRY_RUN} "${RSYNC_EXCLUDES[@]}" "${SRC_LINK_ENGINE}/Dockerfile.discovery" "${DEST}/services/link-engine/Dockerfile.discovery"
rsync -av --progress ${DRY_RUN} "${RSYNC_EXCLUDES[@]}" "${SRC_LINK_ENGINE}/Dockerfile.celery" "${DEST}/services/link-engine/Dockerfile.celery"
rsync -av --progress ${DRY_RUN} "${RSYNC_EXCLUDES[@]}" "${SRC_LINK_ENGINE}/scripts/" "${DEST}/services/link-engine/scripts/"

echo "Done."
if [ "${DRY_RUN}" = "--dry-run" ]; then
  echo "This was a dry run. Re-run with --apply to perform the copy."
fi
