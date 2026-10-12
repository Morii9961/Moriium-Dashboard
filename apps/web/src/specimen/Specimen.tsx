/**
 * 设计样张（P2.1）：用真实快照并排比较字体、颜色、状态表达和阶段轴画法，供 Morii 逐项拍板。
 * 这里的字体和色值都是候选，拍板之前不算定稿。
 */
import {
  type CheckResult,
  checkSnapshot,
  displayValue,
  PRESET_PROJECTS,
  type Snapshot,
  STAGE_LABELS,
} from '@moriium-dashboard/protocol';
import { useEffect, useMemo, useState } from 'react';
import dashboardSnapshot from '../../../../docs/status/project-status.json?raw';
import { contrast, toHex } from '../design/color.ts';
import {
  ACCENT_TOKENS,
  type AccentOption,
  COLOR_TOKENS,
  CONTRAST_PAIRS,
  type Theme,
} from '../design/tokens.ts';
import { freshness, headlineNextAction, summarizeProgress } from '../progress.ts';
import { DEMO_REGISTRY, demoSnapshots } from './demo-snapshots.ts';
import {
  type AxisVariant,
  EvidenceTag,
  MilestoneGrid,
  ProgressEstimate,
  STATUS_TEXT,
  StageAxis,
  StatusMark,
} from './parts.tsx';

type FontScheme = 'b' | 'a';
type Mono = 'geist' | 'jetbrains';

interface Loaded {
  fileName: string;
  snapshot: Snapshot;
  utcMs: number;
  attribution: string;
  source: 'real' | 'own' | 'demo';
}

const REGISTRY = [...PRESET_PROJECTS, ...DEMO_REGISTRY];

/** 地址栏参数：截图时固定选项；?demo 时不读本机真实快照（公开截图只用演示数据）。 */
const params = new URLSearchParams(window.location.search);
const DEMO_ONLY = params.has('demo');
function param<T extends string>(name: string, allowed: readonly T[]): T | undefined {
  const v = params.get(name);
  return allowed.find((a) => a === v);
}
const SPECIMEN_ENDPOINT = '/__specimen/snapshots';

async function load(fileName: string, bytes: Uint8Array, source: Loaded['source']): Promise<Loaded | string> {
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
    fileName,
    snapshot: result.snapshot,
    utcMs: result.meta.snapshotAtUtcMs,
    attribution: who
      ? `报告来自 ${who}${a.source === 'branch' ? '（据分支前缀推断）' : ''}`
      : '报告来自：未注明',
    source,
  };
}

function useSnapshots() {
  const [items, setItems] = useState<Loaded[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [realCount, setRealCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const enc = new TextEncoder();
      const out: (Loaded | string)[] = [];
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
      out.push(await load('morii.dashboard', enc.encode(dashboardSnapshot), 'own'));
      for (const d of demoSnapshots(new Date())) out.push(await load(d.fileName, enc.encode(d.json), 'demo'));
      if (cancelled) return;
      setItems(out.filter((x): x is Loaded => typeof x !== 'string'));
      setProblems(out.filter((x): x is string => typeof x === 'string'));
      setRealCount(real.length);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return { items, problems, realCount };
}

function applyTheme(theme: Theme, accent: AccentOption) {
  const root = document.documentElement;
  const tokens = { ...COLOR_TOKENS[theme], ...ACCENT_TOKENS[accent][theme] };
  // 用 CSSOM 设置变量：严格 CSP 下允许。P2.2 定稿后改为静态 CSS。
  for (const [role, value] of Object.entries(tokens)) {
    root.style.setProperty(`--c-${role.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`, value);
  }
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
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
      {options.map(([v, label]) => (
        <label key={v} className="choice-option">
          <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} />
          <span>{label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function relativeAge(utcMs: number, now: Date): string {
  const hours = Math.round((now.getTime() - utcMs) / 3_600_000);
  if (hours < 1) return '刚刚';
  if (hours < 48) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

function ProjectCard({ item, variant, now }: { item: Loaded; variant: AxisVariant; now: Date }) {
  const s = item.snapshot;
  const p = summarizeProgress(s);
  const next = headlineNextAction(s);
  const name = REGISTRY.find((r) => r.id === s.project_id)?.name ?? s.project_name;
  const fresh = freshness(item.utcMs, now, s.stage);
  const days = Math.floor((now.getTime() - item.utcMs) / 86_400_000);
  const evidenceDone = s.milestones.filter(
    (m) => m.status === 'done' && (m.evidence_level === 'repository' || m.evidence_level === 'existing_test'),
  ).length;
  const selfDone = s.milestones.filter(
    (m) => m.status === 'done' && (m.evidence_level === 'self_report' || m.evidence_level === 'unknown'),
  ).length;

  return (
    <article className="card">
      <header className="card-head">
        <h3 className="card-name">{displayValue(name)}</h3>
        <span className="mono card-id">{s.project_id}</span>
        <span className={`card-fresh fresh-${fresh}`}>
          {fresh === 'stale' ? (
            <>
              <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="6" fill="none" strokeWidth="1.5" />
                <path d="M8 4.5V8l2.5 1.5" fill="none" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              报告已 {days} 天
            </>
          ) : fresh === 'not_counted' ? (
            '已暂停 · 不计过期'
          ) : (
            `快照 ${relativeAge(item.utcMs, now)}`
          )}
        </span>
      </header>

      <div className="card-axis">
        <StageAxis stage={s.stage} variant={variant} size="mini" />
        <span className="card-meta">首份快照即为此阶段</span>
      </div>

      {/* 只有按阶段改写的成熟说法（上线准备、已上线、维护中）才用「正常」色；阶段未知时不用。 */}
      <p
        className={`card-line${p.mature && ['launch_preparation', 'live', 'maintenance'].includes(s.stage) ? ' card-line-mature' : ''}`}
      >
        {p.line}
      </p>

      <div className="card-milestones">
        <MilestoneGrid milestones={s.milestones} />
        <span className="card-meta">
          {p.done}/{p.total} 完成
          {p.done > 0
            ? ` · 有证据 ${evidenceDone} · 自报 ${selfDone} · 据报告已验收 ${p.reportedAccepted}`
            : ''}
        </span>
        <span className="sr-only">
          {(['done', 'in_progress', 'blocked', 'not_started', 'unknown'] as const)
            .map((st) => `${STATUS_TEXT[st]} ${s.milestones.filter((m) => m.status === st).length}`)
            .join('，')}
        </span>
        {s.overall_progress !== null ? <ProgressEstimate value={s.overall_progress} /> : null}
      </div>

      {next ? (
        <p className="card-next">
          <span className={`prio prio-${next.priority ?? 'unknown'}`}>{next.priority ?? '优先级未知'}</span>
          <span lang="zh-Hans">{displayValue(next.title)}</span>
        </p>
      ) : null}

      <footer className="card-foot">
        <span>{item.attribution}</span>
        <span>
          需要你：{p.decisions} 个决定 · {p.awaitingAcceptance} 次验收
        </span>
        <span className={`source source-${item.source}`}>
          {item.source === 'real'
            ? '真实快照（本机）'
            : item.source === 'own'
              ? 'Dashboard 自己的快照'
              : '演示数据'}
        </span>
      </footer>
    </article>
  );
}

const STAGES_FOR_AXIS_DEMO = [
  'development',
  'integration',
  'launch_preparation',
  'paused',
  'unknown',
] as const;

export function Specimen() {
  const [theme, setTheme] = useState<Theme>(
    () =>
      param('theme', ['light', 'dark'] as const) ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );
  const [accent, setAccent] = useState<AccentOption>(param('accent', ['mist', 'slate'] as const) ?? 'mist');
  const [font, setFont] = useState<FontScheme>(param('font', ['b', 'a'] as const) ?? 'b');
  const [mono, setMono] = useState<Mono>(param('mono', ['geist', 'jetbrains'] as const) ?? 'geist');
  const [variant, setVariant] = useState<AxisVariant>(
    param('axis', ['dots', 'segments', 'steps'] as const) ?? 'dots',
  );
  const { items, problems, realCount } = useSnapshots();
  const now = useMemo(() => new Date(), []);

  useEffect(() => applyTheme(theme, accent), [theme, accent]);
  useEffect(() => {
    document.documentElement.dataset.font = font;
    document.documentElement.dataset.mono = mono;
  }, [font, mono]);

  const tokens = { ...COLOR_TOKENS[theme], ...ACCENT_TOKENS[accent][theme] };

  return (
    <>
      <a className="skip" href="#main">
        跳到正文
      </a>
      <header className="top">
        <div className="top-title">
          <h1>设计样张</h1>
          <p className="muted">
            P2.1 · 全部字体和色值都是候选，你逐项拍板后才定稿。快照内容按原文显示，标注{' '}
            <code>lang="zh-Hans"</code>。
          </p>
        </div>
        <div className="controls">
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
            legend="强调色"
            name="accent"
            value={accent}
            onChange={setAccent}
            options={[
              ['mist', '雾蓝 · 安静'],
              ['slate', '雾蓝 · 更蓝'],
            ]}
          />
          <Choice
            legend="字体"
            name="font"
            value={font}
            onChange={setFont}
            options={[
              ['b', '方案 B · 极简无衬线'],
              ['a', '方案 A · 编辑路线'],
            ]}
          />
          <Choice
            legend="等宽字"
            name="mono"
            value={mono}
            onChange={setMono}
            options={[
              ['geist', 'Geist Mono'],
              ['jetbrains', 'JetBrains Mono'],
            ]}
          />
          {font === 'a' ? (
            <span className="muted">方案 A 固定用 IBM Plex Mono，等宽字选项只对方案 B 生效</span>
          ) : null}
          <Choice
            legend="阶段轴"
            name="axis"
            value={variant}
            onChange={setVariant}
            options={[
              ['dots', '圆点'],
              ['segments', '分段条'],
              ['steps', '文字步进'],
            ]}
          />
        </div>
      </header>

      <main id="main">
        <section aria-labelledby="s-projects">
          <h2 id="s-projects">1 · 项目进度</h2>
          <p className="muted">
            {realCount > 0
              ? `本机读入 ${realCount} 份真实快照（只在你的浏览器里显示，不进仓库），另附 Dashboard 自己的快照和演示数据。`
              : '没有读入本机快照，显示 Dashboard 自己的快照和演示数据。设置 MORIIUM_SPECIMEN_SNAPSHOTS 后可以看真实项目。'}
            「还差什么」完全由快照计算；成熟项目显示「功能成熟 · 等待上线」，不显示偏低的百分比。
          </p>
          {problems.length > 0 ? <p className="warn-text">没有显示：{problems.join('；')}</p> : null}
          <div className="cards">
            {items.map((item) => (
              <ProjectCard
                key={`${item.source}-${item.snapshot.project_id}`}
                item={item}
                variant={variant}
                now={now}
              />
            ))}
          </div>
        </section>

        <section aria-labelledby="s-axis">
          <h2 id="s-axis">2 · 阶段轴的三种画法</h2>
          <p className="muted">
            阶段轴是全站唯一的「招牌时刻」，只有它可以用较大面积的强调色。上面的卡片跟着你在顶部选的画法变化。
          </p>
          <div className="axis-compare">
            {(['dots', 'segments', 'steps'] as const).map((v) => (
              <div key={v} className="axis-col">
                <h3>{v === 'dots' ? '圆点' : v === 'segments' ? '分段条' : '文字步进'}</h3>
                <div className="axis-full-demo">
                  <StageAxis stage="integration" variant={v} size="full" />
                </div>
                <ul className="axis-list">
                  {STAGES_FOR_AXIS_DEMO.map((st) => (
                    <li key={st}>
                      <span className="axis-list-label">{STAGE_LABELS[st]}</span>
                      <StageAxis stage={st} variant={v} size="mini" />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="s-status">
          <h2 id="s-status">3 · 状态表达</h2>
          <div className="status-grid">
            <div>
              <h3>里程碑状态</h3>
              <ul className="plain">
                {(['done', 'in_progress', 'blocked', 'not_started', 'unknown'] as const).map((st) => (
                  <li key={st} className="status-row">
                    <StatusMark status={st} />
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
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>证据与验收（三层分开）</h3>
              <ul className="plain tags">
                {(['self', 'evidence', 'test', 'reported', 'accepted', 'rejected'] as const).map((k) => (
                  <li key={k}>
                    <EvidenceTag kind={k} />
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>数据状态</h3>
              <ul className="plain states">
                <li>
                  <span className="card-fresh fresh-stale">
                    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
                      <circle cx="8" cy="8" r="6" fill="none" strokeWidth="1.5" />
                      <path d="M8 4.5V8l2.5 1.5" fill="none" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    报告已 18 天
                  </span>
                  <span className="muted">过期：土黄，不变红，不弹窗</span>
                </li>
                <li>
                  <span className="pill pill-paused">已暂停</span>
                  <span className="muted">灰紫，不计过期</span>
                </li>
                <li>
                  <span className="status status-unknown">未知</span>
                  <span className="muted">照实显示，不当作 0</span>
                </li>
                <li>
                  <span className="muted-strong">还没有快照</span>
                  <span className="muted">不写 0%</span>
                </li>
                <li>
                  <span className="pill pill-conflict">两处说法矛盾</span>
                  <span className="muted">展开说明哪两处</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section aria-labelledby="s-color">
          <h2 id="s-color">
            4 · 颜色 token（{theme === 'light' ? '浅色' : '深色'} ·{' '}
            {accent === 'mist' ? '雾蓝 · 安静' : '雾蓝 · 更蓝'}）
          </h2>
          <p className="muted">
            在 OKLCH 里推导，深色单独选。对比度是按下表的组合实际算出来的；状态色的色盲可区分度用 dataviz
            的校验脚本检查过。
          </p>
          <div className="swatches">
            {Object.entries(tokens).map(([role, value]) => (
              <div key={role} className="swatch">
                <span className="swatch-chip" style={{ background: value }} />
                <span className="swatch-role">{role}</span>
                <span className="mono swatch-value">{value}</span>
                <span className="mono swatch-value">{toHex(value)}</span>
              </div>
            ))}
          </div>
          <table className="table">
            <caption className="sr-only">对比度检查</caption>
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
                      {r >= min ? '✓ ' : '✕ '}≥ {min}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <section aria-labelledby="s-type">
          <h2 id="s-type">5 · 字体（{font === 'b' ? '方案 B · 极简无衬线' : '方案 A · 编辑路线'}）</h2>
          <div className="type-scale">
            <p className="t-32 heading">Moriium Dashboard 工作台</p>
            <p className="t-24 heading">需要你决定 · 3</p>
            <p className="t-20 heading">项目进度与报告新鲜度</p>
            <p className="t-16">还差：4 个里程碑未完成（其中 1 个受阻）· 1 个阻塞 · 等你 2 件</p>
            <p className="t-14">
              正文 14px：快照是证词，不是事实本身。Dashboard 展示时始终带着谁说的、什么时候说的、依据是什么。
            </p>
            <p className="t-12 muted">辅助 12px：这是导入时间，不是在线状态。</p>
          </div>
          <div className="trilingual">
            <p lang="zh-Hans">
              中文：项目「Enouia Runtime」处于集成中，桌面与 Memory 本地闭环已有合成证据；Windows
              验收（W01–W05）还没完成。
            </p>
            <p lang="ja">
              日本語：スナップショットは証言であり、事実そのものではありません。取り込んだ時刻です。稼働状況ではありません。
            </p>
            <p lang="en">
              English: Import time, not online status. Self-reported, repository evidence, and your acceptance
              stay separate.
            </p>
            <p lang="ja" className="muted">
              日本語の画面でも、スナップショットの内容は{' '}
              <span lang="zh-Hans">中文字形（漢字の形が違います）</span> で表示します。
            </p>
          </div>
          <table className="table">
            <caption className="sr-only">表格与等宽数字示例</caption>
            <thead>
              <tr>
                <th scope="col">项目</th>
                <th scope="col">提交</th>
                <th scope="col">快照时间</th>
                <th scope="col" className="num">
                  里程碑
                </th>
                <th scope="col" className="num">
                  待决定
                </th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 6).map((it) => (
                <tr key={`t-${it.source}-${it.snapshot.project_id}`}>
                  <td>
                    {REGISTRY.find((r) => r.id === it.snapshot.project_id)?.name ?? it.snapshot.project_name}
                  </td>
                  <td className="mono">{it.snapshot.source.commit_sha?.slice(0, 7) ?? '—'}</td>
                  <td className="mono">{it.snapshot.snapshot_at.replace('T', ' ').slice(0, 16)}</td>
                  <td className="num">
                    {it.snapshot.milestones.filter((m) => m.status === 'done').length}/
                    {it.snapshot.milestones.length}
                  </td>
                  <td className="num">{it.snapshot.needs_morii.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </>
  );
}
