/**
 * 算力账本（2026-10-25 重做）：数据来自 tokens.ci 的公开主页，服务端代读并缓存（/api/tokens-ci）。
 * 只留最一目了然的：累计 Token 的主数字、灰阶日历（每天一格，越用越黑）、选中那天的明细、近 30 天，
 * 以及招牌——把那一天打印成一张账单。金额是按 API 价格估算的等值，不是实际账单。
 */
import type { TokensCiDay, TokensCiResponse } from '@moriium-dashboard/protocol/tokens-ci-types';
import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { zoneStyle } from '../components/Zone.tsx';
import { useI18n } from '../i18n/i18n.tsx';
import { ApiError, api } from './api.ts';
import { useResource } from './data.tsx';
import {
  activeAverage,
  addDays,
  calendarWeeks,
  clientName,
  compact,
  integer,
  lastDays,
  localToday,
  ratio,
  streakEnding,
  usd,
  zoneScale,
} from './ledger-format.ts';
import { ReceiptDialog } from './Receipt.tsx';
import { type ReceiptLabels, type ReceiptMode, receiptRows } from './receipt-draw.ts';
import { PageHeader } from './ui.tsx';
import { BandHead, LabeledRow } from './ZoneSections.tsx';
import './ledger.css';

/** 客户端在柱状图里的灰：Claude Code 深、Codex CLI 中、其余浅。 */
const CLIENT_ZONE: Record<string, number> = { claude: 2, codex: 6 };
const clientZone = (client: string) => CLIENT_ZONE[client] ?? 4;

export function UsagePage() {
  const { t } = useI18n();
  const [nonce, setNonce] = useState(0);
  const { data, error, loading } = useResource<TokensCiResponse>(
    nonce ? `/api/tokens-ci?refresh=1&n=${nonce}` : '/api/tokens-ci',
  );
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  if (!data)
    return (
      <>
        <PageHeader title={t('usage.title')} />
        <p className="loading-line">{t(error ? 'ledger.loadFailed' : 'common.loading')}</p>
      </>
    );
  if (!data.username || !data.profile)
    return (
      <div className="page">
        <section className="block" aria-labelledby="h-ledger">
          <BandHead title={t('usage.title')} level={1} id="h-ledger" numbers={[]}>
            <p className="head-note">{data.error ? t(`ledger.error.${data.error}`) : t('ledger.setup')}</p>
          </BandHead>
          <SourceForm data={data} busy={loading} onChanged={refresh} />
        </section>
      </div>
    );
  return <Ledger data={data} busy={loading} onRefresh={refresh} />;
}

function Ledger({ data, busy, onRefresh }: { data: TokensCiResponse; busy: boolean; onRefresh: () => void }) {
  const { t, locale, relative, fullDate } = useI18n();
  const profile = data.profile;
  const days = profile?.days ?? [];
  const today = useMemo(() => localToday(), []);
  const latest = days.at(-1)?.date ?? today;
  const [selected, setSelected] = useState(latest);
  const [printing, setPrinting] = useState(0);
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const average = useMemo(() => activeAverage(days), [days]);
  const day = byDate.get(selected) ?? null;
  const now = new Date();
  if (!profile) return null;

  const dateText = (date: string) => fullDate(new Date(`${date}T12:00:00`));
  const dayTitle = (date: string) =>
    new Intl.DateTimeFormat(locale, {
      month: 'long',
      day: 'numeric',
      weekday: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${date}T12:00:00Z`));
  const streakNow = streakEnding(days, byDate.has(today) ? today : addDays(today, -1));
  const last30 = lastDays(days, today, 30);
  const cost30 = last30.reduce((n, r) => n + (r.day?.cost ?? 0), 0);

  return (
    <>
      <section className="ledger-first" aria-labelledby="h-ledger">
        <p className="dateline">
          tokens.ci · @{profile.username}
          {profile.rank ? ` · ${t('ledger.rank', { n: profile.rank })}` : ''}
          {profile.updatedAt
            ? ` · ${t('ledger.updated', { when: relative(Date.parse(profile.updatedAt), now) })}`
            : ''}
        </p>
        <h1 className="hero page-title" id="h-ledger" tabIndex={-1}>
          <span className="big">{compact(profile.totals.tokens, locale, 3)}</span>
          <span className="unit">Token</span>
          <span className="split">
            {t('ledger.heroSplit', {
              cost: usd(profile.totals.cost, locale, true),
              days: profile.totals.activeDays,
              streak: streakNow,
            })}
          </span>
        </h1>
        <p className="ledger-estimate">{t('ledger.estimate')}</p>
      </section>

      <div className="page">
        <section className="block" aria-labelledby="h-activity">
          <BandHead
            title={t('ledger.activity')}
            level={2}
            id="h-activity"
            numbers={[
              [t('ledger.activeDays'), profile.totals.activeDays],
              [t('ledger.cost30'), usd(cost30, locale, true)],
            ]}
          />
          <div className="g">
            <div className="main wide">
              <Calendar days={days} today={today} selected={selected} onSelect={setSelected} />
            </div>
          </div>
        </section>

        <section className="block" aria-labelledby="h-day">
          <BandHead
            title={dayTitle(selected)}
            level={2}
            id="h-day"
            numbers={
              day
                ? [
                    [t('ledger.cost'), usd(day.cost, locale)],
                    [t('ledger.messages'), integer(day.messages, locale)],
                  ]
                : []
            }
          />
          {day ? (
            <DayDetail day={day} average={average.tokens} onPrint={() => setPrinting((n) => n + 1)} />
          ) : (
            <div className="g">
              <p className="main empty-line">{t('ledger.noUsage')}</p>
            </div>
          )}
        </section>

        <section className="block" aria-labelledby="h-recent30">
          <BandHead
            title={t('ledger.recent')}
            level={2}
            id="h-recent30"
            numbers={[[t('ledger.activeDays'), last30.filter((r) => r.day).length]]}
          />
          <div className="g">
            <div className="main wide">
              <RecentBars rows={last30} selected={selected} onSelect={setSelected} />
            </div>
          </div>
        </section>

        <section className="block" aria-labelledby="h-source">
          <BandHead title={t('ledger.source')} level={2} id="h-source" numbers={[]} />
          <SourceForm data={data} busy={busy} onChanged={onRefresh} />
        </section>
      </div>

      {printing && day ? (
        <ReceiptFor
          key={`${selected}:${printing}`}
          day={day}
          days={days}
          rank={profile.rank}
          dateText={dateText(selected)}
          average={average}
          onClose={() => setPrinting(0)}
        />
      ) : null}
    </>
  );
}

/** 灰阶日历：每列一周，一格一天。方向键在日子之间移动，回车或点击选中。 */
function Calendar({
  days,
  today,
  selected,
  onSelect,
}: {
  days: TokensCiDay[];
  today: string;
  selected: string;
  onSelect: (date: string) => void;
}) {
  const { t, locale } = useI18n();
  const { weeks, months } = useMemo(() => calendarWeeks(days, today), [days, today]);
  const zone = useMemo(() => zoneScale(days), [days]);
  const cells = useRef(new Map<string, HTMLButtonElement>());
  const wrap = useRef<HTMLElement>(null);
  // 窄屏放不下全部周时，默认露出最近的几周。
  useEffect(() => {
    const el = wrap.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const first = weeks[0]?.[0]?.date ?? today;
  const monthName = (m: number) =>
    new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' }).format(
      new Date(Date.UTC(2026, m - 1, 15)),
    );
  const dayLabel = (date: string) =>
    new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${date}T12:00:00Z`),
    );

  useEffect(() => {
    if (focusDate) cells.current.get(focusDate)?.focus();
  }, [focusDate]);

  const move = (e: KeyboardEvent, date: string) => {
    const step: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 };
    let next: string | null = null;
    if (e.key in step) next = addDays(date, step[e.key] ?? 0);
    else if (e.key === 'Home') next = first;
    else if (e.key === 'End') next = today;
    if (!next) return;
    e.preventDefault();
    if (next < first || next > today) return;
    onSelect(next);
    setFocusDate(next);
  };

  return (
    <figure className="heat-wrap" ref={wrap}>
      <fieldset className="heat" style={{ '--weeks': weeks.length } as CSSProperties}>
        <legend className="sr-only">{t('ledger.calendarLabel')}</legend>
        {months.map((m) => (
          <span key={`m${m.col}`} className="heat-month" style={{ gridColumn: m.col + 2 }} aria-hidden="true">
            {monthName(m.month)}
          </span>
        ))}
        {[0, 2, 4].map((i) => (
          <span key={`d${i}`} className="heat-wday" style={{ gridRow: i + 2 }} aria-hidden="true">
            {new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
              new Date(Date.UTC(2026, 9, 19 + i)),
            )}
          </span>
        ))}
        {weeks.map((week, w) =>
          week.map((cell, i) => {
            const style = { gridColumn: w + 2, gridRow: i + 2 } as CSSProperties;
            if (cell.future)
              return <span key={cell.date} className="heat-cell future" style={style} aria-hidden="true" />;
            const z = cell.day ? zone(cell.day.tokens) : null;
            const label = cell.day
              ? t('ledger.cellLabel', { date: dayLabel(cell.date), tokens: compact(cell.day.tokens, locale) })
              : t('ledger.cellEmpty', { date: dayLabel(cell.date) });
            return (
              <button
                key={cell.date}
                ref={(el) => {
                  if (el) cells.current.set(cell.date, el);
                  else cells.current.delete(cell.date);
                }}
                type="button"
                className={`heat-cell${z == null ? ' blank' : ''}`}
                style={{ ...style, ...(z != null ? zoneStyle(z) : {}) }}
                tabIndex={cell.date === selected ? 0 : -1}
                aria-pressed={cell.date === selected}
                aria-label={label}
                title={label}
                onClick={() => onSelect(cell.date)}
                onKeyDown={(e) => move(e, cell.date)}
              />
            );
          }),
        )}
      </fieldset>
      <figcaption className="heat-legend">
        <span>{t('ledger.less')}</span>
        {[8, 6, 4, 2, 1].map((z) => (
          <i key={z} style={zoneStyle(z)} aria-hidden="true" />
        ))}
        <span>{t('ledger.more')}</span>
      </figcaption>
    </figure>
  );
}

function DayDetail({ day, average, onPrint }: { day: TokensCiDay; average: number; onPrint: () => void }) {
  const { t, locale } = useI18n();
  const x = ratio(day.tokens, average);
  return (
    <div className="g band ledger-day">
      <div className="main">
        <p className="ledger-day-total">
          <span className="n">{compact(day.tokens, locale)}</span>
          <span className="u">Token</span>
        </p>
        {x != null ? <p className="kicker">{t('ledger.vsAverage', { x })}</p> : null}
        <ul className="ledger-clients">
          {day.clients.map((c) => (
            <li key={c.client}>
              <p className="ledger-client">
                <i style={zoneStyle(clientZone(c.client))} aria-hidden="true" />
                <span className="name">{clientName(c.client)}</span>
                <span className="tok">{compact(c.tokens, locale)}</span>
                <span className="cost">{usd(c.cost, locale)}</span>
              </p>
              <ul className="ledger-models">
                {c.models.map((m) => (
                  <li key={m.model}>
                    <span className="name">{m.model}</span>
                    <span className="tok">{compact(m.tokens, locale)}</span>
                    <span className="cost">{usd(m.cost, locale)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
      <div className="rail ledger-print">
        <button type="button" className="btn btn-primary" onClick={onPrint}>
          {t('ledger.print')}
        </button>
      </div>
    </div>
  );
}

/** 近 30 天：每天一根柱，按客户端分灰叠起来；点柱子选中那天。 */
function RecentBars({
  rows,
  selected,
  onSelect,
}: {
  rows: { date: string; day: TokensCiDay | null }[];
  selected: string;
  onSelect: (date: string) => void;
}) {
  const { t, locale } = useI18n();
  const max = Math.max(1, ...rows.map((r) => r.day?.tokens ?? 0));
  const clients = [...new Set(rows.flatMap((r) => r.day?.clients.map((c) => c.client) ?? []))];
  const short = (date: string) =>
    new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
      new Date(`${date}T12:00:00Z`),
    );
  return (
    <figure className="bars-wrap">
      <p className="bars-max" aria-hidden="true">
        {compact(max, locale)}
      </p>
      <fieldset className="bars">
        <legend className="sr-only">{t('ledger.recentLabel')}</legend>
        {rows.map((r) => {
          const total = r.day?.tokens ?? 0;
          const label = r.day
            ? t('ledger.cellLabel', { date: short(r.date), tokens: compact(total, locale) })
            : t('ledger.cellEmpty', { date: short(r.date) });
          return (
            <button
              key={r.date}
              type="button"
              className={`bar${r.date === selected ? ' on' : ''}`}
              aria-pressed={r.date === selected}
              aria-label={label}
              title={label}
              tabIndex={-1}
              onClick={() => onSelect(r.date)}
            >
              <span className="bar-fill" style={{ height: `${(total / max) * 100}%` }}>
                {r.day?.clients
                  .slice()
                  .sort((a, b) => clientZone(a.client) - clientZone(b.client))
                  .map((c) => (
                    <span key={c.client} style={{ flexGrow: c.tokens, ...zoneStyle(clientZone(c.client)) }} />
                  ))}
              </span>
            </button>
          );
        })}
      </fieldset>
      <figcaption className="bars-axis">
        <span>{short(rows[0]?.date ?? '')}</span>
        <span className="bars-legend">
          {clients.map((c) => (
            <span key={c}>
              <i style={zoneStyle(clientZone(c))} aria-hidden="true" />
              {clientName(c)}
            </span>
          ))}
        </span>
        <span>{short(rows.at(-1)?.date ?? '')}</span>
      </figcaption>
    </figure>
  );
}

function SourceForm({
  data,
  busy,
  onChanged,
}: {
  data: TokensCiResponse;
  busy: boolean;
  onChanged: () => void;
}) {
  const { t, relative } = useI18n();
  const [value, setValue] = useState(data.username ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await api('PUT', '/api/tokens-ci/settings', { username: value });
      onChanged();
    } catch (err) {
      setMessage(
        err instanceof ApiError && err.code === 'invalid_username'
          ? t('ledger.error.invalid_username')
          : t('ledger.error.unavailable'),
      );
    } finally {
      setSaving(false);
    }
  };
  const status = data.stale
    ? t('ledger.stale', { when: data.fetchedAt ? relative(Date.parse(data.fetchedAt), new Date()) : '—' })
    : data.error
      ? t(`ledger.error.${data.error}`)
      : data.fetchedAt
        ? t('ledger.fetched', { when: relative(Date.parse(data.fetchedAt), new Date()) })
        : '';
  return (
    <LabeledRow label="tokens.ci">
      <form className="ledger-source" onSubmit={submit}>
        <label className="field">
          <span>{t('ledger.username')}</span>
          <input
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
            placeholder="GitHub"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button type="submit" className="btn" disabled={saving}>
          {t('ledger.save')}
        </button>
        {data.username ? (
          <button type="button" className="text-btn" onClick={onChanged} disabled={busy}>
            {busy ? t('common.loading') : t('ledger.refresh')}
          </button>
        ) : null}
        <p className="ix" role="status">
          {message ?? status}
        </p>
      </form>
    </LabeledRow>
  );
}

function ReceiptFor({
  day,
  days,
  rank,
  dateText,
  average,
  onClose,
}: {
  day: TokensCiDay;
  days: TokensCiDay[];
  rank: number | null;
  dateText: string;
  average: { tokens: number; cost: number };
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const issued = useMemo(() => new Date(), []);
  const issuedText = new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(issued);
  const streak = streakEnding(days, day.date);
  // 小票上的日期不带星期，和出单时间同一种写法。
  const billDate = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${day.date}T12:00:00Z`),
  );
  const rowsFor = useCallback(
    (mode: ReceiptMode) => {
      const labels: ReceiptLabels = {
        title: t('receipt.title'),
        tagline: t('receipt.tagline'),
        rank: t('receipt.rank'),
        date: t('receipt.date'),
        issued: t('receipt.issued'),
        costHead: t('receipt.costHead'),
        tokensHead: t('receipt.tokensHead'),
        estimate: t('receipt.estimate'),
        tokensSub: t('receipt.tokensSub', {
          cost: usd(day.cost, locale),
          messages: integer(day.messages, locale),
        }),
        streak: t('receipt.streak'),
        streakValue: t('receipt.days', { n: streak }),
        messages: t('receipt.messages'),
        vsAverage: t('receipt.vsAverage'),
        clients: t('receipt.clients'),
        cost: t('receipt.cost'),
        tokens: t('receipt.tokens'),
        total: t('receipt.total'),
        input: t('receipt.input'),
        output: t('receipt.output'),
        cacheRate: t('receipt.cacheRate'),
        footer: 'moriium.com/dashboard',
        footerSub: t('receipt.footerSub'),
      };
      return receiptRows(
        {
          day,
          rank,
          dateText: billDate,
          issuedText,
          ratio: ratio(
            mode === 'cost' ? day.cost : day.tokens,
            mode === 'cost' ? average.cost : average.tokens,
          ),
        },
        labels,
        mode,
        locale,
      );
    },
    [t, locale, day, rank, billDate, issuedText, streak, average],
  );
  return (
    <ReceiptDialog
      rowsFor={rowsFor}
      label={t('receipt.alt', {
        date: dateText,
        cost: usd(day.cost, locale),
        tokens: compact(day.tokens, locale),
        messages: integer(day.messages, locale),
      })}
      fileName={`token-bill-${day.date}.png`}
      onClose={onClose}
    />
  );
}
