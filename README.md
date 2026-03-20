# 知惑 Zhihuo

知惑把“疑问”当成长期存在的思维材料，而不是立刻解决的任务。

- `时间层 Time`：时间档案馆，也是再次进入界面。它不解释过去，而是提供重新进入思考的入口。
- `思路层 Thinking Track`：围绕一个中心问题展开的平行方向。它不是树，不是脑图，也不是知识管理面板。
- `设置层 Settings`：导出、导入校验、数据清理与账户相关设置。

## 产品立意

知惑最特别的体验不是“记录”，而是 `再进入`：

- 从当时的问题重新进入
- 从上次停下的地方进入
- 从某个关键节点重新进入

时间层负责把过去的问题再次点燃；思路层负责让思考继续发生。

在思路层里，每条 track 代表的是一种 `推进方向`，不是分类桶。常见方向包括：

- 假设
- 回忆
- 反驳
- 担忧
- 现实限制
- 旁支念头

另外，系统固定保留一条弱化的缓冲轨 `先放这里`，用于接住暂时不适合放进当前线上的内容。

## 本地运行

1. 安装依赖

```bash
pnpm install
```

2. 配置环境变量

```bash
AUTH_SECRET=replace-with-strong-secret
# 可选：使用 PostgreSQL
# DATABASE_URL=postgres://user:pass@host:5432/zhihuo
```

3. 启动开发环境

```bash
pnpm dev
```

4. 打开

[http://localhost:3000](http://localhost:3000)

## 数据存储

- 未配置 `DATABASE_URL`：使用 `data/zhihuo-db.json`
- 配置 `DATABASE_URL`：使用 PostgreSQL
- 启动时会自动执行 `db/migrations/*.sql`

## 主要 API

### Auth
- `POST /v1/auth/register`
- `POST /v1/auth/login`
- `POST /v1/auth/logout`
- `GET /v1/auth/me`

### Time
- `POST /v1/doubts`
- `GET /v1/doubts?range=week|month|all`
- `GET /v1/doubts/{id}`
- `POST /v1/doubts/{id}/archive`
- `POST /v1/doubts/{id}/delete`
- `POST /v1/doubts/{id}/note`
- `POST /v1/doubts/{id}/to-thinking`

### Thinking Track
- `GET /v1/thinking/spaces`
- `POST /v1/thinking/spaces`
- `GET /v1/thinking/spaces/{space_id}`
- `POST /v1/thinking/spaces/{space_id}/questions`
- `POST /v1/thinking/spaces/{space_id}/organize-preview`
- `POST /v1/thinking/spaces/{space_id}/organize-apply`
- `POST /v1/thinking/spaces/{space_id}/write-to-time`
- `POST /v1/thinking/spaces/{space_id}/status`
- `POST /v1/thinking/spaces/{space_id}/delete`
- `POST /v1/thinking/spaces/{space_id}/track-direction`
- `GET /v1/thinking/spaces/{space_id}/export`
- `POST /v1/thinking/nodes/{node_id}/move`
- `POST /v1/thinking/nodes/{node_id}/misplaced`
- `POST /v1/thinking/nodes/{node_id}/delete`
- `POST /v1/thinking/nodes/{node_id}/link`
- `GET /v1/thinking/snapshot`

### System
- `GET /v1/system/export?format=json|markdown`
- `POST /v1/system/import/validate`
- `POST /v1/system/delete-all`

## 回归测试

先启动服务，再执行：

```bash
pnpm run test:api-routes
pnpm run test:ui-smoke
```

可选环境变量：

```bash
TEST_BASE_URL=http://127.0.0.1:3000
```

## 目录

- `app/`：页面与 Route Handlers
- `components/`：前端界面与交互
- `lib/server/`：服务端业务与存储
- `db/migrations/`：PostgreSQL 迁移
- `scripts/`：自动化回归脚本
