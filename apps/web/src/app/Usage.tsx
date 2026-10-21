import type {
  FxSnapshot,
  PriceCatalog,
  UsageBill,
  UsageBillSummary,
  UsageDataset,
  UsagePreview,
  UsageWeek,
} from '@moriium-dashboard/protocol/usage';
import { type ChangeEvent, useRef, useState } from 'react';
import { useI18n } from '../i18n/i18n.tsx';
import type { MessageKey } from '../i18n/messages/zh-Hans.ts';
import { ApiError, api } from './api.ts';
import { useInvalidate, useResource } from './data.tsx';
import { PageHeader } from './ui.tsx';
import { shanghaiMonday, usageMoney, usageNumber } from './usage-format.ts';
import './usage.css';

const errorMessage = (e: unknown): MessageKey =>
  e instanceof ApiError &&
  [
    'usage_changed',
    'usage_review_required',
    'usage_revision_conflict',
    'usage_immutable',
    'usage_week',
  ].includes(e.code)
    ? (`usage.${e.code}` as MessageKey)
    : 'usage.error';
export function UsagePage() {
  const { t } = useI18n(),
    invalidate = useInvalidate();
  const datasets = useResource<{ datasets: UsageDataset[] }>('/api/usage/datasets');
  const pricing = useResource<{ catalogs: PriceCatalog[]; fx: FxSnapshot[] }>('/api/usage/pricing');
  const [selected, setSelected] = useState(''),
    [week, setWeek] = useState(() => shanghaiMonday());
  const dataset = selected || datasets.data?.datasets[0]?.id || '';
  const [catalog, setCatalog] = useState(''),
    [fx, setFx] = useState(''),
    [mode, setMode] = useState<'classified' | 'standard_short'>('classified');
  const [repriceBase, setRepriceBase] = useState<number | null>(null);
  const [frozen, setFrozen] = useState<UsageBill | null>(null),
    [message, setMessage] = useState<MessageKey | null>(null),
    [busy, setBusy] = useState(false);
  const url = dataset
    ? `/api/usage/weeks/${week}?${new URLSearchParams({ dataset, catalog, fx, mode, ...(repriceBase ? { previous: String(repriceBase) } : {}) })}`
    : null;
  const current = useResource<UsageWeek>(url);
  const history = useResource<{ bills: UsageBillSummary[] }>(
    dataset ? `/api/usage/bills?${new URLSearchParams({ dataset, week })}` : null,
  );
  // Never show stale content under another dataset, week or pricing selection.
  const currentMatches =
    current.data?.dataset_id === dataset &&
    current.data?.week_start === week &&
    (current.data?.catalog?.id ?? '') === catalog &&
    (current.data?.fx?.id ?? '') === fx &&
    current.data?.mode === mode &&
    (current.data?.basis_bill_id ?? null) === repriceBase;
  const bill = frozen?.bill ?? (currentMatches && !current.error ? current.data : undefined);
  const change = () => {
    setFrozen(null);
    setMessage(null);
  };
  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api<UsageBill>('POST', '/api/usage/bills', {
        dataset,
        week,
        catalog: catalog || null,
        fx: fx || null,
        mode,
        previous: repriceBase,
      });
      setFrozen(result);
      setRepriceBase(result.id);
      invalidate();
      setMessage('usage.saved');
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const open = async (id: number) => {
    setBusy(true);
    try {
      const result = await api<UsageBill>('GET', `/api/usage/bills/${id}`);
      if (result.bill.dataset_id !== dataset || result.bill.week_start !== week) throw new Error('scope');
      setCatalog(result.bill.catalog?.id ?? '');
      setFx(result.bill.fx?.id ?? '');
      setMode(result.bill.mode);
      setFrozen(result);
      setRepriceBase(result.id);
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="usage-page">
      <PageHeader title={t('usage.title')} lede={t('usage.scope')} />
      <p className="usage-notice">{t('usage.notPayment')}</p>
      <div className="usage-controls">
        <label className="field">
          <span>{t('usage.dataset')}</span>
          <select
            disabled={busy}
            value={dataset}
            onChange={(e) => {
              setSelected(e.currentTarget.value);
              setRepriceBase(null);
              change();
            }}
          >
            <option value="" disabled>
              {t('usage.empty')}
            </option>
            {datasets.data?.datasets.map((d, i) => (
              <option key={d.id} value={d.id}>
                {t(`usage.source.${d.source}`)} · {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('usage.week')}</span>
          <input
            type="date"
            disabled={busy}
            value={week}
            onChange={(e) => {
              setWeek(e.currentTarget.value);
              setRepriceBase(null);
              change();
            }}
          />
        </label>
        <label className="field">
          <span>{t('usage.catalog')}</span>
          <select
            disabled={busy}
            value={catalog}
            onChange={(e) => {
              setCatalog(e.currentTarget.value);
              change();
            }}
          >
            <option value="">{t('usage.noPrice')}</option>
            {pricing.data?.catalogs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} · {c.version}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('usage.fx')}</span>
          <select
            disabled={busy}
            value={fx}
            onChange={(e) => {
              setFx(e.currentTarget.value);
              change();
            }}
          >
            <option value="">{t('usage.noFx')}</option>
            {pricing.data?.fx.map((f) => (
              <option key={f.id} value={f.id}>
                {f.id} · {f.rate}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('usage.policy')}</span>
          <select
            disabled={busy}
            value={mode}
            onChange={(e) => {
              setMode(e.currentTarget.value as typeof mode);
              change();
            }}
          >
            <option value="classified">{t('usage.classified')}</option>
            <option value="standard_short">{t('usage.scenario')}</option>
          </select>
        </label>
      </div>
      <p role="status">
        {message
          ? t(message)
          : datasets.error || pricing.error
            ? t('usage.error')
            : current.error
              ? t(errorMessage(current.error))
              : current.loading && dataset
                ? t('common.loading')
                : ''}
      </p>
      {frozen ? (
        <p className="usage-notice">
          {t('usage.frozen', { revision: frozen.revision })}{' '}
          <button
            className="btn"
            type="button"
            onClick={() => {
              setFrozen(null);
              setRepriceBase(null);
            }}
          >
            {t('usage.current')}
          </button>
        </p>
      ) : null}
      {repriceBase && !frozen ? (
        <p className="usage-notice">
          {t('usage.repriceBasis')}{' '}
          <button
            type="button"
            className="btn"
            onClick={() => {
              setRepriceBase(null);
              setFrozen(null);
            }}
          >
            {t('usage.current')}
          </button>
        </p>
      ) : null}
      {bill ? <UsageReport bill={bill} /> : <p>{dataset ? t('usage.wait') : t('usage.empty')}</p>}
      <div className="page-actions">
        <button
          className="btn btn-primary"
          type="button"
          disabled={!bill || busy || current.loading || !!current.error || !currentMatches}
          onClick={save}
        >
          {t(repriceBase ? 'usage.reprice' : 'usage.freeze')}
        </button>
      </div>
      <section className="usage-section" aria-labelledby="usage-history">
        <h2 id="usage-history">{t('usage.history')}</h2>
        <p>{t('usage.historyHelp')}</p>
        <ul>
          {history.data?.bills.map((b) => (
            <li key={b.id}>
              <button type="button" className="btn" disabled={busy} onClick={() => open(b.id)}>
                {t('usage.revision', { revision: b.revision })} · {b.created_at}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <UsageImport
        datasets={datasets.data?.datasets ?? []}
        onImported={(id) => {
          setSelected(id);
          setFrozen(null);
          setRepriceBase(null);
          invalidate();
        }}
      />
      <PricingInfo
        catalog={bill?.catalog ?? pricing.data?.catalogs.find((c) => c.id === catalog) ?? null}
        fx={bill?.fx ?? pricing.data?.fx.find((f) => f.id === fx) ?? null}
      />
      <PricingUpload
        onSaved={() => {
          invalidate();
          setFrozen(null);
        }}
      />
    </div>
  );
}

function UsageReport({ bill }: { bill: UsageWeek }) {
  const { t, locale } = useI18n();
  const n = (v: string | null) => usageNumber(v, locale),
    money = (v: string | null, c: 'USD' | 'CNY' = 'USD') => usageMoney(v, c, locale);
  const max = bill.days.reduce(
    (m, d) => (d.tokens !== null && BigInt(d.tokens) > m ? BigInt(d.tokens) : m),
    0n,
  );
  return (
    <>
      <p>
        {bill.week_start} — {bill.end_exclusive} · Asia/Shanghai · {t('usage.halfOpen')}
      </p>
      <dl className="usage-metrics">
        <div>
          <dt>{t('usage.tokens')}</dt>
          <dd>{n(bill.totals.measured_tokens)}</dd>
        </div>
        <div>
          <dt>{t('usage.equivalent')}</dt>
          <dd>
            {money(bill.totals.usd)} / {money(bill.totals.cny, 'CNY')}
          </dd>
        </div>
        <div>
          <dt>{t('usage.cache')}</dt>
          <dd>{bill.totals.cache_read_percent === null ? '—' : `${bill.totals.cache_read_percent}%`}</dd>
        </div>
        <div>
          <dt>{t('usage.effort')}</dt>
          <dd>
            High {bill.totals.high_percent === null ? '—' : `${bill.totals.high_percent}%`} / xhigh{' '}
            {bill.totals.xhigh_percent === null ? '—' : `${bill.totals.xhigh_percent}%`}
          </dd>
        </div>
      </dl>
      <section className="usage-notice" aria-labelledby="usage-coverage">
        <h2 id="usage-coverage">{t('usage.coverage')}</h2>
        <p>
          {t(bill.diagnostics.partial_coverage ? 'usage.partialCoverage' : 'usage.completeCoverage')} ·{' '}
          {t('usage.unpricedCount', { count: bill.diagnostics.unpriced_rows })} ·{' '}
          {t('usage.unpricedTokens', { tokens: n(bill.totals.unpriced_tokens) })}
        </p>
        <p>{t('usage.partialPrice', { tokens: n(bill.totals.priced_tokens) })}</p>
        {bill.totals.has_unknown_totals ? <p>{t('usage.unknownTotals')}</p> : null}
        {bill.diagnostics.effort_inferred ? <p>{t('usage.inferred')}</p> : null}
        {bill.mode === 'standard_short' ? <p>{t('usage.assumption')}</p> : null}
        {bill.diagnostics.missing_fx ? <p>{t('usage.noFx')}</p> : null}
        <p>{t('usage.noSum')}</p>
      </section>
      <section className="usage-section">
        <h2>{t('usage.daily')}</h2>
        <p>{t('usage.chartHelp')}</p>
        <div className="usage-chart" role="img" aria-label={t('usage.daily')}>
          {bill.days.map((d) => (
            <div key={d.date} className="usage-chart-day">
              <div className="usage-bar-space">
                <div
                  className="usage-bar"
                  style={{
                    height:
                      d.tokens === null || max === 0n
                        ? '0%'
                        : `${Number((BigInt(d.tokens) * 10000n) / max) / 100}%`,
                  }}
                  title={`${d.date}: ${n(d.tokens)}`}
                />
              </div>
              <span>{d.date.slice(5)}</span>
            </div>
          ))}
        </div>
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable tables need keyboard focus for horizontal scrolling. */}
        <section className="usage-table-wrap" tabIndex={0} aria-label={t('usage.daily')}>
          <table>
            <caption>{t('usage.daily')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('usage.date')}</th>
                <th scope="col">{t('usage.tokens')}</th>
                <th scope="col">{t('usage.coverage')}</th>
              </tr>
            </thead>
            <tbody>
              {bill.days.map((d) => (
                <tr key={d.date}>
                  <th scope="row">{d.date}</th>
                  <td>{n(d.tokens)}</td>
                  <td>{t(`usage.coverage.${d.state}` as MessageKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </section>
      <section className="usage-section">
        <h2>{t('usage.models')}</h2>
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable tables need keyboard focus for horizontal scrolling. */}
        <section className="usage-table-wrap" tabIndex={0} aria-label={t('usage.models')}>
          <table>
            <caption>{t('usage.models')}</caption>
            <thead>
              <tr>
                {['date', 'sourceLabel', 'model', 'effort', 'tokens', 'equivalent', 'reason'].map((k) => (
                  <th scope="col" key={k}>
                    {t(`usage.${k}` as MessageKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bill.rows.map((r) => (
                <tr key={JSON.stringify(r)}>
                  <th scope="row">{r.date}</th>
                  <td>{t(`usage.source.${r.source}` as MessageKey)}</td>
                  <td>{r.model}</td>
                  <td>
                    {r.effort}
                    <br />
                    {r.effort_evidence === 'inferred' ? t('usage.inferredShort') : null}
                  </td>
                  <td>{n(r.tokens)}</td>
                  <td title={r.usd ?? ''}>{money(r.usd)}</td>
                  <td>
                    {r.reason
                      ? t(`usage.reason.${r.reason}` as MessageKey)
                      : r.assumptions.length
                        ? t('usage.scenario')
                        : t('usage.classified')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </section>
      <section className="usage-section">
        <h2>{t('usage.categories')}</h2>
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable tables need keyboard focus for horizontal scrolling. */}
        <section className="usage-table-wrap" tabIndex={0} aria-label={t('usage.categories')}>
          <table>
            <caption>{t('usage.categories')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('usage.model')}</th>
                <th scope="col">{t('usage.category')}</th>
                <th scope="col">{t('usage.tokens')}</th>
                <th scope="col">{t('usage.equivalent')}</th>
              </tr>
            </thead>
            <tbody>
              {bill.rows.flatMap((r) =>
                Object.entries(r.counts).map(([key, value]) => (
                  <tr key={`${JSON.stringify(r)}-${key}`}>
                    <th scope="row">
                      {r.date} · {r.model} · {r.effort}
                    </th>
                    <td>{t(`usage.count.${key}` as MessageKey)}</td>
                    <td>{n(value)}</td>
                    <td>
                      {['input_total', 'output_reasoning_subset'].includes(key)
                        ? t('usage.subset')
                        : money(r.items.find((item) => item.category === key)?.usd ?? null)}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </section>
      </section>
    </>
  );
}

async function selectedJson(event: ChangeEvent<HTMLInputElement>) {
  const file = event.currentTarget.files?.[0];
  event.currentTarget.value = '';
  if (!file) return undefined;
  if (file.size > 1024 * 1024) throw new Error('size');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())) as unknown;
}
function UsageImport({
  datasets,
  onImported,
}: {
  datasets: UsageDataset[];
  onImported: (id: string) => void;
}) {
  const { t } = useI18n();
  const [snapshot, setSnapshot] = useState<unknown>(null),
    [preview, setPreview] = useState<UsagePreview | null>(null),
    [replace, setReplace] = useState(false),
    [message, setMessage] = useState<MessageKey | null>(null),
    [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const choose = async (e: ChangeEvent<HTMLInputElement>) => {
    const key = ++generation.current;
    setSnapshot(null);
    setPreview(null);
    setReplace(false);
    setMessage(null);
    setBusy(true);
    try {
      const value = await selectedJson(e);
      if (value === undefined) return;
      const p = await api<UsagePreview>('POST', '/api/usage/imports/preview', { snapshot: value });
      if (key !== generation.current) return;
      setSnapshot(value);
      setPreview(p);
    } catch (error) {
      if (key === generation.current) setMessage(errorMessage(error));
    } finally {
      if (key === generation.current) setBusy(false);
    }
  };
  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      await api('POST', '/api/usage/imports', { snapshot, expected_state: preview.expected_state, replace });
      onImported((snapshot as { dataset_id: string }).dataset_id);
      setPreview(null);
      setSnapshot(null);
      setMessage('usage.imported');
    } catch (e) {
      setMessage(errorMessage(e));
      setPreview(null);
      setSnapshot(null);
    } finally {
      setBusy(false);
    }
  };
  const select = async (d: UsageDataset, hash: string, undo: boolean) => {
    setBusy(true);
    try {
      await api('POST', `/api/usage/imports/${hash}/select`, { expected_state: d.expected_state, undo });
      onImported(d.id);
      setMessage('usage.selected');
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="usage-section" aria-labelledby="usage-import">
      <h2 id="usage-import">{t('usage.import')}</h2>
      <p>{t('usage.importHelp')}</p>
      <label className="field">
        <span>{t('usage.choose')}</span>
        <input type="file" accept=".json,application/json" disabled={busy} onChange={choose} />
      </label>
      <p role="status">{message ? t(message) : busy ? t('common.loading') : ''}</p>
      {preview ? (
        <div className="usage-notice">
          <p>
            {t('usage.preview', { rows: preview.rows })} · {preview.range.start} —{' '}
            {preview.range.end_exclusive} · {t(`usage.source.${preview.source}`)}
          </p>
          <p className="usage-hash">SHA-256 {preview.hash}</p>
          <table>
            <caption>{t('usage.diff')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('usage.date')}</th>
                <th scope="col">{t('usage.before')}</th>
                <th scope="col">{t('usage.after')}</th>
              </tr>
            </thead>
            <tbody>
              {preview.daily_totals.map((d) => (
                <tr key={d.date}>
                  <th scope="row">{d.date}</th>
                  <td>{d.previous_tokens ?? '—'}</td>
                  <td>{d.new_tokens ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul>
            {preview.days.map((d) => (
              <li key={d.date}>
                {d.date} · {t(`usage.coverage.${d.state}`)}
              </li>
            ))}
          </ul>
          {preview.conflicts.length ? (
            <>
              <p>{t('usage.conflicts', { count: preview.conflicts.length })}</p>
              <label>
                <input
                  type="checkbox"
                  checked={replace}
                  onChange={(e) => setReplace(e.currentTarget.checked)}
                />
                {t('usage.replace')}
              </label>
            </>
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || preview.duplicate || (preview.conflicts.length > 0 && !replace)}
            onClick={commit}
          >
            {t(preview.duplicate ? 'usage.duplicate' : 'usage.confirm')}
          </button>
        </div>
      ) : null}
      <h3>{t('usage.revisions')}</h3>
      <p>{t('usage.selectHelp')}</p>
      {datasets.map((d, i) => (
        <div key={d.id}>
          <h4>
            {t(`usage.source.${d.source}`)} · {i + 1}
          </h4>
          <ul className="usage-import-list">
            {d.imports.map((r) => (
              <li key={r.hash}>
                <span>
                  {t('usage.revision', { revision: r.revision })} · {r.range.start} — {r.range.end_exclusive}
                  <small className="usage-hash">{r.hash}</small>
                  <small>
                    {t('usage.selectedDays', {
                      count: d.selections.filter((s) => s.import_hash === r.hash).length,
                    })}
                  </small>
                </span>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => select(d, r.hash, false)}
                >
                  {t('usage.select')}
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => select(d, r.hash, true)}>
                  {t('usage.undo')}
                </button>
              </li>
            ))}
          </ul>
          <details>
            <summary>{t('usage.audit')}</summary>
            <ul>
              {d.recent_selections.map((s) => (
                <li key={s.id}>
                  {s.date} · {t(`usage.audit.${s.action}` as MessageKey)} · {s.at}
                  <small className="usage-hash">
                    {s.previous_hash ?? '—'} → {s.import_hash ?? '—'}
                  </small>
                </li>
              ))}
            </ul>
          </details>
        </div>
      ))}
    </section>
  );
}
function PricingInfo({ catalog, fx }: { catalog: PriceCatalog | null; fx: FxSnapshot | null }) {
  const { t } = useI18n();
  return (
    <section className="usage-section">
      <h2>{t('usage.sources')}</h2>
      <p>{t('usage.priceHelp')}</p>
      {fx ? (
        <p>
          USD/CNY {fx.rate} · {fx.as_of} · {t(`usage.fxSource.${fx.source}` as MessageKey)} ·{' '}
          {t(`usage.fxKind.${fx.kind}`)}
          {fx.source_url ? (
            <>
              {' '}
              ·{' '}
              <a href={fx.source_url} target="_blank" rel="noopener noreferrer">
                {t('usage.official')}
              </a>
            </>
          ) : null}
        </p>
      ) : (
        <p>{t('usage.noFx')}</p>
      )}
      {catalog ? (
        <>
          <p>
            {catalog.id} · {catalog.version} · {t('usage.checked', { date: catalog.checked_at })}
          </p>
          {/* biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable tables need keyboard focus for horizontal scrolling. */}
          <section className="usage-table-wrap" tabIndex={0} aria-label={t('usage.catalog')}>
            <table>
              <caption>{t('usage.rateUnit')}</caption>
              <thead>
                <tr>
                  {['model', 'conditions', 'category', 'rate', 'effective', 'sourceLabel'].map((k) => (
                    <th scope="col" key={k}>
                      {t(`usage.${k}` as MessageKey)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {catalog.rules.map((r) => (
                  <tr key={JSON.stringify(r)}>
                    <th scope="row">{r.model}</th>
                    <td>
                      {r.tier} / {r.context_class} / {r.region}
                    </td>
                    <td>{t(`usage.count.${r.category}`)}</td>
                    <td>{r.usd_per_million}</td>
                    <td>
                      {r.effective_from} — {r.effective_to}
                    </td>
                    <td>
                      <a href={r.official_source} target="_blank" rel="noopener noreferrer">
                        {t('usage.official')}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      ) : (
        <p>{t('usage.noPrice')}</p>
      )}
    </section>
  );
}
function PricingUpload({ onSaved }: { onSaved: () => void }) {
  const { t } = useI18n();
  const [message, setMessage] = useState<MessageKey | null>(null),
    [busy, setBusy] = useState(false);
  const upload = async (e: ChangeEvent<HTMLInputElement>, kind: 'catalogs' | 'fx') => {
    setBusy(true);
    setMessage(null);
    try {
      const value = await selectedJson(e);
      if (value === undefined) return;
      await api('POST', `/api/usage/${kind}`, value);
      setMessage('usage.saved');
      onSaved();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="usage-section">
      <h2>{t('usage.pricingImport')}</h2>
      <p>{t('usage.pricingHelp')}</p>
      <div className="usage-controls">
        <label className="field">
          <span>{t('usage.catalog')}</span>
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(e) => upload(e, 'catalogs')}
          />
        </label>
        <label className="field">
          <span>{t('usage.fx')}</span>
          <input
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={(e) => upload(e, 'fx')}
          />
        </label>
      </div>
      <p role="status">{message ? t(message) : ''}</p>
    </section>
  );
}
