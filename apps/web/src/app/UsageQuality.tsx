import type { UsageDatasetObservations } from '@moriium-dashboard/protocol/usage';
import {
  USAGE_COUNT_KEYS,
  USAGE_QUALITY_UNITS,
  type UsageQuality,
} from '@moriium-dashboard/protocol/usage-types';
import { useI18n } from '../i18n/i18n.tsx';
import type { MessageKey } from '../i18n/messages/zh-Hans.ts';
import { usageNumber } from './usage-format.ts';

function Quality({ value }: { value: UsageQuality | undefined }) {
  const { t, locale } = useI18n();
  if (!value || value.state === 'not_reported') return <span>{t('usage.qualityUnknown')}</span>;
  if (!value.reasons.length) return <span>{t('usage.qualityClear')}</span>;
  return (
    <ul className="usage-reasons">
      {value.reasons.map((r) => (
        <li key={r.code}>
          {t(`usage.quality.${r.code}`)} · {usageNumber(r.occurrences, locale)}{' '}
          {t(`usage.unit.${USAGE_QUALITY_UNITS[r.code]}` as MessageKey)}
        </li>
      ))}
    </ul>
  );
}

export function UsageQualityPanel({
  snapshots,
  days,
  rows,
  observations,
}: {
  snapshots: { import_hash: string; quality?: UsageQuality }[];
  days: { date: string; quality?: UsageQuality }[];
  rows: { date: string; model: string; effort: string; quality?: UsageQuality }[];
  observations: UsageDatasetObservations | undefined;
}) {
  const { t, locale } = useI18n();
  return (
    <section className="usage-section usage-quality">
      <h2>{t('usage.qualityTitle')}</h2>
      <p>{t('usage.qualityHelp')}</p>
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: The table is horizontally scrollable by keyboard. */}
      <section className="usage-table-wrap" tabIndex={0} aria-label={t('usage.qualityTitle')}>
        <table>
          <thead>
            <tr>
              <th scope="col">{t('usage.qualityScope')}</th>
              <th scope="col">{t('usage.reason')}</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((s) => (
              <tr key={s.import_hash}>
                <th scope="row">
                  {t('usage.snapshotScope')}
                  <span className="usage-hash">{s.import_hash}</span>
                </th>
                <td>
                  <Quality value={s.quality} />
                </td>
              </tr>
            ))}
            {days.map((d) => (
              <tr key={d.date}>
                <th scope="row">
                  {t('usage.dayScope')} · {d.date}
                </th>
                <td>
                  <Quality value={d.quality} />
                </td>
              </tr>
            ))}
            {rows.map((r, ordinal) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: Ordinals identify rows within this immutable API response, including repeated model/effort dimensions.
              <tr key={ordinal}>
                <th scope="row">
                  {t('usage.rowScope')} {ordinal + 1} · {r.date} · {r.model} · {r.effort}
                </th>
                <td>
                  <Quality value={r.quality} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <h3>{t('usage.unallocatedTitle')}</h3>
      <p>{t('usage.unallocatedHelp')}</p>
      {observations?.import_hash ? <p className="usage-hash">SHA-256 {observations.import_hash}</p> : null}
      <p>
        {t(
          observations?.unallocated_state === 'reported'
            ? 'usage.unallocatedReported'
            : 'usage.qualityUnknown',
        )}
      </p>
      {observations?.quality ? <Quality value={observations.quality} /> : null}
      {observations?.unallocated.length ? (
        /* biome-ignore lint/a11y/noNoninteractiveTabindex: The table is horizontally scrollable by keyboard. */
        <section className="usage-table-wrap" tabIndex={0} aria-label={t('usage.unallocatedTitle')}>
          <table>
            <thead>
              <tr>
                <th scope="col">{t('usage.observedDate')}</th>
                <th scope="col">{t('usage.model')}</th>
                <th scope="col">{t('usage.effort')}</th>
                <th scope="col">{t('usage.categories')}</th>
                <th scope="col">{t('usage.reason')}</th>
              </tr>
            </thead>
            <tbody>
              {observations.unallocated.map((r) => (
                <tr key={JSON.stringify(r)}>
                  <th scope="row">
                    {r.observed_date ?? '—'}
                    <br />
                    {t(`usage.time.${r.time_basis}`)}
                  </th>
                  <td>
                    {r.provider} · {r.model}
                  </td>
                  <td>
                    {r.effort}
                    {r.effort_evidence === 'inferred' ? ` · ${t('usage.inferredShort')}` : ''}
                  </td>
                  <td>
                    <dl className="usage-counts">
                      {USAGE_COUNT_KEYS.map((k) => (
                        <div key={k}>
                          <dt>{t(`usage.count.${k}`)}</dt>
                          <dd>{usageNumber(r.counts[k], locale)}</dd>
                        </div>
                      ))}
                    </dl>
                  </td>
                  <td>
                    <Quality value={r.quality} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </section>
  );
}
