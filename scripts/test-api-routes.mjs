const baseUrl = (process.env.TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const password = "StrongPass123!";
const email = `zhihuo-e2e-${Date.now()}@example.com`;

const ciMode = process.env.CI === "true";
const baseHost = new URL(baseUrl).hostname;
const baseProtocol = new URL(baseUrl).protocol;
const localHosts = new Set(["127.0.0.1", "localhost"]);

if (!ciMode) {
  console.error("[api-test] blocked: this script is CI-only. Set CI=true in CI job, do not run in production.");
  process.exit(1);
}

if (baseProtocol !== "http:" || !localHosts.has(baseHost)) {
  console.error(`[api-test] blocked: TEST_BASE_URL must be local http endpoint, got ${baseUrl}`);
  process.exit(1);
}

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

  const monitorUnauthorized = await request("GET", "/v1/system/monitor");
  assert(monitorUnauthorized.status === 401, `monitor should require auth, got ${monitorUnauthorized.status}`);

  const sendCode = await request("POST", "/v1/auth/register/send-code", { email });
  assert(sendCode.status === 200, `send register code failed: ${sendCode.status}`);
  const code = sendCode.json?.debug_code;
  assert(typeof code === "string" && /^\d{6}$/.test(code), "send register code should return 6-digit debug_code in CI");

  const register = await request("POST", "/v1/auth/register", { email, password, code });
  assert(register.status === 200, `register failed: ${register.status}`);

  const me = await request("GET", "/v1/auth/me");
  assert(me.status === 200, `me failed: ${me.status}`);
  assert(typeof me.json?.user_id === "string", "me missing user_id");

  const monitor = await request("GET", "/v1/system/monitor");
  assert(monitor.status === 200, `monitor failed: ${monitor.status}`);
  assert(typeof monitor.json?.users?.total === "number", "monitor users.total missing");
  assert(typeof monitor.json?.active_users?.d3 === "number", "monitor active_users.d3 missing");
  assert(typeof monitor.json?.content?.time_entries_total === "number", "monitor content.time_entries_total missing");
  assert(Array.isArray(monitor.json?.flow_3d) && monitor.json.flow_3d.length === 3, "monitor flow_3d should contain 3 rows");
  assert(typeof monitor.json?.traffic_now?.qps_1m === "number", "monitor traffic_now.qps_1m missing");
  assert(
    Array.isArray(monitor.json?.traffic_peak_3d) && monitor.json.traffic_peak_3d.length === 3,
    "monitor traffic_peak_3d should contain 3 rows"
  );

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

  const createScratch = await request("POST", "/v1/thinking/scratch", {
    raw_text: "也许这条只是先记一下"
  });
  assert(createScratch.status === 201, `create scratch failed: ${createScratch.status}`);
  const scratchId = createScratch.json?.scratch?.id;
  assert(typeof scratchId === "string", "scratch id missing");

  const scratchList = await request("GET", "/v1/thinking/scratch");
  assert(scratchList.status === 200, `scratch list failed: ${scratchList.status}`);
  assert(Array.isArray(scratchList.json?.scratch), "scratch list should be array");

  const scratchToSpace = await request("POST", `/v1/thinking/scratch/${scratchId}/to-space`);
  assert(scratchToSpace.status === 200, `scratch to space failed: ${scratchToSpace.status}`);
  const scratchSpaceId = scratchToSpace.json?.space_id;
  assert(typeof scratchSpaceId === "string", "scratch to space should return space_id");

  const scratchListAfterConvert = await request("GET", "/v1/thinking/scratch");
  assert(scratchListAfterConvert.status === 200, `scratch list after convert failed: ${scratchListAfterConvert.status}`);
  assert(
    !scratchListAfterConvert.json?.scratch?.some((item) => item.id === scratchId),
    "converted scratch should disappear from scratch list"
  );

  const secondScratch = await request("POST", "/v1/thinking/scratch", {
    raw_text: "这条随记稍后放入时间"
  });
  assert(secondScratch.status === 201, `second scratch create failed: ${secondScratch.status}`);
  const secondScratchId = secondScratch.json?.scratch?.id;
  const secondScratchCreatedAt = secondScratch.json?.scratch?.created_at;
  assert(typeof secondScratchId === "string", "second scratch id missing");
  assert(typeof secondScratchCreatedAt === "string", "second scratch created_at missing");

  const feedScratch = await request("POST", `/v1/thinking/scratch/${secondScratchId}/feed-to-time`);
  assert(feedScratch.status === 200, `feed scratch to time failed: ${feedScratch.status}`);
  const fedDoubtId = feedScratch.json?.doubt_id;
  assert(typeof fedDoubtId === "string", "feed scratch should return doubt_id");

  const feedScratchAgain = await request("POST", `/v1/thinking/scratch/${secondScratchId}/feed-to-time`);
  assert(feedScratchAgain.status === 200, `feed scratch to time should be idempotent, got ${feedScratchAgain.status}`);
  assert(feedScratchAgain.json?.doubt_id === fedDoubtId, "feed-to-time should return the same doubt on repeat");

  const scratchListAfterFeed = await request("GET", "/v1/thinking/scratch");
  assert(scratchListAfterFeed.status === 200, `scratch list after feed failed: ${scratchListAfterFeed.status}`);
  assert(!scratchListAfterFeed.json?.scratch?.some((item) => item.id === secondScratchId), "fed scratch should disappear from list");

  const doubtsAfterFeed = await request("GET", "/v1/doubts?range=all");
  assert(doubtsAfterFeed.status === 200, `doubts after feed failed: ${doubtsAfterFeed.status}`);
  const fedDoubt = doubtsAfterFeed.json?.doubts?.find((item) => item.id === fedDoubtId);
  assert(fedDoubt?.raw_text === "这条随记稍后放入时间", "fed scratch should create time-layer doubt with original text");
  assert(fedDoubt?.created_at === secondScratchCreatedAt, "fed scratch should preserve scratch created_at");

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

  const blankQuestion = await request("POST", `/v1/thinking/spaces/${spaceId}/questions`, {
    raw_text: "   "
  });
  assert(blankQuestion.status === 400, `blank question should fail with 400, got ${blankQuestion.status}`);

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

  const detail = await request("GET", `/v1/thinking/spaces/${spaceId}`);
  assert(detail.status === 200, `space detail failed: ${detail.status}`);
  assert(Array.isArray(detail.json?.tracks), "tracks should be array");
  assert(Array.isArray(detail.json?.milestone_node_ids), "detail should include milestone ids");
  assert(detail.json?.tracks?.every((track) => "direction_hint" in track), "track detail should include direction_hint");
  const detailFirstNode = detail.json?.tracks?.flatMap((track) => track.nodes ?? []).find((node) => node.id === firstNodeId);
  assert(detailFirstNode?.answer_text === null, "new node should default answer_text to null");

  const answer = await request("POST", `/v1/thinking/nodes/${firstNodeId}/answer`, {
    answer_text: "先承认这件事对我有吸引力"
  });
  assert(answer.status === 200, `save answer failed: ${answer.status}`);
  assert(answer.json?.answer_text === "先承认这件事对我有吸引力", "answer text should round-trip");

  const detailAfterAnswer = await request("GET", `/v1/thinking/spaces/${spaceId}`);
  assert(detailAfterAnswer.status === 200, `detail after answer failed: ${detailAfterAnswer.status}`);
  const answeredNode = detailAfterAnswer.json?.tracks?.flatMap((track) => track.nodes ?? []).find((node) => node.id === firstNodeId);
  assert(answeredNode?.answer_text === "先承认这件事对我有吸引力", "detail should include saved answer_text");

  const clearAnswer = await request("POST", `/v1/thinking/nodes/${firstNodeId}/answer`, {
    answer_text: ""
  });
  assert(clearAnswer.status === 200, `clear answer failed: ${clearAnswer.status}`);
  assert(clearAnswer.json?.answer_text === null, "empty answer should persist as null");

  const updateNode = await request("POST", `/v1/thinking/nodes/${firstNodeId}/update`, {
    raw_question_text: "现在最重要的阻力是什么"
  });
  assert(updateNode.status === 200, `update node failed: ${updateNode.status}`);
  assert(updateNode.json?.raw_question_text === "现在最重要的阻力是什么", "updated question should round-trip");

  const copyNode = await request("POST", `/v1/thinking/nodes/${firstNodeId}/copy`);
  assert(copyNode.status === 200, `copy node failed: ${copyNode.status}`);
  assert(typeof copyNode.json?.node_id === "string", "copy node should return node_id");

  const copyTargetTrack = await request("POST", `/v1/thinking/spaces/${spaceId}/tracks`);
  assert(copyTargetTrack.status === 200, `create copy target track failed: ${copyTargetTrack.status}`);
  const copyTargetTrackId = copyTargetTrack.json?.track_id;
  assert(typeof copyTargetTrackId === "string", "copy target track id missing");

  const copyNodeToTrack = await request("POST", `/v1/thinking/nodes/${firstNodeId}/copy`, {
    target_track_id: copyTargetTrackId
  });
  assert(copyNodeToTrack.status === 200, `copy node to target track failed: ${copyNodeToTrack.status}`);
  assert(copyNodeToTrack.json?.track_id === copyTargetTrackId, "copied node should land in target track");

  const writeToTime = await request("POST", `/v1/thinking/spaces/${spaceId}/write-to-time`);
  assert(writeToTime.status === 200, `write-to-time failed: ${writeToTime.status}`);
  assert(writeToTime.json?.status === "hidden", "write-to-time should hide the space");

  const targetTrackId = detail.json?.tracks?.[0]?.id;
  assert(typeof targetTrackId === "string", "missing track id for direction hint");
  const updateDirection = await request("POST", `/v1/thinking/spaces/${spaceId}/track-direction`, {
    track_id: targetTrackId,
    direction_hint: "hypothesis"
  });
  assert(updateDirection.status === 200, `track direction update failed: ${updateDirection.status}`);

  const clearDirection = await request("POST", `/v1/thinking/spaces/${spaceId}/track-direction`, {
    track_id: targetTrackId,
    direction_hint: null
  });
  assert(clearDirection.status === 200, `track direction clear failed: ${clearDirection.status}`);

  const detailAfterClear = await request("GET", `/v1/thinking/spaces/${spaceId}`);
  assert(detailAfterClear.status === 200, `space detail after clear failed: ${detailAfterClear.status}`);
  const clearedTrack = detailAfterClear.json?.tracks?.find((track) => track.id === targetTrackId);
  assert(clearedTrack?.direction_hint === null, "direction_hint should stay null after clearing");

  const statementSpaceQuestion = await request("POST", `/v1/thinking/spaces/${statementSpaceId}/questions`, {
    raw_text: "这是另一条线吗"
  });
  assert(statementSpaceQuestion.status === 200, `statement space question failed: ${statementSpaceQuestion.status}`);

  const statementDetail = await request("GET", `/v1/thinking/spaces/${statementSpaceId}`);
  assert(statementDetail.status === 200, `statement detail failed: ${statementDetail.status}`);
  const parkingTrackId = statementDetail.json?.parking_track_id;
  assert(typeof parkingTrackId === "string", "parking track id missing");

  const setParkingActive = await request("POST", `/v1/thinking/spaces/${statementSpaceId}/active-track`, {
    track_id: parkingTrackId
  });
  assert(setParkingActive.status === 200, `set parking track active failed: ${setParkingActive.status}`);

  const statementDetailAfterParking = await request("GET", `/v1/thinking/spaces/${statementSpaceId}`);
  assert(statementDetailAfterParking.status === 200, `statement detail after parking failed: ${statementDetailAfterParking.status}`);
  assert(statementDetailAfterParking.json?.current_track_id === parkingTrackId, "parking track should remain active after refresh");

  const createEmptyTrack = await request("POST", `/v1/thinking/spaces/${statementSpaceId}/tracks`);
  assert(createEmptyTrack.status === 200, `create empty track failed: ${createEmptyTrack.status}`);
  assert(typeof createEmptyTrack.json?.track_id === "string", "empty track should return track_id");
  const emptyTrackId = createEmptyTrack.json?.track_id;

  const createEmptyTrackAgain = await request("POST", `/v1/thinking/spaces/${statementSpaceId}/tracks`);
  assert(createEmptyTrackAgain.status === 200, `second create empty track failed: ${createEmptyTrackAgain.status}`);
  assert(createEmptyTrackAgain.json?.track_id === emptyTrackId, "pending track should be idempotent before first question");

  const statementDetailAfterEmptyTrack = await request("GET", `/v1/thinking/spaces/${statementSpaceId}`);
  assert(statementDetailAfterEmptyTrack.status === 200, `statement detail after empty track failed: ${statementDetailAfterEmptyTrack.status}`);
  assert(statementDetailAfterEmptyTrack.json?.pending_track_id === emptyTrackId, "pending track id should round-trip");
  assert(
    statementDetailAfterEmptyTrack.json?.tracks?.some((track) => track.id === emptyTrackId && track.is_empty === true),
    "empty track should appear in detail view"
  );

  const setEmptyActive = await request("POST", `/v1/thinking/spaces/${statementSpaceId}/active-track`, {
    track_id: emptyTrackId
  });
  assert(setEmptyActive.status === 200, `set empty track active failed: ${setEmptyActive.status}`);

  const firstQuestionOnEmptyTrack = await request("POST", `/v1/thinking/spaces/${statementSpaceId}/questions`, {
    raw_text: "这是新方向的第一条",
    track_id: emptyTrackId
  });
  assert(firstQuestionOnEmptyTrack.status === 200, `add question to empty track failed: ${firstQuestionOnEmptyTrack.status}`);

  const statementDetailAfterFirstQuestion = await request("GET", `/v1/thinking/spaces/${statementSpaceId}`);
  assert(statementDetailAfterFirstQuestion.status === 200, `statement detail after first empty-track question failed: ${statementDetailAfterFirstQuestion.status}`);
  const promotedTrack = statementDetailAfterFirstQuestion.json?.tracks?.find((track) => track.id === emptyTrackId);
  assert(promotedTrack?.node_count === 1, "empty track should become normal track after first question");
  assert(promotedTrack?.is_empty === false, "empty track flag should clear after first question");
  assert(statementDetailAfterFirstQuestion.json?.pending_track_id == null, "pending track should clear after first question");

  const createNextEmptyTrack = await request("POST", `/v1/thinking/spaces/${statementSpaceId}/tracks`);
  assert(createNextEmptyTrack.status === 200, `next create empty track failed: ${createNextEmptyTrack.status}`);
  assert(createNextEmptyTrack.json?.track_id !== emptyTrackId, "after first question, next pending track should be new");

  const spaces = await request("GET", "/v1/thinking/spaces");
  assert(spaces.status === 200, `spaces list failed: ${spaces.status}`);
  assert(typeof spaces.json?.spaces?.[0]?.last_activity_at === "string", "spaces list should include last_activity_at");
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
