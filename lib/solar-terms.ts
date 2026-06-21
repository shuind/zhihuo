/**
 * 节气与月相的轻量计算。
 * - 节气使用 2019-2100 年静态日表（按北京时间生成），覆盖产品主时间范围
 * - 月相使用 Meeus 朔月修正公式推算月龄，避免 Conway 算法的整日漂移
 */

export type SolarTerm = {
  name: string;
  date: Date;
};

type SolarTermDefinition = {
  name: string;
  month: number;
};

const TERM_DEFINITIONS: SolarTermDefinition[] = [
  { name: "小寒", month: 0 },
  { name: "大寒", month: 0 },
  { name: "立春", month: 1 },
  { name: "雨水", month: 1 },
  { name: "惊蛰", month: 2 },
  { name: "春分", month: 2 },
  { name: "清明", month: 3 },
  { name: "谷雨", month: 3 },
  { name: "立夏", month: 4 },
  { name: "小满", month: 4 },
  { name: "芒种", month: 5 },
  { name: "夏至", month: 5 },
  { name: "小暑", month: 6 },
  { name: "大暑", month: 6 },
  { name: "立秋", month: 7 },
  { name: "处暑", month: 7 },
  { name: "白露", month: 8 },
  { name: "秋分", month: 8 },
  { name: "寒露", month: 9 },
  { name: "霜降", month: 9 },
  { name: "立冬", month: 10 },
  { name: "小雪", month: 10 },
  { name: "大雪", month: 11 },
  { name: "冬至", month: 11 }
];

// 24 个两位日号，顺序与 TERM_DEFINITIONS 一致。来源：lunar-javascript 1.7.7 逐日节气表生成。
const SOLAR_TERM_DAYS_BY_YEAR: Record<number, string> = {
  2019: "052004190621052006210621072308230823082408220722",
  2020: "062004190520041905200521062207220722082307220721",
  2021: "052003180520042005210521072207230723082307220721",
  2022: "052004190520052005210621072307230723082307220722",
  2023: "052004190621052006210621072308230823082408220722",
  2024: "062004190520041905200521062207220722082307220621",
  2025: "052003180520042005210521072207230723082307220721",
  2026: "052004180520052005210521072307230723082307220722",
  2027: "052004190621052006210621072308230823082307220722",
  2028: "062004190520041905200521062207220722082307220621",
  2029: "052003180520042005210521072207230723082307220721",
  2030: "052004180520052005210521072307230723082307220722",
  2031: "052004190621052006210621072308230823082307220722",
  2032: "062004190520041905200521062207220722082307220621",
  2033: "052003180520042005210521072207230723082307220721",
  2034: "052004180520052005210521072307230723082307220722",
  2035: "052004190621052005210621072307230823082307220722",
  2036: "062004190520041905200521062207220722082307220621",
  2037: "052003180520042005210521072207230723082307220721",
  2038: "052004180520052005210521072307230723082307220722",
  2039: "052004190621052005210621072307230823082307220722",
  2040: "062004190520041905200521062207220722082307220621",
  2041: "052003180520042005200521072207230722082307220721",
  2042: "052004180520042005210521072307230723082307220722",
  2043: "052004190621052005210621072307230823082307220722",
  2044: "062004190520041905200521062207220722072307220621",
  2045: "052003180520041905200521072207230722082307220721",
  2046: "052004180520042005210521072207230723082307220722",
  2047: "052004190621052005210621072307230823082307220722",
  2048: "062004190520041905200520062207220722072307210621",
  2049: "051903180520041905200521062207220722082307220721",
  2050: "052003180520042005210521072207230723082307220722",
  2051: "052004190520052005210621072307230723082307220722",
  2052: "052004190520041905200520062207220722072307210621",
  2053: "051903180520041905200521062207220722082307220721",
  2054: "052003180520042005210521072207230723082307220722",
  2055: "052004190520052005210521072307230723082307220722",
  2056: "052004190520041905200520062207220722072307210621",
  2057: "051903180520041905200521062207220722082307220621",
  2058: "052003180520042005210521072207230723082307220721",
  2059: "052004190520052005210521072307230723082307220722",
  2060: "052004190520041905200520062207220722072206210621",
  2061: "051903180520041905200521062207220722082307220621",
  2062: "052003180520042005210521072207230723082307220721",
  2063: "052004180520052005210521072307230723082307220722",
  2064: "052004190520041905200520062207220722072206210621",
  2065: "051903180520041905200521062207220722082307220621",
  2066: "052003180520042005210521072207230723082307220721",
  2067: "052004180520052005210521072307230723082307220722",
  2068: "052004190520041904200520062206220722072206210621",
  2069: "051903180520041905200521062207220722082307220621",
  2070: "052003180520042005200521072207230722082307220721",
  2071: "052004180520052005210521072307230723082307220722",
  2072: "052004190520041904200520062206220722072206210621",
  2073: "051903180520041905200521062207220722072307220621",
  2074: "052003180520042005200521072207230722082307220721",
  2075: "052004180520042005210521072207230723082307220722",
  2076: "052004190520041904200520062206220722072206210621",
  2077: "051903180520041905200521062207220722072307220621",
  2078: "052003180520041905200521062207230722082307220721",
  2079: "052004180520042005210521072207230723082307220722",
  2080: "052004190520041904200520062206220722072206210621",
  2081: "051903180520041905200520062207220722072307210621",
  2082: "052003180520041905200521062207220722082307220721",
  2083: "052003180520042005210521072207230723082307220722",
  2084: "052004190419041904200520062206220622072206210621",
  2085: "041903180520041905200520062207220722072307210621",
  2086: "051903180520041905200521062207220722082307220721",
  2087: "052003180520042005210521072207230723082307220722",
  2088: "052004190419041904200420062206220622072206210621",
  2089: "041903180520041905200520062207220722072307210621",
  2090: "051903180520041905200521062207220722082307220621",
  2091: "052003180520042005210521072207230723082307220721",
  2092: "052004190419041904200420062206220622072206210621",
  2093: "041903180520041905200520062207220722072206210621",
  2094: "051903180520041905200521062207220722082307220621",
  2095: "052003180520042005210521072207230723082307220721",
  2096: "052004180419041904200420062206220622072206210621",
  2097: "041903180520041905200520062206220722072206210621",
  2098: "051903180520041905200521062207220722082307220621",
  2099: "052003180520042005210521072207230723082307220721",
  2100: "052004180520052005210521072307230723082307220722"
};

const SOLAR_TERM_DAY_NAMES = [
  "初", "二", "三", "四", "五", "六", "七", "八", "九", "十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七"
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
  const ordinal = SOLAR_TERM_DAY_NAMES[days] ?? `第${days + 1}`;
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
  const jd = date.getTime() / 86_400_000 + 2_440_587.5;
  const currentK = Math.floor((jd - 2_451_550.09765) / 29.530588853);
  let previousNewMoon = trueNewMoon(currentK);
  let nextNewMoon = trueNewMoon(currentK + 1);

  if (previousNewMoon > jd) {
    nextNewMoon = previousNewMoon;
    previousNewMoon = trueNewMoon(currentK - 1);
  } else if (nextNewMoon <= jd) {
    previousNewMoon = nextNewMoon;
    nextNewMoon = trueNewMoon(currentK + 2);
  }

  const synodicLength = nextNewMoon - previousNewMoon;
  const age = Math.max(0, Math.min(synodicLength, jd - previousNewMoon));
  const value = age / synodicLength;
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
  const encodedDays = SOLAR_TERM_DAYS_BY_YEAR[year];
  if (encodedDays) {
    const day = Number(encodedDays.slice(index * 2, index * 2 + 2));
    return { name: definition.name, date: new Date(year, definition.month, day) };
  }

  // 范围外仅作兜底，产品主范围走上面的静态表。
  const y = year % 100;
  const coefficient = FALLBACK_TERM_COEFFICIENTS[index];
  const leapAdjust = Math.floor((y - 1) / 4);
  const day = Math.floor(y * 0.2422 + coefficient) - leapAdjust;
  return { name: definition.name, date: new Date(year, definition.month, day) };
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

const FALLBACK_TERM_COEFFICIENTS = [
  5.4055, 20.12, 3.87, 18.73, 5.63, 20.646, 4.81, 20.1,
  5.52, 21.04, 5.678, 21.37, 7.108, 22.83, 7.5, 23.13,
  7.646, 23.042, 8.318, 23.438, 7.438, 22.36, 7.18, 21.94
];

function trueNewMoon(k: number) {
  const t = k / 1236.85;
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const e = 1 - 0.002516 * t - 0.0000074 * t2;
  const m = normalizeDegrees(2.5534 + 29.10535669 * k - 0.0000218 * t2 - 0.00000011 * t3);
  const mPrime = normalizeDegrees(201.5643 + 385.81693528 * k + 0.0107438 * t2 + 0.00001239 * t3 - 0.000000058 * t4);
  const f = normalizeDegrees(160.7108 + 390.67050284 * k - 0.0016341 * t2 - 0.00000227 * t3 + 0.000000011 * t4);
  const omega = normalizeDegrees(124.7746 - 1.5637558 * k + 0.0020691 * t2 + 0.00000215 * t3);

  return (
    2_451_550.09765 +
    29.530588853 * k +
    0.0001337 * t2 -
    0.00000015 * t3 +
    0.00000000073 * t4 -
    0.4072 * sinDeg(mPrime) +
    0.17241 * e * sinDeg(m) +
    0.01608 * sinDeg(2 * mPrime) +
    0.01039 * sinDeg(2 * f) +
    0.00739 * e * sinDeg(mPrime - m) -
    0.00514 * e * sinDeg(mPrime + m) +
    0.00208 * e * e * sinDeg(2 * m) -
    0.00111 * sinDeg(mPrime - 2 * f) -
    0.00057 * sinDeg(mPrime + 2 * f) +
    0.00056 * e * sinDeg(2 * mPrime + m) -
    0.00042 * sinDeg(3 * mPrime) +
    0.00042 * e * sinDeg(m + 2 * f) +
    0.00038 * e * sinDeg(m - 2 * f) -
    0.00024 * e * sinDeg(2 * mPrime - m) -
    0.00017 * sinDeg(omega) -
    0.00007 * sinDeg(mPrime + 2 * m) +
    0.00004 * sinDeg(2 * mPrime - 2 * f) +
    0.00004 * sinDeg(3 * m) +
    0.00003 * sinDeg(mPrime + m - 2 * f) +
    0.00003 * sinDeg(2 * mPrime + 2 * f) -
    0.00003 * sinDeg(mPrime + m + 2 * f) +
    0.00003 * sinDeg(mPrime - m + 2 * f) -
    0.00002 * sinDeg(mPrime - m - 2 * f) -
    0.00002 * sinDeg(3 * mPrime + m) +
    0.00002 * sinDeg(4 * mPrime)
  );
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function sinDeg(value: number) {
  return Math.sin((value * Math.PI) / 180);
}
