import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateTypesSource, generateValidatorsSource, outputPath } from '../scripts/generate-validators.ts';
import { parseSnapshotAt } from '../src/datetime.ts';
import { diffSnapshots, matchItems, normalizeItemText } from '../src/diff.ts';
import { decodeSnapshotBytes } from '../src/encoding.ts';
import { canonicalize, contentFingerprint, sha256Hex } from '../src/fingerprint.ts';
import { extractCodeFence, locateJsonSyntaxError } from '../src/json-syntax.ts';
import { spaced } from '../src/messages/zh-Hans.ts';
import { suggestKey } from '../src/normalize.ts';
import { placeSnapshot } from '../src/placement.ts';
import { scanSecrets } from '../src/secrets.ts';
import type { Snapshot } from '../src/types.ts';

describe('generated validators', () => {
  it('are up to date with docs/protocol/schema and the Ajv version', () => {
    expect(readFileSync(outputPath, 'utf8')).toBe(generateValidatorsSource());
    expect(readFileSync(outputPath.replace(/\.js$/, '.d.ts'), 'utf8')).toBe(generateTypesSource());
  });

  it('contain no require() and no dynamic evaluation', () => {
    const code = readFileSync(outputPath, 'utf8');
    expect(code).not.toMatch(/\brequire\(/);
    expect(code).not.toMatch(/new Function|\beval\(/);
  });
});

describe('locateJsonSyntaxError', () => {
  it.each([
    ['{\n  "a": 1,\n  "title": "x",}\n', 'trailing_comma', 3, 16],
    ['[1, 2,]', 'trailing_comma', 1, 7],
    ['{"a": 1', 'unexpected_end', 1, 8],
    ['{"a" 1}', 'missing_colon', 1, 6],
    ['{"a": 1 "b": 2}', 'missing_comma', 1, 9],
    ["{'a': 1}", 'property_name_not_string', 1, 2],
    ['{"a": "line\nbreak"}', 'control_character_in_string', 1, 12],
    ['{"a": "\\x"}', 'invalid_escape', 1, 8],
    ['{"a": 01}', 'missing_comma', 1, 8],
    ['{"a": 1} x', 'trailing_content', 1, 10],
    ['   ', 'empty', 1, 1],
    ['{"a": "unterminated', 'unterminated_string', 1, 7],
    ['{"a": tru}', 'unexpected_character', 1, 7],
  ])('%j → %s at %i:%i', (text, reason, line, column) => {
    expect(locateJsonSyntaxError(text)).toMatchObject({ reason, line, column });
  });

  it('returns null for valid JSON', () => {
    expect(locateJsonSyntaxError('{"a": [1, -2.5e3, true, null, "\\u00e9"]}')).toBeNull();
  });

  it('counts columns in code points', () => {
    expect(locateJsonSyntaxError('{"标题": "安装包",}')).toMatchObject({
      reason: 'trailing_comma',
      column: 14,
    });
  });
});

describe('extractCodeFence', () => {
  it('extracts a fenced JSON block and reports the line offset', () => {
    expect(extractCodeFence('```json\n{"a": 1}\n```\n')).toEqual({ inner: '{"a": 1}', lineOffset: 1 });
    expect(extractCodeFence('\n```\n{}\n```')).toEqual({ inner: '{}', lineOffset: 2 });
  });

  it('ignores text that is not wholly fenced', () => {
    expect(extractCodeFence('说明\n```json\n{}\n```')).toBeNull();
    expect(extractCodeFence('{"a": "```"}')).toBeNull();
  });
});

describe('parseSnapshotAt', () => {
  it('keeps the UTC instant and the original offset', () => {
    expect(parseSnapshotAt('2026-10-11T22:29:47+08:00')).toEqual({
      utcMs: Date.UTC(2026, 9, 11, 14, 29, 47),
      offsetMinutes: 480,
    });
    expect(parseSnapshotAt('2026-10-11T14:29:47Z')?.utcMs).toBe(Date.UTC(2026, 9, 11, 14, 29, 47));
    expect(parseSnapshotAt('2026-10-11T09:00:00-05:30')).toEqual({
      utcMs: Date.UTC(2026, 9, 11, 14, 30),
      offsetMinutes: -330,
    });
  });

  it('accepts up to nanosecond fractions', () => {
    expect(parseSnapshotAt('2026-10-11T00:00:00.123456789Z')?.utcMs).toBe(Date.UTC(2026, 9, 11) + 123);
  });

  it.each([
    '2026-10-11T20:00:00',
    '2026-10-11 20:00:00+08:00',
    '2026-10-11T20:00+08:00',
    '2026-02-30T00:00:00Z',
    '2026-13-01T00:00:00Z',
    '2026-10-11T24:00:00Z',
    '2026-10-11T20:00:00+24:00',
  ])('rejects %s', (value) => {
    expect(parseSnapshotAt(value)).toBeNull();
  });
});

describe('decodeSnapshotBytes', () => {
  const enc = (s: string) => new TextEncoder().encode(s);

  it('accepts UTF-8 and strips a BOM', () => {
    expect(decodeSnapshotBytes(enc('{"a":"中"}'))).toEqual({ ok: true, text: '{"a":"中"}', hadBom: false });
    const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc('{}')]);
    expect(decodeSnapshotBytes(withBom)).toEqual({ ok: true, text: '{}', hadBom: true });
  });

  it('rejects UTF-16 with and without BOM, UTF-32 and invalid UTF-8', () => {
    const utf16le = new Uint8Array([0xff, 0xfe, ...Buffer.from('{"a":1}', 'utf16le')]);
    expect(decodeSnapshotBytes(utf16le)).toMatchObject({ ok: false, reason: 'utf16' });
    expect(decodeSnapshotBytes(new Uint8Array(Buffer.from('{"a": 1}', 'utf16le')))).toMatchObject({
      ok: false,
      reason: 'utf16',
    });
    expect(decodeSnapshotBytes(new Uint8Array([0xff, 0xfe, 0, 0, 0x7b, 0, 0, 0]))).toMatchObject({
      ok: false,
      reason: 'utf32',
    });
    // 「中」的 GBK 编码
    expect(decodeSnapshotBytes(new Uint8Array([0x7b, 0x22, 0xd6, 0xd0, 0x22, 0x7d]))).toMatchObject({
      ok: false,
      reason: 'not_utf8',
    });
  });

  it('rejects files over 1 MiB', () => {
    expect(decodeSnapshotBytes(new Uint8Array(1024 * 1024 + 1))).toMatchObject({
      ok: false,
      reason: 'too_large',
    });
  });
});

describe('RFC 8785 canonicalization', () => {
  it('matches the example in RFC 8785 section 3.2.3', () => {
    const input = JSON.parse(
      '{"numbers": [333333333.33333329, 1E30, 4.50, 2e-3, 0.000000000000000000000000001],' +
        ' "string": "\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/", "literals": [null, true, false]}',
    );
    expect(canonicalize(input)).toBe(
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],' +
        `"string":"${String.fromCodePoint(0x20ac)}$\\u000f\\nA'B\\"\\\\\\\\\\"/"}`,
    );
  });

  it('sorts keys by UTF-16 code units, recursively', () => {
    expect(canonicalize({ b: 1, a: { d: [3, { z: 0, y: 1 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[3,{"y":1,"z":0}]},"b":1}',
    );
  });

  it('gives the same fingerprint regardless of key order and whitespace', async () => {
    const a = await contentFingerprint(JSON.parse('{"x": 1, "y": [1, 2]}'));
    const b = await contentFingerprint(JSON.parse('{\n  "y": [1,2],\n  "x": 1\n}'));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('computes SHA-256 like any other implementation', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('scanSecrets', () => {
  const j = (...parts: string[]) => parts.join('');

  it('reports line numbers only', () => {
    const text = [
      '{',
      `  "basis": ["${j('gh', 'p_', 'A'.repeat(36))}"],`,
      `  "note": "${j('pass', 'word=', 'hunter2hunter2')}"`,
      '}',
    ].join('\n');
    expect(scanSecrets(text)).toEqual([
      { line: 2, label: 'GitHub 令牌' },
      { line: 3, label: '口令或密钥赋值' },
    ]);
  });

  it('does not flag prose about tokens', () => {
    expect(
      scanSecrets('需要 Morii 提供令牌；token 不写入仓库。仓库变量 MORIMETA_UPDATER_PUBLIC_KEY'),
    ).toEqual([]);
  });
});

describe('suggestKey', () => {
  it('suggests close field names', () => {
    expect(suggestKey('next_action', ['next_actions', 'needs_morii'])).toBe('next_actions');
    expect(suggestKey('milestone', ['milestones'])).toBe('milestones');
    expect(suggestKey('Summary', ['summary'])).toBe('summary');
    expect(suggestKey('owner', ['summary', 'stage'])).toBeNull();
  });
});

describe('spaced', () => {
  it('adds spaces between CJK and Latin but not around punctuation', () => {
    expect(spaced('应为整数或null。')).toBe('应为整数或 null。');
    expect(spaced('共3项')).toBe('共 3 项');
    expect(spaced('「finished」不是')).toBe('「finished」不是');
  });
});

const base: Snapshot = {
  schema_version: '1.1',
  project_id: 'demo.alpha',
  project_name: 'Demo Alpha',
  snapshot_at: '2026-10-01T10:00:00+08:00',
  source: { branch: 'main', commit_sha: 'abc1234', basis: ['docs/a.md'], tests_rerun: false },
  stage: 'development',
  summary: '演示项目',
  overall_progress: null,
  milestones: [
    {
      id: 'm1',
      title: '第一步',
      status: 'in_progress',
      evidence_level: 'self_report',
      evidence_refs: [],
      human_acceptance: 'pending',
    },
    {
      id: 'm2',
      title: '第二步',
      status: 'not_started',
      evidence_level: 'self_report',
      evidence_refs: [],
      human_acceptance: 'pending',
    },
  ],
  blockers: [{ title: '等待  素材', impact: '无法发布' }],
  next_actions: [{ id: 'n1', title: '写文档', priority: 'P1', result: '文档' }],
  needs_morii: [{ decision: '要不要公开？' }],
};

describe('diffSnapshots', () => {
  it('reports changes block by block', () => {
    const after: Snapshot = {
      ...base,
      stage: 'integration',
      source: { ...base.source, commit_sha: 'def5678', basis: ['docs/a.md', 'docs/b.md'] },
      milestones: [
        {
          ...(base.milestones[0] as Snapshot['milestones'][number]),
          status: 'done',
          evidence_level: 'repository',
          evidence_refs: ['PR 3'],
        },
        {
          id: 'm3',
          title: '第三步',
          status: 'not_started',
          evidence_level: 'self_report',
          evidence_refs: [],
          human_acceptance: 'pending',
        },
      ],
      // 只改了空白和全角，仍是同一条
      blockers: [{ title: '等待 素材', impact: '无法发布' }],
      next_actions: [{ id: 'n1', title: '写完文档', priority: 'P0', result: '文档' }],
      needs_morii: [{ decision: '要不要公开？' }, { id: 'd2', decision: '用哪个域名？' }],
    };
    const d = diffSnapshots(base, after);
    expect(d.stage).toEqual({ from: 'development', to: 'integration' });
    expect(d.overallProgress).toBeNull();
    expect(d.milestones.added.map((m) => m.id)).toEqual(['m3']);
    expect(d.milestones.removed.map((m) => m.id)).toEqual(['m2']);
    expect(d.milestones.changed).toEqual([
      expect.objectContaining({ id: 'm1', fields: ['status', 'evidence_level', 'evidence_refs'] }),
    ]);
    expect(d.blockers.added).toEqual([]);
    expect(d.blockers.removed).toEqual([]);
    expect(d.nextActions.kept).toHaveLength(1);
    expect(d.nextActions.priorityChanged).toHaveLength(1);
    expect(d.needsMorii.added.map((n) => n.decision)).toEqual(['用哪个域名？']);
    expect(d.source.commitSha).toEqual({ from: 'abc1234', to: 'def5678' });
    expect(d.source.basisAdded).toEqual(['docs/b.md']);
  });

  it('matches items by text when an id appears for the first time', () => {
    const r = matchItems(
      [{ decision: '要不要公开？' }],
      [{ id: 'd1', decision: '要不要公开？' }],
      (n) => n.decision,
    );
    expect(r.kept).toHaveLength(1);
    expect(r.added).toEqual([]);
  });

  it('normalizes full-width characters and whitespace for matching', () => {
    expect(normalizeItemText(' 部署（ＶＰＳ）\n  方案 ')).toBe('部署(VPS) 方案');
  });
});

describe('placeSnapshot', () => {
  const s = (
    id: string,
    hour: number,
    fp: string,
    extra: Partial<{ deleted: boolean; superseded: boolean }> = {},
  ) => ({
    id,
    snapshotAtUtcMs: Date.UTC(2026, 9, 10, hour),
    contentFingerprint: fp,
    deleted: false,
    superseded: false,
    ...extra,
  });

  it('first snapshot becomes the latest', () => {
    expect(placeSnapshot({ snapshotAtUtcMs: 0, contentFingerprint: 'a' }, [])).toEqual({
      kind: 'latest',
      replaces: null,
    });
  });

  it('detects duplicates, including ones in the trash', () => {
    const existing = [s('1', 8, 'a'), s('2', 9, 'b', { deleted: true })];
    expect(
      placeSnapshot({ snapshotAtUtcMs: Date.UTC(2026, 9, 10, 12), contentFingerprint: 'a' }, existing),
    ).toEqual({
      kind: 'duplicate',
      of: '1',
      deleted: false,
    });
    expect(
      placeSnapshot({ snapshotAtUtcMs: Date.UTC(2026, 9, 10, 12), contentFingerprint: 'b' }, existing),
    ).toEqual({
      kind: 'duplicate',
      of: '2',
      deleted: true,
    });
  });

  it('detects a conflict at the same instant', () => {
    expect(
      placeSnapshot({ snapshotAtUtcMs: Date.UTC(2026, 9, 10, 8), contentFingerprint: 'z' }, [s('1', 8, 'a')]),
    ).toEqual({
      kind: 'conflict',
      with: '1',
    });
  });

  it('puts older snapshots into history and newer ones on top', () => {
    const existing = [s('1', 8, 'a'), s('2', 10, 'b'), s('3', 12, 'c', { deleted: true })];
    expect(
      placeSnapshot({ snapshotAtUtcMs: Date.UTC(2026, 9, 10, 9), contentFingerprint: 'x' }, existing),
    ).toEqual({
      kind: 'history',
      currentLatest: '2',
    });
    expect(
      placeSnapshot({ snapshotAtUtcMs: Date.UTC(2026, 9, 10, 11), contentFingerprint: 'x' }, existing),
    ).toEqual({
      kind: 'latest',
      replaces: '2',
    });
  });

  it('ignores superseded versions when looking for a conflict', () => {
    const existing = [s('1', 8, 'a', { superseded: true }), s('2', 8, 'b')];
    expect(
      placeSnapshot({ snapshotAtUtcMs: Date.UTC(2026, 9, 10, 8), contentFingerprint: 'c' }, existing),
    ).toEqual({
      kind: 'conflict',
      with: '2',
    });
  });
});
