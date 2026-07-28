import { execFile } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const tempDir = path.join(rootDir, ".tmp", "store-regression");
const keepTemp = process.env.KEEP_STORE_REGRESSION_TMP === "1";

function toTsPath(value) {
  return value.replace(/\\/g, "/");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function execFileAsync(command, args, options) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { ...options, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function compileStore() {
  await rm(tempDir, { recursive: true, force: true });
  await mkdir(tempDir, { recursive: true });

  const tsconfigPath = path.join(tempDir, "tsconfig.json");
  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      lib: ["es2022", "dom"],
      skipLibCheck: true,
      strict: true,
      esModuleInterop: true,
      module: "CommonJS",
      moduleResolution: "node10",
      jsx: "react-jsx",
      resolveJsonModule: true,
      rootDir: toTsPath(rootDir),
      outDir: toTsPath(tempDir),
      noEmit: false,
      declaration: false,
      sourceMap: false,
      incremental: false,
      baseUrl: toTsPath(rootDir),
      paths: {
        "@/*": ["./*"]
      }
    },
    files: [
      "next-env.d.ts",
      "lib/server/store.ts",
      "lib/server/types.ts",
      "lib/server/utils.ts",
      "lib/server/import-payload.ts",
      "components/zhihuo-model.ts",
      "components/time-archive/api-mappers.ts",
      "components/time-archive/sync-payload.ts",
      "components/time-archive/thinking-view-store.ts"
    ].map((file) => toTsPath(path.join(rootDir, file)))
  };
  await writeFile(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`, "utf8");

  const require = createRequire(import.meta.url);
  const tscBin = require.resolve("typescript/bin/tsc");
  await execFileAsync(process.execPath, [tscBin, "-p", tsconfigPath], { cwd: rootDir });

  const aliasScopeDir = path.join(tempDir, "node_modules", "@");
  await mkdir(aliasScopeDir, { recursive: true });
  await cp(path.join(tempDir, "lib"), path.join(aliasScopeDir, "lib"), { recursive: true });
  await cp(path.join(tempDir, "components"), path.join(aliasScopeDir, "components"), { recursive: true });
}

function createDb() {
  return {
    doubts: [],
    doubt_notes: [],
    thinking_spaces: [],
    thinking_nodes: [],
    thinking_inbox: [],
    thinking_scratch: [],
    thinking_space_meta: [],
    thinking_node_links: [],
    thinking_media_assets: [],
    email_verification_codes: [],
    users: [
      {
        id: "user-store-regression",
        email: "store-regression@example.test",
        password_hash: "test",
        created_at: "2026-01-01T00:00:00.000Z",
        deleted_at: null
      }
    ],
    audit_logs: [],
    user_sync_state: [],
    applied_client_mutations: [],
    sync_operation_log: [],
    sync_repair_items: []
  };
}

function runStoreAssertions(store) {
  const db = createDb();
  const userId = "user-store-regression";

  const created = store.createThinkingSpace(db, userId, "Should I start now?", null, {
    clientSpaceId: "space-1",
    clientParkingTrackId: "parking-1",
    clientUpdatedAt: "2026-01-01T00:00:00.000Z"
  });
  assert(created?.over_limit === false, "space creation should succeed");
  assert(created.space.id === "space-1", "space should keep client id");
  assert(db.thinking_space_meta[0]?.parking_track_id === "parking-1", "space meta should keep client parking track");
  assert(store.getUserRevision(db, userId) === 1, "space creation should bump revision");

  const firstNode = store.addQuestionToSpace(db, userId, "space-1", "What risk matters most?", {
    client_node_id: "node-1",
    client_created_at: "2026-01-01T00:01:00.000Z"
  });
  assert(firstNode.kind === "ok", "first node should be created");
  assert(firstNode.node.id === "node-1", "node should keep client id");

  const asset = store.upsertThinkingMediaAsset(db, userId, {
    id: "asset-1",
    file_name: "risk.png",
    mime_type: "image/png",
    byte_size: 128,
    sha256: "asset-one",
    width: 16,
    height: 16,
    created_at: "2026-01-01T00:01:30.000Z"
  });
  assert(asset.deleted_at === null, "new media asset should be active");
  assert(store.setNodeImageAsset(db, userId, "node-1", "asset-1").kind === "ok", "node image should attach");
  assert(store.listThinkingMediaAssets(db, userId).some((item) => item.id === "asset-1"), "active media should be listed");

  const clearedImage = store.setNodeImageAsset(db, userId, "node-1", null);
  assert(clearedImage.kind === "ok", "node image should clear");
  assert(db.thinking_media_assets.find((item) => item.id === "asset-1")?.deleted_at, "unreferenced media should be pruned");
  assert(!store.listThinkingMediaAssets(db, userId).some((item) => item.id === "asset-1"), "pruned media should be hidden");

  const secondNode = store.addQuestionToSpace(db, userId, "space-1", "How should I validate the next step?", {
    client_node_id: "node-2",
    client_created_at: "2026-01-01T00:02:00.000Z"
  });
  assert(secondNode.kind === "ok", "second node should be created");
  const firstTrackId = firstNode.track_id;
  const reordered = store.moveNode(db, userId, "node-2", firstTrackId, 0);
  assert(reordered?.readonly === false, "same-track reorder should be writable");
  const reorderedIds = db.thinking_nodes
    .filter((node) => node.parent_node_id === `track:${firstTrackId}`)
    .sort((a, b) => a.order_index - b.order_index)
    .map((node) => node.id);
  assert(reorderedIds[0] === "node-2", "same-track reorder should persist target position");

  const moved = store.moveNode(db, userId, "node-2", "validation-track");
  assert(moved?.readonly === false, "node move should be writable");
  assert(moved.track_id === "validation-track", "node should move to requested track");
  assert(db.thinking_nodes.find((node) => node.id === "node-2")?.parent_node_id === "track:validation-track", "node parent should use track prefix");

  const written = store.writeSpaceToTime(db, userId, "space-1", null, {
    preserveOriginalTime: false,
    clientDoubtId: "doubt-from-space",
    letterTitle: "Decision log",
    letterLines: ["first line", "second line"],
    letterVariant: "plain",
    letterSealText: "OK"
  });
  assert(written.kind === "ok", "space should write to time");
  assert(written.space.status === "hidden", "written space should become hidden");
  assert(written.doubt.id === "doubt-from-space", "write-to-time should keep client doubt id");
  assert(written.doubt.first_node_preview === "What risk matters most?", "write-to-time should preserve first node preview");
  assert(written.doubt.last_node_preview === "How should I validate the next step?", "write-to-time should preserve last node preview");
  assert(written.doubt.letter_lines.length === 2, "write-to-time should persist letter lines");

  const repair = store.recordSyncRepairItem(db, userId, {
    clientMutationId: "repair-1",
    op: "/v1/thinking/spaces/missing/questions",
    payload: { raw_text: "Lost offline question" },
    reason: "space_missing",
    destinationClass: "space",
    originalTargetId: "missing"
  });
  const repairedAgain = store.recordSyncRepairItem(db, userId, {
    clientMutationId: "repair-1",
    op: "/v1/thinking/spaces/missing/questions",
    payload: { raw_text: "Lost offline question" },
    reason: "space_still_missing",
    destinationClass: "space",
    originalTargetId: "missing"
  });
  assert(repair.id === repairedAgain.id, "repair item should deduplicate by client mutation id");
  assert(store.listUserSyncRepairItems(db, userId).length === 1, "unresolved repair item should be listed once");
  assert(repairedAgain.reason === "space_still_missing", "deduped repair item should update reason");

  const resolved = store.resolveUserSyncRepairItem(db, userId, repair.id);
  assert(resolved?.resolved_at, "repair item should resolve");
  assert(store.listUserSyncRepairItems(db, userId).length === 0, "resolved repair item should leave active list");

  const meta = db.thinking_space_meta.find((item) => item.space_id === "space-1");
  meta.milestone_node_ids = ["node-2"];
  meta.track_direction_hints = { "validation-track": "hypothesis" };
  db.thinking_node_links.push({
    id: "link-1",
    space_id: "space-1",
    source_node_id: "node-1",
    target_node_id: "node-2",
    link_type: "related",
    score: 0.8,
    created_at: "2026-01-01T00:03:00.000Z"
  });
  db.thinking_scratch.push({
    id: "scratch-1",
    user_id: userId,
    raw_text: "A durable scratch note",
    created_at: "2026-01-01T00:04:00.000Z",
    updated_at: "2026-01-01T00:04:00.000Z",
    archived_at: null,
    deleted_at: null,
    derived_space_id: null,
    fed_time_doubt_id: null
  });
  const snapshot = store.getThinkingSnapshot(db, userId);
  const restoredDb = createDb();
  store.replaceThinkingSnapshot(restoredDb, userId, snapshot);
  assert(restoredDb.thinking_scratch.some((item) => item.id === "scratch-1"), "snapshot replace should preserve scratch");
  assert(restoredDb.thinking_node_links.some((item) => item.id === "link-1"), "snapshot replace should preserve node links");
  const restoredMeta = restoredDb.thinking_space_meta.find((item) => item.space_id === "space-1");
  assert(restoredMeta?.milestone_node_ids?.[0] === "node-2", "snapshot replace should preserve milestone nodes");
  assert(
    restoredMeta?.track_direction_hints?.["validation-track"] === "hypothesis",
    "snapshot replace should preserve direction hints"
  );
}

function runModelAssertions(model) {
  const oldStore = model.normalizeThinkingStore({});
  assert(oldStore.showThinkingDimensions === false, "old thinking store should hide dimensions by default");

  const visibleStore = model.normalizeThinkingStore({
    ...model.EMPTY_THINKING_STORE,
    showThinkingDimensions: true
  });
  assert(visibleStore.showThinkingDimensions === true, "thinking dimension visibility should persist when enabled");

  const roundTripped = model.normalizeThinkingStore(JSON.parse(JSON.stringify(visibleStore)));
  assert(roundTripped.showThinkingDimensions === true, "thinking dimension visibility should survive JSON round trip");
}

function runImportPayloadAssertions(store, importPayload) {
  const userId = "user-store-regression";
  const createdAt = "2026-01-02T00:00:00.000Z";
  const normalized = importPayload.normalizeUserImportPayload(
    {
      life: {
        doubts: [{ id: "doubt-raw", raw_text: "Raw export doubt", created_at: createdAt }],
        notes: []
      },
      thinking: {
        spaces: [
          {
            id: "space-raw",
            user_id: userId,
            root_question_text: "Raw export space",
            status: "active",
            created_at: createdAt
          }
        ],
        nodes: [
          {
            id: "node-raw-a",
            space_id: "space-raw",
            raw_question_text: "First raw node",
            created_at: createdAt,
            order_index: 0,
            state: "normal",
            dimension: "definition"
          },
          {
            id: "node-raw-b",
            space_id: "space-raw",
            raw_question_text: "Second raw node",
            created_at: createdAt,
            order_index: 1,
            state: "normal",
            dimension: "evidence"
          }
        ],
        space_meta: [
          {
            space_id: "space-raw",
            export_version: 2,
            milestone_node_ids: ["node-raw-b"],
            track_direction_hints: { main: "hypothesis" }
          }
        ],
        node_links: [
          {
            id: "link-raw",
            space_id: "space-raw",
            source_node_id: "node-raw-a",
            target_node_id: "node-raw-b",
            link_type: "related",
            score: 0.6,
            created_at: createdAt
          }
        ],
        inbox: [],
        scratch: [
          {
            id: "scratch-raw",
            user_id: userId,
            raw_text: "Raw scratch",
            created_at: createdAt,
            updated_at: createdAt
          }
        ],
        media_assets: []
      }
    },
    userId
  );
  assert(importPayload.validateUserImportReferences(normalized).ok, "raw server export references should validate");
  const db = createDb();
  store.replaceLifeSnapshot(db, userId, normalized.life);
  store.replaceThinkingSnapshot(db, userId, normalized.thinking);
  assert(db.thinking_spaces[0]?.root_question_text === "Raw export space", "snake_case space should import");
  assert(db.thinking_nodes.length === 2, "snake_case nodes should import");
  assert(db.thinking_scratch[0]?.raw_text === "Raw scratch", "snake_case scratch should import");
  assert(db.thinking_node_links[0]?.id === "link-raw", "snake_case node links should import");
  assert(db.thinking_space_meta[0]?.milestone_node_ids?.[0] === "node-raw-b", "snake_case milestone metadata should import");
}

function runTimeArchiveHelperAssertions(model, viewStore, apiMappers, syncPayload) {
  const createdAt = "2026-01-01T00:00:00.000Z";
  const store = model.normalizeThinkingStore({
    ...model.EMPTY_THINKING_STORE,
    spaces: [
      {
        id: "space-helper",
        userId: "local_user",
        rootQuestionText: "How should this be split?",
        status: "active",
        createdAt,
        lastActivityAt: createdAt,
        writtenToTimeAt: null,
        sourceTimeDoubtId: null
      }
    ],
    nodes: [
      {
        id: "node-helper",
        spaceId: "space-helper",
        parentNodeId: "track:main-track",
        rawQuestionText: "Which boundary is safest?",
        createdAt,
        orderIndex: 0,
        isSuggested: false,
        state: "normal",
        dimension: "resource"
      }
    ],
    spaceMeta: [{ spaceId: "space-helper", exportVersion: 1, lastTrackId: "main-track", parkingTrackId: "parking-track" }]
  });

  const view = viewStore.buildSpaceViewFromStore(store, "space-helper");
  assert(view?.tracks[0]?.nodes[0]?.dimension === "resource", "view build should preserve node dimension");
  assert(viewStore.isSpaceViewConsistentWithStore(store, "space-helper", view), "built view should match store nodes");

  const synced = viewStore.syncStoreNodesFromView(store, "space-helper", {
    ...view,
    tracks: [
      {
        ...view.tracks[0],
        nodes: [{ ...view.tracks[0].nodes[0], questionText: "Updated boundary", dimension: "risk" }]
      }
    ]
  });
  const syncedNode = synced.nodes.find((node) => node.id === "node-helper");
  assert(syncedNode?.parentNodeId === "track:main-track", "view sync should keep track parent encoding");
  assert(syncedNode?.orderIndex === 0, "view sync should recompute stable order index");
  assert(syncedNode?.dimension === "risk", "view sync should preserve incoming dimension");
  assert(synced.spaceMeta.length === store.spaceMeta.length, "view sync should not drop space meta");

  const mapped = apiMappers.mapSyncSnapshotThinking({
    spaces: [{ id: "space-api", rootQuestionText: "API space", status: "active", createdAt }],
    nodes: [{ id: "node-api", spaceId: "space-api", rawQuestionText: "API node", createdAt }]
  });
  assert(mapped.showThinkingDimensions === false, "mapped sync snapshot should default dimension visibility to false");
  assert(mapped.nodes[0]?.dimension === "definition", "mapped sync snapshot should default missing node dimension");

  const payloadA = {
    version: "2026-03-03",
    exported_at: "2026-01-02T00:00:00.000Z",
    user_id: "user-a",
    user_email: "a@example.test",
    life: {
      doubts: [
        {
          id: "doubt-1",
          raw_text: "A doubt",
          first_node_preview: null,
          last_node_preview: null,
          letter_lines: "[\"one\",\"two\"]",
          created_at: createdAt,
          archived_at: null,
          deleted_at: null
        }
      ],
      notes: []
    },
    thinking: {
      spaces: [
        {
          id: "space-1",
          rootQuestionText: "Question",
          status: "active",
          createdAt,
          writtenToTimeAt: null,
          sourceTimeDoubtId: null
        }
      ],
      nodes: [],
      space_meta: [],
      inbox: {},
      scratch: [],
      media_assets: []
    },
    audit: []
  };
  const payloadB = {
    ...payloadA,
    life: {
      doubts: [{ ...payloadA.life.doubts[0], letter_lines: ["one", "two"] }],
      notes: []
    },
    thinking: {
      ...payloadA.thinking,
      spaces: [
        {
          id: "space-1",
          root_question_text: "Question",
          status: "active",
          created_at: createdAt,
          written_to_time_at: null,
          source_time_doubt_id: null
        }
      ]
    }
  };
  assert(
    syncPayload.stableStringify(syncPayload.canonicalizeExportPayload(payloadA)) ===
      syncPayload.stableStringify(syncPayload.canonicalizeExportPayload(payloadB)),
    "canonical export payload should normalize equivalent camel/snake payloads"
  );
}

async function run() {
  await compileStore();
  const require = createRequire(import.meta.url);
  const store = require(path.join(tempDir, "lib", "server", "store.js"));
  const model = require(path.join(tempDir, "components", "zhihuo-model.js"));
  const viewStore = require(path.join(tempDir, "components", "time-archive", "thinking-view-store.js"));
  const apiMappers = require(path.join(tempDir, "components", "time-archive", "api-mappers.js"));
  const syncPayload = require(path.join(tempDir, "components", "time-archive", "sync-payload.js"));
  const importPayload = require(path.join(tempDir, "lib", "server", "import-payload.js"));
  runStoreAssertions(store);
  runModelAssertions(model);
  runImportPayloadAssertions(store, importPayload);
  runTimeArchiveHelperAssertions(model, viewStore, apiMappers, syncPayload);
  console.log("[store-test] all checks passed");
}

try {
  await run();
} catch (error) {
  console.error("[store-test] failed:", error instanceof Error ? error.message : String(error));
  if (error && typeof error === "object" && "stdout" in error && error.stdout) {
    console.error(String(error.stdout));
  }
  if (error && typeof error === "object" && "stderr" in error && error.stderr) {
    console.error(String(error.stderr));
  }
  process.exitCode = 1;
} finally {
  if (!keepTemp) await rm(tempDir, { recursive: true, force: true });
}
