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
    files: ["lib/server/store.ts", "lib/server/types.ts", "lib/server/utils.ts", "components/zhihuo-model.ts"].map((file) =>
      toTsPath(path.join(rootDir, file))
    )
  };
  await writeFile(tsconfigPath, `${JSON.stringify(tsconfig, null, 2)}\n`, "utf8");

  const require = createRequire(import.meta.url);
  const tscBin = require.resolve("typescript/bin/tsc");
  await execFileAsync(process.execPath, [tscBin, "-p", tsconfigPath], { cwd: rootDir });

  const aliasScopeDir = path.join(tempDir, "node_modules", "@");
  await mkdir(aliasScopeDir, { recursive: true });
  await cp(path.join(tempDir, "lib"), path.join(aliasScopeDir, "lib"), { recursive: true });
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

async function run() {
  await compileStore();
  const require = createRequire(import.meta.url);
  const store = require(path.join(tempDir, "lib", "server", "store.js"));
  const model = require(path.join(tempDir, "components", "zhihuo-model.js"));
  runStoreAssertions(store);
  runModelAssertions(model);
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
