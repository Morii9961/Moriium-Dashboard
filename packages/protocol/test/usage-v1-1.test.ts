import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { usageValidatorSource } from '../scripts/generate-usage-validator.ts';
import { parseUsage } from '../src/usage.ts';

const root = new URL('../usage/v1.1/', import.meta.url);
for (const f of readdirSync(new URL('fixtures/', root)).filter((f) => f.endsWith('.json')))
  it(`1.1 conformance ${f}`, () => {
    const result = parseUsage(readFileSync(new URL(`fixtures/${f}`, root), 'utf8'));
    expect(result.ok).toBe(f.startsWith('valid-'));
    if (result.ok) expect(result.snapshot.schema_version).toBe('1.1');
  });
it('1.1 generated validator and exchange bytes are frozen independently', () => {
  expect(
    readFileSync(new URL('../src/generated/usage-validator-v1-1.js', import.meta.url), 'utf8').replaceAll(
      '\r\n',
      '\n',
    ),
  ).toBe(usageValidatorSource('1.1'));
  const manifest = JSON.parse(readFileSync(new URL('SHA256.json', root), 'utf8')) as Record<string, string>;
  expect(Object.keys(manifest)).toHaveLength(readdirSync(new URL('fixtures/', root)).length + 1);
  for (const [path, hash] of Object.entries(manifest))
    expect(
      createHash('sha256')
        .update(readFileSync(new URL(path, root)))
        .digest('hex'),
    ).toBe(hash);
});
