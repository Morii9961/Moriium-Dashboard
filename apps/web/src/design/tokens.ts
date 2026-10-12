/**
 * 设计样张第三轮的候选 token（P2.1）。
 *
 * 已定（2026-10-12，Morii）：强调色「雾蓝 · 安静」；状态色沿用第一轮；浅色背景「雾」。
 * 待定：深色背景。Morii 要更深、更低饱和、适当偏蓝。两个候选：
 *   「夜」：深蓝灰，彩度只有常见「蓝黑」模板的一半左右；
 *   「黛」：更深的墨蓝，带一点青。
 * 全部在 OKLCH 里推导；对比度按 CONTRAST_PAIRS 实际计算（测试里也检查）。
 */

export type Theme = 'light' | 'dark';
export type Backdrop = 'mist' | 'night' | 'dai';

export const BACKDROPS: Record<Theme, Backdrop[]> = { light: ['mist'], dark: ['night', 'dai'] };
export const BACKDROP_LABELS: Record<Backdrop, string> = { mist: '雾', night: '夜', dai: '黛' };

/** 画布、纸面、墨色、边框：随背景候选变化。 */
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

export const SURFACES: Record<Backdrop, SurfaceTokens> = {
  mist: {
    canvas: 'oklch(0.944 0.007 228)',
    surface: 'oklch(0.964 0.005 228)',
    raised: 'oklch(0.98 0.003 228)',
    ink1: 'oklch(0.255 0.014 250)',
    ink2: 'oklch(0.415 0.014 250)',
    ink3: 'oklch(0.5 0.012 250)',
    borderWeak: 'oklch(0.897 0.008 228)',
    border: 'oklch(0.835 0.01 228)',
  },
  night: {
    canvas: 'oklch(0.175 0.008 252)',
    surface: 'oklch(0.205 0.009 252)',
    raised: 'oklch(0.235 0.01 252)',
    ink1: 'oklch(0.925 0.005 250)',
    ink2: 'oklch(0.78 0.008 250)',
    ink3: 'oklch(0.665 0.009 250)',
    borderWeak: 'oklch(0.258 0.009 252)',
    border: 'oklch(0.33 0.011 252)',
  },
  dai: {
    canvas: 'oklch(0.188 0.013 232)',
    surface: 'oklch(0.218 0.014 232)',
    raised: 'oklch(0.248 0.015 232)',
    ink1: 'oklch(0.925 0.006 230)',
    ink2: 'oklch(0.785 0.009 230)',
    ink3: 'oklch(0.67 0.01 230)',
    borderWeak: 'oklch(0.27 0.013 232)',
    border: 'oklch(0.345 0.015 232)',
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

export function tokensFor(theme: Theme, backdrop: Backdrop): ColorTokens {
  return { ...SURFACES[backdrop], ...STATUS[theme] };
}

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
];
