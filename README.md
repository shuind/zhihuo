# 知惑 Zhihuo (Next.js)

当前仓库包含：
- 前端：Life Layer + Thinking Layer + Settings
- 后端：基于 Next Route Handlers 的 `/v1/*` API

## 本地运行

1. 安装依赖

```bash
pnpm install
```

2. 配置环境变量（开发最小）

```bash
# 必填（生产必须替换）
AUTH_SECRET=replace-with-strong-secret

# 可选：不填时使用本地 JSON 文件存储
# DATABASE_URL=postgres://user:pass@host:5432/zhihuo
```

3. 启动开发环境

```bash
pnpm dev
```

4. 打开

`http://localhost:3000`

## 数据存储与迁移

- 无 `DATABASE_URL`：使用 `data/zhihuo-db.json`（仅开发用途）。
- 有 `DATABASE_URL`：使用 PostgreSQL。
- 启动时自动执行 `db/migrations/*.sql`。
- 若存在历史 `app_state` JSONB 数据，会自动迁移到规范化表。

## 认证与多用户

- 使用 `zhihuo_session` HttpOnly Cookie 会话。
- 生产环境默认只接受 Cookie，不再依赖 `x-user-id`。
- 仅当 `ALLOW_USER_HEADER=true` 时，允许通过请求头注入用户（调试用途）。

## 已实现 API

### Auth
- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/auth/logout`
- `GET /v1/auth/me`

### Life
- `POST /v1/doubts`
- `GET /v1/doubts?range=week|month|all&include_archived=true|false`
- `GET /v1/doubts/{id}`
- `POST /v1/doubts/{id}/archive`
- `POST /v1/doubts/{id}/delete`
- `POST /v1/doubts/{id}/note`
- `POST /v1/doubts/{id}/to-thinking`

### Thinking
- `GET /v1/thinking/spaces`
- `POST /v1/thinking/spaces`
- `GET /v1/thinking/spaces/{space_id}`
- `POST /v1/thinking/spaces/{space_id}/questions`
- `POST /v1/thinking/spaces/{space_id}/rebuild`
- `POST /v1/thinking/spaces/{space_id}/freeze`
- `POST /v1/thinking/spaces/{space_id}/status`
- `GET /v1/thinking/spaces/{space_id}/export`
- `POST /v1/thinking/nodes/{node_id}/move`
- `POST /v1/thinking/nodes/{node_id}/misplaced`
- `GET /v1/thinking/snapshot`（兼容只读）
- `POST /v1/thinking/snapshot`（已废弃，返回 410）

### System / 安全
- `GET /v1/system/export`（全量导出 + checksum）
- `POST /v1/system/import/validate`（校验 checksum 与引用完整性）
- `POST /v1/system/delete-all`（全量删除 + 审计，需 `confirm_text: "DELETE ALL"`）

## 可观测性与稳定性

- 所有 `/v1/*` 路由已接入统一错误边界与结构化日志（JSON）。
- 核心写操作已接入内存级速率限制（429 + `retry-after`）。
- PostgreSQL 读写包含瞬时错误重试（序列化冲突/死锁等）。

## 自动化 API 回归

先启动服务，再运行：

```bash
pnpm run test:api-routes
```

可用环境变量：

```bash
TEST_BASE_URL=http://127.0.0.1:3000
```

## 目录

- `app/` 页面与 Route Handlers
- `app/v1/**` API 路由
- `components/` 前端交互层
- `lib/server/` 后端业务、存储、安全与观测
- `db/migrations/` PostgreSQL 迁移脚本
- `scripts/` 自动化脚本
