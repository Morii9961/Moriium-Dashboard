/**
 * 灰阶尺的共用部件（DESIGN.md 第 6、8 节）：
 * - 阶段 → Zone：规划 IX · 开发 VIII · 集成 VII · 验收 VI · 上线准备 V · 已上线 III · 维护 II；暂停与未知不在尺上。
 * - 证据 → Zone：未注明 X · 自报 VIII · 仓库证据 VI · 有测试记录 IV · 据报告已验收 I。
 * - 新鲜度 → 名字的墨色：今天 Zone I，7 天线性褪到 Zone IV（下限保证对比度 ≥ 4.5:1）。
 * 所有灰度编码都同时有文字或罗马数字，颜色从不是唯一线索。
 */
import { type EvidenceLevel, STAGE_AXIS, type Stage } from '@moriium-dashboard/protocol';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from '../app/router.tsx';
import { useI18n } from '../i18n/i18n.tsx';

export const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'] as const;

export const STAGE_ZONE: Partial<Record<Stage, number>> = {
  planning: 9,
  development: 8,
  integration: 7,
  acceptance: 6,
  launch_preparation: 5,
  live: 3,
  maintenance: 2,
};

export const EVIDENCE_ZONE: Record<EvidenceLevel, number> = {
  unknown: 10,
  self_report: 8,
  repository: 6,
  existing_test: 4,
  morii_accepted: 1,
};

/** 一周褪到底。 */
export const FADE_DAYS = 7;

export const zoneOf = (stage: Stage | undefined | null): number | null =>
  stage ? (STAGE_ZONE[stage] ?? null) : null;

/** 给元素设置 --zc / --zt（这一格的灰和块上文字色）。 */
export const zoneStyle = (zone: number): CSSProperties =>
  ({ '--zc': `var(--z${zone})`, '--zt': `var(--zt${zone})` }) as CSSProperties;

/** 报告越旧，墨越淡：今天正墨，FADE_DAYS 天褪到次墨。 */
export function inkStyle(utcMs: number, now: Date): CSSProperties {
  const days = Math.max(0, (now.getTime() - utcMs) / 86_400_000);
  const t = Math.min(1, days / FADE_DAYS);
  return { color: `color-mix(in srgb, var(--c-ink2) ${Math.round(t * 100)}%, var(--c-ink1))` };
}

/** 灰阶块：默认只是图形（aria-hidden），文字说明由旁边的文字负责。 */
export function ZoneBlock({ zone, size, className }: { zone: number; size?: number; className?: string }) {
  const style = { ...zoneStyle(zone), ...(size ? { width: size, height: size } : {}) };
  return (
    <span
      className={`zb${zone === 10 ? ' blank' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      aria-hidden="true"
    >
      {ROMAN[zone]}
    </span>
  );
}

/** 整行高的灰条（项目页、详情页的灰阶栏）。 */
export function ZoneBar({ zone, tall = false }: { zone: number | null; tall?: boolean }) {
  return (
    <div
      className={`zbar${tall ? ' tall' : ''}${zone == null || zone === 10 ? ' blank' : ''}`}
      style={zone != null ? zoneStyle(zone) : undefined}
      aria-hidden="true"
    >
      <span>{zone != null ? ROMAN[zone] : '—'}</span>
    </div>
  );
}

/** 一排 6px 方点：实心 = 完成，空心 = 未完成。 */
export function MilestoneDots({ done }: { done: boolean[] }) {
  return (
    <span className="dots" aria-hidden="true">
      {done.map((on, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 方点只有顺序，没有身份。
        <i key={i} className={on ? 'on' : undefined} />
      ))}
    </span>
  );
}

export interface RulerItem {
  key: string;
  zone: number;
  name: string;
  href: string;
  meta: string;
  label: string;
  ink?: CSSProperties | undefined;
}

/** 11 格灰阶（左 X 右 0），可选在格下标出阶段名。 */
export function RulerCells({ blank = false, hot }: { blank?: boolean; hot?: number | null }) {
  const { t } = useI18n();
  return (
    <ol className="cells" aria-hidden="true">
      {ROMAN.map((_, col) => {
        const z = 10 - col;
        const stage = STAGE_AXIS.find((s) => STAGE_ZONE[s] === z);
        return (
          <li
            key={z}
            className={`cell${hot === z ? ' hot' : ''}`}
            data-zone={z}
            style={{ ...(blank ? {} : zoneStyle(z)), '--i': col } as CSSProperties}
          >
            <span className="roman">{ROMAN[z]}</span>
            {stage && !blank ? <span className="cstage">{t(`station.${stage}`)}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

function RulerStages() {
  const { t } = useI18n();
  return (
    <ol className="stages" aria-hidden="true">
      {ROMAN.map((_, col) => {
        const z = 10 - col;
        const stage = STAGE_AXIS.find((s) => STAGE_ZONE[s] === z);
        return (
          <li key={z} className={stage ? undefined : 'off'}>
            {stage ? t(`station.${stage}`) : ''}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * 首屏招牌：横贯全宽的灰阶尺，项目用 1px 引线吊在各自的格上。
 * 同一格里的项目左右错开；越靠左吊得越高，引线就不会穿过别人的名字。390 宽时尺竖贴右缘（CSS）。
 */
export function ZoneRuler({ items, off, label }: { items: RulerItem[]; off?: ReactNode; label: string }) {
  // 尺从左到右是 X → 0；按 Zone 从大到小排，同格按原顺序。
  const ordered = items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => b.item.zone - a.item.zone || a.i - b.i);
  const perZone = new Map<number, RulerItem[]>();
  for (const { item } of ordered) perZone.set(item.zone, [...(perZone.get(item.zone) ?? []), item]);
  const n = ordered.length;
  return (
    <figure className="ruler" aria-label={label}>
      <ul className="hangers" style={{ '--rows': n } as CSSProperties}>
        {ordered.map(({ item }, idx) => {
          const siblings = perZone.get(item.zone) ?? [item];
          const sub = siblings.indexOf(item);
          const offset = siblings.length > 1 ? 0.22 + sub * 0.44 : 0.5;
          const style = {
            '--col': 10 - item.zone,
            '--off': offset,
            '--k': n - 1 - idx,
            '--sub': sub,
            '--nsub': siblings.length,
          } as CSSProperties;
          return (
            <li key={item.key} className="hanger" style={style}>
              <Link to={item.href} data-zone={item.zone} aria-label={item.label}>
                <span className="hname" style={item.ink}>
                  {item.name}
                </span>
                <span className="hmeta">{item.meta}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <RulerCells />
      <RulerStages />
      {off ? <p className="offruler">{off}</p> : null}
    </figure>
  );
}
