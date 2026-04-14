import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const isWindows = process.platform === "win32";
const pnpm = isWindows ? "pnpm.cmd" : "pnpm";
const apiRoutesDir = join(process.cwd(), "app", "v1");
const tempRoot = join(process.cwd(), ".mobile-build");
const tempApiRoutesDir = join(tempRoot, "v1");

function run(command, args, options = {}) {
  console.log(`[mobile] ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: isWindows,
    ...options
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  }
}

if (!process.env.NEXT_PUBLIC_API_BASE_URL) {
  console.log("[mobile] NEXT_PUBLIC_API_BASE_URL is not set; APK cloud sync will target the packaged app origin.");
}

try {
  if (existsSync(apiRoutesDir)) {
    mkdirSync(tempRoot, { recursive: true });
    rmSync(tempApiRoutesDir, { recursive: true, force: true });
    cpSync(apiRoutesDir, tempApiRoutesDir, { recursive: true });
    rmSync(apiRoutesDir, { recursive: true, force: true });
  }

  run(pnpm, ["exec", "next", "build"], {
    env: {
      ...process.env,
      NEXT_PUBLIC_MOBILE_BUILD: "1"
    }
  });
} finally {
  if (!existsSync(apiRoutesDir) && existsSync(tempApiRoutesDir)) {
    cpSync(tempApiRoutesDir, apiRoutesDir, { recursive: true });
    rmSync(tempApiRoutesDir, { recursive: true, force: true });
  }
}

if (existsSync(join(process.cwd(), "android"))) {
  run(pnpm, ["exec", "cap", "sync", "android"]);
} else {
  run(pnpm, ["exec", "cap", "add", "android"]);
}
