import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_DIRS = ["app", "components", "lib"];
const SOURCE_EXTENSIONS = new Set([".css", ".ts", ".tsx"]);
const SOURCE_FONT = "node_modules/@fontsource/noto-serif-sc/files/noto-serif-sc-chinese-simplified-400-normal.woff";
const CHAR_FILE = ".tmp/font-subset-chars.txt";
const OUTPUT_FONT = "public/fonts/zhihuo-serif-ui-400.woff";

const seedText = `
知惑 Zhihuo 时间档案馆 已存入时间 此刻 在想什么 探索 继续想一想 随记 新思考
设置 登录 注册 验证码 下载 APK 清明 初日 月相 朱印 节气 沉淀笺 封存 空间
方向 回望札记 我的回应 取消 保存 创建 删除 确认 关闭 返回首页 ANDROID APK
0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ .,;:!?()[]{}<>/\\|'"·—–-+_=*@#$%^&~
`;

function walkFiles(dir) {
  const absoluteDir = path.join(ROOT, dir);
  if (!existsSync(absoluteDir)) return [];
  const output = [];
  for (const entry of readdirSync(absoluteDir)) {
    const absolutePath = path.join(absoluteDir, entry);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      output.push(...walkFiles(path.relative(ROOT, absolutePath)));
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry))) output.push(absolutePath);
  }
  return output;
}

function shouldKeepChar(char) {
  const code = char.codePointAt(0) ?? 0;
  return (
    (code >= 0x20 && code <= 0x7e) ||
    (code >= 0x3000 && code <= 0x303f) ||
    (code >= 0x3400 && code <= 0x9fff) ||
    (code >= 0xff00 && code <= 0xffef)
  );
}

const chars = new Set();
for (const file of SOURCE_DIRS.flatMap(walkFiles)) {
  for (const char of readFileSync(file, "utf8")) {
    if (shouldKeepChar(char)) chars.add(char);
  }
}
for (const char of seedText) {
  if (shouldKeepChar(char)) chars.add(char);
}

mkdirSync(path.dirname(path.join(ROOT, CHAR_FILE)), { recursive: true });
mkdirSync(path.dirname(path.join(ROOT, OUTPUT_FONT)), { recursive: true });
writeFileSync(path.join(ROOT, CHAR_FILE), [...chars].sort().join(""), "utf8");

const result = spawnSync(
  "pyftsubset",
  [
    SOURCE_FONT,
    `--text-file=${CHAR_FILE}`,
    "--flavor=woff",
    `--output-file=${OUTPUT_FONT}`,
    "--layout-features=*",
    "--no-hinting"
  ],
  { cwd: ROOT, shell: process.platform === "win32", stdio: "inherit" }
);

if (result.status !== 0) {
  throw new Error("font subset generation failed; ensure pyftsubset from fonttools is installed");
}

const size = statSync(path.join(ROOT, OUTPUT_FONT)).size;
console.log(`Generated ${OUTPUT_FONT} with ${chars.size} chars (${Math.round(size / 1024)}KB).`);
