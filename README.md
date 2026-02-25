# Zhihuo v0 Frontend

Frontend prototype for Zhihuo built with:

- `Next.js 16`
- `TypeScript`
- `Tailwind CSS 4`
- `React Three Fiber`

## Routes

- `/feed` - doubt capture
- `/sky` - 3D sky forest overview
- `/forest/[id]` - cluster detail
- `/timeline` - time-based evolution
- `/explore` - explicit explore mode
- `/settings` - constitution and feature toggles

## API (MVP)

- `GET /api/health`
- `GET /api/bootstrap`
- `GET /api/doubts`
- `POST /api/doubts`
- `GET /api/clusters`
- `GET /api/timeline`
- `PATCH /api/links/:id/suppress`

## Run

```bash
pnpm install
pnpm dev
```

If your environment forces offline pnpm mode:

```bash
pnpm install --config.offline=false
```

## Notes

- Google font import was removed from `app/layout.tsx` to avoid Turbopack font resolver issues.
- Dev script uses webpack mode: `next dev --webpack`.
