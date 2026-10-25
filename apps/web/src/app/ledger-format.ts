/**
 * 算力账本的纯计算：数字写法、连续活跃、日均、灰阶日历。页面和小票共用，不碰 DOM。
 * 金额是 tokens.ci 按 API 价格估算的美元。
 */
import type { TokensCiDay } from '@moriium-dashboard/protocol/tokens-ci-types';
import type { Locale } from '../i18n/locale.ts';

/** 大数用当地的写法：中文「亿 / 万」，日文「億 / 万」，英文「B / M / K」。 */
export function compact(n: number, locale: Locale, digits = 4): string {
  if (Math.abs(n) < 10_000) return new Intl.NumberFormat(locale).format(Math.round(n));
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumSignificantDigits: digits }).format(n);
}

export const integer = (n: number, locale: Locale) => new Intl.NumberFormat(locale).format(Math.round(n));

export function usd(n: number, locale: Locale, whole = false): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(n);
}

export const clientName = (client: string) =>
  client === 'claude' ? 'Claude Code' : client === 'codex' ? 'Codex CLI' : client;

const DAY = 86_400_000;
const toMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
export const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (date: string, n: number) => toDate(toMs(date) + n * DAY);

/** 截至 date（含）连续有用量的天数。 */
export function streakEnding(days: TokensCiDay[], date: string): number {
  const active = new Set(days.filter((d) => d.tokens > 0).map((d) => d.date));
  let n = 0;
  for (let d = date; active.has(d); d = addDays(d, -1)) n++;
  return n;
}

/** 有用量的日子里，平均每天多少（Token 与费用）。 */
export function activeAverage(days: TokensCiDay[]): { tokens: number; cost: number } {
  const active = days.filter((d) => d.tokens > 0);
  if (!active.length) return { tokens: 0, cost: 0 };
  return {
    tokens: active.reduce((n, d) => n + d.tokens, 0) / active.length,
    cost: active.reduce((n, d) => n + d.cost, 0) / active.length,
  };
}

/** 一位小数的倍数，例如 1.4。平均为 0 时返回 null。 */
export function ratio(value: number, average: number): number | null {
  return average > 0 ? Math.round((value / average) * 10) / 10 : null;
}

/**
 * 有用量的日子映射到灰阶：最少的 Zone VIII，最多的 Zone I，按对数均分（用量相差很大，线性会把多数日子挤成一档）。
 * 没有用量返回 null（画成 Zone X 的空格）。
 */
export function zoneScale(days: TokensCiDay[]): (tokens: number) => number | null {
  const values = days.map((d) => d.tokens).filter((t) => t > 0);
  if (!values.length) return () => null;
  const lo = Math.log(Math.min(...values));
  const hi = Math.log(Math.max(...values));
  return (tokens) => {
    if (tokens <= 0) return null;
    if (hi === lo) return 4;
    const t = (Math.log(tokens) - lo) / (hi - lo);
    return Math.max(1, Math.min(8, Math.round(8 - t * 7)));
  };
}

export interface CalendarCell {
  date: string;
  day: TokensCiDay | null;
  /** 今天之后的格子：占位，不能选。 */
  future: boolean;
}

/**
 * 灰阶日历：每列一周（周一到周日），从最早有用量那周的周一到 today 所在周。
 * 至少 minWeeks 周、至多 maxWeeks 周（超出时只留最近的）。
 */
export function calendarWeeks(
  days: TokensCiDay[],
  today: string,
  minWeeks = 13,
  maxWeeks = 53,
): { weeks: CalendarCell[][]; months: { col: number; month: number }[] } {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const monday = (date: string) => addDays(date, -((new Date(toMs(date)).getUTCDay() + 6) % 7));
  const lastMonday = monday(today);
  const first = days[0]?.date ?? today;
  let count = Math.round((toMs(lastMonday) - toMs(monday(first))) / DAY / 7) + 1;
  count = Math.max(minWeeks, Math.min(maxWeeks, count));
  const start = addDays(lastMonday, -7 * (count - 1));
  const weeks: CalendarCell[][] = [];
  const months: { col: number; month: number }[] = [];
  for (let w = 0; w < count; w++) {
    const col: CalendarCell[] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(start, w * 7 + i);
      col.push({ date, day: byDate.get(date) ?? null, future: date > today });
    }
    const month = Number(col[0]?.date.slice(5, 7));
    if (!months.length || months[months.length - 1]?.month !== month) months.push({ col: w, month });
    weeks.push(col);
  }
  return { weeks, months };
}

/** 截至 today 的最近 n 天（含没有用量的日子）。 */
export function lastDays(
  days: TokensCiDay[],
  today: string,
  n = 30,
): { date: string; day: TokensCiDay | null }[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(today, i - n + 1);
    return { date, day: byDate.get(date) ?? null };
  });
}

/** 本机的今天（YYYY-MM-DD）。tokens.ci 也按提交时的本地日期归日。 */
export function localToday(now = new Date()): string {
  return toDate(now.getTime() - now.getTimezoneOffset() * 60_000);
}
