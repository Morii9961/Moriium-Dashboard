import { describe, expect, it } from 'vitest';
import { isSupportedSchemaVersion } from '../src/index.ts';

describe('isSupportedSchemaVersion', () => {
  it('accepts 1.0 and 1.1', () => {
    expect(isSupportedSchemaVersion('1.0')).toBe(true);
    expect(isSupportedSchemaVersion('1.1')).toBe(true);
  });

  it('rejects other values, including the number 1.1', () => {
    for (const value of ['1.2', '2.0', '1', 1.1, null, undefined]) {
      expect(isSupportedSchemaVersion(value)).toBe(false);
    }
  });
});
