# 知惑 Zhihuo · 前端手感优化清单

> 视角：前端 / 交互
> 日期：2026-06-08
> 原则：舒适、顺手、不打断。每条都对应具体代码，能直接改。

---

## P0 · 真 bug，影响每一次输入

### 1. 中文输入法回车误提交（全项目通病）

这是一个中文产品，但**没有一处** Enter 提交做了输入法保护。搜狗/微软拼音/苹果拼音在选词时按回车，会被当成"提交"——疑问还没打完就存进去了。

涉及（`grep` 全中）：
- `life-layer.tsx:313` 记疑问
- `thinking-layer.tsx:2216 / 2291 / 2037 / 2107 / 2363` 加节点、各种输入
- `time-archive/auth.tsx:57 / 323 / 332 / 344` 登录/注册/验证码
- `thinking/star-map/thought-detail-panel.tsx:148`
- `space-dialogs.tsx:25`

修法统一加一行守卫（`e.nativeEvent.isComposing` 或 `e.keyCode === 229`）：

```ts
onKeyDown={(e) => {
  if (e.key !== "Enter" || e.shiftKey) return;
  if (e.nativeEvent.isComposing) return;   // ← 输入法选词中，放过
  e.preventDefault();
  void saveDoubt();
}}
```

建议封装成一个 `onSubmitEnter(fn)` 小工具，所有输入框共用，避免再漏。**这条改完，整个产品的输入手感会立刻不一样。**

---

## P1 · 动效偏慢，拖节奏

### 2. 700ms 的过渡太多

`life-layer.tsx` / `time-archive.tsx` 里 `duration-700` 出现 11 次、`duration-500` 7 次。分屏展开用了 `duration: 0.64`。

安静 ≠ 慢。0.7s 的布局位移在反复操作时会明显"等它走完"。建议：
- 布局/位移类降到 **280–360ms**（`EASE_GENTLE` 曲线保留，它本身很好）。
- 纯透明度淡入淡出可以留 500ms，氛围感由它承担就够。
- 给一条 `@media (prefers-reduced-motion: reduce)` 全局兜底，把位移类动画直接关掉。

### 3. 「已存入时间」提示固定 1400ms

`life-layer.tsx:211` 写死 1400ms 才淡出。连续记几条时，上一条的提示还压着。建议缩到 ~900ms，或新输入触发时立刻清掉上一个 timer（现在每次 `saveDoubt` 会重置，但时长仍偏长）。

---

## P2 · 触感与可达性（移动端为主）

### 4. 按钮没有按下反馈

`ui/button.tsx` 的 `buttonVariants` 只有 `hover:` 态，没有 `active:`。移动端没有 hover，点下去毫无反馈。建议给 ghost/默认态加 `active:scale-[0.98]` 或 `active:bg-*`，并 `touch-action: manipulation` 去掉 300ms 点击延迟。

底部导航 `.mobile-main-nav-item:active` 已经做了背景反馈（globals.css:80），是对的——把这个习惯推广到普通按钮。

### 5. 输入框聚焦态偏弱

记疑问的 Textarea（`life-layer.tsx:304`）`focus-visible:ring-0`，靠 placeholder 颜色变化暗示聚焦。在暗背景下不够明确。可加一条极淡的底部线（`border-b` 渐显），既不破坏氛围又给出"我在这写"的确定感。

### 6. 点击目标尺寸

顶栏 tab（`navigation.tsx` TopTab）`size="sm"` → `h-8`（32px），低于移动端 44px 推荐下限。`text-xs` 的圆点装饰也偏小。桌面无所谓，移动端建议抬到 40–44px 命中区（视觉可不变，扩大 padding/伪元素命中即可）。

---

## P3 · 性能与稳健

### 7. `backdrop-filter: blur` 在低端机掉帧

globals.css 多处 blur（6px / 4px）。Android WebView（Capacitor 打包）上 blur + 滚动同屏容易掉帧。建议：blur 半径减小，或在滚动容器祖先上避免 blur 与 `will-change` 叠加；可考虑滚动时临时降级。

### 8. 星点动画常驻

`.star { animation: twinkle 9s infinite }` + `createStars` 批量生成常驻 DOM 动画。数量大时是持续的合成开销。建议：限制星点数、用 `transform/opacity`（已是 opacity，OK），并在页面不可见时 `animation-play-state: paused`。

### 9. 残留调试日志

`letter-studio.tsx:57` 的 `console.error("[v0] export failed", ...)` 前缀清掉。全局 grep `[v0]` 一并清理。

---

## 建议落地顺序

1. **先修 #1（输入法回车）** —— 一次封装，全局受益，是手感提升最大的一改。
2. 再调 #2/#3 动效时长 —— 几个数字的事，立竿见影。
3. #4/#5 触感 —— 移动端体验补齐。
4. 其余按需。

要的话我现在就先把 #1 的输入法守卫做成统一工具并铺到所有输入框，这一步零风险、纯增益。
