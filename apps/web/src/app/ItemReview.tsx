import { type FormEvent, useState } from 'react';
import { CopyLine } from '../components/CopyLine.tsx';
import { useI18n } from '../i18n/i18n.tsx';
import { ApiError, api } from './api.ts';
import { useInvalidate } from './data.tsx';
import { ReviewMessage } from './ProjectDetail.tsx';
import { AddToFocus } from './Today.tsx';
import type { ItemState, ReviewItem } from './types.ts';

export function ItemReview({
  item,
  projectId,
  snapshotId,
}: {
  item: ReviewItem;
  projectId: string;
  snapshotId: number;
}) {
  const { t, locale } = useI18n();
  const invalidate = useInvalidate();
  const [status, setStatus] = useState<ItemState['status']>(item.state?.status ?? 'open');
  const [conclusion, setConclusion] = useState(item.state?.conclusion ?? '');
  const [date, setDate] = useState(item.state?.dueDate ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api(
        'PUT',
        `/api/items/${encodeURIComponent(projectId)}/${item.kind}/${encodeURIComponent(item.key)}`,
        { status, conclusion, dueDate: date || null, snapshotId },
      );
      setMessage('saved');
      invalidate();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.code : 'unknown');
      if (e instanceof ApiError && e.code === 'snapshot_changed') invalidate();
    } finally {
      setBusy(false);
    }
  };
  return (
    <li
      className="review-item"
      id={`item-${encodeURIComponent(projectId)}-${item.kind}-${encodeURIComponent(item.key)}`}
    >
      <p lang="zh-Hans">{item.text}</p>
      {!item.gone && item.pending ? <AddToFocus title={item.text} /> : null}
      {item.impact ? (
        <p className="source-note" lang="zh-Hans">
          {item.impact}
        </p>
      ) : null}
      {item.gone ? <span>{t('item.gone')}</span> : null}
      {item.state ? (
        <p className="item-state">
          {t(`item.${item.state.status}`)} · {fmt.format(new Date(item.state.at))}
          {item.state.dueDate ? ` · ${item.state.dueDate}` : ''}
        </p>
      ) : null}
      {item.state?.conclusion ? <p lang="zh-Hans">{item.state.conclusion}</p> : null}
      {item.repeated ? (
        <>
          <p>{t('item.repeated')}</p>
          <CopyLine text={`${item.text}\n${item.state?.conclusion ?? ''}`} lang="zh-Hans" />
        </>
      ) : null}
      {!item.gone ? (
        <details>
          <summary>{t('item.edit')}</summary>
          <form onSubmit={submit} className="review-form">
            <label className="field">
              <span>{t('item.state')}</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.currentTarget.value as ItemState['status'])}
              >
                {(item.kind === 'needs_morii'
                  ? ['open', 'decided', 'later', 'not_applicable']
                  : ['open', 'acknowledged']
                ).map((s) => (
                  <option key={s} value={s}>
                    {t(`item.${s as ItemState['status']}`)}
                  </option>
                ))}
              </select>
            </label>
            {status === 'later' ? (
              <label className="field">
                <span>{t('item.due')}</span>
                <input type="date" value={date} required onChange={(e) => setDate(e.currentTarget.value)} />
              </label>
            ) : null}
            <label className="field">
              <span>{t('item.conclusion')}</span>
              <textarea
                value={conclusion}
                required={status === 'decided'}
                maxLength={2000}
                onChange={(e) => setConclusion(e.currentTarget.value)}
              />
            </label>
            <button type="submit" className="btn" disabled={busy}>
              {t('action.save')}
            </button>
            <ReviewMessage code={message} />
          </form>
        </details>
      ) : null}
    </li>
  );
}

export function ItemReviewList({
  items,
  projectId,
  snapshotId,
}: {
  items: ReviewItem[];
  projectId: string;
  snapshotId: number;
}) {
  const { t } = useI18n();
  const active = items.filter((i) => !i.gone);
  const gone = items.filter((i) => i.gone);
  return (
    <>
      <ul className="detail-items review-items">
        {active.map((item) => (
          <ItemReview
            key={`${item.kind}:${item.key}:${item.state?.at ?? ''}`}
            item={item}
            projectId={projectId}
            snapshotId={snapshotId}
          />
        ))}
      </ul>
      {gone.length ? (
        <details className="gone-items">
          <summary>{t('item.goneCount', { n: gone.length })}</summary>
          <ul className="detail-items">
            {gone.map((item) => (
              <ItemReview
                key={`${item.kind}:${item.key}`}
                item={item}
                projectId={projectId}
                snapshotId={snapshotId}
              />
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
