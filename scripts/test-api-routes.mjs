const baseUrl = (process.env.TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const password = "StrongPass123!";
const email = `zhihuo-e2e-${Date.now()}@example.com`;

const jar = new Map();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function updateCookies(response) {
  const raw = response.headers.get("set-cookie");
  if (!raw) return;
  const pair = raw.split(";")[0];
  const [name, value] = pair.split("=");
  if (name && value != null) jar.set(name.trim(), value.trim());
}

function cookieHeader() {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function request(method, path, body) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  const cookie = cookieHeader();
  if (cookie) headers.cookie = cookie;

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  updateCookies(response);

  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }
  return { status: response.status, json };
}

async function run() {
  console.log(`[api-test] base=${baseUrl}`);

  const register = await request("POST", "/v1/auth/register", { email, password });
  assert(register.status === 200, `register failed: ${register.status}`);

  const me = await request("GET", "/v1/auth/me");
  assert(me.status === 200, `me failed: ${me.status}`);
  assert(typeof me.json?.user_id === "string", "me missing user_id");

  const createDoubt = await request("POST", "/v1/doubts", { raw_text: "Should I start now?", layer: "life" });
  assert(createDoubt.status === 201, `create doubt failed: ${createDoubt.status}`);
  const doubtId = createDoubt.json?.doubt_id;
  assert(typeof doubtId === "string", "missing doubt_id");

  const createSpace = await request("POST", "/v1/thinking/spaces", {
    root_question_text: "Should I start now?",
    source_time_doubt_id: doubtId
  });
  assert(createSpace.status === 201, `create space failed: ${createSpace.status}`);
  const spaceId = createSpace.json?.space_id;
  assert(typeof spaceId === "string", "missing space_id");

  const createStatementSpace = await request("POST", "/v1/thinking/spaces", {
    root_question_text: "我过度使用AI"
  });
  assert(createStatementSpace.status === 201, `statement create space should succeed, got ${createStatementSpace.status}`);
  assert(Array.isArray(createStatementSpace.json?.suggested_questions), "statement create should return suggestions array");
  assert((createStatementSpace.json?.suggested_questions ?? []).length === 0, "default suggestions should be empty");
  const statementSpaceId = createStatementSpace.json?.space_id;
  assert(typeof statementSpaceId === "string", "statement space id missing");

  const addQuestion = await request("POST", `/v1/thinking/spaces/${spaceId}/questions`, {
    raw_text: "Is the risk underestimated?"
  });
  assert(addQuestion.status === 200, `add question failed: ${addQuestion.status}`);
  const firstNodeId = addQuestion.json?.node_id;
  assert(typeof firstNodeId === "string", "missing node id for first question");

  const statementQuestion = await request("POST", `/v1/thinking/spaces/${spaceId}/questions`, {
    raw_text: "需要建立习惯"
  });
  assert(statementQuestion.status === 200, `statement question should succeed, got ${statementQuestion.status}`);
  assert(Array.isArray(statementQuestion.json?.suggested_questions), "statement question should return suggestions");
  assert((statementQuestion.json?.suggested_questions ?? []).length === 0, "default suggestions should be empty");
  const secondNodeId = statementQuestion.json?.node_id;
  assert(typeof secondNodeId === "string", "missing node id for second question");

  const link = await request("POST", `/v1/thinking/nodes/${firstNodeId}/link`, {
    target_node_id: secondNodeId
  });
  assert(link.status === 200, `node link failed: ${link.status}`);

  const invalidBackground = await request("POST", `/v1/thinking/spaces/${spaceId}/background`, {
    background_text: "太短"
  });
  assert(invalidBackground.status === 400, `invalid background should fail with 400, got ${invalidBackground.status}`);
  assert(invalidBackground.json?.error === "背景说明需在 100-300 字之间", "background length error message mismatch");

  const preview = await request("POST", `/v1/thinking/spaces/${spaceId}/organize-preview`, {});
  assert(preview.status === 200, `organize preview failed: ${preview.status}`);
  assert(Array.isArray(preview.json?.candidates), "organize preview candidates should be array");

  const apply = await request("POST", `/v1/thinking/spaces/${spaceId}/organize-apply`, {
    moves: (preview.json?.candidates ?? []).slice(0, 2).map((item) => ({
      node_id: item.node_id,
      target_track_id: item.suggested_track_id
    }))
  });
  assert(apply.status === 200, `organize apply failed: ${apply.status}`);
  assert(typeof apply.json?.moved_count === "number", "organize apply missing moved_count");

  const freeze = await request("POST", `/v1/thinking/spaces/${spaceId}/freeze`, {
    user_freeze_note: "阶段冻结测试",
    milestone_node_ids: [firstNodeId, secondNodeId]
  });
  assert(freeze.status === 200, `freeze failed: ${freeze.status}`);
  assert(Array.isArray(freeze.json?.milestone_node_ids), "freeze should return milestone ids");

  const detail = await request("GET", `/v1/thinking/spaces/${spaceId}`);
  assert(detail.status === 200, `space detail failed: ${detail.status}`);
  assert(Array.isArray(detail.json?.tracks), "tracks should be array");
  assert(Array.isArray(detail.json?.milestone_node_ids), "detail should include milestone ids");
  assert(detail.json?.tracks?.every((track) => "direction_hint" in track), "track detail should include direction_hint");

  const targetTrackId = detail.json?.tracks?.[0]?.id;
  assert(typeof targetTrackId === "string", "missing track id for direction hint");
  const updateDirection = await request("POST", `/v1/thinking/spaces/${spaceId}/track-direction`, {
    track_id: targetTrackId,
    direction_hint: "hypothesis"
  });
  assert(updateDirection.status === 200, `track direction update failed: ${updateDirection.status}`);

  const spaces = await request("GET", "/v1/thinking/spaces");
  assert(spaces.status === 200, `spaces list failed: ${spaces.status}`);
  assert(spaces.json?.time_links?.[0]?.reentry?.question_entry, "time link should include reentry.question_entry");

  const deleteSpace = await request("POST", `/v1/thinking/spaces/${statementSpaceId}/delete`);
  assert(deleteSpace.status === 200, `delete space failed: ${deleteSpace.status}`);

  const fullExport = await request("GET", "/v1/system/export");
  assert(fullExport.status === 200, `system export failed: ${fullExport.status}`);
  assert(typeof fullExport.json?.checksum === "string", "export checksum missing");

  const markdownExport = await request("GET", "/v1/system/export?format=markdown");
  assert(markdownExport.status === 200, `system markdown export failed: ${markdownExport.status}`);
  assert(typeof markdownExport.json?.markdown === "string", "markdown export missing markdown");

  const validate = await request("POST", "/v1/system/import/validate", {
    payload: fullExport.json?.payload,
    checksum: fullExport.json?.checksum
  });
  assert(validate.status === 200, `import validate failed: ${validate.status}`);
  assert(validate.json?.ok === true, "import validate should be ok");

  const deleteAll = await request("POST", "/v1/system/delete-all", {
    confirm_text: "DELETE ALL",
    reason: "api regression cleanup"
  });
  assert(deleteAll.status === 200, `delete all failed: ${deleteAll.status}`);
  assert(deleteAll.json?.ok === true, "delete all should be ok");

  const meAfterDelete = await request("GET", "/v1/auth/me");
  assert(meAfterDelete.status === 401, `me should be unauthorized after delete-all, got ${meAfterDelete.status}`);

  console.log("[api-test] all checks passed");
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("fetch failed")) {
    console.error("[api-test] failed: fetch failed");
    console.error("[api-test] tip: start the app first and set TEST_BASE_URL if needed (example: http://127.0.0.1:41003)");
  } else {
    console.error("[api-test] failed:", message);
  }
  process.exitCode = 1;
});
