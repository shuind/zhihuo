/**
 * 节气与月相的轻量计算。
 * - 节气使用 2000-2100 年常见近似公式动态计算（误差约 1 天）
 * - 月相使用简化共轭法（Conway），误差 ±1 天
 */

export type SolarTerm = {
  name: string;
  date: Date;
};

type SolarTermDefinition = {
  name: string;
  month: number;
  coefficient: number;
};

const TERM_DEFINITIONS: SolarTermDefinition[] = [
  { name: "小寒", month: 0, coefficient: 5.4055 },
  { name: "大寒", month: 0, coefficient: 20.12 },
  { name: "立春", month: 1, coefficient: 3.87 },
  { name: "雨水", month: 1, coefficient: 18.73 },
  { name: "惊蛰", month: 2, coefficient: 5.63 },
  { name: "春分", month: 2, coefficient: 20.646 },
  { name: "清明", month: 3, coefficient: 4.81 },
  { name: "谷雨", month: 3, coefficient: 20.1 },
  { name: "立夏", month: 4, coefficient: 5.52 },
  { name: "小满", month: 4, coefficient: 21.04 },
  { name: "芒种", month: 5, coefficient: 5.678 },
  { name: "夏至", month: 5, coefficient: 21.37 },
  { name: "小暑", month: 6, coefficient: 7.108 },
  { name: "大暑", month: 6, coefficient: 22.83 },
  { name: "立秋", month: 7, coefficient: 7.5 },
  { name: "处暑", month: 7, coefficient: 23.13 },
  { name: "白露", month: 8, coefficient: 7.646 },
  { name: "秋分", month: 8, coefficient: 23.042 },
  { name: "寒露", month: 9, coefficient: 8.318 },
  { name: "霜降", month: 9, coefficient: 23.438 },
  { name: "立冬", month: 10, coefficient: 7.438 },
  { name: "小雪", month: 10, coefficient: 22.36 },
  { name: "大雪", month: 11, coefficient: 7.18 },
  { name: "冬至", month: 11, coefficient: 21.94 }
];

/**
 * 获取给定日期所在"节气段"的名称与该节气开始日期
 * 例如 2026-04-10 返回 { name: "清明", date: 2026-04-05 }
 */
export function getCurrentSolarTerm(date: Date): SolarTerm {
  const year = date.getFullYear();
  const target = startOfLocalDay(date).getTime();
  const candidates = [
    getSolarTermDate(year - 1, TERM_DEFINITIONS.length - 1),
    ...TERM_DEFINITIONS.map((_, index) => getSolarTermDate(year, index))
  ];

  let current = candidates[0];
  for (const term of candidates) {
    if (term.date.getTime() <= target) current = term;
    else break;
  }

  return current;
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

function getSolarTermDate(year: number, index: number): SolarTerm {
  const definition = TERM_DEFINITIONS[index];
  const y = year % 100;
  const leapAdjust = Math.floor((y - 1) / 4);
  const day = Math.floor(y * 0.2422 + definition.coefficient) - leapAdjust;
  return { name: definition.name, date: new Date(year, definition.month, day) };
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
