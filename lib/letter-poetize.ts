/**
 * 把一条疑问 + 若干思考节点，凝练成适合笺纸导出的短文本
 *
 * 当前实现为"规则式"：从节点文本中挑出最短最密的几句，
 * 做轻度裁剪与空格整理。后续可替换为 AI SDK 的结构化生成。
 */

export type PoetizeInput = {
  /** 原始疑问 */
  doubt: string;
  /** 思考过程中的节点（从发问到沉淀的顺序） */
  nodes: string[];
  /** 用户的落笔一句（可选，思考层写回时间时留下的那句） */
  closing?: string;
};

export type PoetizeOutput = {
  /** 笺纸正文：数行短句 */
  lines: string[];
  /** 作为标题的疑问（可能被轻度裁剪） */
  title: string;
};

const MAX_LINE = 18;    // 单行中文字符上限
const MAX_LINES = 4;    // 最多行数

export function poetize(input: PoetizeInput): PoetizeOutput {
  const title = trimSentence(input.doubt, 20);

  // 合并所有候选句子
  const candidates: string[] = [];
  for (const raw of input.nodes) {
    for (const piece of splitToSentences(raw)) {
      const cleaned = cleanSentence(piece);
      if (cleaned && cleaned.length <= MAX_LINE * 1.6) candidates.push(cleaned);
    }
  }
  if (input.closing) {
    for (const piece of splitToSentences(input.closing)) {
      const cleaned = cleanSentence(piece);
      if (cleaned) candidates.push(cleaned);
    }
  }

  // 去重，保留较短且信息密度较高的（按字符长度排）
  const uniq = Array.from(new Set(candidates));
  const sorted = [...uniq].sort((a, b) => scoreSentence(a) - scoreSentence(b));

  // 取前 MAX_LINES 句，再按它们在原文中出现的顺序排列
  const picked = sorted.slice(0, MAX_LINES);
  picked.sort((a, b) => uniq.indexOf(a) - uniq.indexOf(b));

  const lines = picked.map((s) => softWrap(s, MAX_LINE));
  // 如果只有一句且过长，强制拆成两行
  const flat = lines.flat();

  return {
    title,
    lines: flat.length ? flat : [trimSentence(input.doubt, MAX_LINE)]
  };
}

function splitToSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/[。！？?!\n\r；;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function cleanSentence(s: string): string {
  return s
    .replace(/^[""''"'「『]+/, "")
    .replace(/[""''"'」』]+$/, "")
    .replace(/[，,、]$/, "")
    .trim();
}

function trimSentence(s: string, max: number): string {
  const cleaned = cleanSentence(s);
  if (cleaned.length <= max) return cleaned;
  return cleaned.slice(0, max - 1) + "…";
}

/**
 * 分数越低越优先：短句优先，过短（<6）惩罚，信息密度（非标点字符比例）奖励
 */
function scoreSentence(s: string): number {
  const len = s.length;
  const letters = s.replace(/[\s，,。！？?!；;、·—\-…]/g, "").length;
  const density = letters / Math.max(len, 1);

  let score = len;
  if (len < 6) score += 20; // 过短罚
  if (len > MAX_LINE) score += (len - MAX_LINE) * 1.2;
  score -= density * 6;
  return score;
}

/**
 * 软换行：如果一行中文超过 max，在合适的位置（逗号处优先）切一次
 */
function softWrap(s: string, max: number): string[] {
  if (s.length <= max) return [s];
  // 优先在逗号处切
  const comma = [...s.matchAll(/[，,、]/g)];
  if (comma.length) {
    const mid = comma.reduce((best, m) =>
      Math.abs((m.index ?? 0) - max) < Math.abs((best.index ?? 0) - max) ? m : best
    );
    const idx = mid.index ?? Math.floor(s.length / 2);
    const left = cleanSentence(s.slice(0, idx + 1));
    const right = cleanSentence(s.slice(idx + 1));
    return [left, right].filter(Boolean);
  }
  // 退化：按长度均分
  const half = Math.floor(s.length / 2);
  return [s.slice(0, half), s.slice(half)];
}
