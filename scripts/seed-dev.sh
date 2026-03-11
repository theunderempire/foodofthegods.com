#!/bin/bash
# Seed the development database. Drops and re-imports all collections.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

docker compose --profile seed run --rm db-seed
