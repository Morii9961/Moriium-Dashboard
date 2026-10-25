import type { TokensCiDay } from '@moriium-dashboard/protocol/tokens-ci-types';
import { describe, expect, it } from 'vitest';
import {
  activeAverage,
  calendarWeeks,
  compact,
  lastDays,
  ratio,
  streakEnding,
  usd,
  zoneScale,
} from '../src/app/ledger-format.ts';

const day = (date: string, tokens: number, cost = tokens / 1e6): TokensCiDay => ({
  date,
  tokens,
  cost,
  messages: 1,
  input: 0,
  output: 0,
  clients: [],
});

describe('number wording', () => {
  it('uses each locale’s large-number units', () => {
    expect(compact(326_300_000, 'zh-Hans')).toBe('3.263亿');
    expect(compact(6_299_000, 'zh-Hans')).toBe('629.9万');
    expect(compact(10_450_000_000, 'zh-Hans', 3)).toBe('105亿');
    expect(compact(326_300_000, 'ja')).toBe('3.263億');
    expect(compact(326_300_000, 'en')).toBe('326.3M');
    expect(compact(1573, 'en')).toBe('1,573');
    expect(usd(115.594, 'en')).toBe('$115.59');
    expect(usd(4860.2, 'zh-Hans', true)).toBe('$4,860');
  });
});

describe('streaks and averages', () => {
  const days = [day('2026-10-20', 10), day('2026-10-22', 20), day('2026-10-23', 30), day('2026-10-24', 40)];

  it('counts consecutive active days ending on a date', () => {
    expect(streakEnding(days, '2026-10-24')).toBe(3);
    expect(streakEnding(days, '2026-10-20')).toBe(1);
    expect(streakEnding(days, '2026-10-21')).toBe(0);
  });

  it('averages only active days and rounds the ratio to one decimal', () => {
    expect(activeAverage(days).tokens).toBe(25);
    expect(ratio(40, 25)).toBe(1.6);
    expect(ratio(1, 0)).toBeNull();
  });
});

describe('grey calendar', () => {
  it('maps the smallest day to Zone VIII and the largest to Zone I on a log scale', () => {
    const z = zoneScale([day('a', 1_000), day('b', 1_000_000), day('c', 1_000_000_000)]);
    expect(z(1_000)).toBe(8);
    expect(z(1_000_000_000)).toBe(1);
    expect(z(1_000_000)).toBe(5);
    expect(z(0)).toBeNull();
  });

  it('lays weeks out Monday to Sunday up to today and labels month starts', () => {
    const { weeks, months } = calendarWeeks([day('2026-09-02', 5)], '2026-10-25', 4);
    expect(weeks.at(-1)?.[0]?.date).toBe('2026-10-19');
    expect(weeks.at(-1)?.[6]?.date).toBe('2026-10-25');
    expect(weeks[0]?.[0]?.date).toBe('2026-08-31');
    expect(weeks[0]?.[2]?.day?.tokens).toBe(5);
    expect(months.map((m) => m.month)).toEqual([8, 9, 10]);
    const future = calendarWeeks([], '2026-10-21', 1).weeks[0];
    expect(future?.filter((c) => c.future).map((c) => c.date)).toEqual([
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
  });

  it('returns the last n calendar days including empty ones', () => {
    const rows = lastDays([day('2026-10-24', 3)], '2026-10-25', 3);
    expect(rows.map((r) => [r.date, r.day?.tokens ?? 0])).toEqual([
      ['2026-10-23', 0],
      ['2026-10-24', 3],
      ['2026-10-25', 0],
    ]);
  });
});
