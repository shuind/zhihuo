import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const isWindows = process.platform === "win32";
const pnpm = isWindows ? "pnpm.cmd" : "pnpm";
const gradlew = isWindows ? "gradlew.bat" : "./gradlew";
const androidDir = join(process.cwd(), "android");

function javaMajor(javaHome) {
  const executable = javaHome ? join(javaHome, "bin", isWindows ? "java.exe" : "java") : "java";
  const result = spawnSync(executable, ["-version"], { encoding: "utf8", shell: false });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const match = output.match(/version\s+"(\d+)(?:\.|")/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function resolveJavaHome() {
  const candidates = [
    process.env.JAVA_HOME,
    process.env.ANDROID_STUDIO_JDK,
    isWindows && process.env.ProgramFiles ? join(process.env.ProgramFiles, "Android", "Android Studio", "jbr") : null,
    process.platform === "darwin" ? "/Applications/Android Studio.app/Contents/jbr/Contents/Home" : null,
    process.platform === "linux" ? "/opt/android-studio/jbr" : null
  ].filter((candidate) => typeof candidate === "string" && candidate.trim() && existsSync(candidate));

  const compatible = candidates.find((candidate) => (javaMajor(candidate) ?? 0) >= 21);
  if (compatible) return compatible;
  if ((javaMajor(null) ?? 0) >= 21) return null;
  return undefined;
}

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

const javaHome = resolveJavaHome();
if (javaHome === undefined) {
  console.error("[android] Java 21+ not found. Install Android Studio or set JAVA_HOME/ANDROID_STUDIO_JDK to a JDK 21+ directory.");
  process.exit(1);
}

run(pnpm, ["build:mobile"]);
run(gradlew, ["assembleDebug", "--no-daemon"], {
  cwd: androidDir,
  env: {
    ...process.env,
    ...(javaHome ? { JAVA_HOME: javaHome } : {})
  }
});
