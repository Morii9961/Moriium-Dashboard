/**
 * 设计 token 的唯一来源（P2.2 定稿，2026-10-12）。
 *
 * 颜色：强调色「雾蓝 · 安静」；状态色沿用第一轮；浅色背景「雾」，深色背景「夜」。全部在 OKLCH 里推导，
 * 对比度按 CONTRAST_PAIRS 实际计算（测试里也检查）。
 * 间距、圆角、字号、动效也在这里。运行 `pnpm tokens` 生成静态的 src/styles/tokens.css，
 * 测试会检查生成的文件没有过期。决定见 docs/design-decisions.md。
 */

export type Theme = 'light' | 'dark';

/** 两种主题背景的名字：浅色「雾」，深色「夜」。 */
export const BACKDROP_NAME: Record<Theme, string> = { light: '雾', dark: '夜' };

/** 画布、纸面、墨色、边框：随背景变化。 */
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

/** 状态色与强调色：每种主题一套，已定。 */
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

export const SURFACES: Record<Theme, SurfaceTokens> = {
  light: {
    canvas: 'oklch(0.944 0.007 228)',
    surface: 'oklch(0.964 0.005 228)',
    raised: 'oklch(0.98 0.003 228)',
    ink1: 'oklch(0.255 0.014 250)',
    ink2: 'oklch(0.415 0.014 250)',
    ink3: 'oklch(0.5 0.012 250)',
    borderWeak: 'oklch(0.897 0.008 228)',
    border: 'oklch(0.835 0.01 228)',
  },
  dark: {
    canvas: 'oklch(0.175 0.008 252)',
    surface: 'oklch(0.205 0.009 252)',
    raised: 'oklch(0.235 0.01 252)',
    ink1: 'oklch(0.925 0.005 250)',
    ink2: 'oklch(0.78 0.008 250)',
    ink3: 'oklch(0.665 0.009 250)',
    borderWeak: 'oklch(0.258 0.009 252)',
    border: 'oklch(0.33 0.011 252)',
  },
};

export const STATUS: Record<Theme, StatusTokens> = {
  light: {
    good: 'oklch(0.6 0.105 158)',
    goodText: 'oklch(0.46 0.09 158)',
    warn: 'oklch(0.62 0.11 75)',
    warnText: 'oklch(0.48 0.09 70)',
    serious: 'oklch(0.48 0.135 30)',
    seriousText: 'oklch(0.47 0.135 30)',
    paused: 'oklch(0.56 0.06 300)',
    pausedText: 'oklch(0.46 0.06 300)',
    unknown: 'oklch(0.58 0.01 255)',
    goodSoft: 'oklch(0.925 0.03 158)',
    warnSoft: 'oklch(0.93 0.04 85)',
    seriousSoft: 'oklch(0.925 0.03 30)',
    pausedSoft: 'oklch(0.93 0.022 300)',
    accent: 'oklch(0.55 0.075 240)',
    accentText: 'oklch(0.46 0.075 240)',
    accentSoft: 'oklch(0.925 0.022 240)',
    accentRing: 'oklch(0.82 0.04 240)',
  },
  dark: {
    good: 'oklch(0.76 0.1 160)',
    goodText: 'oklch(0.79 0.08 160)',
    warn: 'oklch(0.79 0.11 80)',
    warnText: 'oklch(0.83 0.1 82)',
    serious: 'oklch(0.66 0.14 30)',
    seriousText: 'oklch(0.77 0.11 32)',
    paused: 'oklch(0.72 0.06 300)',
    pausedText: 'oklch(0.8 0.05 300)',
    unknown: 'oklch(0.62 0.01 255)',
    goodSoft: 'oklch(0.29 0.035 160)',
    warnSoft: 'oklch(0.3 0.04 80)',
    seriousSoft: 'oklch(0.29 0.04 30)',
    pausedSoft: 'oklch(0.29 0.03 300)',
    accent: 'oklch(0.75 0.075 240)',
    accentText: 'oklch(0.81 0.065 240)',
    accentSoft: 'oklch(0.3 0.035 240)',
    accentRing: 'oklch(0.42 0.05 240)',
  },
};

export function tokensFor(theme: Theme): ColorTokens {
  return { ...SURFACES[theme], ...STATUS[theme] };
}

/** 间距以 4 为基数（02 第 3 节）。 */
export const SPACE = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64, 9: 96 } as const;

export const RADIUS = { sm: 6, md: 10, lg: 14, pill: 999 } as const;

/**
 * 字号（px）。正文 15，界面最小 12（站名 11.5 是路线图里的例外）。
 * display 用 clamp 随视口变化，只给刊头这类一页一处的大标题。
 */
export const TYPE = {
  xs: '12px',
  sm: '13px',
  md: '15px',
  lg: '17px',
  xl: '22px',
  '2xl': '28px',
  '3xl': '36px',
  display: 'clamp(36px, 6.2vw, 76px)',
} as const;

/** 动效（02 第 14 节）：统一缓动；减少动画偏好下只保留透明度。 */
export const MOTION = {
  ease: 'cubic-bezier(0.16, 1, 0.3, 1)',
  fast: '180ms',
  base: '280ms',
  slow: '520ms',
} as const;

/** 需要检查对比度的组合：[前景, 背景, 最低比值, 说明]。 */
export const CONTRAST_PAIRS: [keyof ColorTokens, keyof ColorTokens, number, string][] = [
  ['ink1', 'canvas', 4.5, '正文'],
  ['ink2', 'canvas', 4.5, '次要文字'],
  ['ink3', 'canvas', 4.5, '辅助文字'],
  ['ink3', 'surface', 4.5, '卡片上的辅助文字'],
  ['ink3', 'raised', 4.5, '浮层上的辅助文字'],
  ['accentText', 'surface', 4.5, '强调色文字（卡片上）'],
  ['goodText', 'surface', 4.5, '「完成」「功能成熟」文字'],
  ['warnText', 'surface', 4.5, '「报告过期」文字'],
  ['seriousText', 'raised', 4.5, '「受阻」文字（浮层上）'],
  ['pausedText', 'surface', 4.5, '「已暂停」文字'],
  ['goodText', 'goodSoft', 4.5, '浅底标签上的「完成」'],
  ['warnText', 'warnSoft', 4.5, '浅底标签上的「过期」'],
  ['seriousText', 'seriousSoft', 4.5, '浅底标签上的「受阻」'],
  ['pausedText', 'pausedSoft', 4.5, '浅底标签上的「已暂停」'],
  ['accent', 'surface', 3, '路线图当前站、焦点环（图形）'],
  ['good', 'surface', 3, '完成图形'],
  ['warn', 'surface', 3, '过期图形'],
  ['serious', 'surface', 3, '受阻图形'],
  ['paused', 'surface', 3, '暂停图形'],
  ['unknown', 'surface', 3, '未知图形'],
  ['ink2', 'surface', 3, '路线图已经过的站（图形）'],
  ['surface', 'accentText', 4.5, '主按钮文字（雾蓝底）'],
];
