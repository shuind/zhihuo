#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <repo-url> [deploy-dir]"
  exit 1
fi

REPO_URL="$1"
DEPLOY_DIR="${2:-/opt/zhihuo}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required"
  exit 1
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required"
  exit 1
fi

if ! command -v docker-compose >/dev/null 2>&1 && ! docker compose version >/dev/null 2>&1; then
  echo "docker compose is required"
  exit 1
fi

mkdir -p "$DEPLOY_DIR"
if [[ ! -d "$DEPLOY_DIR/.git" ]]; then
  git clone "$REPO_URL" "$DEPLOY_DIR"
fi

cd "$DEPLOY_DIR"
git checkout main
git pull --ff-only

if [[ ! -f .env.production ]]; then
  cp .env.production.example .env.production
  echo "Created .env.production from template. Please edit it before first run."
fi

docker compose up -d --build
docker compose ps
