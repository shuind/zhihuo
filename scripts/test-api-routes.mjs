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

  const addQuestion = await request("POST", `/v1/thinking/spaces/${spaceId}/questions`, {
    raw_text: "Is the risk underestimated?"
  });
  assert(addQuestion.status === 200, `add question failed: ${addQuestion.status}`);

  const statementQuestion = await request("POST", `/v1/thinking/spaces/${spaceId}/questions`, {
    raw_text: "需要建立习惯"
  });
  assert(statementQuestion.status === 200, `statement question should succeed, got ${statementQuestion.status}`);
  assert(Array.isArray(statementQuestion.json?.suggested_questions), "statement question should return suggestions");
  assert((statementQuestion.json?.suggested_questions ?? []).length === 0, "default suggestions should be empty");

  const invalidBackground = await request("POST", `/v1/thinking/spaces/${spaceId}/background`, {
    background_text: "太短"
  });
  assert(invalidBackground.status === 400, `invalid background should fail with 400, got ${invalidBackground.status}`);
  assert(invalidBackground.json?.error === "背景说明需在 100-300 字之间", "background length error message mismatch");

  const rebuild = await request("POST", `/v1/thinking/spaces/${spaceId}/rebuild`);
  assert(rebuild.status === 200, `rebuild failed: ${rebuild.status}`);

  const detail = await request("GET", `/v1/thinking/spaces/${spaceId}`);
  assert(detail.status === 200, `space detail failed: ${detail.status}`);
  assert(Array.isArray(detail.json?.tracks), "tracks should be array");

  const fullExport = await request("GET", "/v1/system/export");
  assert(fullExport.status === 200, `system export failed: ${fullExport.status}`);
  assert(typeof fullExport.json?.checksum === "string", "export checksum missing");

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
