/**
 * 设计基线页（P2.2）。P2.1 样张的决定都已定稿，这一页改为展示定稿的设计：
 * 线路总图（招牌元素）、项目长条、颜色、字体、状态表达和对比度。
 * 主题和界面语言可以在顶栏切换，用的是正式的主题模块和三语框架。
 */
import { type CheckResult, checkSnapshot, PRESET_PROJECTS } from '@moriium-dashboard/protocol';
import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import dashboardSnapshot from '../../../../docs/status/project-status.json?raw';
import { contrast, toHex } from '../design/color.ts';
import { BACKDROP_NAME, CONTRAST_PAIRS, type ColorTokens, type Theme, tokensFor } from '../design/tokens.ts';
import { useI18n } from '../i18n/i18n.tsx';
import { LOCALE_NAMES, LOCALES, type Locale } from '../i18n/locale.ts';
import type { MessageKey } from '../i18n/messages/zh-Hans.ts';
import { readThemePref, resolveTheme, setThemePref, THEME_PREFS, type ThemePref } from '../theme/theme.ts';
import { DEMO_REGISTRY, demoSnapshots } from './demo-snapshots.ts';
import { figureOf, type Origin, ProjectStrip, type StripItem } from './ProjectStrip.tsx';
import { EvidenceTag, MilestoneGrid, StatusMark } from './parts.tsx';
import { type MapLine, TransitMap } from './TransitMap.tsx';

const REGISTRY = [...PRESET_PROJECTS, ...DEMO_REGISTRY];
const SPECIMEN_ENDPOINT = '/__specimen/snapshots';

/** 地址栏参数：?demo 时不读本机真实快照（公开截图只用演示数据）。 */
const DEMO_ONLY = new URLSearchParams(window.location.search).has('demo');

async function load(fileName: string, bytes: Uint8Array, origin: Origin): Promise<StripItem | string> {
  const result: CheckResult = await checkSnapshot(bytes, { registry: REGISTRY });
  if (result.kind !== 'accepted') return fileName;
  const a = result.meta.attribution;
  const id = result.snapshot.project_id;
  return {
    anchor: `p-${origin}-${id.replace(/[^a-z0-9]+/gi, '-')}`,
    name: REGISTRY.find((r) => r.id === id)?.name ?? result.snapshot.project_name,
    snapshot: result.snapshot,
    utcMs: result.meta.snapshotAtUtcMs,
    offsetMinutes: result.meta.snapshotAtOffsetMinutes,
    agent: a.agent === 'claude' || a.agent === 'codex' || a.agent === 'other' ? a.agent : null,
    agentInferred: a.source === 'branch',
    origin,
  };
}

function useSnapshots() {
  const [items, setItems] = useState<StripItem[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const enc = new TextEncoder();
      const out: (StripItem | string)[] = [];
      let real: { fileName: string; base64: string }[] = [];
      if (!DEMO_ONLY) {
        try {
          const res = await fetch(SPECIMEN_ENDPOINT);
          if (res.ok) real = await res.json();
        } catch {
          real = [];
        }
      }
      for (const f of real) {
        const bytes = Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0));
        out.push(await load(f.fileName, bytes, 'real'));
      }
      out.push(await load('morii.dashboard', enc.encode(dashboardSnapshot), 'self'));
      for (const d of demoSnapshots(new Date())) out.push(await load(d.fileName, enc.encode(d.json), 'demo'));
      if (cancelled) return;
      setItems(out.filter((x): x is StripItem => typeof x !== 'string'));
      setProblems(out.filter((x): x is string => typeof x === 'string'));
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return { items, problems };
}

/** 跟随系统时，系统主题变了也要更新页面上显示的色值。 */
function useResolvedTheme(pref: ThemePref): Theme {
  const [system, setSystem] = useState<Theme>(() => resolveTheme('system'));
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystem(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return pref === 'system' ? system : pref;
}

function Segmented<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
}: {
  legend: string;
  name: string;
  value: T;
  options: [T, string][];
  onChange: (v: T, e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <fieldset className="seg-control">
      <legend className="sr-only">{legend}</legend>
      {options.map(([v, label]) => (
        <label key={v} className="seg-option">
          <input type="radio" name={name} value={v} checked={value === v} onChange={(e) => onChange(v, e)} />
          <span>{label}</span>
        </label>
      ))}
    </fieldset>
  );
}

const SWATCH_GROUPS: [MessageKey, (keyof ColorTokens)[]][] = [
  ['color.surface', ['canvas', 'surface', 'raised', 'borderWeak', 'border', 'ink3', 'ink2', 'ink1']],
  ['color.status', ['good', 'warn', 'serious', 'paused', 'unknown']],
  ['color.accent', ['accent', 'accentText', 'accentSoft', 'accentRing']],
];

const TYPE_SAMPLES = [
  {
    lang: 'zh-Hans',
    label: '中文 · MiSans + 霞鹜文楷',
    heading: 'Moriium 主站 · 功能成熟，等待上线',
    body: '快照是证词，不是事实本身。Dashboard 展示时始终带着谁说的、什么时候说的、依据是什么。还差 3 个里程碑，其中 1 个受阻。',
    small: 'main @ fd48f88 · 10月11日 22:45',
  },
  {
    lang: 'ja',
    label: '日本語 · Murecho + Klee One',
    heading: 'Enouia Runtime · 統合中',
    body: 'スナップショットは証言であり、事実そのものではありません。表示しているのは取り込んだ時刻で、稼働状況ではありません。',
    small: '報告から 16 日 · 自己申告',
  },
  {
    lang: 'en',
    label: 'English · IBM Plex Sans + Source Serif 4',
    heading: 'MoriMeta · in acceptance',
    body: 'A snapshot is testimony, not fact. Every number says who reported it, when, and on what evidence. Five milestones to go, two of them blocked.',
    small: 'main @ 9170cd8 · Oct 12, 13:12',
  },
] as const;

export function Specimen() {
  const { t, locale, setLocale, fullDate, list } = useI18n();
  const [themePref, setPref] = useState<ThemePref>(readThemePref);
  const theme = useResolvedTheme(themePref);
  const tokens = tokensFor(theme);
  const { items, problems } = useSnapshots();
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    document.title = `${t('hero.eyebrow')} · ${t('app.name')}`;
  }, [t]);

  // 线路总图和标题只算真实项目；没有真实快照（例如 ?demo）时才用演示数据。
  const mapItems = items.some((i) => i.origin !== 'demo') ? items.filter((i) => i.origin !== 'demo') : items;
  const lines: MapLine[] = mapItems.map((i) => {
    const f = figureOf(i.snapshot, t);
    return {
      anchor: i.anchor,
      name: i.name,
      stage: i.snapshot.stage,
      progress: f.text,
      progressLabel: f.label,
      pending: f.p.decisions + f.p.awaitingAcceptance,
    };
  });
  const pending = lines.reduce((n, l) => n + l.pending, 0);
  const acceptedDate = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(
    new Date(2026, 9, 9),
  );

  const onTheme = (pref: ThemePref, e: ChangeEvent<HTMLInputElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setThemePref(pref, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    setPref(pref);
  };

  return (
    <>
      <a className="skip" href="#main">
        {t('a11y.skip')}
      </a>

      <header className="topbar">
        <p className="brand">{t('app.name')}</p>
        <div className="topbar-controls">
          <Segmented
            legend={t('theme.legend')}
            name="theme"
            value={themePref}
            onChange={onTheme}
            options={THEME_PREFS.map((p) => [p, t(`theme.${p}`)])}
          />
          <Segmented
            legend={t('locale.legend')}
            name="locale"
            value={locale}
            onChange={(l: Locale) => setLocale(l)}
            options={LOCALES.map((l) => [l, LOCALE_NAMES[l]])}
          />
        </div>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <p className="hero-eyebrow">
          <span>{t('hero.eyebrow')}</span>
          <span aria-hidden="true">/</span>
          <time dateTime={now.toISOString().slice(0, 10)}>{fullDate(now)}</time>
        </p>
        <h1 className="hero-title" id="hero-title">
          {lines.length > 0 ? (
            <>
              <span>{t('hero.projects', { projects: lines.length })}</span>
              <span className="hero-title-second">{t('hero.pending', { pending })}</span>
            </>
          ) : null}
        </h1>
        <TransitMap lines={lines} />
      </section>

      <main id="main">
        <section className="section" aria-labelledby="s-strips">
          <div className="section-head">
            <p className="section-tag">{t('sec.projects.tag')}</p>
            <h2 id="s-strips">{t('sec.projects.title')}</h2>
            {problems.length > 0 ? (
              <p className="section-warn">{t('sec.problems', { list: list(problems) })}</p>
            ) : null}
          </div>
          <div className="strips">
            {items.map((item) => (
              <ProjectStrip key={item.anchor} item={item} now={now} />
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="s-color">
          <div className="section-head">
            <p className="section-tag">{t('sec.color.tag')}</p>
            <h2 id="s-color">{t('sec.color.title')}</h2>
          </div>
          <div className="palette">
            <p className="palette-name" aria-hidden="true">
              {BACKDROP_NAME[theme]}
            </p>
            {SWATCH_GROUPS.map(([group, roles]) => (
              <div key={group} className="palette-group">
                <h3 className="palette-title">{t(group)}</h3>
                <ul className="swatches">
                  {roles.map((role) => (
                    <li key={role} className="swatch">
                      <span
                        className="swatch-chip"
                        aria-hidden="true"
                        style={{
                          background: `var(--c-${role.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)})`,
                        }}
                      />
                      <span className="swatch-role mono">{role}</span>
                      <span className="swatch-hex mono">{toHex(tokens[role])}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="s-type">
          <div className="section-head">
            <p className="section-tag">{t('sec.type.tag')}</p>
            <h2 id="s-type">{t('sec.type.title')}</h2>
          </div>
          <div className="typepanels">
            {TYPE_SAMPLES.map((s) => (
              <figure key={s.lang} className="typepanel" lang={s.lang}>
                <figcaption className="typepanel-label">{s.label}</figcaption>
                <p className="typepanel-heading">{s.heading}</p>
                <p className="typepanel-body">{s.body}</p>
                <p className="typepanel-small mono">{s.small}</p>
              </figure>
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="s-status">
          <div className="section-head">
            <p className="section-tag">{t('sec.status.tag')}</p>
            <h2 id="s-status">{t('sec.status.title')}</h2>
          </div>
          <div className="statusrow">
            <ul className="plain">
              {(['done', 'in_progress', 'blocked', 'not_started', 'unknown'] as const).map((st) => (
                <li key={st} className="status-line">
                  <MilestoneGrid
                    milestones={[
                      {
                        id: st,
                        title: st,
                        status: st,
                        evidence_level: 'unknown',
                        evidence_refs: [],
                        human_acceptance: 'unknown',
                      },
                    ]}
                  />
                  <StatusMark status={st} />
                </li>
              ))}
            </ul>
            <ul className="plain tags">
              {(['self', 'evidence', 'test', 'reported', 'accepted', 'rejected'] as const).map((k) => (
                <li key={k}>
                  <EvidenceTag kind={k} date={acceptedDate} />
                </li>
              ))}
            </ul>
          </div>
          <details className="contrast">
            <summary>{t('contrast.summary')}</summary>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">{t('contrast.use')}</th>
                  <th scope="col">{t('contrast.pair')}</th>
                  <th scope="col" className="num">
                    {t('contrast.ratio')}
                  </th>
                  <th scope="col" className="num">
                    {t('contrast.min')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {CONTRAST_PAIRS.map(([fg, bg, min, label]) => {
                  const r = contrast(tokens[fg], tokens[bg]);
                  return (
                    <tr key={`${fg}-${bg}`}>
                      <td lang="zh-Hans">{label}</td>
                      <td className="mono">
                        {fg} / {bg}
                      </td>
                      <td className="num mono">{r.toFixed(2)}</td>
                      <td className="num">
                        {r >= min ? '✓' : '✕'} ≥ {min}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
        </section>
      </main>
    </>
  );
}
