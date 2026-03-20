# Deployment and CI/CD

## 1. Server prerequisites

- Linux host (Ubuntu 22.04+ recommended)
- Docker and Docker Compose
- Git
- Optional: domain + reverse proxy (Nginx/Caddy) for HTTPS

## 2. First deploy on server

```bash
sudo mkdir -p /opt/zhihuo
sudo chown -R $USER:$USER /opt/zhihuo
git clone <YOUR_REPO_URL> /opt/zhihuo
cd /opt/zhihuo
cp .env.production.example .env.production
```

Edit `.env.production`:
- set `AUTH_SECRET` to a strong random value
- set `POSTGRES_PASSWORD`
- ensure `DATABASE_URL` matches the Postgres credentials

Start services:

```bash
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:3000/v1/health
```

## 3. CI workflow

File: `.github/workflows/ci.yml`

Triggers:
- pull requests
- push to `main`

Checks:
- `pnpm lint`
- `pnpm build`
- `pnpm exec tsc --noEmit`
- start app and run `pnpm run test:api-routes`

## 4. CD workflow

File: `.github/workflows/deploy.yml`

Required GitHub Secrets:
- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DEPLOY_PORT` (optional, default 22)
- `DEPLOY_PATH` (example: `/opt/zhihuo`)

On `main` push, the workflow runs:
1. SSH to server
2. `git checkout main && git pull --ff-only`
3. `docker compose up -d --build`

## 5. Manual operations

Update:

```bash
bash deploy/update.sh /opt/zhihuo
```

Logs:

```bash
docker compose logs -f app
docker compose logs -f postgres
```

Rollback:

```bash
cd /opt/zhihuo
git log --oneline -n 10
git checkout <old_commit_sha>
docker compose up -d --build
```

## 6. Optional reverse proxy

Expose the app at `127.0.0.1:3000` behind Nginx/Caddy.
Use `/v1/health` for liveness/readiness probes.
