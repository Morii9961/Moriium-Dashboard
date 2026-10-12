/**
 * 线路总图：全站唯一的招牌元素（阶段轴「圆点」画法的放大版）。
 *
 * 每个项目是一条线，从左边的起点出发，经过各阶段的换乘站，停在它现在所在的阶段；
 * 没走到的路段只画一条细线。按走得最远的排在最上面，整张图的轮廓就是一道台阶。
 * 暂停和阶段未知的项目画成虚线，排在最下面，不假装知道它们停在哪里。
 *
 * 画法借用地铁线路图：站是横跨所有线的胶囊，线名写在终点旁，用画布色描边让文字压在线上也清楚。
 * 每条线是一个链接，跳到下面对应的项目长条并展开。悬停或聚焦一条线时，其余的线退到背景里。
 * 首次出现时线条依次画出（减少动画偏好下直接显示终态）。图下面的项目长条就是它的文字版。
 */
import { STAGE_AXIS, type Stage } from '@moriium-dashboard/protocol';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { navigate } from '../app/router.tsx';
import { useI18n } from '../i18n/i18n.tsx';

export interface MapLine {
  /** 点击这条线去哪里：页内锚点（#…）或站内路径（/projects/…）。 */
  href: string;
  name: string;
  /** null：登记了但还没有快照，画成没出发的虚线。 */
  stage: Stage | null;
  /** 已经格式化好的进度，例如「≈80%」「64%」「—」。 */
  progress: string;
  /** 读屏用的进度说明，例如「Agent 估算 80%」。 */
  progressLabel: string;
  pending: number;
}

const AXIS = STAGE_AXIS as readonly Stage[];
const stageIndex = (s: Stage | null) => (s === null ? -1 : AXIS.indexOf(s));

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function TransitMap({ lines }: { lines: MapLine[] }) {
  const { t } = useI18n();
  const [ref, width] = useWidth<HTMLElement>();

  const sorted = [...lines].sort((a, b) => {
    const ia = stageIndex(a.stage);
    const ib = stageIndex(b.stage);
    if (ia < 0 !== ib < 0) return ia < 0 ? 1 : -1;
    return ib - ia || a.name.localeCompare(b.name);
  });

  // 窄屏：线名写在线的上方左端，站名错成两行；宽屏：线名写在终点右边。
  const narrow = width < 680;
  // 线名写在线的上方左端：窄屏，或者全部项目都还没有快照（终点右边没有东西可写）。
  const allEmpty = sorted.length > 0 && sorted.every((l) => l.stage === null);
  const labelsLeft = narrow || allEmpty;
  const laneGap = labelsLeft ? 58 : 50;
  const top = narrow ? 78 : 64;
  const originX = 10;
  const firstX = narrow ? 44 : 64;
  const rightPad = labelsLeft ? 32 : 210;
  const step = Math.max(0, (width - firstX - rightPad) / (AXIS.length - 1));
  const stationX = (i: number) => firstX + i * step;
  const lastX = stationX(AXIS.length - 1);
  const laneY = (i: number) => top + 18 + i * laneGap + (labelsLeft ? 14 : 0);
  const bottom = laneY(Math.max(0, sorted.length - 1)) + 18;
  const height = bottom + 22;

  // 各站在这里到站的项目数，写在站名旁边。
  const arrivals = AXIS.map((s) => sorted.filter((l) => l.stage === s).length);

  return (
    <nav className="tmap" ref={ref} aria-label={t('map.label')}>
      {width > 0 ? (
        <svg
          className={`tmap-svg${narrow ? ' is-narrow' : ''}${labelsLeft ? ' labels-left' : ''}`}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          <title>{t('map.label')}</title>
          {/* 起点：所有线都从这里出发。 */}
          <rect
            className="tmap-origin"
            x={originX - 3}
            y={top + 6}
            width={6}
            height={bottom - top - 6}
            rx={3}
          />

          {AXIS.map((s, i) => {
            const x = stationX(i);
            const row = narrow && i % 2 === 1 ? 1 : 0;
            return (
              <g key={s} className="tmap-station">
                <rect
                  className="tmap-capsule"
                  x={x - 10}
                  y={top + 4}
                  width={20}
                  height={bottom - top - 2}
                  rx={10}
                />
                {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: SVG 文字不可聚焦；站名已包含在每条线的读屏说明里。 */}
                <text
                  aria-hidden="true"
                  className={`tmap-station-name${arrivals[i] ? ' has-arrivals' : ''}`}
                  x={x}
                  y={top - 14 - row * 20}
                  textAnchor="middle"
                >
                  {t(`station.${s}` as 'station.planning')}
                  {arrivals[i] ? (
                    <tspan className="tmap-station-count" dx={4}>
                      {arrivals[i]}
                    </tspan>
                  ) : null}
                </text>
              </g>
            );
          })}

          {sorted.map((l, i) => {
            const y = laneY(i);
            const idx = stageIndex(l.stage);
            const off = idx < 0;
            const endX = off ? lastX : stationX(idx);
            const stageText =
              l.stage === null ? t('map.noSnapshot') : t(`stage.${l.stage}` as 'stage.planning');
            const label =
              l.stage === null
                ? t('map.laneEmpty', { name: l.name })
                : t('map.lane', {
                    name: l.name,
                    stage: stageText,
                    progress: l.progressLabel,
                    pending: l.pending,
                  });
            const labelX = labelsLeft ? firstX - 14 : endX + 22;
            const labelY = labelsLeft ? y - 14 : y + 5;
            return (
              <a
                key={l.href}
                href={l.href}
                onClick={(e) => {
                  // 站内路径走客户端路由，不整页刷新。
                  if (!l.href.startsWith('/') || e.metaKey || e.ctrlKey || e.shiftKey) return;
                  e.preventDefault();
                  navigate(l.href);
                }}
                className={`tmap-lane${off ? ` is-off is-${l.stage ?? 'none'}` : ''}`}
                aria-label={label}
                style={{ '--i': i } as CSSProperties}
              >
                {/* 看不见的粗线：让细线也好点中。 */}
                <path className="tmap-hit" d={`M ${originX} ${y} H ${lastX + (labelsLeft ? 0 : 160)}`} />
                {off ? null : <path className="tmap-ahead" d={`M ${endX} ${y} H ${lastX}`} />}
                <path
                  className="tmap-line"
                  d={`M ${originX} ${y} H ${endX}`}
                  pathLength={off ? undefined : 1}
                />
                {off
                  ? null
                  : AXIS.slice(0, idx).map((s, k) => (
                      <circle key={s} className="tmap-stop" cx={stationX(k)} cy={y} r={3} />
                    ))}
                {off ? null : (
                  <g className="tmap-terminus">
                    <circle className="tmap-terminus-ring" cx={endX} cy={y} r={12} />
                    <circle className="tmap-terminus-dot" cx={endX} cy={y} r={6.5} />
                  </g>
                )}
                <text className="tmap-label" x={labelX} y={labelY}>
                  <tspan className="tmap-label-name">{l.name}</tspan>
                  <tspan className="tmap-label-figure" dx={10}>
                    {off ? stageText : l.progress}
                  </tspan>
                </text>
              </a>
            );
          })}
        </svg>
      ) : null}
    </nav>
  );
}
