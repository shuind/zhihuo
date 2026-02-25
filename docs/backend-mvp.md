# Zhihuo Backend MVP

This project now includes a file-backed backend with Next.js route handlers.

## Storage

- File path: `data/zhihuo-db.json`
- Fallback seed: `lib/mock-data.ts`
- Runtime: Node.js route handlers (`runtime = "nodejs"`)

## Endpoints

### `GET /api/health`

Health check endpoint.

### `GET /api/bootstrap`

Returns initial state payload:

```json
{
  "userId": "user-demo-001",
  "doubts": [],
  "clusters": [],
  "candidateLinks": []
}
```

### `GET /api/doubts?limit=20&cursor=...`

Cursor-based doubt list.

### `POST /api/doubts`

Create doubt item.

Request body:

```json
{
  "rawText": "text",
  "layer": "life"
}
```

### `GET /api/clusters`

Returns cluster list.

### `GET /api/timeline?year=2026&clusterId=self-worth&limit=200`

Returns timeline items sorted by time ascending.

### `PATCH /api/links/:id/suppress`

Suppresses one candidate link.

## User context

All endpoints read user id from:

1. `x-user-id` header
2. `userId` query param
3. fallback: `user-demo-001`
