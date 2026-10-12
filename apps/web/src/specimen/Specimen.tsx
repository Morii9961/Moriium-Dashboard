/**
 * 设计样张第二轮（P2.1）。
 *
 * 2026-10-12 Morii 已定：字体方案 A、等宽 IBM Plex Mono、强调色「雾蓝 · 安静」、阶段轴圆点、
 * 状态色沿用、日文敬体、中英文之间加空格。这一页只把还没定的三项做成可切换：
 * 背景、中日文字体、项目卡片。
 */
import { type CheckResult, checkSnapshot, PRESET_PROJECTS } from '@moriium-dashboard/protocol';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import dashboardSnapshot from '../../../../docs/status/project-status.json?raw';
import { contrast, toHex } from '../design/color.ts';
import {
  BACKDROP_LABELS,
  BACKDROPS,
  type Backdrop,
  CONTRAST_PAIRS,
  type ColorTokens,
  type Theme,
  tokensFor,
} from '../design/tokens.ts';
import { DEMO_REGISTRY, demoSnapshots } from './demo-snapshots.ts';
import { type CardItem, ProgressCard } from './ProgressCard.tsx';
import { EvidenceTag, LineMap, MilestoneGrid, StatusMark } from './parts.tsx';

type ZhFont = 'misans' | 'noto';
type JaFont = 'zen' | 'line' | 'plex';

const REGISTRY = [...PRESET_PROJECTS, ...DEMO_REGISTRY];
const SPECIMEN_ENDPOINT = '/__specimen/snapshots';

/** 地址栏参数：截图时固定选项；?demo 时不读本机真实快照（公开截图只用演示数据）。 */
const params = new URLSearchParams(window.location.search);
const DEMO_ONLY = params.has('demo');
function param<T extends string>(name: string, allowed: readonly T[]): T | undefined {
  const v = params.get(name);
  return allowed.find((a) => a === v);
}

const ZH_LABELS: Record<ZhFont, string> = { misans: 'MiSans + 霞鹜文楷', noto: '思源（第一轮）' };
const JA_LABELS: Record<JaFont, string> = {
  zen: 'Zen 角ゴシック + しっぽり明朝',
  line: 'LINE Seed JP + Klee One',
  plex: 'IBM Plex Sans JP（第一轮）',
};

const DECIDED = [
  '字体方案 A：IBM Plex Sans、Source Serif 4',
  '等宽 IBM Plex Mono',
  '强调色 雾蓝 · 安静',
  '阶段轴 圆点',
  '状态色 沿用',
  '日文 敬体',
  '中英文之间 加空格',
];

async function load(fileName: string, bytes: Uint8Array, sourceLabel: string): Promise<CardItem | string> {
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
  const [items, setItems] = useState<CardItem[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [realCount, setRealCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const enc = new TextEncoder();
      const out: (CardItem | string)[] = [];
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
      setItems(out.filter((x): x is CardItem => typeof x !== 'string'));
      setProblems(out.filter((x): x is string => typeof x === 'string'));
      setRealCount(real.length);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return { items, problems, realCount };
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
}: {
  theme: Theme;
  backdrop: Backdrop;
  sample: CardItem | undefined;
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
        </span>
        <span className="mono">
          画布 {toHex(tokens.canvas)} · 卡片 {toHex(tokens.surface)}
        </span>
      </figcaption>
    </figure>
  );
}

function FontPanel({ zh, ja, label }: { zh?: ZhFont; ja?: JaFont; label: string }) {
  return (
    <figure className="fontpanel" data-zh={zh} data-ja={ja}>
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
  const [lightBackdrop, setLightBackdrop] = useState<Backdrop>(
    param('light', ['stone', 'mist'] as const) ?? 'stone',
  );
  const [darkBackdrop, setDarkBackdrop] = useState<Backdrop>(
    param('dark', ['ink', 'dusk'] as const) ?? 'ink',
  );
  const [zh, setZh] = useState<ZhFont>(param('zh', ['misans', 'noto'] as const) ?? 'misans');
  const [ja, setJa] = useState<JaFont>(param('ja', ['zen', 'line', 'plex'] as const) ?? 'zen');
  const { items, problems, realCount } = useSnapshots();
  const now = useMemo(() => new Date(), []);

  const backdrop = theme === 'light' ? lightBackdrop : darkBackdrop;
  const tokens = tokensFor(theme, backdrop);

  useEffect(() => {
    const root = document.documentElement;
    // 用 CSSOM 设置变量：严格 CSP 下允许。P2.2 定稿后改为静态 CSS。
    for (const [k, v] of Object.entries(cssVars(tokens))) root.style.setProperty(k, String(v));
    root.dataset.theme = theme;
    root.dataset.zh = zh;
    root.dataset.ja = ja;
    root.style.colorScheme = theme;
  }, [tokens, theme, zh, ja]);

  const sample = items.find((i) => i.snapshot.stage === 'integration') ?? items[0];

  return (
    <>
      <a className="skip" href="#main">
        跳到正文
      </a>

      <header className="masthead">
        <div className="masthead-inner">
          <p className="eyebrow">Moriium Dashboard · 设计样张 · 第二轮</p>
          <h1 className="title">项目做到哪里，一眼看清</h1>
          <p className="lede">
            按你上一轮的意见改了背景、中日文字体和项目卡片。已经定下的不再给选项；还没定的三项，在下面切换比较。
          </p>
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

      <section className="controls" aria-label="待你拍板的选项">
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
        <Choice
          legend="浅色背景"
          name="light"
          value={lightBackdrop}
          onChange={setLightBackdrop}
          options={BACKDROPS.light.map((b) => [b, BACKDROP_LABELS[b]])}
        />
        <Choice
          legend="深色背景"
          name="dark"
          value={darkBackdrop}
          onChange={setDarkBackdrop}
          options={BACKDROPS.dark.map((b) => [b, BACKDROP_LABELS[b]])}
        />
        <Choice
          legend="中文"
          name="zh"
          value={zh}
          onChange={setZh}
          options={(Object.keys(ZH_LABELS) as ZhFont[]).map((k) => [k, ZH_LABELS[k]])}
        />
        <Choice
          legend="日文"
          name="ja"
          value={ja}
          onChange={setJa}
          options={(Object.keys(JA_LABELS) as JaFont[]).map((k) => [k, JA_LABELS[k]])}
        />
      </section>

      <main id="main">
        <section className="section" aria-labelledby="s-cards">
          <div className="section-head">
            <p className="section-tag">待你拍板 · 项目卡片</p>
            <h2 id="s-cards">每张卡只回答四件事</h2>
            <p className="section-note">
              做到哪里、还差什么、下一步、等你几件。其余的放在详情里：鼠标停一下，或者用 Tab
              走到「详情」；手机上点「详情」。
              {realCount > 0
                ? ` 这里有 ${realCount} 个项目来自你本机的真实快照，只在你的浏览器里显示。`
                : ' 现在显示的是 Dashboard 自己的快照和演示数据。'}
            </p>
            {problems.length > 0 ? <p className="section-warn">没有显示：{problems.join('；')}</p> : null}
          </div>
          <div className="pcards">
            {items.map((item) => (
              <ProgressCard key={`${item.sourceLabel}-${item.snapshot.project_id}`} item={item} now={now} />
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="s-backdrop">
          <div className="section-head">
            <p className="section-tag">待你拍板 · 背景</p>
            <h2 id="s-backdrop">浅色压低亮度，深色换掉蓝黑</h2>
            <p className="section-note">
              四个候选并排，不受上面主题切换的影响。浅色亮度从 0.984 降到 0.95
              左右；「石」是带一点暖意的中性灰，不是米黄，「雾」偏冷。深色「墨」是带暖意的石墨，「夜雾」是更亮、更低饱和的蓝灰。
            </p>
          </div>
          <div className="backdrops">
            {(['stone', 'mist'] as const).map((b) => (
              <BackdropSample key={b} theme="light" backdrop={b} sample={sample} />
            ))}
            {(['ink', 'dusk'] as const).map((b) => (
              <BackdropSample key={b} theme="dark" backdrop={b} sample={sample} />
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="s-fonts">
          <div className="section-head">
            <p className="section-tag">待你拍板 · 中日文字体</p>
            <h2 id="s-fonts">标题有温度，正文要耐看</h2>
            <p className="section-note">
              拉丁字母仍是方案 A 的 IBM Plex Sans 与 Source Serif 4。中文正文换成
              MiSans，标题用霞鹜文楷（楷体，和日文的 Klee One
              同源）。日文给两组新候选，第一轮的写法放在最后作对照。快照内容一律按中文字形显示。
            </p>
          </div>
          <div className="fontpanels">
            <FontPanel zh="misans" label="中文 · MiSans + 霞鹜文楷" />
            <FontPanel zh="noto" label="中文 · 思源（第一轮）" />
            <FontPanel ja="zen" label="日文 · Zen 角ゴシック New + しっぽり明朝" />
            <FontPanel ja="line" label="日文 · LINE Seed JP + Klee One" />
            <FontPanel ja="plex" label="日文 · IBM Plex Sans JP（第一轮）" />
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
