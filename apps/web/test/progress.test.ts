import type { Snapshot } from '@moriium-dashboard/protocol';
import { describe, expect, it } from 'vitest';
import { contrast, toHex } from '../src/design/color.ts';
import { ACCENT_TOKENS, COLOR_TOKENS, CONTRAST_PAIRS } from '../src/design/tokens.ts';
import { freshness, headlineNextAction, summarizeProgress } from '../src/progress.ts';

const m = (id: string, status: Snapshot['milestones'][number]['status'], acceptance = 'pending') =>
  ({
    id,
    title: id,
    status,
    evidence_level: 'repository',
    evidence_refs: ['x'],
    human_acceptance: acceptance,
  }) as Snapshot['milestones'][number];

const snap = (over: Partial<Snapshot>): Snapshot => ({
  schema_version: '1.1',
  project_id: 'demo.x',
  project_name: 'X',
  snapshot_at: '2026-10-12T00:00:00Z',
  source: { branch: null, commit_sha: null, basis: [], tests_rerun: false },
  stage: 'development',
  summary: 's',
  overall_progress: null,
  milestones: [],
  blockers: [],
  next_actions: [],
  needs_morii: [],
  ...over,
});

describe('summarizeProgress (02 §5.4)', () => {
  it('writes the 还差 line from the snapshot only', () => {
    const s = snap({
      milestones: [
        m('a', 'done'),
        m('b', 'in_progress'),
        m('c', 'blocked'),
        m('d', 'not_started'),
        m('e', 'unknown'),
      ],
      blockers: [{ title: 't', impact: 'i' }],
      needs_morii: [{ decision: 'q?' }],
    });
    expect(summarizeProgress(s).line).toBe(
      '还差：3 个里程碑未完成（其中 1 个受阻）· 1 个阻塞 · 等你 2 件（1 个决定、1 次验收）· 另有 1 个状态未知',
    );
  });

  it('says 功能成熟 · 等待上线 for a mature project instead of a low number', () => {
    const s = snap({
      stage: 'launch_preparation',
      milestones: [m('a', 'done', 'accepted'), m('b', 'done', 'accepted')],
    });
    const p = summarizeProgress(s);
    expect(p.mature).toBe(true);
    expect(p.line).toBe('功能成熟 · 等待上线');
  });

  it('uses stage wording for live and maintenance, and keeps what is waiting', () => {
    expect(summarizeProgress(snap({ stage: 'live', milestones: [m('a', 'done')] })).line).toBe(
      '已上线 · 等你 1 件（1 次验收）',
    );
    expect(summarizeProgress(snap({ stage: 'maintenance' })).line).toBe('维护中');
  });

  it('does not count unknown milestones as done or unfinished', () => {
    const p = summarizeProgress(
      snap({ stage: 'launch_preparation', milestones: [m('a', 'done', 'accepted'), m('b', 'unknown')] }),
    );
    expect(p.mature).toBe(true);
    expect(p.line).toBe('功能成熟 · 等待上线 · 另有 1 个状态未知');
  });

  it('limits to core milestones when they are chosen', () => {
    const s = snap({
      milestones: [m('core', 'done', 'accepted'), m('extra', 'not_started')],
      stage: 'launch_preparation',
    });
    expect(summarizeProgress(s, ['core']).mature).toBe(true);
    expect(summarizeProgress(s).mature).toBe(false);
  });

  it('picks the first P0, otherwise the first P1, as the headline next step', () => {
    const s = snap({
      next_actions: [
        { title: 'p1', priority: 'P1', result: '' },
        { title: 'p0', priority: 'P0', result: '' },
      ],
    });
    expect(headlineNextAction(s)?.title).toBe('p0');
    expect(
      headlineNextAction(snap({ next_actions: [{ title: 'p2', priority: 'P2', result: '' }] })),
    ).toBeUndefined();
  });

  it('computes report freshness and ignores paused projects', () => {
    const now = new Date('2026-10-20T00:00:00Z');
    expect(freshness(Date.UTC(2026, 9, 18), now, 'development')).toBe('fresh');
    expect(freshness(Date.UTC(2026, 9, 10), now, 'development')).toBe('aging');
    expect(freshness(Date.UTC(2026, 9, 1), now, 'development')).toBe('stale');
    expect(freshness(Date.UTC(2026, 8, 1), now, 'paused')).toBe('not_counted');
  });
});

describe('candidate color tokens', () => {
  it.each(['mist', 'slate'] as const)(
    'meet every contrast requirement in both themes (%s accent)',
    (accent) => {
      for (const theme of ['light', 'dark'] as const) {
        const t = { ...COLOR_TOKENS[theme], ...ACCENT_TOKENS[accent][theme] };
        for (const [fg, bg, min, label] of CONTRAST_PAIRS) {
          expect(contrast(t[fg], t[bg]), `${theme} ${label}`).toBeGreaterThanOrEqual(min);
        }
      }
    },
  );

  it('converts OKLCH to sRGB correctly', () => {
    expect(toHex('oklch(1 0 0)')).toBe('#ffffff');
    expect(toHex('oklch(0 0 0)')).toBe('#000000');
    expect(toHex('oklch(0.6279 0.2577 29.23)')).toBe('#ff0000');
  });
});

describe('summarizeProgress wording with unknown milestones', () => {
  it('does not claim every milestone is done when some are unknown', () => {
    const s = snap({ stage: 'unknown', milestones: [m('a', 'done', 'accepted'), m('b', 'unknown')] });
    expect(summarizeProgress(s).line).toBe('已知的里程碑都已完成 · 另有 1 个状态未知');
  });
});
