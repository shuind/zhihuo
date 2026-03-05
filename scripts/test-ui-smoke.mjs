const baseUrl = (process.env.TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const email = `zhihuo-ui-${Date.now()}@example.com`;
const password = "StrongPass123!";
const QUESTION_PLACEHOLDER = "继续输入一个疑问…";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function hasMojibake(text) {
  return /�|锛|銆\?|鏄|鍚庢|閭|璇疯|缂哄|杞ㄩ/.test(text);
}

async function assertNoMojibake(page, scope) {
  const text = await page.locator("body").innerText();
  assert(!hasMojibake(text), `${scope} 出现疑似乱码`);
}

async function ensureSignedIn(page) {
  await page.waitForFunction(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const hasThinkingTab = buttons.some((el) => el.textContent?.includes("思路"));
    const hasEmailInput = Array.from(document.querySelectorAll("input")).some((el) => el.getAttribute("placeholder") === "邮箱");
    return hasThinkingTab || hasEmailInput;
  }, { timeout: 20000 });

  const thinkingTab = page.getByRole("button", { name: "思路" }).first();
  if (await thinkingTab.isVisible().catch(() => false)) return;

  await page.getByRole("button", { name: "注册" }).click();
  await page.getByPlaceholder("邮箱").fill(email);
  await page.getByPlaceholder("密码（至少8位）").fill(password);
  await page.getByRole("button", { name: "注册并登录" }).click();
  await page.getByRole("button", { name: "思路" }).waitFor({ timeout: 20000 });
}

async function openThinking(page) {
  const thinkingTab = page.getByRole("button", { name: "思路" }).first();
  if (await thinkingTab.isVisible().catch(() => false)) await thinkingTab.click();
  await page.getByRole("button", { name: /新空间/ }).first().waitFor({ timeout: 12000 });
}

async function createSpace(page, title) {
  console.log("[ui-smoke] create space");
  await page.getByRole("button", { name: /新空间/ }).first().click();
  await page.getByPlaceholder("输入一个根问题").fill(title);
  await page.getByRole("button", { name: /^创建(中\.\.\.)?$/ }).click();
  await page.getByText(title).first().waitFor({ timeout: 10000 });
  await page.getByPlaceholder(QUESTION_PLACEHOLDER).waitFor({ timeout: 10000 });
}

async function addTrackNodes(page, count) {
  console.log("[ui-smoke] add nodes");
  const input = page.getByPlaceholder(QUESTION_PLACEHOLDER);
  for (let i = 1; i <= count; i += 1) {
    await input.fill(`轨道测试陈述 ${i}`);
    await page.getByRole("button", { name: /^放入结构|放入中\.\.\.$/ }).first().click();
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(900);
}

async function assertTrackScrollableAndCentered(page) {
  console.log("[ui-smoke] assert track scroll+center");
  let metrics = null;
  for (let i = 0; i < 24; i += 1) {
    metrics = await page.evaluate(() => {
      const container = document.querySelector('[data-track-scroll="true"]');
      const nodes = [...document.querySelectorAll('[data-track-node="true"]')];
      if (!(container instanceof HTMLElement)) return { ok: false, reason: "missing track container" };
      if (!nodes.length) return { ok: false, reason: "missing track nodes" };
      const latest = nodes[nodes.length - 1];
      if (!(latest instanceof HTMLElement)) return { ok: false, reason: "missing latest node" };

      const c = container.getBoundingClientRect();
      const n = latest.getBoundingClientRect();
      const delta = Math.abs(n.top + n.height / 2 - (c.top + c.height / 2));

      return {
        ok: true,
        scrollable: container.scrollHeight > container.clientHeight + 2,
        delta,
        threshold: Math.max(92, c.height * 0.3)
      };
    });

    if (metrics?.ok && metrics.scrollable && metrics.delta <= metrics.threshold) break;
    await page.waitForTimeout(220);
  }

  assert(metrics?.ok, `轨道校验失败: ${metrics?.reason || "unknown"}`);
  assert(metrics.scrollable, "轨道列表不可滚动");
  assert(metrics.delta <= metrics.threshold, `最新卡片未居中，偏差 ${Math.round(metrics.delta)}`);
}

async function assertMenuActions(page) {
  console.log("[ui-smoke] assert node menu");
  await page.getByRole("button", { name: "节点菜单" }).first().click();
  await page.getByRole("menuitem", { name: "新方向" }).first().click();
  await page.waitForTimeout(420);

  await page.getByRole("button", { name: "节点菜单" }).first().click();
  await page.getByRole("menuitem", { name: "暂停轨道" }).first().click();
  await page.waitForTimeout(220);
  const dimmed = await page.evaluate(() => {
    const panel = document.querySelector('[data-track-panel="true"]');
    if (!(panel instanceof HTMLElement)) return false;
    return Number.parseFloat(getComputedStyle(panel).opacity || "1") < 0.7;
  });
  assert(dimmed, "暂停轨道后视觉未变淡");

  await page.getByRole("button", { name: "节点菜单" }).first().click();
  await page.getByRole("menuitem", { name: "恢复轨道" }).first().click();
  await page.waitForTimeout(200);

  const countBefore = await page.locator('[data-track-node="true"]').count();
  await page.getByRole("button", { name: "节点菜单" }).nth(1).click();
  await page.getByRole("menuitem", { name: "删除" }).first().click();
  await page.waitForTimeout(350);
  const countAfter = await page.locator('[data-track-node="true"]').count();
  assert(countAfter < countBefore, "删除节点未生效");
}

async function assertTrackSwitchRestore(page) {
  console.log("[ui-smoke] assert switch restore");
  const previousTop = await page.evaluate(() => {
    const container = document.querySelector('[data-track-scroll="true"]');
    if (!(container instanceof HTMLElement)) return -1;
    container.scrollTop = container.scrollHeight;
    return container.scrollTop;
  });
  assert(previousTop >= 0, "无法读取轨道滚动位置");

  const otherTrackButtons = page.locator('[data-other-tracks="true"] [data-other-track-button="true"]');
  const count = await otherTrackButtons.count();
  assert(count > 0, "缺少可切换的其他轨道");

  await otherTrackButtons.first().click();
  await page.waitForTimeout(380);
  await page.locator('[data-other-tracks="true"] [data-other-track-button="true"]').first().click();
  await page.waitForTimeout(460);

  const restoredTop = await page.evaluate(() => {
    const container = document.querySelector('[data-track-scroll="true"]');
    if (!(container instanceof HTMLElement)) return -1;
    return container.scrollTop;
  });
  assert(restoredTop >= 0, "切轨后无法读取滚动位置");
  assert(Math.abs(restoredTop - previousTop) <= 140, `切轨滚动位置恢复失败，差值 ${Math.round(Math.abs(restoredTop - previousTop))}`);
}

async function assertFreezeAndExport(page) {
  console.log("[ui-smoke] assert freeze+export");
  await page.getByRole("button", { name: "冻结" }).click();
  await page.getByRole("button", { name: "确认冻结" }).click();
  await page.getByText("冻结").first().waitFor({ timeout: 10000 });

  await page.getByRole("button", { name: "导出" }).click();
  const exportArea = page.locator("textarea").last();
  await exportArea.waitFor({ timeout: 8000 });
  await page.waitForFunction(
    () => {
      const all = Array.from(document.querySelectorAll("textarea"));
      const last = all[all.length - 1];
      if (!(last instanceof HTMLTextAreaElement)) return false;
      return last.value !== "导出生成中...";
    },
    { timeout: 12000 }
  );
  const exportText = await exportArea.inputValue();
  assert(exportText.trim().length > 20, "导出内容为空");
  await page.getByRole("button", { name: "关闭" }).first().click();
}

async function assertTabsAndMobile(page) {
  console.log("[ui-smoke] assert tabs+mobile");
  await page.getByRole("button", { name: "设置" }).click();
  await page.getByText("系统设置").waitFor({ timeout: 10000 });
  await assertNoMojibake(page, "设置页");

  await page.getByRole("button", { name: "时间" }).click();
  await page.getByText("时间档案馆").first().waitFor({ timeout: 10000 });
  await assertNoMojibake(page, "时间页");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "思路" }).click();
  await page.waitForSelector('input[placeholder="继续输入一个疑问…"], input[placeholder="该空间已只读"]', { timeout: 10000 });

  const noXOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert(noXOverflow, "移动端出现横向溢出");
  await assertNoMojibake(page, "移动端思路页");
}

async function run() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.error("[ui-smoke] 缺少依赖 playwright，请先安装后重试");
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    console.log(`[ui-smoke] base=${baseUrl}`);
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await ensureSignedIn(page);
    await assertNoMojibake(page, "首页");

    await openThinking(page);
    await createSpace(page, `轨道回归空间-${Date.now()}`);
    await addTrackNodes(page, 18);
    await assertTrackScrollableAndCentered(page);
    await assertMenuActions(page);
    await assertTrackSwitchRestore(page);
    await assertFreezeAndExport(page);
    await assertTabsAndMobile(page);

    console.log("[ui-smoke] all checks passed");
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[ui-smoke] failed:", message);
  process.exitCode = 1;
});
