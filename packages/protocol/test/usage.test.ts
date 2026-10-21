import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { usageValidatorSource } from '../scripts/generate-usage-validator.ts';
import { parseUsage } from '../src/usage.ts';

const root = new URL('../usage/', import.meta.url);
it('generated usage validator stays aligned with the independent schema', () => {
  expect(
    readFileSync(new URL('../src/generated/usage-validator.js', import.meta.url), 'utf8').replaceAll(
      '\r\n',
      '\n',
    ),
  ).toBe(usageValidatorSource());
});
for (const f of readdirSync(new URL('fixtures/', root)).filter((f) => f.endsWith('.json'))) {
  it(`UsageSnapshot conformance: ${f}`, () => {
    const text = readFileSync(new URL(`fixtures/${f}`, root), 'utf8');
    expect(parseUsage(text).ok).toBe(f.startsWith('valid-'));
  });
}
it('frozen exchange manifest covers schema and every fixture byte', () => {
  const manifest = JSON.parse(readFileSync(new URL('SHA256.json', root), 'utf8')) as Record<string, string>;
  for (const [path, hash] of Object.entries(manifest))
    expect(
      createHash('sha256')
        .update(readFileSync(new URL(path, root)))
        .digest('hex'),
    ).toBe(hash);
  expect(Object.keys(manifest).length).toBe(readdirSync(new URL('fixtures/', root)).length + 1);
});
it('native CLI and generated ESM work independently of the test transformer', () => {
  const cli = new URL('../src/cli/usage-check.ts', import.meta.url);
  for (const [file, status] of [
    ['valid-week.json', 0],
    ['invalid-negative.json', 1],
  ] as const) {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(cli), fileURLToPath(new URL(`fixtures/${file}`, root))],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(status);
    expect(result.stderr).toBe('');
  }
});
it('rejects pathological depth and invalid timestamps without exposing content', () => {
  expect(parseUsage(`${'['.repeat(33)}0${']'.repeat(33)}`).ok).toBe(false);
  const s = JSON.parse(readFileSync(new URL('fixtures/valid-week.json', root), 'utf8'));
  s.generated_at = '2026-11-03T24:00:00+08:00';
  expect(parseUsage(JSON.stringify(s)).ok).toBe(false);
  s.generated_at = '2026-11-03T12:00:00+08:00';
  s.rows[0].counts.input_total = '9'.repeat(79);
  expect(parseUsage(JSON.stringify(s)).ok).toBe(false);
});
