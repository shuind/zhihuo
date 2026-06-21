# 知惑 Zhihuo · 瘦身计划

> 视角：体积 / 依赖 / 仓库整洁
> 日期：2026-06-08
> 关系：第四阶段（收尾）。前三份是手感、设计、性能，都已交给 codex。本篇只谈"减重"——删冗余、砍体积、清仓库。
> 排序：按"省下的字节 × 风险低"排，第一条远大于其余之和。

---

## P0 · 中文字体 = 最大的一块肥肉（约 3MB）

`layout.tsx` 同步 import 了 4 个字体 CSS：

```
chinese-simplified-300  ← woff2 体积级别 ~1.3MB
chinese-simplified-400  ← woff2 实测 1.5MB
latin-300 / latin-400   ← 小
```

**首屏要拉约 3MB 中文字体**，这是整个产品最大的加载与体积负担，超过 JS 包本身。Noto Serif SC 全字符集本就庞大，而 fontsource 的整包还在 `node_modules` 占 87M。

这里有三档优化，按收益：

### 方案 A（推荐）：字体子集化 — 只打包用到的字
产品 UI 文案是**固定的中文**（"时间档案馆""已存入时间""清明·初日"等），用户输入的疑问才是动态字。但 UI 文案可以子集化：
- 用 `fonttools` / `subset-font` 把 UI 高频字打成一个几十 KB 的子集，作为首屏字体。
- 全量字体改成**按需懒加载**（用户真正进到要渲染大量自定义文字的界面，比如笺导出，再加载完整字重）。

### 方案 B：砍掉一个字重
现在 300 + 400 两个字重都全量加载。检查 UI 是否真的同时需要两档——多数克制型界面用单字重 + 透明度就够。**砍掉 300，立省约一半字体流量。**

### 方案 C：`font-display: swap` + 异步
确保字体不阻塞首屏渲染，先用系统衬线（CSS 里 fallback 已配了 STSong/Songti SC）顶上，字体到了再换。至少别让 3MB 卡白屏。

> 这条做完，首屏体积和 TTI 的改善会比后面所有条加起来都明显。

---

## P1 · 依赖与代码冗余

### 1. framer-motion → 大部分可换纯 CSS（省约 40–50KB gz）

实测用量：`motion.div×21`、`AnimatePresence×21`、`motion.section×10`、少量 aside/article。**全是基础的进出场动画**，没有用到 `useScroll` / `useTransform` / `layout` 等 framer 真正值钱的能力。

- 进出场用 CSS transition + `data-state` 切换即可覆盖绝大多数。
- 若嫌 `AnimatePresence` 的退场时机难手写，可只保留它、其余换 CSS，或换更轻的方案。
- 这条和设计稿"统一动效时长"是同一波改动，一起做最省事。

### 2. `card.tsx` 只用了 1 处

`components/ui/card.tsx` 全项目仅 1 个文件引用（settings-layer），而 card 模块导出了 Header/Title/Description/Content/Footer 一整套。要么内联到那一处、删掉组件文件，要么确认它值得作为通用件保留。小事，但属于"用一个引一整套"的典型冗余。

### 3. 确认无未用依赖
当前 `package.json` 的依赖核查下来**都在用**（pg×10、html-to-image、nodemailer、radix-slot 各 1+），没有明显死依赖。这点是健康的，不用动。

---

## P2 · 仓库整洁（不影响运行，影响 clone 与心智）

### 4. 根目录 4 个 codex 日志没被 git 跟踪管住

```
codex-dev-err.log        (0B)
codex-dev-out.log        (979B)
codex-next-start-err.log (56B)
codex-next-start-out.log (122KB) ← 122KB 的日志躺在根目录
```

`.gitignore` 里有 `/*.log`、`/*-out.log`、`/*-err.log`——规则是覆盖到的，所以它们没进版本库（好）。但它们**物理躺在工作区根目录**，每次 `ls` 都碍眼，`codex-next-start-out.log` 还有 122KB。建议直接删掉，让 codex 把日志写到 `.tmp/` 这类已忽略目录里。

### 5. `.next` 占 499M
开发构建缓存，正常。但如果磁盘紧张，`rm -rf .next` 随时可重建。`out`（20M）、`android`（20M）同理。这些都已在 `.gitignore`，只是本地占用提醒。

---

## P3 · 路由表面积

### 6. 调试路由确认已锁

`app/letter/page.tsx` 已做 `notFound()` 守卫（仅 dev 或显式开 `NEXT_PUBLIC_ENABLE_LETTER_DEBUG`），**这点做得对**，生产不暴露。`LetterStudio`（独立笺工作台）只被这个调试页引用——确认它不打进生产包即可，目前看是安全的。

### 7. `ops-monitor` / `apk` 页面
属于运维/分发面，不是核心三层。确认它们在移动端静态导出时是否需要被排除（移动 App 里不需要 ops-monitor）。能排除就少打两个页面的 JS。

---

## 落地顺序（性价比）

| 顺序 | 项 | 预计收益 | 风险 |
|---|---|---|---|
| 1 | **#P0 字体子集化 / 砍字重** | 首屏 −2~3MB | 低（fallback 已配） |
| 2 | #1 framer → CSS | −40~50KB gz + 运行时 | 中（要测退场动画） |
| 3 | #4 删根目录日志 | 仓库整洁 | 零 |
| 4 | #7 移动端排除 ops/apk | 少打 2 页 | 低 |
| 5 | #2 card 内联 | 极小 | 零 |

---

## 一句话总结

瘦身的 90% 都在**第一条——3MB 中文字体**。其余是锦上添花。如果只做一件事，就做字体子集化 + `font-display: swap`。framer-motion 那条正好可以并进设计阶段的动效统一里一起做，不额外开工。

至此四个阶段（手感 / 设计 / 性能 / 瘦身）齐了。需要的话我可以先帮你把 #4（删日志）和 #P0 的字体子集脚本搭起来——这两件互不冲突、都能立刻落地。
