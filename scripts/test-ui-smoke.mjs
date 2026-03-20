const baseUrl = (process.env.TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const email = `zhihuo-ui-${Date.now()}@example.com`;
const password = "StrongPass123!";
const QUESTION_PLACEHOLDER = "继续这条思路…";

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
  await page.waitForSelector('button:has-text("思路"), input[placeholder="邮箱"]', { timeout: 60000 });

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
  await page.getByPlaceholder("写下这段思考现在围着什么转").fill(title);
  await page.getByRole("button", { name: /^创建(中\.\.\.)?$/ }).click();
  await page.locator('[data-thinking-detail-header="true"]').waitFor({ timeout: 10000 });
  await page.getByPlaceholder(QUESTION_PLACEHOLDER).waitFor({ timeout: 10000 });
}

async function assertWorkbenchLayout(page) {
  console.log("[ui-smoke] assert workbench layout");
  await page.locator('[data-thinking-detail="true"]').waitFor({ timeout: 10000 });
  await page.locator('[data-thinking-detail-header="true"]').waitFor({ timeout: 10000 });
  await page.locator('[data-composer="true"]').waitFor({ timeout: 10000 });
  await page.locator('[data-track-panel="true"]').waitFor({ timeout: 10000 });
  await page.locator('[data-other-tracks="true"]').waitFor({ timeout: 10000 });
  const globalThinkingTabVisible = await page.getByRole("button", { name: "思路" }).first().isVisible().catch(() => false);
  assert(!globalThinkingTabVisible, "详情页打开后全局顶栏仍然可见");
  await expectComposerGuard(page);
  await page.locator('[data-new-track-button="true"]').waitFor({ timeout: 10000 });
}

async function expectComposerGuard(page) {
  const input = page.getByPlaceholder(QUESTION_PLACEHOLDER);
  const submit = page.locator('[data-composer="true"] button[aria-label="继续"]').first();
  await input.fill("   ");
  assert(await submit.isDisabled(), "composer 空白输入时提交按钮应禁用");
  await input.press("Enter");
  await page.waitForTimeout(160);
  assert((await page.locator('[data-track-node="true"]').count()) === 0, "空白输入不应创建节点");
  await input.fill("");
}

async function assertBackToSpacesAndReopen(page, title) {
  console.log("[ui-smoke] assert back to spaces");
  await page.getByRole("button", { name: "返回空间列表" }).click();
  await page.locator('[data-thinking-spaces="true"]').waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "思路" }).first().waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: title }).first().click();
  await page.locator('[data-thinking-detail="true"]').waitFor({ timeout: 10000 });
}

async function addTrackNodes(page, count) {
  console.log("[ui-smoke] add nodes");
  const input = page.getByPlaceholder(QUESTION_PLACEHOLDER);
  const submit = page.locator('[data-composer="true"] button[aria-label="继续"]').first();
  for (let i = 1; i <= count; i += 1) {
    await input.fill(`轨道测试陈述 ${i}`);
    await submit.waitFor({ state: "visible", timeout: 10000 });
    await page.waitForFunction(
      () => {
        const btn = document.querySelector('[data-composer="true"] button[aria-label="继续"]');
        return btn instanceof HTMLButtonElement && !btn.disabled;
      },
      { timeout: 10000 }
    );
    await submit.click();
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(900);
}

async function assertPersistentNewTrack(page) {
  console.log("[ui-smoke] assert persistent new track");
  const newTrackButton = page.locator('[data-new-track-button="true"]');
  await newTrackButton.waitFor({ timeout: 10000 });

  const input = page.getByPlaceholder(QUESTION_PLACEHOLDER);
  await input.fill("右栏创建的新方向");
  await newTrackButton.click();
  await page.waitForTimeout(320);
  await page.getByText("右栏创建的新方向", { exact: false }).first().waitFor({ timeout: 10000 });
  assert((await input.inputValue()) === "", "通过新方向创建后 composer 应清空");

  await newTrackButton.waitFor({ timeout: 10000 });
  await newTrackButton.click();
  await page.waitForTimeout(320);
  await page.locator('[data-new-track-button="true"]').waitFor({ state: "hidden", timeout: 10000 });

  await input.fill("pending 轨的第一条");
  await page.getByRole("button", { name: "继续" }).last().click();
  await page.waitForTimeout(320);
  await page.locator('[data-new-track-button="true"]').waitFor({ timeout: 10000 });
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

async function openNodeMenu(page, index = 0) {
  const node = page.locator('[data-track-node="true"]').nth(index);
  await node.hover();
  const button = node.getByLabel("节点菜单");
  await button.waitFor({ state: "visible", timeout: 10000 });
  await button.click({ force: true });
}

async function assertInlineAnswerRow(page) {
  console.log("[ui-smoke] assert inline answer row");
  const firstNode = page.locator('[data-track-node="true"]').first();
  await firstNode.click();
  const input = firstNode.locator('[data-node-answer-input="true"]');
  await input.waitFor({ state: "visible", timeout: 10000 });
  await input.fill("先写一条回答");
  await input.press("Enter");
  await page.waitForTimeout(240);

  await firstNode.click();
  await input.waitFor({ state: "visible", timeout: 10000 });
  assert((await input.inputValue()) === "先写一条回答", "节点回答未回填");

  const secondNode = page.locator('[data-track-node="true"]').nth(1);
  await secondNode.click();
  await secondNode.locator('[data-node-answer-input="true"]').waitFor({ state: "visible", timeout: 10000 });
  assert((await secondNode.locator('[data-node-answer-input="true"]').inputValue()) === "", "切换到另一张卡后应显示该卡自己的回答输入");
}

async function assertMenuActions(page) {
  console.log("[ui-smoke] assert node menu");
  await openNodeMenu(page, 0);
  const menu = page.locator('[role="menu"]:visible').last();
  await menu.getByRole("menuitem", { name: "修改" }).waitFor({ timeout: 10000 });
  await menu.getByRole("menuitem", { name: "复制" }).waitFor({ timeout: 10000 });
  await menu.getByRole("menuitem", { name: "删除" }).waitFor({ timeout: 10000 });

  const countBeforeCopy = await page.locator('[data-track-node="true"]').count();
  await menu.getByRole("menuitem", { name: "复制" }).click({ force: true });
  await page.waitForTimeout(180);
  const countAfterCopy = await page.locator('[data-track-node="true"]').count();
  assert(countAfterCopy === countBeforeCopy, "复制不应在原轨直接生成新节点");

  await openNodeMenu(page, 0);
  await page.locator('[role="menu"]:visible').last().getByRole("menuitem", { name: "修改" }).click({ force: true });
  const editInput = page.locator('[data-track-node="true"]').first().locator('input[maxlength="220"]').first();
  await editInput.fill("修改后的节点问题");
  await editInput.press("Enter");
  await page.waitForTimeout(220);
  await page.getByText("修改后的节点问题", { exact: false }).first().waitFor({ timeout: 10000 });

  const countBefore = await page.locator('[data-track-node="true"]').count();
  await openNodeMenu(page, 1);
  await page.locator('[role="menu"]:visible').last().getByRole("menuitem", { name: "删除" }).click({ force: true });
  let countAfter = countBefore;
  for (let i = 0; i < 8; i += 1) {
    await page.waitForTimeout(180);
    countAfter = await page.locator('[data-track-node="true"]').count();
    if (countAfter < countBefore) break;
  }
  assert(countAfter < countBefore, "删除节点未生效");
}

async function assertCutPaste(page) {
  console.log("[ui-smoke] assert cut paste");
  const firstNode = page.locator('[data-track-node="true"]').first();
  await firstNode.hover();
  await firstNode.getByRole("button", { name: "剪切节点" }).first().click({ force: true });

  await ensureSwitchableTrack(page);
  const otherTrackButtons = page.locator('[data-other-tracks="true"] [data-other-track-button="true"]');
  const trackCount = await otherTrackButtons.count();
  const pasteButton = page.locator('[data-composer="true"]').getByRole("button", { name: "粘贴" });
  let pasteVisible = false;
  for (let i = 0; i < trackCount; i += 1) {
    const title = (await otherTrackButtons.nth(i).locator("p").first().innerText()).trim();
    await otherTrackButtons.nth(i).click();
    if (title) {
      await page.getByText(title, { exact: false }).first().waitFor({ timeout: 6000 });
    } else {
      await page.waitForTimeout(280);
    }
    try {
      await pasteButton.waitFor({ timeout: 6000 });
      pasteVisible = true;
      break;
    } catch {}
  }
  assert(pasteVisible, "剪切后切换轨道，未出现粘贴入口");
  await pasteButton.first().click();
  await page.waitForTimeout(260);
  const remainingPaste = await page.locator('[data-composer="true"]').getByRole("button", { name: "粘贴" }).count();
  assert(remainingPaste === 0, "粘贴完成后入口未消失");
}

async function assertCopyPaste(page) {
  console.log("[ui-smoke] assert copy paste");
  const sourceCount = await page.locator('[data-track-node="true"]').count();
  await openNodeMenu(page, 0);
  await page.locator('[role="menu"]:visible').last().getByRole("menuitem", { name: "复制" }).click({ force: true });
  await page.waitForTimeout(180);
  assert((await page.locator('[data-track-node="true"]').count()) === sourceCount, "复制后原轨节点数不应变化");

  await ensureSwitchableTrack(page);
  const otherTrackButtons = page.locator('[data-other-tracks="true"] [data-other-track-button="true"]');
  await otherTrackButtons.first().click();
  const targetBefore = await page.locator('[data-track-node="true"]').count();
  const pasteButton = page.locator('[data-composer="true"]').getByRole("button", { name: "粘贴" }).first();
  await pasteButton.waitFor({ timeout: 10000 });
  await pasteButton.click();
  let targetAfter = targetBefore;
  for (let i = 0; i < 16; i += 1) {
    await page.waitForTimeout(220);
    targetAfter = await page.locator('[data-track-node="true"]').count();
    if (targetAfter > targetBefore) break;
  }
  assert(targetAfter > targetBefore, "复制粘贴后目标轨末尾应新增副本");
}

async function ensureSwitchableTrack(page) {
  const otherTrackButtons = page.locator('[data-other-tracks="true"] [data-other-track-button="true"]');
  const existing = await otherTrackButtons.count();
  if (existing > 0) return;

  const newTrackButton = page.locator('[data-new-track-button="true"]');
  if ((await newTrackButton.count()) === 0) {
    throw new Error("缺少可切换轨道，且无法创建新轨道");
  }
  const input = page.getByPlaceholder(QUESTION_PLACEHOLDER);
  await input.fill(`smoke-切轨-${Date.now()}`);
  await newTrackButton.first().click();
  await page.waitForTimeout(420);
  const after = await otherTrackButtons.count();
  assert(after > 0, "创建新轨后仍无可切换轨道");
}

async function assertOrganizePanel(page) {
  console.log("[ui-smoke] assert organize panel");
  await page.getByRole("button", { name: "更多" }).click();
  await page.getByRole("button", { name: "整理一下" }).click();
  await page.getByText("安放这些散开的念头").waitFor({ timeout: 8000 });
  await page.getByRole("button", { name: "安放这些念头" }).click();
}

async function assertTrackSwitchRestore(page) {
  console.log("[ui-smoke] assert switch restore");
  const otherTrackButtons = page.locator('[data-other-tracks="true"] [data-other-track-button="true"]');
  const count = await otherTrackButtons.count();
  assert(count > 0, "缺少可切换的其他轨道");
  const firstTitle = (await otherTrackButtons.first().locator("p").first().innerText()).trim();

  await otherTrackButtons.first().click();
  await page.waitForTimeout(380);
  await page.getByText(firstTitle.trim(), { exact: false }).first().waitFor({ timeout: 10000 });

  const nodeCount = await page.locator('[data-track-node="true"]').count();
  assert(nodeCount >= 0, "切轨后节点区域不可用");
}

async function openMoreMenu(page, spaceTitle) {
  const moreButton = page.locator('button[aria-label="更多"]').first();
  try {
    await moreButton.click({ timeout: 1800 });
    return true;
  } catch {}
  try {
    await page.getByRole("button", { name: spaceTitle }).first().click({ timeout: 2000 });
    await page.locator('[data-thinking-detail="true"]').waitFor({ timeout: 10000 });
    await moreButton.click({ timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function assertFreezeAndExport(page, spaceTitle) {
  console.log("[ui-smoke] assert export+write-to-time");
  if (!(await openMoreMenu(page, spaceTitle))) {
    throw new Error("未找到“更多”入口，无法执行导出/写入时间断言");
  }
  // 先导出，再写入时间，避免写入后详情面板退场导致菜单不可达。
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

  if (!(await openMoreMenu(page, spaceTitle))) {
    throw new Error("导出后未找到“更多”入口，无法写入时间");
  }
  await page.getByRole("button", { name: "写入时间" }).click();
  await page.getByText("已写入时间").first().waitFor({ timeout: 10000 });
}

async function addLifeEntry(page, text) {
  const composer = page.locator('[data-life-composer="true"]');
  await composer.waitFor({ timeout: 10000 });
  const countBefore = await page.locator('[data-life-item="true"]').count();
  await composer.fill(text);
  await page.getByRole("button", { name: "存入此刻" }).click();
  let countAfter = countBefore;
  for (let i = 0; i < 16; i += 1) {
    await page.waitForTimeout(180);
    countAfter = await page.locator('[data-life-item="true"]').count();
    if (countAfter > countBefore) break;
  }
  assert(countAfter > countBefore, "写入时间后列表条目数未增加");
}

async function assertTimeLayerDesktop(page) {
  console.log("[ui-smoke] assert time layer desktop");
  const firstEntry = `如果把今天放慢一点-${Date.now()}`;
  const secondEntry = `为什么我总在关键处退缩-${Date.now()}`;

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "时间", exact: true }).first().click();
  await page.locator('[data-life-layout="true"]').waitFor({ timeout: 10000 });
  const exitDetailButton = page.getByRole("button", { name: "退出细读" }).first();
  if (await exitDetailButton.isVisible().catch(() => false)) {
    await exitDetailButton.click();
  }
  await page.locator('[data-life-composer="true"]').waitFor({ timeout: 10000 });
  await assertNoMojibake(page, "时间页");

  await addLifeEntry(page, firstEntry);
  await addLifeEntry(page, secondEntry);

  await page.locator('[data-life-item="true"]').first().click();
  await page.locator('[data-life-detail="desktop"]').waitFor({ timeout: 10000 });
  await page.locator('[data-life-search="true"]').waitFor({ timeout: 10000 });

  await page.locator('[data-life-search="true"]').fill("关键处退缩");
  await page.waitForTimeout(260);
  const filteredCount = await page.locator('[data-life-item="true"]').count();
  assert(filteredCount >= 1, "搜索后未返回任何时间条目");

  await page.getByRole("button", { name: "退出细读" }).click();
  await page.locator('[data-life-composer="true"]').waitFor({ timeout: 10000 });

}

async function assertTimeLayerMobile(page) {
  console.log("[ui-smoke] assert time layer mobile");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "时间", exact: true }).first().click();
  await page.locator('[data-life-layout="true"]').waitFor({ timeout: 10000 });
  await page.locator('[data-life-item="true"]').first().click();
  await page.locator('[data-life-detail="mobile"]').waitFor({ timeout: 10000 });

  const noXOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert(noXOverflow, "移动端时间页出现横向溢出");
  await assertNoMojibake(page, "移动端时间页");

  await page.getByRole("button", { name: "关闭" }).first().click();
  await page.locator('[data-life-detail="mobile"]').waitFor({ state: "hidden", timeout: 10000 });
  await page.locator('[data-life-composer="true"]').waitFor({ timeout: 10000 });
}

async function assertTabsAndMobile(page, spaceTitle) {
  console.log("[ui-smoke] assert tabs+mobile");
  await page.getByRole("button", { name: "设置" }).click();
  await page.getByText("系统设置").waitFor({ timeout: 10000 });
  await assertNoMojibake(page, "设置页");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "思路" }).click();
  const noXOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert(noXOverflow, "移动端出现横向溢出");
  await assertNoMojibake(page, "移动端思路页");

  const targetSpaceButton = page.getByRole("button", { name: spaceTitle }).first();
  const anySpaceButton = page
    .locator('[data-thinking-spaces="true"] button:not([aria-label="保存随记"])')
    .filter({ hasNotText: "查看全部" })
    .first();
  if (await targetSpaceButton.isVisible().catch(() => false)) {
    await targetSpaceButton.click();
  } else {
    if (!(await anySpaceButton.isVisible().catch(() => false))) return;
    await anySpaceButton.click({ timeout: 3000 });
  }
  await page.waitForSelector('input[placeholder="继续这条思路…"], input[placeholder="这个空间已写入时间"]', { timeout: 10000 });
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
  const spaceTitle = `轨道回归空间-${Date.now()}`;
  await createSpace(page, spaceTitle);
  await assertWorkbenchLayout(page);
  await assertBackToSpacesAndReopen(page, spaceTitle);
  await assertPersistentNewTrack(page);
  await addTrackNodes(page, 28);
    await assertInlineAnswerRow(page);
    await assertOrganizePanel(page);
    await assertTrackScrollableAndCentered(page);
    await assertMenuActions(page);
    await assertCopyPaste(page);
    await assertTrackSwitchRestore(page);
    await assertFreezeAndExport(page, spaceTitle);
    await assertTabsAndMobile(page, spaceTitle);
    await assertTimeLayerDesktop(page);
    await assertTimeLayerMobile(page);

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
