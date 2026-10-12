/**
 * 设计样张第四轮（P2.1）。
 *
 * 已定（2026-10-12，Morii）：字体方案 A、IBM Plex Mono、强调色「雾蓝 · 安静」、阶段轴圆点、
 * 状态色沿用、日文敬体、中英文之间加空格、浅色背景「雾」、深色背景「夜」、中文 MiSans + 霞鹜文楷、
 * 日文 Murecho + Klee One、进度百分比的取法。
 * 待定：项目长条的第四版。
 */
import { type CheckResult, checkSnapshot, PRESET_PROJECTS } from '@moriium-dashboard/protocol';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import dashboardSnapshot from '../../../../docs/status/project-status.json?raw';
import { contrast, toHex } from '../design/color.ts';
import {
  BACKDROP_LABELS,
  type Backdrop,
  CONTRAST_PAIRS,
  type ColorTokens,
  type Theme,
  tokensFor,
} from '../design/tokens.ts';
import { DEMO_REGISTRY, demoSnapshots } from './demo-snapshots.ts';
import { ProjectStrip, type StripItem } from './ProjectStrip.tsx';
import { EvidenceTag, LineMap, MilestoneGrid, StatusMark } from './parts.tsx';

const REGISTRY = [...PRESET_PROJECTS, ...DEMO_REGISTRY];
const SPECIMEN_ENDPOINT = '/__specimen/snapshots';

/** 地址栏参数：截图时固定选项；?demo 时不读本机真实快照（公开截图只用演示数据）。 */
const params = new URLSearchParams(window.location.search);
const DEMO_ONLY = params.has('demo');
function param<T extends string>(name: string, allowed: readonly T[]): T | undefined {
  const v = params.get(name);
  return allowed.find((a) => a === v);
}

const DECIDED = [
  '字体方案 A',
  '等宽 IBM Plex Mono',
  '中文 MiSans + 霞鹜文楷',
  '强调色 雾蓝 · 安静',
  '浅色背景 雾',
  '深色背景 夜',
  '阶段轴 圆点',
  '状态色 沿用',
  '日文 Murecho + Klee One',
  '日文 敬体',
  '中英文之间 加空格',
  '进度 百分比',
];

async function load(fileName: string, bytes: Uint8Array, sourceLabel: string): Promise<StripItem | string> {
  const result: CheckResult = await checkSnapshot(bytes, { registry: REGISTRY });
  if (result.kind !== 'accepted')
    return `${fileName}：${result.kind === 'rejected' ? '无法导入' : '需要选择'}`;
  const a = result.meta.attribution;
  const who =
    a.agent === 'claude'
      ? 'Claude'
      : a.agent === 'codex'
        ? 'Codex'
        : a.agent === 'other'
          ? '其他 Agent'
          : null;
  return {
    name: REGISTRY.find((r) => r.id === result.snapshot.project_id)?.name ?? result.snapshot.project_name,
    snapshot: result.snapshot,
    utcMs: result.meta.snapshotAtUtcMs,
    offsetMinutes: result.meta.snapshotAtOffsetMinutes,
    attribution: who ? `报告来自 ${who}${a.source === 'branch' ? '（据分支推断）' : ''}` : '报告来自：未注明',
    sourceLabel,
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
        out.push(await load(f.fileName, bytes, '真实快照（本机）'));
      }
      out.push(await load('morii.dashboard', enc.encode(dashboardSnapshot), 'Dashboard 自己的快照'));
      for (const d of demoSnapshots(new Date()))
        out.push(await load(d.fileName, enc.encode(d.json), '演示数据'));
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

/** 把一套 token 写成 CSS 变量（--c-ink1、--c-border-weak……）。 */
function cssVars(tokens: ColorTokens): CSSProperties {
  const vars: Record<string, string> = {};
  for (const [role, value] of Object.entries(tokens)) {
    vars[`--c-${role.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`] = value;
  }
  return vars as CSSProperties;
}

function Choice<T extends string>({
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
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="choice">
      <legend>{legend}</legend>
      <div className="choice-options">
        {options.map(([v, label]) => (
          <label key={v} className="choice-option">
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function BackdropSample({
  theme,
  backdrop,
  sample,
  decided,
}: {
  theme: Theme;
  backdrop: Backdrop;
  sample: StripItem | undefined;
  decided?: boolean;
}) {
  const tokens = tokensFor(theme, backdrop);
  return (
    <figure className="backdrop">
      {/* 颜色变量只作用在样板区域；说明文字用页面本身的颜色。 */}
      <div className="backdrop-stage" style={cssVars(tokens)}>
        <p className="backdrop-name">{BACKDROP_LABELS[backdrop]}</p>
        {sample ? (
          <div className="backdrop-card">
            <p className="backdrop-card-title">{sample.name}</p>
            <LineMap stage={sample.snapshot.stage} size="compact" />
            <p className="backdrop-card-line">还差 3 个里程碑，其中 1 个受阻</p>
          </div>
        ) : null}
      </div>
      <figcaption>
        <span>
          {theme === 'light' ? '浅色' : '深色'} · {BACKDROP_LABELS[backdrop]}
          {decided ? '（已定）' : ''}
        </span>
        <span className="mono">
          画布 {toHex(tokens.canvas)} · 卡片 {toHex(tokens.surface)}
        </span>
      </figcaption>
    </figure>
  );
}

function FontPanel({ zh, ja, label }: { zh?: boolean; ja?: boolean; label: string }) {
  return (
    <figure className="fontpanel">
      <figcaption className="fontpanel-label">{label}</figcaption>
      {zh ? (
        <div lang="zh-Hans">
          <p className="fontpanel-heading">Moriium 主站 · 需要你决定</p>
          <p className="fontpanel-body">
            快照是证词，不是事实本身。Dashboard 展示时始终带着谁说的、什么时候说的、依据是什么。还差 3
            个里程碑，其中 1 个受阻；下一步是核实 ICP 接入条件。
          </p>
          <p className="fontpanel-small">报告来自 Codex · main @ fd48f88 · 快照 10月11日 22:45</p>
        </div>
      ) : null}
      {ja ? (
        <div lang="ja">
          <p className="fontpanel-heading">判断が必要な項目 · Enouia Runtime</p>
          <p className="fontpanel-body">
            スナップショットは証言であり、事実そのものではありません。表示しているのは取り込んだ時刻で、稼働状況ではありません。W01–W05
            の受け入れはまだ終わっていません。
          </p>
          <p className="fontpanel-small">報告から 16 日 · 自己申告 · 受け入れ済み</p>
        </div>
      ) : null}
    </figure>
  );
}

export function Specimen() {
  const [theme, setTheme] = useState<Theme>(
    () =>
      param('theme', ['light', 'dark'] as const) ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );
  const { items, problems } = useSnapshots();
  const now = useMemo(() => new Date(), []);

  const backdrop: Backdrop = theme === 'light' ? 'mist' : 'night';
  const tokens = tokensFor(theme, backdrop);

  useEffect(() => {
    const root = document.documentElement;
    // 用 CSSOM 设置变量：严格 CSP 下允许。P2.2 定稿后改为静态 CSS。
    for (const [k, v] of Object.entries(cssVars(tokens))) root.style.setProperty(k, String(v));
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  }, [tokens, theme]);

  const sample = items.find((i) => i.snapshot.stage === 'integration') ?? items[0];

  return (
    <>
      <a className="skip" href="#main">
        跳到正文
      </a>

      <header className="masthead">
        <div className="masthead-inner">
          <p className="eyebrow">Moriium Dashboard · 设计样张 · 第四轮</p>
          <h1 className="title">项目做到哪里，一眼看清</h1>
          <ul className="decided" aria-label="已定">
            {DECIDED.map((d) => (
              <li key={d}>
                <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M3.5 8.5l3 3 6-7"
                    fill="none"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {d}
              </li>
            ))}
          </ul>
        </div>
      </header>

      <section className="controls" aria-label="预览选项">
        <Choice
          legend="主题"
          name="theme"
          value={theme}
          onChange={setTheme}
          options={[
            ['light', '浅色'],
            ['dark', '深色'],
          ]}
        />
      </section>

      <main id="main">
        <section className="section section-wide" aria-labelledby="s-strips">
          <div className="section-head">
            <p className="section-tag">待你拍板 · 项目长条</p>
            <h2 id="s-strips">一行看完一个项目</h2>
            {problems.length > 0 ? <p className="section-warn">没有显示：{problems.join('；')}</p> : null}
          </div>

          <div className="strips">
            {items.map((item) => (
              <ProjectStrip key={`${item.sourceLabel}-${item.snapshot.project_id}`} item={item} now={now} />
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="s-backdrop">
          <div className="section-head">
            <p className="section-tag">已定 · 背景</p>
            <h2 id="s-backdrop">浅色「雾」，深色「夜」</h2>
          </div>
          <div className="backdrops">
            <BackdropSample theme="light" backdrop="mist" sample={sample} decided />
            <BackdropSample theme="dark" backdrop="night" sample={sample} decided />
          </div>
        </section>

        <section className="section" aria-labelledby="s-fonts">
          <div className="section-head">
            <p className="section-tag">已定 · 字体</p>
            <h2 id="s-fonts">中文与日文同一种气质</h2>
          </div>
          <div className="fontpanels">
            <FontPanel zh label="中文 · MiSans + 霞鹜文楷" />
            <FontPanel ja label="日文 · Murecho + Klee One" />
          </div>
        </section>

        <section className="section" aria-labelledby="s-status">
          <div className="section-head">
            <p className="section-tag">已定 · 状态表达</p>
            <h2 id="s-status">每个状态都有图形和文字</h2>
          </div>
          <div className="statusrow">
            <ul className="plain" aria-label="里程碑状态">
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
            <ul className="plain tags" aria-label="证据与验收">
              {(['self', 'evidence', 'test', 'reported', 'accepted', 'rejected'] as const).map((k) => (
                <li key={k}>
                  <EvidenceTag kind={k} />
                </li>
              ))}
            </ul>
          </div>
          <details className="contrast">
            <summary>对比度检查（当前主题与背景，全部达标）</summary>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">用途</th>
                  <th scope="col">前景 / 背景</th>
                  <th scope="col" className="num">
                    对比度
                  </th>
                  <th scope="col" className="num">
                    要求
                  </th>
                </tr>
              </thead>
              <tbody>
                {CONTRAST_PAIRS.map(([fg, bg, min, label]) => {
                  const r = contrast(tokens[fg], tokens[bg]);
                  return (
                    <tr key={`${fg}-${bg}`}>
                      <td>{label}</td>
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
