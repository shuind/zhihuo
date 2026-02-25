import { GuardScene } from "@/lib/types";

const bannedWords: Record<GuardScene, string[]> = {
  life_auto: [
    "你其实",
    "你应该",
    "本质是",
    "逃避",
    "恐惧",
    "创伤",
    "完美主义",
    "幼稚",
    "正确答案"
  ],
  learning_auto: [
    "标准答案",
    "一步到位",
    "你应该",
    "最终结论",
    "完整教程",
    "直接这样做"
  ],
  explore_prompt: [
    "你其实",
    "这意味着",
    "你应该",
    "真正的问题是",
    "因为",
    "所以"
  ],
  semantic_hint: ["诊断", "病症", "人格缺陷"]
};

const maxLength: Record<GuardScene, number> = {
  life_auto: 140,
  learning_auto: 140,
  explore_prompt: 50,
  semantic_hint: 40
};

export type GuardResult =
  | { ok: true; text: string }
  | { ok: false; reason: string; action: "EMPTY" | "RETRY" | "DROP" };

export function guardOutput(scene: GuardScene, text: string): GuardResult {
  const trimmed = text.trim();

  if (!trimmed) {
    return { ok: false, reason: "empty", action: "EMPTY" };
  }

  if (trimmed.length > maxLength[scene]) {
    return { ok: false, reason: "too_long", action: "EMPTY" };
  }

  if (bannedWords[scene].some((word) => trimmed.includes(word))) {
    return { ok: false, reason: "banned_word", action: "DROP" };
  }

  if (scene === "explore_prompt" && !/[?？]$/.test(trimmed)) {
    return { ok: false, reason: "must_be_question", action: "EMPTY" };
  }

  return { ok: true, text: trimmed };
}
