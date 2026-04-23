/**
 * 节气与月相的轻量计算。
 * - 节气使用近似公式（误差约 1 天），对"标签感"已足够
 * - 月相使用简化共轭法（Conway），误差 ±1 天
 */

export type SolarTerm = {
  name: string;
  date: Date;
};

const TERM_NAMES = [
  "小寒", "大寒",
  "立春", "雨水", "惊蛰", "春分", "清明", "谷雨",
  "立夏", "小满", "芒种", "夏至", "小暑", "大暑",
  "立秋", "处暑", "白露", "秋分", "寒露", "霜降",
  "立冬", "小雪", "大雪", "冬至"
];

// 二十四节气近似天数表（以 1 月 1 日为起点），误差约 1 天
// 数据来自常见节气公式（Y*D+C - L）的简化版本，针对 2000-2100 年
const TERM_OFFSETS_2026 = [
  5, 20,                 // 小寒 大寒
  34, 49, 64, 79, 94, 109,
  125, 140, 156, 172, 188, 204,
  220, 236, 252, 267, 282, 297,
  312, 326, 341, 355
];

/**
 * 获取给定日期所在"节气段"的名称与该节气开始日期
 * 例如 2026-04-10 返回 { name: "清明", date: 2026-04-05 }
 */
export function getCurrentSolarTerm(date: Date): SolarTerm {
  const year = date.getFullYear();
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(year, 0, 1).getTime()) / 86_400_000
  );

  // 找到最近且不晚于当前日期的节气
  let index = 0;
  for (let i = 0; i < TERM_OFFSETS_2026.length; i++) {
    if (TERM_OFFSETS_2026[i] <= dayOfYear) index = i;
    else break;
  }
  const termDate = new Date(year, 0, 1);
  termDate.setDate(termDate.getDate() + TERM_OFFSETS_2026[index]);

  return { name: TERM_NAMES[index], date: termDate };
}

/**
 * 给一个更具身体感的描述，例如"清明第五日"
 */
export function describeSolarTerm(date: Date): string {
  const term = getCurrentSolarTerm(date);
  const days = Math.floor(
    (date.getTime() - term.date.getTime()) / 86_400_000
  );
  const ordinals = ["初", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二", "十三", "十四", "十五"];
  const ordinal = ordinals[days] ?? `第${days + 1}`;
  return `${term.name}·${ordinal}日`;
}

/* ------------------------------ 月相 ------------------------------ */

export type MoonPhase = {
  /** 0 - 1 的连续值，0 = 新月，0.5 = 满月 */
  value: number;
  /** 人类可读名称 */
  name: string;
  /** 用于 SVG 绘制的分类 */
  shape: "new" | "waxing-crescent" | "first-quarter" | "waxing-gibbous" | "full" | "waning-gibbous" | "last-quarter" | "waning-crescent";
};

export function getMoonPhase(date: Date): MoonPhase {
  // Conway 简化算法
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  let r = year % 100;
  r %= 19;
  if (r > 9) r -= 19;
  r = (r * 11) % 30 + month + day;
  if (month < 3) r += 2;
  r -= year < 2000 ? 4 : 8.3;
  r = Math.floor(r + 0.5) % 30;
  const age = r < 0 ? r + 30 : r; // 0-29

  const value = age / 29.53;
  const name = phaseName(age);
  const shape = phaseShape(age);
  return { value, name, shape };
}

function phaseName(age: number): string {
  if (age < 1.5) return "朔月";
  if (age < 5.5) return "蛾眉月";
  if (age < 9.5) return "上弦月";
  if (age < 13.5) return "盈凸月";
  if (age < 16.5) return "望月";
  if (age < 20.5) return "亏凸月";
  if (age < 24) return "下弦月";
  if (age < 28) return "残月";
  return "朔月";
}

function phaseShape(age: number): MoonPhase["shape"] {
  if (age < 1.5) return "new";
  if (age < 5.5) return "waxing-crescent";
  if (age < 9.5) return "first-quarter";
  if (age < 13.5) return "waxing-gibbous";
  if (age < 16.5) return "full";
  if (age < 20.5) return "waning-gibbous";
  if (age < 24) return "last-quarter";
  if (age < 28) return "waning-crescent";
  return "new";
}
