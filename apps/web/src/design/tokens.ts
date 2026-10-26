/**
 * 设计 token 的唯一来源。2026-10-18 起是「灰阶尺」（根目录 DESIGN.md）：
 * 十一级中性灰（Zone X → 0），没有彩色；浅色叫「正片」，深色叫「负片」，负片是同一把尺整体反相。
 * 颜色写成 oklch(L 0 0)（色度 0 = 纯灰），对比度按 CONTRAST_PAIRS 实际计算（测试里也检查）。
 * 间距、圆角、字号、动效也在这里。运行 `pnpm tokens` 生成静态的 src/styles/tokens.css，
 * 测试会检查生成的文件没有过期。决定见 docs/design-decisions.md。
 */

export type Theme = 'light' | 'dark';

/** 两种主题的名字：浅色「正片」，深色「负片」。 */
export const BACKDROP_NAME: Record<Theme, string> = { light: '正片', dark: '负片' };

/** 画布、纸面、墨色、边框：随主题变化。灰阶尺没有卡片底色，三种面都是纸色。 */
export interface SurfaceTokens {
  canvas: string;
  surface: string;
  raised: string;
  ink1: string;
  ink2: string;
  ink3: string;
  borderWeak: string;
  border: string;
}

/**
 * 状态色与强调色。灰阶尺不用颜色区分状态（状态靠图形与文字：8px 黑方块 = 受阻，褪墨 = 报告变旧），
 * 这些角色保留是为了让组件按语义取值；它们全部是灰。
 */
export interface StatusTokens {
  good: string;
  goodText: string;
  warn: string;
  warnText: string;
  serious: string;
  seriousText: string;
  paused: string;
  pausedText: string;
  unknown: string;
  goodSoft: string;
  warnSoft: string;
  seriousSoft: string;
  pausedSoft: string;
  accent: string;
  accentText: string;
  accentSoft: string;
  accentRing: string;
}

export type ColorTokens = SurfaceTokens & StatusTokens;

const PAPER = 'oklch(0.9401 0 0)'; // #EBEBEB  Zone IX 附近
const INK = 'oklch(0.2002 0 0)'; // #161616  Zone I
const INK2 = 'oklch(0.4819 0 0)'; // #5E5E5E  Zone IV
const RULE = 'oklch(0.7316 0 0)'; // #A8A8A8  Zone VII
const RULE_WEAK = 'oklch(0.8266 0 0)'; // #C6C6C6
const BLACK = 'oklch(0 0 0)';

const N_PAPER = 'oklch(0.2002 0 0)'; // #161616
const N_INK = 'oklch(0.9219 0 0)'; // #E5E5E5
const N_INK2 = 'oklch(0.7058 0 0)'; // #A0A0A0
const N_RULE = 'oklch(0.4712 0 0)'; // #5B5B5B
const N_RULE_WEAK = 'oklch(0.3446 0 0)'; // #393939
const WHITE = 'oklch(1 0 0)';

export const SURFACES: Record<Theme, SurfaceTokens> = {
  light: {
    canvas: PAPER,
    surface: PAPER,
    raised: PAPER,
    ink1: INK,
    ink2: INK2,
    ink3: INK2,
    borderWeak: RULE_WEAK,
    border: RULE,
  },
  dark: {
    canvas: N_PAPER,
    surface: N_PAPER,
    raised: N_PAPER,
    ink1: N_INK,
    ink2: N_INK2,
    ink3: N_INK2,
    borderWeak: N_RULE_WEAK,
    border: N_RULE,
  },
};

export const STATUS: Record<Theme, StatusTokens> = {
  light: {
    good: INK,
    goodText: INK,
    warn: INK2,
    warnText: INK2,
    serious: BLACK,
    seriousText: BLACK,
    paused: INK2,
    pausedText: INK2,
    unknown: 'oklch(0.5795 0 0)', // #7A7A7A
    goodSoft: PAPER,
    warnSoft: PAPER,
    seriousSoft: PAPER,
    pausedSoft: PAPER,
    accent: BLACK,
    accentText: INK,
    accentSoft: 'oklch(0.9037 0 0)', // #DFDFDF  Zone IX，选中项的底
    accentRing: BLACK,
  },
  dark: {
    good: N_INK,
    goodText: N_INK,
    warn: N_INK2,
    warnText: N_INK2,
    serious: WHITE,
    seriousText: WHITE,
    paused: N_INK2,
    pausedText: N_INK2,
    unknown: 'oklch(0.6167 0 0)', // #858585
    goodSoft: N_PAPER,
    warnSoft: N_PAPER,
    seriousSoft: N_PAPER,
    pausedSoft: N_PAPER,
    accent: WHITE,
    accentText: N_INK,
    accentSoft: 'oklch(0.2435 0 0)', // #202020
    accentRing: WHITE,
  },
};

export function tokensFor(theme: Theme): ColorTokens {
  return { ...SURFACES[theme], ...STATUS[theme] };
}

/**
 * 灰阶尺本身：Zone 0（纯黑）到 Zone X（近白）。负片整把反相。
 * text 是块上文字的颜色（正片 Zone 0–IV 白字、V–X 黑字；负片 0–V 黑字、VI–X 白字）。
 */
export interface ZoneStep {
  fill: string;
  text: string;
}

const zone = (fill: string, text: string): ZoneStep => ({ fill, text });

export const ZONES: Record<Theme, readonly ZoneStep[]> = {
  light: [
    zone(BLACK, WHITE),
    zone('oklch(0.2264 0 0)', WHITE), // #1C1C1C
    zone('oklch(0.3211 0 0)', WHITE), // #333333
    zone('oklch(0.4091 0 0)', WHITE), // #4A4A4A
    zone('oklch(0.4962 0 0)', WHITE), // #626262
    zone('oklch(0.5795 0 0)', BLACK), // #7A7A7A
    zone('oklch(0.6665 0 0)', BLACK), // #949494
    zone('oklch(0.7476 0 0)', BLACK), // #ADADAD
    zone('oklch(0.8266 0 0)', BLACK), // #C6C6C6
    zone('oklch(0.9037 0 0)', BLACK), // #DFDFDF
    zone('oklch(0.9761 0 0)', BLACK), // #F7F7F7
  ],
  dark: [
    zone(WHITE, BLACK),
    zone('oklch(0.9158 0 0)', BLACK), // #E3E3E3
    zone('oklch(0.8452 0 0)', BLACK), // #CCCCCC
    zone('oklch(0.7731 0 0)', BLACK), // #B5B5B5
    zone('oklch(0.6960 0 0)', BLACK), // #9D9D9D
    zone('oklch(0.6167 0 0)', BLACK), // #858585
    zone('oklch(0.5278 0 0)', WHITE), // #6B6B6B
    zone('oklch(0.4386 0 0)', WHITE), // #525252
    zone('oklch(0.3446 0 0)', WHITE), // #393939
    zone('oklch(0.2435 0 0)', WHITE), // #202020
    zone('oklch(0.1344 0 0)', WHITE), // #080808
  ],
};

/** 间距以 8 为单位（DESIGN.md 第 4 节），4 只用于细节。 */
export const SPACE = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64, 9: 96, 10: 128 } as const;

/** 圆角全站为 0（DESIGN.md 第 4 节）。名字保留，方便组件按语义取值。 */
export const RADIUS = { sm: 0, md: 0, lg: 0, pill: 0 } as const;

/**
 * 字号（px，DESIGN.md 第 3 节）：12 元数据 · 15 次级正文 · 17 主正文 · 19 尺上项目名 · 28 区块标题 ·
 * 40 页头数字 · 64 页面标题 · 320 首屏主数字（窄屏缩到 240 / 168）。
 */
export const TYPE = {
  xs: '12px',
  sm: '15px',
  md: '15px',
  lg: '17px',
  xl: '19px',
  '2xl': '28px',
  '3xl': '40px',
  display: 'clamp(44px, 5vw, 64px)',
  hero: 'clamp(168px, 22vw, 320px)',
} as const;

/**
 * 动效（DESIGN.md 第 7 节，2026-10-19 起）：像显影一样，从纸色里出现，只用 opacity 与 transform。
 * ease 进出场用强 ease-out；inOut 给屏幕内的移动；drawer 给抽屉。时长：按压 120 · 悬停与小件 150 ·
 * 换页与标签 220 · 对话框与抽屉 300。曲线来自 animate skill 的表，不手调。
 */
export const MOTION = {
  ease: 'cubic-bezier(0.23, 1, 0.32, 1)',
  easeInOut: 'cubic-bezier(0.77, 0, 0.175, 1)',
  easeDrawer: 'cubic-bezier(0.32, 0.72, 0, 1)',
  press: '120ms',
  fast: '150ms',
  base: '220ms',
  slow: '300ms',
} as const;

/** 需要检查对比度的组合：[前景, 背景, 最低比值, 说明]。 */
export const CONTRAST_PAIRS: [keyof ColorTokens, keyof ColorTokens, number, string][] = [
  ['ink1', 'canvas', 4.5, '正文'],
  ['ink2', 'canvas', 4.5, '次级文字'],
  ['ink3', 'raised', 4.5, '对话框里的次级文字'],
  ['accentText', 'accentSoft', 4.5, '选中项上的文字'],
  ['ink2', 'accentSoft', 4.5, '选中项上的次级文字'],
  ['goodText', 'surface', 4.5, '「完成」文字'],
  ['warnText', 'surface', 4.5, '「报告变旧」文字'],
  ['seriousText', 'raised', 4.5, '「受阻」文字'],
  ['pausedText', 'surface', 4.5, '「已暂停」文字'],
  ['accent', 'surface', 3, '焦点环、当前导航方块（图形）'],
  ['serious', 'surface', 3, '受阻方块（图形）'],
  ['unknown', 'surface', 3, '未知图形'],
  ['border', 'canvas', 1.8, '细线（非文字）'],
  ['canvas', 'ink1', 4.5, '主按钮文字（墨色底）'],
];
