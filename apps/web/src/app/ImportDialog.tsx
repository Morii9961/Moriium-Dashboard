/**
 * 导入对话框（P3.2，04 第 4、8 节）。
 *
 * 选择或拖入文件 → 服务端预览（不写入）→ 每个文件一张卡 → 确认 → 服务端重新检查后写入 → 结果，可撤销。
 * 每张卡的状态同时用图标、文字和颜色表达；校验完成后用 live region 播报统计。
 * 快照里的文字（问题说明、修复说明）由协议包生成，是中文，标 lang="zh-Hans"。
 */
import {
  CheckCircle,
  ClockCounterClockwise,
  Equals,
  FileArrowUp,
  type Icon,
  Question,
  WarningCircle,
  X,
  XCircle,
} from '@phosphor-icons/react';
import {
  createContext,
  type DragEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { CopyLine } from '../components/CopyLine.tsx';
import { useI18n } from '../i18n/i18n.tsx';
import type { MessageKey } from '../i18n/messages/zh-Hans.ts';
import { ApiError, api } from './api.ts';
import { useInvalidate, useResource } from './data.tsx';
import { useDraftGuard } from './drafts.ts';
import { PasteSnapshot } from './PasteSnapshot.tsx';
import { Link } from './router.tsx';
import type { FileOutcome, FilePreview, ProjectWithCurrent, ReporterAgent, ShownIssue } from './types.ts';

const MAX_FILES = 20;
const MAX_BYTES = 1024 * 1024;

interface Entry {
  key: string;
  name: string;
  base64: string | null;
  tooLargeKb?: number | undefined;
  codeFence?: 'extract' | undefined;
  conflict?: 'replace' | undefined;
  reporter?: ReporterAgent | 'none' | undefined;
  preview?: FilePreview | undefined;
}

const ImportContext = createContext<{ open: (projectId?: string) => void } | null>(null);

export function useImport() {
  const ctx = useContext(ImportContext);
  if (!ctx) throw new Error('useImport 必须在 <ImportProvider> 里使用');
  return ctx;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function readEntry(file: File): Promise<Entry> {
  const key = crypto.randomUUID();
  if (file.size > MAX_BYTES)
    return { key, name: file.name, base64: null, tooLargeKb: Math.ceil(file.size / 1024) };
  return { key, name: file.name, base64: toBase64(new Uint8Array(await file.arrayBuffer())) };
}

const importable = (e: Entry) =>
  e.preview?.status === 'accepted' &&
  (e.preview.placement.kind === 'latest' ||
    e.preview.placement.kind === 'history' ||
    (e.preview.placement.kind === 'conflict' && e.conflict === 'replace'));

function statusOf(e: Entry): { icon: Icon; tone: string; label: MessageKey; count?: number } {
  if (e.tooLargeKb !== undefined || e.preview?.status === 'rejected')
    return {
      icon: XCircle,
      tone: 'bad',
      label: 'import.outcome.rejected',
      count: e.preview?.status === 'rejected' ? e.preview.errors.length : 1,
    };
  if (!e.preview) return { icon: Question, tone: 'muted', label: 'import.checking' };
  if (e.preview.status === 'needs_choice')
    return { icon: Question, tone: 'warn', label: 'import.outcome.needs_choice' };
  switch (e.preview.placement.kind) {
    case 'latest':
      return { icon: CheckCircle, tone: 'good', label: 'import.placement.latest' };
    case 'history':
      return { icon: ClockCounterClockwise, tone: 'muted', label: 'import.outcome.history' };
    case 'duplicate':
      return { icon: Equals, tone: 'muted', label: 'import.outcome.duplicate' };
    case 'conflict':
      return { icon: WarningCircle, tone: 'warn', label: 'import.conflict.legend' };
  }
}

function IssueList({ issues }: { issues: ShownIssue[] }) {
  return (
    <ul className="issue-list" lang="zh-Hans">
      {issues.map((i, n) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 问题列表不会重排，同一位置可能有多条同类问题。
        <li key={`${i.pointer}-${i.code}-${n}`}>
          <span className="issue-where">{i.location}</span>
          <span>
            {i.problem}
            {i.received ? <span className="issue-received">（收到：{i.received}）</span> : null}
            {i.fix ? ` ${i.fix}` : null}
          </span>
          {i.pointer ? <code className="issue-pointer">{i.pointer}</code> : null}
        </li>
      ))}
    </ul>
  );
}

function FileCard({
  entry,
  onChange,
  onRemove,
  onRetryAny,
}: {
  entry: Entry;
  onChange: (patch: Partial<Entry>) => void;
  onRemove: () => void;
  onRetryAny: (() => void) | null;
}) {
  const { t, locale, relative, snapshotTime } = useI18n();
  const id = useId();
  const now = useMemo(() => new Date(), []);
  const { icon: StatusIcon, tone, label, count } = statusOf(entry);
  const p = entry.preview;
  const dateOf = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));

  let placementText = '';
  if (p?.status === 'accepted') {
    const pl = p.placement;
    if (pl.kind === 'latest')
      placementText = pl.replaces ? t('import.placement.latest') : t('import.placement.first');
    if (pl.kind === 'history')
      placementText = pl.inBatch
        ? t('import.placement.historyBatch')
        : t('import.placement.history', {
            date: pl.currentLatest
              ? snapshotTime(pl.currentLatest.utcMs, pl.currentLatest.offsetMinutes)
              : '—',
          });
    if (pl.kind === 'duplicate')
      placementText = pl.inBatch
        ? t('import.placement.duplicateBatch')
        : pl.deleted
          ? t('import.placement.duplicateTrash')
          : t('import.placement.duplicate', { date: pl.of ? dateOf(pl.of.importedAt) : '—' });
    if (pl.kind === 'conflict')
      placementText = pl.inBatch
        ? t('import.placement.conflictBatch')
        : t('import.placement.conflict', {
            date: pl.with ? snapshotTime(pl.with.utcMs, pl.with.offsetMinutes) : '—',
          });
  }

  let diffText = '';
  if (p?.status === 'accepted' && p.diff && p.placement.kind === 'latest') {
    const d = p.diff;
    const parts = [
      d.stage
        ? t('import.diff.stage', {
            from: t(`stage.${d.stage.from}` as MessageKey),
            to: t(`stage.${d.stage.to}` as MessageKey),
          })
        : '',
      d.milestones.added.length + d.milestones.removed.length + d.milestones.changed.length > 0
        ? t('import.diff.milestones', {
            count: d.milestones.added.length + d.milestones.removed.length + d.milestones.changed.length,
          })
        : '',
      d.needsMorii.added.length > 0 ? t('import.diff.needsAdded', { count: d.needsMorii.added.length }) : '',
      d.blockers.added.length > 0 ? t('import.diff.blockersAdded', { count: d.blockers.added.length }) : '',
    ].filter(Boolean);
    diffText = parts.length > 0 ? parts.join(' · ') : t('import.diff.none');
  }

  const reporterValue =
    entry.reporter ?? (p?.status === 'accepted' ? (p.attribution.agent ?? 'none') : 'none');
  const reporterHint =
    entry.reporter === undefined && p?.status === 'accepted'
      ? p.attribution.source === 'branch'
        ? t('import.reporterInferred')
        : p.attribution.source === 'file'
          ? t('import.reporterFile')
          : ''
      : '';

  return (
    <li className={`icard tone-${tone}`} aria-labelledby={`${id}-title`}>
      <span className="icard-icon" aria-hidden="true">
        <StatusIcon size={22} weight={tone === 'good' ? 'fill' : 'regular'} />
      </span>
      <div className="icard-body">
        <p className="icard-title" id={`${id}-title`}>
          {p?.status === 'accepted' ? (
            <>
              <span className="icard-name">{p.projectName}</span>
              <span className="icard-id mono">{p.projectId}</span>
            </>
          ) : (
            <span className="icard-name mono">{entry.name}</span>
          )}
        </p>
        <p className="icard-status">{count !== undefined ? t('import.rejected', { count }) : t(label)}</p>

        {p?.status === 'accepted' ? (
          <>
            <p className="icard-meta">
              <span>
                {snapshotTime(p.utcMs, p.offsetMinutes)} · {relative(p.utcMs, now)}
              </span>
              <label className="icard-reporter">
                <span>{t('import.reporter')}</span>
                <select
                  value={reporterValue}
                  onChange={(e) => onChange({ reporter: e.currentTarget.value as ReporterAgent | 'none' })}
                >
                  {(['claude', 'codex', 'other', 'none'] as const).map((a) => (
                    <option key={a} value={a}>
                      {t(`agent.${a}`)}
                    </option>
                  ))}
                </select>
                {reporterHint ? <span className="icard-hint">（{reporterHint}）</span> : null}
              </label>
            </p>
            <p className="icard-line">{placementText}</p>
            {diffText ? <p className="icard-line icard-diff">{diffText}</p> : null}
            {p.placement.kind === 'conflict' ? (
              <fieldset className="icard-choice">
                <legend className="sr-only">{t('import.conflict.legend')}</legend>
                {(['skip', 'replace'] as const).map((v) => (
                  <label key={v}>
                    <input
                      type="radio"
                      name={`${id}-conflict`}
                      checked={(entry.conflict === 'replace' ? 'replace' : 'skip') === v}
                      onChange={() =>
                        onChange(v === 'replace' ? { conflict: 'replace' } : { conflict: undefined })
                      }
                    />
                    {t(`import.conflict.${v}`)}
                  </label>
                ))}
              </fieldset>
            ) : null}
            {p.warnings.length > 0 ? (
              <details className="icard-details">
                <summary>{t('import.warnings', { count: p.warnings.length })}</summary>
                <IssueList issues={p.warnings} />
              </details>
            ) : null}
          </>
        ) : null}

        {entry.tooLargeKb !== undefined ? (
          <p className="icard-line">{t('import.tooLarge', { kb: entry.tooLargeKb })}</p>
        ) : null}

        {p?.status === 'needs_choice' ? (
          <div className="icard-fence">
            <p className="icard-line">{t('import.fence.ask')}</p>
            <button type="button" className="btn" onClick={() => onChange({ codeFence: 'extract' })}>
              {t('import.fence.extract')}
            </button>
          </div>
        ) : null}

        {p?.status === 'rejected' ? (
          <>
            <IssueList issues={p.errors} />
            <details className="icard-details">
              <summary>{t('import.copyFix')}</summary>
              <CopyLine text={p.fixPrompt} lang="zh-Hans" />
            </details>
            {onRetryAny && p.errors.some((e) => e.code === 'project_mismatch') ? (
              <button type="button" className="btn btn-quiet" onClick={onRetryAny}>
                {t('import.retryAny')}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      <button
        type="button"
        className="icon-btn icard-remove"
        aria-label={t('import.remove', { name: entry.name })}
        onClick={onRemove}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </li>
  );
}

function ResultView({
  results,
  batchId,
  onClose,
}: {
  results: FileOutcome[];
  batchId: number;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const invalidate = useInvalidate();
  const [undo, setUndo] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const imported = results.filter((r) => r.outcome === 'imported').length;
  const undoNow = async () => {
    setUndo('busy');
    try {
      await api('DELETE', `/api/imports/${batchId}`);
      setUndo('done');
      invalidate();
    } catch {
      setUndo('error');
    }
  };
  const outcomeKey = (r: FileOutcome): MessageKey =>
    r.outcome === 'imported'
      ? `import.outcome.${r.placement}`
      : r.outcome === 'skipped'
        ? `import.outcome.${r.reason}`
        : `import.outcome.${r.outcome}`;
  return (
    <div className="iresult">
      <p className="iresult-title" role="status">
        {undo === 'done'
          ? t('import.undone')
          : t('import.done', { imported, skipped: results.length - imported })}
      </p>
      <ul className="iresult-list">
        {results.map((r, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 结果列表渲染后不再变化，同名文件只能靠位置区分。
          <li key={`${r.fileName}-${i}`} className={`iresult-row is-${r.outcome}`}>
            <span className="mono">{r.fileName}</span>
            <span>{t(outcomeKey(r))}</span>
            {'projectId' in r && undo !== 'done' ? (
              <Link
                to={`/projects/${encodeURIComponent(r.projectId)}`}
                onClick={onClose}
                className="iresult-link"
              >
                {r.projectId}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
      <div className="idialog-actions">
        {imported > 0 && undo !== 'done' ? (
          <button type="button" className="btn btn-quiet" onClick={undoNow} disabled={undo === 'busy'}>
            {t('import.undo')}
          </button>
        ) : null}
        {undo === 'error' ? <span className="reg-status is-error">{t('apiError.unknown')}</span> : null}
        <button type="button" className="btn btn-primary" onClick={onClose}>
          {t('import.close')}
        </button>
      </div>
    </div>
  );
}

function ImportDialog({
  dialog,
  projectId,
  onClose,
}: {
  dialog: RefObject<HTMLDialogElement | null>;
  projectId: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const invalidate = useInvalidate();
  const { data } = useResource<{ projects: ProjectWithCurrent[] }>('/api/projects');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [expected, setExpected] = useState<string | null>(projectId);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const [error, setError] = useState<MessageKey | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ batchId: number; results: FileOutcome[] } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [paste, setPaste] = useState('');
  const [pasteTooLarge, setPasteTooLarge] = useState(false);
  const [reading, setReading] = useState(false);
  const confirmClose = useDraftGuard(paste.length > 0);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const session = useRef(0);

  useEffect(() => setExpected(projectId), [projectId]);

  // 文件或选择变了就重新预览（服务端检查，不写入）。
  const sendable = entries.filter((e) => e.base64 !== null);
  const signature = JSON.stringify([expected, sendable.map((e) => [e.key, e.codeFence, e.conflict])]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: signature 概括了会影响预览的全部输入。
  useEffect(() => {
    const mine = ++seq.current;
    if (sendable.length === 0) {
      setChecking(false);
      return;
    }
    setChecking(true);
    setError(null);
    api<{ files: FilePreview[] }>('POST', '/api/imports/check', {
      files: sendable.map((e) => ({
        name: e.name,
        base64: e.base64,
        ...(e.codeFence ? { codeFence: e.codeFence } : {}),
        ...(e.conflict ? { conflict: e.conflict } : {}),
        ...(expected ? { expectedProjectId: expected } : {}),
      })),
    })
      .then(({ files }) => {
        if (mine !== seq.current) return;
        const byKey = new Map(sendable.map((e, i) => [e.key, files[i]]));
        setEntries((prev) => prev.map((e) => (byKey.has(e.key) ? { ...e, preview: byKey.get(e.key) } : e)));
      })
      .catch((err: unknown) => {
        if (mine !== seq.current) return;
        setError(err instanceof ApiError && err.code === 'offline' ? 'apiError.offline' : 'apiError.unknown');
      })
      .finally(() => mine === seq.current && setChecking(false));
    return () => {
      seq.current++;
    };
  }, [signature]);

  const addFiles = async (list: FileList | File[]) => {
    if (reading || submitting) return;
    const currentSession = session.current;
    setReading(true);
    const files = [...list];
    const room = MAX_FILES - entries.length;
    setNotice(files.length > room ? 'import.tooMany' : null);
    try {
      const read = await Promise.all(files.slice(0, Math.max(0, room)).map(readEntry));
      if (currentSession !== session.current) return;
      setResult(null);
      setEntries((prev) => [...prev, ...read].slice(0, MAX_FILES));
    } catch {
      if (currentSession === session.current) setError('apiError.unknown');
    } finally {
      if (currentSession === session.current) setReading(false);
    }
  };

  const previewPaste = () => {
    if (reading || checking || submitting || !paste.trim()) return;
    if (entries.length >= MAX_FILES) {
      setNotice('import.tooMany');
      return;
    }
    const bytes = new TextEncoder().encode(paste);
    if (bytes.byteLength > MAX_BYTES) {
      setPasteTooLarge(true);
      return;
    }
    setEntries((prev) => [
      ...prev,
      { key: crypto.randomUUID(), name: 'pasted-snapshot.json', base64: toBase64(bytes) },
    ]);
    setPaste('');
    setPasteTooLarge(false);
    setNotice(null);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) void addFiles(e.dataTransfer.files);
  };

  const ready = entries.filter(importable);
  const counts = {
    total: entries.length,
    ok: ready.length,
    dup: entries.filter((e) => e.preview?.status === 'accepted' && e.preview.placement.kind === 'duplicate')
      .length,
    bad: entries.filter((e) => e.tooLargeKb !== undefined || e.preview?.status === 'rejected').length,
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const r = await api<{ batchId: number; results: FileOutcome[] }>('POST', '/api/imports', {
        files: sendable.map((e) => ({
          name: e.name,
          base64: e.base64,
          ...(e.codeFence ? { codeFence: e.codeFence } : {}),
          ...(e.conflict ? { conflict: e.conflict } : {}),
          ...(e.reporter ? { reporter: e.reporter } : {}),
          ...(expected ? { expectedProjectId: expected } : {}),
        })),
      });
      setResult(r);
      setEntries([]);
      invalidate();
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'offline' ? 'apiError.offline' : 'apiError.unknown');
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    session.current++;
    seq.current++;
    setEntries([]);
    setPaste('');
    setPasteTooLarge(false);
    setReading(false);
    setChecking(false);
    setResult(null);
    setNotice(null);
    setError(null);
    onClose();
  };
  const requestClose = () => {
    if (!submitting && confirmClose()) dialog.current?.close();
  };

  const projectName = expected ? (data?.projects.find((p) => p.id === expected)?.name ?? expected) : null;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: 点遮罩关闭只是鼠标的快捷方式；键盘用 Esc 关闭（原生 dialog）。
    <dialog
      ref={dialog}
      className="idialog"
      aria-labelledby="idialog-title"
      onClose={close}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div className="idialog-inner">
        <header className="idialog-head">
          <h2 id="idialog-title" className="idialog-title">
            {projectName ? t('import.titleFor', { name: projectName }) : t('import.title')}
          </h2>
          <button type="button" className="icon-btn" aria-label={t('import.cancel')} onClick={requestClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        {result ? (
          <ResultView
            results={result.results}
            batchId={result.batchId}
            onClose={() => dialog.current?.close()}
          />
        ) : (
          <>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: 拖放只是补充方式；键盘和读屏用里面的「选择文件」按钮。 */}
            <div
              className={`dropzone${dragging ? ' is-dragging' : ''}${entries.length > 0 ? ' is-compact' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <FileArrowUp className="dropzone-icon" size={entries.length > 0 ? 22 : 36} aria-hidden="true" />
              <p className="dropzone-text">{t('import.drop')}</p>
              <p className="dropzone-sub">
                <button
                  type="button"
                  className="btn"
                  disabled={reading || submitting}
                  onClick={() => input.current?.click()}
                >
                  {t('import.choose')}
                </button>
                <span>{t('import.multi')}</span>
              </p>
              <input
                ref={input}
                type="file"
                accept=".json,application/json"
                multiple
                hidden
                onChange={(e) => {
                  if (e.currentTarget.files) void addFiles(e.currentTarget.files);
                  e.currentTarget.value = '';
                }}
              />
            </div>

            <PasteSnapshot
              text={paste}
              onChange={(text) => {
                setPaste(text);
                setPasteTooLarge(false);
              }}
              onPreview={previewPaste}
              disabled={reading || checking || submitting}
              tooLarge={pasteTooLarge}
            />

            {notice ? <p className="idialog-notice">{t(notice)}</p> : null}

            {entries.length > 0 ? (
              <ul className="icards">
                {entries.map((e) => (
                  <FileCard
                    key={e.key}
                    entry={e}
                    onChange={(patch) =>
                      setEntries((prev) =>
                        prev.map((x) =>
                          x.key === e.key
                            ? { ...x, ...patch, ...(patch.codeFence ? { preview: undefined } : {}) }
                            : x,
                        ),
                      )
                    }
                    onRemove={() => setEntries((prev) => prev.filter((x) => x.key !== e.key))}
                    onRetryAny={expected ? () => setExpected(null) : null}
                  />
                ))}
              </ul>
            ) : null}

            <p className="sr-only" aria-live="polite">
              {entries.length > 0 && !checking ? t('import.summary', counts) : ''}
            </p>

            {error ? (
              <p className="reg-status is-error" role="alert">
                {t(error)}
              </p>
            ) : null}

            <div className="idialog-actions">
              <button type="button" className="btn btn-quiet" disabled={submitting} onClick={requestClose}>
                {t('import.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={ready.length === 0 || checking || submitting || reading || paste.length > 0}
                onClick={submit}
              >
                {ready.length > 0 ? t('import.submit', { count: ready.length }) : t('import.nothing')}
              </button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}

export function ImportProvider({ children }: { children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const open = useCallback((id?: string) => {
    setProjectId(id ?? null);
    dialog.current?.showModal();
  }, []);
  return (
    <ImportContext.Provider value={{ open }}>
      {children}
      <ImportDialog dialog={dialog} projectId={projectId} onClose={() => setProjectId(null)} />
    </ImportContext.Provider>
  );
}
