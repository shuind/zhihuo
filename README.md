# 知惑 Zhihuo

知惑是一款以“记录疑问、整理思路、回望时间”为核心的个人思考应用。项目同时支持 Next.js Web、PWA 与 Capacitor Android，并提供离线存储、账户同步、媒体附件、AI 辅助和信笺导出。

## 开发

环境要求：Node.js 20+、pnpm 10。复制 `.env.production.example` 中需要的变量到本地环境文件；本地未配置 PostgreSQL 时会使用 `data/` 下的 JSON 存储。

```bash
pnpm install
pnpm dev
```

常用检查：

```bash
pnpm lint
pnpm test:store-regression
pnpm test:api-routes
pnpm test:ui-smoke
pnpm build
```

Android 构建参见 [移动端构建说明](./docs/MOBILE_APK.md)，服务器部署参见 [部署说明](./docs/DEPLOYMENT.md)。

## 目录

- `app/`：Next.js 页面、布局与 `/v1` API 路由。
- `components/`：生活、思考、设置、时间档案与信笺界面。
- `lib/`：客户端工具、服务端存储、同步与安全逻辑。
- `db/migrations/`：PostgreSQL 数据库迁移。
- `scripts/`：回归测试、字体与移动端构建脚本。
- `docs/`：部署、移动端构建与优化记录。
- `android/`：Capacitor Android 原生工程。
- `public/`：PWA、字体、图标和发布 APK。

## 本地文件约定

`data/` 保存 JSON 数据库及媒体，`runtime-data/` 保存运行时密钥；两者都被 Git 忽略，不应当作缓存删除。Docker Compose 分别将它们持久化到 `zhihuo-user-data` 与 `zhihuo-runtime-data` 命名卷，备份时两者都必须包含。`.next/`、`out/`、`.mobile-build/`、`.tmp/`、Android `build/` 与 `.gradle/` 均为可再生成产物，可安全清理。

当前优化状态和后续工作统一记录在 [优化记录](./docs/OPTIMIZATION.md)。历史优化草稿不再单独维护。
