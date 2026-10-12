import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type Io, parseRegister, runStatusCheck } from '../src/cli/status-check.ts';

const fixture = (file: string) => new URL(`../../../fixtures/protocol/${file}`, import.meta.url);

function harness(files: Record<string, Uint8Array | string> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const io: Io = {
    out: (t) => out.push(t),
    err: (t) => err.push(t),
    readFile: (path) => {
      const content = files[path];
      if (content === undefined) return readFileSync(fixture(path));
      return typeof content === 'string' ? new TextEncoder().encode(content) : content;
    },
  };
  return { io, out: () => out.join('\n'), err: () => err.join('\n') };
}

const common = [
  '--register',
  'demo.alpha=Demo Alpha',
  '--register',
  'demo.beta',
  '--now',
  '2026-10-12T12:00:00+08:00',
];

describe('pnpm status:check', () => {
  it('prints help and exits 0 with --help, 1 without files', async () => {
    const a = harness();
    expect(await runStatusCheck(['--help'], a.io)).toBe(0);
    expect(a.out()).toContain('用法：pnpm status:check');
    const b = harness();
    expect(await runStatusCheck([], b.io)).toBe(1);
    expect(b.err()).toContain('用法');
  });

  it('rejects unknown options with the help text', async () => {
    const h = harness();
    expect(await runStatusCheck(['--fast', 'a.json'], h.io)).toBe(1);
    expect(h.err()).toContain('用法');
  });

  it('summarizes an importable snapshot, keeping the three evidence layers apart', async () => {
    const h = harness();
    expect(await runStatusCheck(['valid/v1.1-progress-estimate.json', ...common], h.io)).toBe(0);
    const text = h.out();
    expect(text).toContain('✓ 可以导入 · v1.1-progress-estimate.json');
    expect(text).toContain('Demo Alpha（demo.alpha）· 快照 2026-10-11 20:00（UTC+08:00），16 小时前');
    expect(text).toContain('报告来自 Codex（文件里的 reporter）');
    expect(text).toContain('整体进度 60（Agent 估算，不是验收比例）');
    expect(text).toContain('完成 1（自报 0 · 有证据 1 · 据报告已验收 0）');
  });

  it('never shows a progress number when overall_progress is null', async () => {
    const h = harness();
    await runStatusCheck(['valid/v1.0-full.json', ...common], h.io);
    expect(h.out()).toContain('整体进度：不估算');
    expect(h.out()).not.toMatch(/整体进度 \d/);
  });

  it('reproduces the shape of the 03 §11 output for a rejected file, with the fix prompt', async () => {
    const example = JSON.stringify({
      schema_version: '1.0',
      project_id: 'mori.meta',
      snapshot_at: '2026-10-11 20:00',
      stage: 'acceptance',
      summary: '安装包可以本地构建，等待手工测试。',
      overall_progress: '80%',
      milestones: [{ id: 'installer', title: '安装包', status: 'finished' }],
    });
    const h = harness({ 'example.json': example });
    expect(await runStatusCheck(['example.json', '--now', '2026-10-12T12:00:00+08:00'], h.io)).toBe(1);
    const text = h.out();
    expect(text).toContain('✕ 无法导入 · 5 个错误 · 2 条提醒 · example.json');
    expect(text).toContain('提醒（修好错误后仍会出现）');
    expect(text).toContain('缺少 project_name，将使用登记名称「MoriMeta」');
    expect(text).toContain('请修正 docs/status/project-status.json，然后重新生成：');
    expect(text).toContain('协议见 Project Status Protocol v1.0。');
  });

  it('asks about code fences (exit 2) and extracts on request', async () => {
    const a = harness();
    expect(await runStatusCheck(['syntax/code-fence.json', ...common], a.io)).toBe(2);
    expect(a.out()).toContain('? 需要你决定');
    const b = harness();
    expect(await runStatusCheck(['syntax/code-fence.json', '--extract-code-fence', ...common], b.io)).toBe(0);
    expect(b.out()).toContain('已按你的选择提取其中的 JSON');
  });

  it('checks several files and returns the worst exit code', async () => {
    const h = harness();
    const code = await runStatusCheck(
      ['valid/v1.0-full.json', 'syntax/code-fence.json', 'structure/progress-string.json', ...common],
      h.io,
    );
    expect(code).toBe(1);
    expect(h.out().match(/^(✓|\?|✕) /gm)).toEqual(['✓ ', '? ', '✕ ']);
  });

  it('simulates importing from a project page with --expect-project', async () => {
    const h = harness();
    expect(
      await runStatusCheck(['project/demo-beta.json', '--expect-project', 'demo.alpha', ...common], h.io),
    ).toBe(1);
    expect(h.out()).toContain('你在 Demo Alpha 页面导入，但这份文件属于 demo.beta');
  });

  it('outputs machine-readable JSON with --json', async () => {
    const h = harness();
    await runStatusCheck(['valid/v1.0-full.json', 'structure/stage-missing.json', '--json', ...common], h.io);
    const parsed = JSON.parse(h.out()) as { file: string; kind: string }[];
    expect(parsed.map((r) => [r.file, r.kind])).toEqual([
      ['valid/v1.0-full.json', 'accepted'],
      ['structure/stage-missing.json', 'rejected'],
    ]);
  });

  it('reports unreadable files and invalid --now', async () => {
    const a = harness({});
    expect(await runStatusCheck(['missing/nope.json'], a.io)).toBe(1);
    expect(a.err()).toContain('读不到文件');
    const b = harness();
    expect(await runStatusCheck(['valid/v1.0-full.json', '--now', 'yesterday'], b.io)).toBe(1);
    expect(b.err()).toContain('--now 不是有效的时间');
  });

  it('never prints control or bidi characters coming from the file', async () => {
    const cp = String.fromCodePoint;
    const base = JSON.parse(readFileSync(fixture('valid/v1.0-full.json'), 'utf8'));
    base.summary = `正常${cp(0x1b)}[2J${cp(0x202e)}内容`;
    const h = harness({ [`evil${cp(0x1b)}.json`]: JSON.stringify(base) });
    await runStatusCheck([`evil${cp(0x1b)}.json`, ...common], h.io);
    expect(h.out()).not.toContain(cp(0x1b));
    expect(h.out()).not.toContain(cp(0x202e));
  });

  it('parses --register values with optional names', () => {
    expect(parseRegister(['demo.alpha', 'demo.beta=Demo = Beta'])).toEqual([
      { id: 'demo.alpha', name: 'demo.alpha' },
      { id: 'demo.beta', name: 'Demo = Beta' },
    ]);
  });
});
