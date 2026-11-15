#!/usr/bin/env bash
# Optional Vercel Ignored Build Step.
# Exit 0 skips the deployment. Exit 1 builds it.
#
# From the repository root:
#   bash scripts/vercel-affected.sh admin
#   bash scripts/vercel-affected.sh clinic-client
#
# Vercel can also skip unaffected projects automatically when workspace
# dependencies are declared. Use this script when a documentation-only change
# should not redeploy every application. See docs/DEPLOYMENT.md.

set -u

APP_DIR="${1:-}"

if [[ -z "$APP_DIR" ]]; then
  echo "Usage: bash scripts/vercel-affected.sh <admin|clinic-client>" >&2
  exit 1
fi

if ! git rev-parse --verify "HEAD^" >/dev/null 2>&1; then
  echo "No parent commit. Building ${APP_DIR}."
  exit 1
fi

if git diff --quiet "HEAD^" HEAD -- \
  "$APP_DIR" \
  packages \
  pnpm-lock.yaml \
  pnpm-workspace.yaml \
  package.json \
  scripts
then
  echo "No changes affecting ${APP_DIR}. Skipping the build."
  exit 0
fi

echo "Changes affect ${APP_DIR}. Building."
exit 1
