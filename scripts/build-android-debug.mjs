import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const isWindows = process.platform === "win32";
const pnpm = isWindows ? "pnpm.cmd" : "pnpm";
const gradlew = isWindows ? "gradlew.bat" : "./gradlew";
const androidDir = join(process.cwd(), "android");

function run(command, args, options = {}) {
  console.log(`[android] ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: isWindows,
    ...options
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const hasAndroidSdk = Boolean(
  process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || existsSync(join(androidDir, "local.properties"))
);

if (!hasAndroidSdk) {
  console.error("[android] Android SDK not found. Set ANDROID_HOME/ANDROID_SDK_ROOT or create android/local.properties with sdk.dir.");
  process.exit(1);
}

run(pnpm, ["build:mobile"]);
run(gradlew, ["assembleDebug", "--no-daemon"], { cwd: androidDir });
