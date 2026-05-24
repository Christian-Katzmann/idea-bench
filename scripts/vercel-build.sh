#!/usr/bin/env bash
set -euo pipefail

if [[ "${VERCEL_ENV:-}" == "preview" && -z "${DATABASE_URL:-}" ]]; then
  echo "Skipping database preflight for Vercel preview: DATABASE_URL is not configured."
  npm run build
else
  npm run deploy:check
  npm run build
fi
