# 知惑 Zhihuo · 性能与内存优化清单

> 视角：前端性能 / 资源占用
> 日期：2026-06-08
> 关系：第三阶段。承接手感（一）、设计（二）。本篇只谈跑得快不快、占多少内存。
> 说明：本篇结论基于实际代码核查，并修正了第一阶段稿中的一处误判。

---

## 先更正一处误判

第一阶段稿里我担心"媒体以 base64 塞进 localStorage、很快撞 5–10MB 上限"。**核查后这是错的**：媒体走的是 IndexedDB 存 `Blob`（`offline-store.ts`），渲染用 `URL.createObjectURL`，且 `time-archive.tsx:837` 有 `revokeObjectURL` 回收。这块工程是干净的。localStorage 只存文本类的 doubts/nodes/meta，压力小得多。

所以内存的真正风险不在媒体存储，而在下面几处。

---

## P0 · 单文件巨石 = 运行时与维护双重负担

### 1. `time-archive.tsx`：7070 行 / 134 个 useMemo·useCallback / 32 个 useEffect

这不只是维护问题，是**运行时问题**。这一个组件持有几乎所有状态（两个 store、同步状态机、鉴权、PIN、媒体、离线队列）。任何一处 `setState`——哪怕只是改个同步状态的 pill——都会让这个巨型组件**重新执行整套 134 个 memo 的依赖比对**。

后果：

- 输入时的轻微迟滞（每次按键可能触发顶层重渲）。
- 134 个 `useCallback` 本身有内存成本：每个都常驻一个闭包 + 依赖数组。
- 32 个 effect 的依赖数组每次渲染都要逐一浅比较。

**这是当前最大的性能杠杆。** 拆分（手感稿里也提过，这里从性能角度再强调）：
- 同步/离线 → `useSyncEngine`，独立组件，状态变化不波及输入区。
- 鉴权/PIN → `useAuthGate`。
- 三层各自 `memo()` 包裹，靠 props 隔离，让"切 tab / 改同步状态"不会重渲未激活的层。

目标：顶层组件 setState 的重渲范围**从"整棵树"缩到"相关子树"**。

---

## P1 · 轮询与定时器

### 2. 30 秒云同步轮询常驻

`time-archive.tsx:161` `CLOUD_SYNC_CHECK_INTERVAL_MS = 30s`，`3184` 起一个 `setInterval` 每 30s `run()` 一次。

现状已经做了 `visibilitychange` 判断（不可见时 `run` 内部应跳过），这点是对的。但仍建议：

- **页面隐藏时直接 `clearInterval`，可见时再重建**，而不是靠每次 tick 内部判断后空转。空转的 tick 仍会唤醒 JS 线程、阻止某些省电状态。
- 30s 固定间隔可以改**退避策略**：有改动时密、长期无改动时拉长到 60–120s。沉思类产品大部分时间是静止的，没必要每 30s 醒一次。

### 3. 离线时 15 秒健康探测

`time-archive.tsx:3201` 离线时每 15s `fetch('/v1/health')`。离线状态下高频探测意义不大且耗电。建议同样用退避（15s → 30s → 60s），连上后立即恢复。

---

## P2 · 渲染与动画开销

### 4. 媒体 objectURL 全量重建

`time-archive.tsx:837` 的 effect 依赖 `[offlineMediaAssets, thinkingStore.mediaAssets]`，一旦变化就**把所有 blob 全部 `revoke` + 全部重新 `createObjectURL`**。媒体多时，每次新增一张图都会重建全部 URL，造成图片闪烁 + 短时内存峰值（旧 URL 未必立即释放）。建议改成**增量 diff**：只为新增 asset 建 URL、只为移除的 revoke。

### 5. 常驻动画的合成层成本

设计稿里提过星点 `twinkle 9s infinite` 和 `life-drift 22s/30s`（雾气）常驻。从性能角度补充：

- 这些动画在页面**不可见时也在跑**。给 `.star` / `.life-mist` 加 `animation-play-state: paused`（配合 `visibilitychange` 或 `:where(body:not(.is-hidden))`）。
- `.life-mist` 用 `mix-blend-mode: screen` + 大半径 `radial-gradient` + 动画，是合成器的重活，低端 Android WebView 上是掉帧主因之一。可降低其更新频率或在低端设备禁用。

### 6. `backdrop-filter: blur` 与滚动同屏

性能稿复述设计稿要点：blur 区域随列表滚动会持续重算。Capacitor Android 上尤其明显。`time-detail-shell` 在生活层已经把 blur 关成 `none`（globals.css:263），是对的——把这个做法推广，移动端尽量用半透明实色替代 blur。

---

## P3 · 包体积与加载

### 7. framer-motion 全量引入

`framer-motion` 在 `life-layer`、`time-archive` 等多处用，但多数只是 `motion.div` + 简单 `animate`。framer-motion 运行时不小（gz 后约 40–50KB）。两个选择：
- 多数简单位移/淡入用纯 CSS transition 即可（设计稿要统一动效时长，正好一起换）。
- 保留 framer 的地方确保走 tree-shaking，别引入用不到的 feature。

### 8. 字体加载

`layout.tsx` 同步 import 了 Noto Serif SC 简体 300/400 + latin 300/400 四个 CSS。中文字体子集很大，建议确认是否按 `unicode-range` 分片加载、是否 `font-display: swap`，首屏别被字体阻塞。

### 9. 移动端 `images.unoptimized: true`

`next.config.mjs` 移动构建关掉了图片优化（静态导出必需，合理）。但这意味着用户上传的图片原样进 DOM。建议上传时在客户端**压缩 + 限制最大边长**（如 1600px），既省内存又省 IndexedDB 空间和同步流量。

---

## 落地顺序（按"性价比"排）

1. **#1 拆 `time-archive.tsx`** —— 工程量最大，但收益最大，输入迟滞、内存常驻、可维护性一次性解决。可分两步：先抽 `useSyncEngine`，再三层 `memo`。
2. **#2 / #3 定时器退避 + 隐藏即停** —— 改动小，直接降耗电与空转。
3. **#4 媒体 URL 增量重建** + **#9 上传压缩** —— 媒体场景内存与流量。
4. **#5 / #6 动画与 blur** —— 移动端流畅度。
5. **#7 framer 瘦身 / #8 字体** —— 加载与包体。

要先做的话，#2/#3（定时器）风险最低、最快见效；#1 收益最大但需要规划。建议从 #2/#3 起步验证，再投入 #1 的拆分。
