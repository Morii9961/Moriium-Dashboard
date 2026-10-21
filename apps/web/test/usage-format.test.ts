import { expect, it } from 'vitest';
import { shanghaiMonday, usageMoney, usageNumber } from '../src/app/usage-format.ts';
import { contrast } from '../src/design/color.ts';
import { SURFACES } from '../src/design/tokens.ts';

it('keeps huge counts and final money rounding exact', () => {
  expect(usageNumber('9007199254741999', 'en')).toBe('9,007,199,254,741,999');
  expect(usageMoney('9007199254741999.995000000000000', 'USD', 'en')).toBe('$9,007,199,254,742,000.00');
  expect(usageMoney('0.004999999999999', 'USD', 'en')).toBe('$0.00');
  expect(usageMoney('0.005000000000000', 'USD', 'en')).toBe('$0.01');
  expect(usageMoney(null, 'USD', 'en')).toBe('—');
});
it('selects Shanghai Monday, independently of host timezone and UTC Sunday', () => {
  expect(shanghaiMonday(new Date('2026-11-01T15:59:59Z'))).toBe('2026-10-26');
  expect(shanghaiMonday(new Date('2026-11-01T16:00:00Z'))).toBe('2026-11-02');
});
it('the reused Usage text, chart and input boundary colors meet contrast floors in both themes', () => {
  for (const colors of Object.values(SURFACES)) {
    expect(contrast(colors.ink1, colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.ink2, colors.canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.ink3, colors.surface)).toBeGreaterThanOrEqual(3);
  }
});
