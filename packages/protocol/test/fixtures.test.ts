/**
 * 协议样本（fixtures/protocol）：每个样本的检查结果必须与清单里的预期一致，
 * 清单的 doc 字段指向规划 03、04 的对应章节。
 *
 * 疑似密钥和超大文件的样本在这里运行时生成，不提交进仓库：
 * 公开仓库里不放令牌形态的字符串，也不放 1 MiB 的文件。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkSnapshot } from '../src/check.ts';
import type { RegisteredProject } from '../src/constants.ts';
import { formatFixPrompt, formatIssue, formatIssueLine } from '../src/messages/zh-Hans.ts';
import { placeSnapshot } from '../src/placement.ts';
import type { CheckResult, Issue } from '../src/types.ts';

const fixtureUrl = (file: string) => new URL(`../../../fixtures/protocol/${file}`, import.meta.url);

interface Case {
  file: string;
  doc: string;
  title: string;
  options?: { codeFence?: 'ask' | 'extract'; expectedProjectId?: string };
  expect: { kind: CheckResult['kind']; errors: string[]; warnings: string[]; choice?: string };
}

interface HistoryCase {
  doc: string;
  title: string;
  existing: string[];
  candidate: string;
  expect: Record<string, unknown>;
}

const manifest = JSON.parse(readFileSync(fixtureUrl('cases.json'), 'utf8')) as {
  now: string;
  registry: RegisteredProject[];
  cases: Case[];
  history: HistoryCase[];
};
const now = new Date(manifest.now);
const registry = manifest.registry;

const sorted = (issues: readonly Issue[]) => issues.map((i) => i.code).sort();

/** 每条问题都能格式化成完整的中文，没有漏掉的参数。 */
function expectReadable(issues: readonly Issue[]) {
  for (const issue of issues) {
    const f = formatIssue(issue);
    expect(f.problem.length, issue.code).toBeGreaterThan(0);
    const line = formatIssueLine(issue);
    expect(line, issue.code).not.toMatch(/undefined|\[object Object\]|NaN/);
  }
}

async function run(bytes: Uint8Array, options: Case['options'] = {}) {
  return checkSnapshot(bytes, { registry, now, ...options });
}

describe('protocol fixtures', () => {
  it.each(manifest.cases.map((c) => [`${c.doc} · ${c.title} (${c.file})`, c] as const))(
    '%s',
    async (_, c) => {
      const result = await run(readFileSync(fixtureUrl(c.file)), c.options);
      expect(result.kind).toBe(c.expect.kind);
      if (result.kind === 'needs_choice') {
        expect(result.choice).toBe(c.expect.choice);
        return;
      }
      const errors = result.kind === 'rejected' ? result.errors : [];
      expect(sorted(errors)).toEqual([...c.expect.errors].sort());
      expect(sorted(result.warnings)).toEqual([...c.expect.warnings].sort());
      expectReadable([...errors, ...result.warnings]);
      if (result.kind === 'rejected') {
        const prompt = formatFixPrompt(errors, { schemaVersion: result.schemaVersion });
        expect(prompt.split('\n')).toHaveLength(errors.length + 2);
      }
    },
  );

  it('covers every issue code at least once (together with the generated cases below)', () => {
    const covered = new Set(manifest.cases.flatMap((c) => [...c.expect.errors, ...c.expect.warnings]));
    // 下面「generated fixtures」里运行时生成的样本。
    for (const code of [
      'secret_detected',
      'file_too_large',
      'encoding_utf32',
      'too_long',
      'too_many_items',
    ]) {
      covered.add(code);
    }
    // 规范化会先去掉协议没有的字段，Schema 的 additionalProperties 不会再触发；保留这个代码只为防御。
    covered.add('unknown_field_rejected');
    const source = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8');
    const start = source.indexOf('export type IssueCode');
    const block = source.slice(start, source.indexOf(';', start));
    const all = [...block.matchAll(/\| '([a-z0-9_]+)'/g)]
      .map((m) => m[1] as string)
      .filter((code, i, list) => list.indexOf(code) === i);
    const missing = all.filter((code) => !covered.has(code));
    expect(missing).toEqual([]);
  });
});

describe('fixture catalogue', () => {
  it('lists every case in fixtures/protocol/README.md', () => {
    const readme = readFileSync(fixtureUrl('README.md'), 'utf8');
    const files = [...new Set(manifest.cases.map((c) => c.file))];
    expect(files.filter((file) => !readme.includes(`\`${file}\``))).toEqual([]);
    expect(manifest.cases.filter((c) => !readme.includes(c.title)).map((c) => c.title)).toEqual([]);
  });
});

describe('generated fixtures', () => {
  const base = readFileSync(fixtureUrl('valid/v1.0-full.json'), 'utf8');
  const j = (...parts: string[]) => parts.join('');

  it.each([
    ['GitHub 令牌', j('gh', 'p_', 'x'.repeat(36))],
    ['细粒度令牌', j('github_', 'pat_', 'y'.repeat(30))],
    ['sk- 形式的 key', j('s', 'k-', 'proj', '-', 'z'.repeat(24))],
    ['AWS key', j('AK', 'IA', 'Q'.repeat(16))],
    ['私钥', j('-----BEGIN ', 'RSA PRIVATE', ' KEY-----')],
    ['口令赋值', j('pass', 'word=', 'w'.repeat(12))],
  ])('03 §6.4 · 疑似%s：拒绝，只报行号，不回显', async (_, secret) => {
    const text = base.replace('"PR #12"', `"PR #12", "${secret}"`);
    const result = await run(new TextEncoder().encode(text));
    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected') return;
    expect(sorted(result.errors)).toEqual(['secret_detected']);
    expect(result.errors[0]?.line).toBe(text.split('\n').findIndex((l) => l.includes(secret)) + 1);
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(formatFixPrompt(result.errors)).not.toContain(secret);
  });

  it('03 §3.7 · 文本超过 2000 字符、数组超过 200 项：拒绝', async () => {
    const value = JSON.parse(base);
    value.milestones[0].title = '演'.repeat(2001);
    value.blockers = Array.from({ length: 201 }, (_, i) => ({ title: `阻塞 ${i}`, impact: '虚构' }));
    const result = await run(new TextEncoder().encode(JSON.stringify(value)));
    expect(result.kind === 'rejected' && sorted(result.errors)).toEqual(['too_long', 'too_many_items']);
  });

  it('03 §2 · 超过 1 MiB：拒绝', async () => {
    const padded = base.replace('"PR #12"', `"PR #12", "${'演'.repeat(400_000)}"`);
    const result = await run(new TextEncoder().encode(padded));
    expect(result.kind === 'rejected' && sorted(result.errors)).toEqual(['file_too_large']);
  });

  it('03 §6.1 · UTF-32：拒绝', async () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x00, ...Buffer.from('{', 'utf8'), 0, 0, 0]);
    const result = await run(bytes);
    expect(result.kind === 'rejected' && sorted(result.errors)).toEqual(['encoding_utf32']);
  });
});

describe('history fixtures (04 §5)', () => {
  async function summary(file: string) {
    const result = await run(readFileSync(fixtureUrl(file)));
    if (result.kind !== 'accepted') throw new Error(`${file} should be accepted`);
    return {
      id: file,
      snapshotAtUtcMs: result.meta.snapshotAtUtcMs,
      contentFingerprint: result.meta.contentFingerprint,
    };
  }

  it.each(manifest.history.map((h) => [`${h.doc} · ${h.title}`, h] as const))('%s', async (_, h) => {
    const existing = await Promise.all(
      h.existing.map(async (file) => ({ ...(await summary(file)), deleted: false, superseded: false })),
    );
    const candidate = await summary(h.candidate);
    expect(placeSnapshot(candidate, existing)).toEqual(h.expect);
  });

  it('reformatted copy has the same content fingerprint but a different raw fingerprint', async () => {
    const a = await run(readFileSync(fixtureUrl('history/t1-base.json')));
    const b = await run(readFileSync(fixtureUrl('history/t1-base-reformatted.json')));
    if (a.kind !== 'accepted' || b.kind !== 'accepted') throw new Error('both should be accepted');
    expect(a.meta.contentFingerprint).toBe(b.meta.contentFingerprint);
    expect(a.meta.rawFingerprint).not.toBe(b.meta.rawFingerprint);
  });
});
