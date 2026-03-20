#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="${1:-/opt/zhihuo}"

cd "$DEPLOY_DIR"
git fetch --all --prune
git checkout main
git pull --ff-only
docker compose up -d --build
docker compose ps
