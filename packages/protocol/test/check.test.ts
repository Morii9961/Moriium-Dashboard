/**
 * checkSnapshot 的流水线行为。逐条覆盖 03、04 各种情况的样本测试在 P1.4（fixtures/protocol）。
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkSnapshot } from '../src/check.ts';
import { PRESET_PROJECTS, type RegisteredProject } from '../src/constants.ts';
import { formatFixPrompt, formatIssue, formatIssueLine } from '../src/messages/zh-Hans.ts';
import type { CheckResult, Issue } from '../src/types.ts';

const registry: RegisteredProject[] = [...PRESET_PROJECTS, { id: 'demo.alpha', name: 'Demo Alpha' }];
const now = new Date('2026-10-12T12:00:00+08:00');
const enc = (value: unknown) =>
  new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
const check = (value: unknown, extra: Partial<Parameters<typeof checkSnapshot>[1]> = {}) =>
  checkSnapshot(enc(value), { registry, now, ...extra });

const valid = {
  schema_version: '1.1',
  project_id: 'demo.alpha',
  project_name: 'Demo Alpha',
  snapshot_at: '2026-10-12T10:00:00+08:00',
  source: { branch: 'claude/demo', commit_sha: 'abcdef1', basis: ['docs/plan.md'], tests_rerun: false },
  reporter: { agent: 'claude', note: null },
  stage: 'development',
  summary: '演示项目，虚构内容。',
  overall_progress: null,
  milestones: [
    {
      id: 'm1',
      title: '第一步',
      status: 'done',
      evidence_level: 'repository',
      evidence_refs: ['PR 1'],
      human_acceptance: 'pending',
    },
  ],
  blockers: [],
  next_actions: [{ id: 'n1', title: '写文档', priority: 'P1', result: '文档' }],
  needs_morii: [],
};

const codes = (issues: readonly Issue[]) => issues.map((i) => i.code);
function errorsOf(r: CheckResult): Issue[] {
  if (r.kind !== 'rejected') throw new Error(`expected rejected, got ${r.kind}`);
  return r.errors;
}

describe('checkSnapshot', () => {
  it('accepts a valid v1.1 snapshot with no warnings and attributes it to the file reporter', async () => {
    const r = await check(valid);
    expect(r.kind).toBe('accepted');
    if (r.kind !== 'accepted') return;
    expect(r.warnings).toEqual([]);
    expect(r.normalizations).toEqual([]);
    expect(r.meta).toMatchObject({
      schemaVersion: '1.1',
      validatedAs: '1.1',
      rulesVersion: 1,
      snapshotAtUtcMs: Date.UTC(2026, 9, 12, 2),
      snapshotAtOffsetMinutes: 480,
      attribution: { agent: 'claude', source: 'file', note: null },
    });
  });

  it("accepts Dashboard's own snapshot in docs/status", async () => {
    const bytes = readFileSync(new URL('../../../docs/status/project-status.json', import.meta.url));
    const r = await checkSnapshot(bytes, {
      registry: PRESET_PROJECTS,
      now: new Date('2027-01-01T00:00:00Z'),
    });
    expect(r.kind === 'accepted' ? r.warnings : r).toEqual([]);
  });

  it('reproduces the rejected example from 03 section 11', async () => {
    const r = await check({
      schema_version: '1.0',
      project_id: 'mori.meta',
      snapshot_at: '2026-10-11 20:00',
      stage: 'acceptance',
      summary: '安装包可以本地构建，等待手工测试。',
      overall_progress: '80%',
      milestones: [{ id: 'installer', title: '安装包', status: 'finished' }],
    });
    expect(r.kind).toBe('rejected');
    if (r.kind !== 'rejected') return;
    expect(codes(r.errors).sort()).toEqual(
      ['enum_invalid', 'required_missing', 'required_missing', 'snapshot_at_format', 'type_mismatch'].sort(),
    );
    expect(codes(r.warnings).sort()).toEqual(['filled_empty_array', 'filled_project_name']);
    expect(r.schemaVersion).toBe('1.0');
    expect(formatFixPrompt(r.errors, { schemaVersion: r.schemaVersion })).toContain(
      'Project Status Protocol v1.0',
    );
  });

  it('accepts a newer 1.x minor, mapping unknown enum values and ignoring unknown fields', async () => {
    const r = await check({
      ...valid,
      schema_version: '1.4',
      stage: 'beta',
      recent_work: ['x'],
      next_actions: [{ id: 'n1', title: '写文档', priority: 'P3', result: '文档' }],
    });
    expect(r.kind).toBe('accepted');
    if (r.kind !== 'accepted') return;
    expect(r.snapshot.stage).toBe('unknown');
    expect(r.snapshot.next_actions[0]?.priority).toBeNull();
    expect(r.snapshot.schema_version).toBe('1.4');
    expect(r.meta.validatedAs).toBe('1.1');
    expect(codes(r.warnings)).toEqual(
      expect.arrayContaining(['version_unknown_minor', 'unknown_field', 'unknown_enum_mapped']),
    );
  });

  it('rejects deep nesting cleanly instead of overflowing the stack', async () => {
    const deep = `{"schema_version": "1.1", "x": ${'['.repeat(5000)}${']'.repeat(5000)}}`;
    expect(codes(errorsOf(await check(deep)))).toEqual(['json_too_deep']);
    const broken = `{"x": ${'['.repeat(200000)}`;
    expect(codes(errorsOf(await check(broken)))).toEqual(['json_syntax']);
  });

  it('asks before extracting a fenced snapshot, and extracts when told to', async () => {
    const fenced = `\`\`\`json\n${JSON.stringify(valid, null, 2)}\n\`\`\`\n`;
    expect(await check(fenced)).toEqual({ kind: 'needs_choice', choice: 'code_fence' });
    const r = await check(fenced, { codeFence: 'extract' });
    expect(r.kind).toBe('accepted');
    if (r.kind === 'accepted') expect(codes(r.warnings)).toEqual(['code_fence_extracted']);
  });

  it('stops at a suspected secret without echoing it or doing anything else', async () => {
    const token = ['gh', 'p_', 'Q'.repeat(36)].join('');
    const r = await check({ ...valid, summary: 'x', source: { ...valid.source, basis: [token] } });
    const errors = errorsOf(r);
    expect(errors).toEqual([expect.objectContaining({ code: 'secret_detected', line: expect.any(Number) })]);
    expect(JSON.stringify(r)).not.toContain(token);
    expect(formatIssueLine(errors[0] as Issue)).not.toContain(token);
  });

  it('removes control and bidi characters from file-provided text in messages', async () => {
    const cp = String.fromCodePoint;
    const evilKey = `x${cp(0x1b)}[2J${cp(0x202e)}`;
    const r = await check({ ...valid, [evilKey]: 1 });
    expect(r.kind).toBe('accepted');
    if (r.kind !== 'accepted') return;
    const text = formatIssueLine(r.warnings[0] as Issue);
    expect(text).not.toContain(cp(0x1b));
    expect(text).not.toContain(cp(0x202e));
  });

  it('ignores a __proto__ key instead of polluting prototypes', async () => {
    const r = await check(`{"__proto__": {"polluted": true}, ${JSON.stringify(valid).slice(1)}`);
    expect(r.kind).toBe('accepted');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    if (r.kind === 'accepted') expect(formatIssue(r.warnings[0] as Issue).location).toBe('__proto__');
  });

  it('treats snapshot_at more than 10 minutes ahead as an error, and within 10 minutes as fine', async () => {
    const ahead = await check({ ...valid, snapshot_at: '2026-10-12T15:00:00+08:00' });
    expect(errorsOf(ahead)).toEqual([
      expect.objectContaining({ code: 'snapshot_in_future', params: { aheadMinutes: 180 } }),
    ]);
    expect((await check({ ...valid, snapshot_at: '2026-10-12T12:09:00+08:00' })).kind).toBe('accepted');
  });

  it('checks the expected project when importing from a project page', async () => {
    const r = await check(valid, { expectedProjectId: 'mori.meta' });
    expect(errorsOf(r)).toEqual([
      expect.objectContaining({
        code: 'project_mismatch',
        params: expect.objectContaining({ actualId: 'demo.alpha' }),
      }),
    ]);
  });
});
