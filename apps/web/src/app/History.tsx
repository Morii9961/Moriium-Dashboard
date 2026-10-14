/**
 * 项目历史（P3.4，04 第 10 节）：时间带、历史列表、任选两份对比、回收站。
 *
 * 时间带每份快照一个刻度，只表达报告的疏密，不表达好坏（S2 小图，自己画的 SVG，对读屏隐藏；
 * 下面的列表就是它的文字版）。默认对比「当前」和「上一份」。
 */
import { ArrowRight, DownloadSimple, Minus, Plus, Trash } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/i18n.tsx';
import type { MessageKey } from '../i18n/messages/zh-Hans.ts';
import { ApiError, api } from './api.ts';
import { useInvalidate, useResource } from './data.tsx';
import type { CompareResult, HistoryItem, SnapshotRecord } from './types.ts';

function TimeBand({ items, now }: { items: HistoryItem[]; now: Date }) {
  const active = items.filter((s) => !s.deleted && !s.superseded);
  if (active.length === 0) return null;
  const first = Math.min(...active.map((s) => s.utcMs));
  const end = now.getTime();
  // 至少显示 14 天，避免只有一两份时刻度挤在一起。
  const start = Math.min(first, end - 14 * 86_400_000);
  const pos = (ms: number) => ((ms - start) / Math.max(1, end - start)) * 100;
  const current = active[0];
  return (
    <svg className="timeband" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
      <line className="timeband-axis" x1="0" y1="12" x2="100" y2="12" vectorEffect="non-scaling-stroke" />
      {active.map((s) => (
        <line
          key={s.id}
          className={`timeband-tick${s.id === current?.id ? ' is-current' : ''}`}
          x1={pos(s.utcMs)}
          x2={pos(s.utcMs)}
          y1={s.id === current?.id ? 2 : 6}
          y2={s.id === current?.id ? 22 : 18}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

function CompareView({ a, b }: { a: number; b: number }) {
  const { t, snapshotTime, list } = useI18n();
  const lv = (label: string, value: string) => t('compare.labelValue', { label, value });
  const { data, loading } = useResource<CompareResult>(`/api/snapshots/compare?a=${a}&b=${b}`);
  if (!data) return <p className="settings-note">{loading ? t('compare.loading') : t('apiError.unknown')}</p>;
  const d = data.diff;
  const stageText = (s: string) => t(`stage.${s}` as MessageKey);
  const blocks: { title: string; rows: { sign: '+' | '-' | '→'; text: string; zh?: boolean }[] }[] = [];

  const top: (typeof blocks)[number]['rows'] = [];
  if (d.stage)
    top.push({
      sign: '→',
      text: lv(t('compare.stage'), `${stageText(d.stage.from)} → ${stageText(d.stage.to)}`),
    });
  if (d.overallProgress)
    top.push({
      sign: '→',
      text: lv(t('compare.progress'), `${d.overallProgress.from ?? '—'} → ${d.overallProgress.to ?? '—'}`),
    });
  if (d.summary) top.push({ sign: '→', text: lv(t('compare.summary'), d.summary.to), zh: true });
  if (top.length) blocks.push({ title: t('compare.overview'), rows: top });

  const ms: (typeof blocks)[number]['rows'] = [
    ...d.milestones.added.map((m) => ({ sign: '+' as const, text: m.title, zh: true })),
    ...d.milestones.removed.map((m) => ({ sign: '-' as const, text: m.title, zh: true })),
    ...d.milestones.changed.map((c) => ({
      sign: '→' as const,
      text: t('compare.withDetail', {
        text: c.after.title,
        detail: list(
          c.fields.map((f) =>
            f === 'status'
              ? `${t('compare.field.status')} ${t(`status.${c.before.status}`)} → ${t(`status.${c.after.status}`)}`
              : f === 'evidence_level'
                ? `${t('compare.field.evidence_level')} ${c.before.evidence_level} → ${c.after.evidence_level}`
                : f === 'human_acceptance'
                  ? `${t('compare.field.human_acceptance')} ${c.before.human_acceptance} → ${c.after.human_acceptance}`
                  : t(`compare.field.${f}`),
          ),
        ),
      }),
      zh: true,
    })),
  ];
  if (ms.length) blocks.push({ title: t('compare.milestones'), rows: ms });

  const items = (
    title: MessageKey,
    diff: { added: unknown[]; removed: unknown[] },
    textOf: (x: never) => string,
  ) => {
    const rows = [
      ...diff.added.map((x) => ({ sign: '+' as const, text: textOf(x as never), zh: true })),
      ...diff.removed.map((x) => ({ sign: '-' as const, text: textOf(x as never), zh: true })),
    ];
    if (rows.length) blocks.push({ title: t(title), rows });
  };
  items('compare.blockers', d.blockers, (b: { title: string }) => b.title);
  items('compare.next', d.nextActions, (n: { title: string }) => n.title);
  if (d.nextActions.priorityChanged.length) {
    blocks.push({
      title: t('compare.priority'),
      rows: d.nextActions.priorityChanged.map((p) => ({
        sign: '→' as const,
        text: t('compare.withDetail', {
          text: p.after.title,
          detail: `${p.before.priority ?? '—'} → ${p.after.priority ?? '—'}`,
        }),
        zh: true,
      })),
    });
  }
  items('compare.needs', d.needsMorii, (n: { decision: string }) => n.decision);

  const src: (typeof blocks)[number]['rows'] = [];
  if (d.source.branch)
    src.push({
      sign: '→',
      text: lv(t('compare.branch'), `${d.source.branch.from ?? '—'} → ${d.source.branch.to ?? '—'}`),
    });
  if (d.source.commitSha)
    src.push({
      sign: '→',
      text: lv(
        t('compare.commit'),
        `${d.source.commitSha.from?.slice(0, 7) ?? '—'} → ${d.source.commitSha.to?.slice(0, 7) ?? '—'}`,
      ),
    });
  for (const b of d.source.basisAdded) src.push({ sign: '+', text: b, zh: true });
  for (const b of d.source.basisRemoved) src.push({ sign: '-', text: b, zh: true });
  if (src.length) blocks.push({ title: t('compare.source'), rows: src });

  const signLabel = { '+': t('compare.added'), '-': t('compare.removed'), '→': t('compare.changed') };
  const SignIcon = { '+': Plus, '-': Minus, '→': ArrowRight };

  return (
    <section className="compare" aria-live="polite">
      <p className="compare-title">
        <span>{snapshotTime(data.before.utcMs, data.before.offsetMinutes)}</span>
        <ArrowRight size={16} aria-hidden="true" />
        <span>{snapshotTime(data.after.utcMs, data.after.offsetMinutes)}</span>
      </p>
      {blocks.length === 0 ? <p className="settings-note">{t('compare.none')}</p> : null}
      {blocks.map((block) => (
        <div key={block.title} className="compare-block">
          <h4 className="compare-block-title">{block.title}</h4>
          <ul className="compare-rows">
            {block.rows.map((r) => {
              const Icon = SignIcon[r.sign];
              return (
                <li
                  key={`${r.sign}:${r.text}`}
                  className={`compare-row sign-${r.sign === '+' ? 'add' : r.sign === '-' ? 'remove' : 'change'}`}
                >
                  <Icon size={14} aria-hidden="true" />
                  <span className="sr-only">{signLabel[r.sign]}</span>
                  <span lang={r.zh ? 'zh-Hans' : undefined}>{r.text}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

export function ProjectHistory({ projectId }: { projectId: string }) {
  const { t, snapshotTime } = useI18n();
  const invalidate = useInvalidate();
  const now = useMemo(() => new Date(), []);
  const { data } = useResource<{ snapshots: HistoryItem[] }>(
    `/api/projects/${encodeURIComponent(projectId)}/snapshots`,
  );
  const [selected, setSelected] = useState<number[]>([]);
  const [compare, setCompare] = useState<[number, number] | null>(null);
  const [message, setMessage] = useState<MessageKey | null>(null);

  const all = data?.snapshots ?? [];
  const live = all.filter((s) => !s.deleted);
  const active = live.filter((s) => !s.superseded);
  const trash = all.filter((s) => s.deleted);
  const currentId = active[0]?.id;

  // 默认：当前和上一份。
  const defaultPair = active.length >= 2 ? `${active[0]?.id},${active[1]?.id}` : '';
  useEffect(() => {
    if (!defaultPair) {
      setSelected([]);
      setCompare(null);
      return;
    }
    const [a, b] = defaultPair.split(',').map(Number) as [number, number];
    setSelected([a, b]);
    setCompare([a, b]);
  }, [defaultPair]);

  if (!data || all.length === 0) return null;

  const toggle = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-2)));

  const act = async (method: 'DELETE' | 'POST', path: string) => {
    setMessage(null);
    try {
      await api(method, path);
      invalidate();
    } catch (error) {
      setMessage(
        error instanceof ApiError && error.code === 'conflict'
          ? 'history.restoreConflict'
          : 'apiError.unknown',
      );
    }
  };

  const row = (s: HistoryItem) => (
    <li key={s.id} className={`hrow${s.superseded ? ' is-superseded' : ''}`}>
      <label className="hrow-pick">
        <input
          type="checkbox"
          checked={selected.includes(s.id)}
          onChange={() => toggle(s.id)}
          aria-label={t('history.select', { time: snapshotTime(s.utcMs, s.offsetMinutes) })}
        />
      </label>
      <span className="hrow-time mono">{snapshotTime(s.utcMs, s.offsetMinutes)}</span>
      <span className="hrow-stage">{t(`stage.${s.stage}` as MessageKey)}</span>
      <span className="hrow-meta">
        {t('history.milestones', { done: s.milestonesDone, total: s.milestonesTotal })}
        {s.pending > 0 ? ` · ${t('history.pending', { count: s.pending })}` : ''}
      </span>
      <span className="hrow-agent">
        {s.reporter.agent ? t(`agent.${s.reporter.agent}`) : t('agent.unknown')}
      </span>
      <span className="hrow-tags">
        {s.id === currentId ? <span className="htag is-current">{t('history.current')}</span> : null}
        {s.superseded ? <span className="htag">{t('history.superseded')}</span> : null}
      </span>
      <span className="hrow-actions">
        <a
          className="icon-btn"
          href={`/api/snapshots/${s.id}/raw`}
          download
          aria-label={`${t('history.raw')} · ${s.fileName}`}
          title={t('history.raw')}
        >
          <DownloadSimple size={16} aria-hidden="true" />
        </a>
        <button
          type="button"
          className="icon-btn"
          aria-label={t('history.delete')}
          title={t('history.delete')}
          onClick={() => act('DELETE', `/api/snapshots/${s.id}`)}
        >
          <Trash size={16} aria-hidden="true" />
        </button>
      </span>
    </li>
  );

  return (
    <section className="history" aria-labelledby="history-title">
      <header className="history-head">
        <h2 id="history-title" className="history-title">
          {t('history.title')}
        </h2>
        <span className="history-count">{t('history.count', { count: active.length })}</span>
      </header>
      <TimeBand items={all} now={now} />
      <TaskSourceSnapshot projectId={projectId} />
      <ol className="hlist">{live.map(row)}</ol>
      {message ? (
        <p className="reg-status is-error" role="alert">
          {t(message)}
        </p>
      ) : null}
      {active.length < 2 ? (
        <p className="settings-note">{t('history.single')}</p>
      ) : (
        <div className="page-actions history-actions">
          <button
            type="button"
            className="btn"
            disabled={selected.length !== 2}
            onClick={() => setCompare([selected[0] as number, selected[1] as number])}
          >
            {t('history.compare')}
          </button>
        </div>
      )}
      {compare ? <CompareView a={compare[0]} b={compare[1]} /> : null}
      {trash.length > 0 ? (
        <details className="trash">
          <summary>{t('history.trash', { count: trash.length })}</summary>
          <ol className="hlist">
            {trash.map((s) => (
              <li key={s.id} className="hrow is-trashed">
                <span className="hrow-time mono">{snapshotTime(s.utcMs, s.offsetMinutes)}</span>
                <span className="hrow-stage">{t(`stage.${s.stage}` as MessageKey)}</span>
                <span className="hrow-meta">
                  {t('history.milestones', { done: s.milestonesDone, total: s.milestonesTotal })}
                </span>
                <span className="hrow-actions">
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={() => act('POST', `/api/snapshots/${s.id}/restore`)}
                  >
                    {t('history.restore')}
                  </button>
                </span>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </section>
  );
}

function TaskSourceSnapshot({ projectId }: { projectId: string }) {
  const { t, snapshotTime } = useI18n();
  const id = Number(new URLSearchParams(location.search).get('snapshot'));
  const { data, error } = useResource<{ snapshot: SnapshotRecord }>(
    Number.isSafeInteger(id) && id > 0 ? `/api/snapshots/${id}` : null,
  );
  if (!id) return null;
  const s = data?.snapshot;
  if (!s) return <p>{t(error ? 'projects.loadFailed' : 'common.loading')}</p>;
  if (s.projectId !== projectId) return null;
  return (
    <section className="source-panel">
      <h3>{t('tasks.source', { id: s.id })}</h3>
      <time dateTime={s.snapshotAt}>{snapshotTime(s.utcMs, s.offsetMinutes)}</time>
      <p lang="zh-Hans">{s.snapshot.summary}</p>
      <ul>
        {s.snapshot.next_actions.map((a, i) => (
          <li key={a.id ?? `${a.title}:${i}`} lang="zh-Hans">
            {a.title} · {a.result}
          </li>
        ))}
      </ul>
      <a href={`/api/snapshots/${s.id}/raw`} download>
        {t('history.raw')}
      </a>
    </section>
  );
}
