#!/bin/bash
# Start production stack. Always run this instead of `docker compose up` directly.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

exec docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d "$@"
