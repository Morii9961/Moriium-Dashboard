/**
 * snapshot_at 的解析。协议要求 RFC 3339 并且必须带时区（03 第 3.1 节）。
 * 自己解析而不用 Date.parse：Date.parse 会把不带时区的时间当作本地时间，
 * 也不保留原始偏移，而入库需要同时保存 UTC 和原始偏移（规划 R12）。
 */

const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?(Z|([+-])(\d{2}):(\d{2}))$/;

export interface ParsedDateTime {
  utcMs: number;
  offsetMinutes: number;
}

export function parseSnapshotAt(value: string): ParsedDateTime | null {
  const m = RFC3339.exec(value);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const fraction = m[7] ? Number(`0${m[7]}`) : 0;

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;

  let offsetMinutes = 0;
  if (m[8] !== 'Z') {
    const offHour = Number(m[10]);
    const offMinute = Number(m[11]);
    if (offHour > 23 || offMinute > 59) return null;
    offsetMinutes = (m[9] === '-' ? -1 : 1) * (offHour * 60 + offMinute);
  }

  const localMs = Date.UTC(year, month - 1, day, hour, minute, second) + Math.floor(fraction * 1000);
  return { utcMs: localMs - offsetMinutes * 60_000, offsetMinutes };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 用于给出更具体的错误说明：缺 T、缺时区、缺秒。 */
export function describeDateTimeProblem(value: string): {
  missingT: boolean;
  missingTimezone: boolean;
  missingSeconds: boolean;
} {
  const hasDateAndTime = /^\d{4}-\d{2}-\d{2}[T t]\d{2}:\d{2}/.test(value);
  return {
    missingT: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value),
    missingTimezone: hasDateAndTime && !/(Z|[+-]\d{2}:?\d{2})$/i.test(value),
    missingSeconds: /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?!:)/.test(value),
  };
}

/** Ajv 的 date-time 格式：语法由 Schema 的 pattern 管，这里只判断日期是否存在。 */
export function isValidDateTime(value: string): boolean {
  return parseSnapshotAt(value) !== null;
}
