const BANNED_PATTERNS = [
  /你应该|你必须|最好|建议你|你要/iu,
  /真正的问题是|这说明你|结论是|最终答案/iu,
  /行动计划|执行步骤|处方|诊断/iu
];

function normalizeText(input: string) {
  return input.replace(/\s+/g, " ").trim();
}

function hasBannedPattern(text: string) {
  return BANNED_PATTERNS.some((rule) => rule.test(text));
}

export function guardBranchLabel(raw: string) {
  const text = normalizeText(raw).slice(0, 24);
  if (!text || hasBannedPattern(text)) return "未命名维度";
  return text;
}

export function guardMissingDimensions<T extends string>(items: T[]) {
  return items.filter((item): item is T => typeof item === "string" && item.length > 0).slice(0, 6);
}

export function guardSuggestedQuestions(items: string[]) {
  const result: string[] = [];
  for (const item of items) {
    const text = normalizeText(item).slice(0, 48);
    if (!text) continue;
    if (hasBannedPattern(text)) continue;
    if (!/[?？]$/.test(text)) continue;
    result.push(text);
    if (result.length >= 3) break;
  }
  return result;
}
