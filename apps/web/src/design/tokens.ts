/**
 * 设计样张用的候选 token（P2.1）。**不是定稿**：Morii 在样张上逐项拍板后，P2.2 再写成正式 token。
 *
 * 方向来自规划 02 第 13 节：冷静、清楚、私人；偏冷的灰带极轻的蓝调；一个强调色（雾蓝），
 * 只给交互、焦点、当前阶段；状态色：正常灰绿、严重砖红、提醒土黄、暂停灰紫，「未知」用中性灰。
 * 全部在 OKLCH 里推导，深色单独选，不是浅色的机械反转（DESIGN.md 4.2）。
 */

export type Theme = 'light' | 'dark';
export type AccentOption = 'mist' | 'slate';

/** 角色 → 颜色。代码只消费角色（DESIGN.md 4.1）。 */
export interface ColorTokens {
  canvas: string;
  surface: string;
  raised: string;
  ink1: string;
  ink2: string;
  ink3: string;
  borderWeak: string;
  border: string;
  /** 状态：图形用 `*`，需要当文字用时用 `*Text`（对比度更高）。 */
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
}

export interface AccentTokens {
  accent: string;
  accentText: string;
  accentSoft: string;
  /** 阶段轴当前点的外圈。 */
  accentRing: string;
}

export const COLOR_TOKENS: Record<Theme, ColorTokens> = {
  light: {
    canvas: 'oklch(0.984 0.004 250)',
    surface: 'oklch(0.995 0.002 250)',
    raised: 'oklch(1 0 0)',
    ink1: 'oklch(0.255 0.014 255)',
    ink2: 'oklch(0.43 0.014 255)',
    ink3: 'oklch(0.53 0.012 255)',
    borderWeak: 'oklch(0.925 0.006 250)',
    border: 'oklch(0.865 0.008 250)',
    good: 'oklch(0.6 0.105 158)',
    goodText: 'oklch(0.47 0.09 158)',
    warn: 'oklch(0.635 0.11 75)',
    warnText: 'oklch(0.5 0.09 70)',
    serious: 'oklch(0.48 0.135 30)',
    seriousText: 'oklch(0.48 0.135 30)',
    paused: 'oklch(0.58 0.06 300)',
    pausedText: 'oklch(0.47 0.06 300)',
    unknown: 'oklch(0.6 0.01 255)',
    goodSoft: 'oklch(0.95 0.025 160)',
    warnSoft: 'oklch(0.955 0.035 85)',
    seriousSoft: 'oklch(0.95 0.025 32)',
    pausedSoft: 'oklch(0.955 0.02 300)',
  },
  dark: {
    canvas: 'oklch(0.185 0.01 255)',
    surface: 'oklch(0.215 0.011 255)',
    raised: 'oklch(0.25 0.012 255)',
    ink1: 'oklch(0.93 0.006 255)',
    ink2: 'oklch(0.79 0.01 255)',
    ink3: 'oklch(0.68 0.01 255)',
    borderWeak: 'oklch(0.29 0.012 255)',
    border: 'oklch(0.37 0.014 255)',
    good: 'oklch(0.76 0.1 160)',
    goodText: 'oklch(0.78 0.075 160)',
    warn: 'oklch(0.78 0.11 80)',
    warnText: 'oklch(0.82 0.1 82)',
    serious: 'oklch(0.62 0.14 30)',
    seriousText: 'oklch(0.75 0.11 32)',
    paused: 'oklch(0.7 0.06 300)',
    pausedText: 'oklch(0.78 0.055 300)',
    unknown: 'oklch(0.6 0.01 255)',
    goodSoft: 'oklch(0.28 0.03 160)',
    warnSoft: 'oklch(0.29 0.035 80)',
    seriousSoft: 'oklch(0.28 0.035 32)',
    pausedSoft: 'oklch(0.28 0.03 300)',
  },
};

/**
 * 两个强调色候选，同属雾蓝一族：
 * - mist：偏灰、更安静（色相 245，彩度低）。
 * - slate：稍微更蓝、更有存在感（色相 255，彩度略高）。
 */
export const ACCENT_TOKENS: Record<AccentOption, Record<Theme, AccentTokens>> = {
  mist: {
    light: {
      accent: 'oklch(0.56 0.075 240)',
      accentText: 'oklch(0.48 0.075 240)',
      accentSoft: 'oklch(0.95 0.018 240)',
      accentRing: 'oklch(0.84 0.04 240)',
    },
    dark: {
      accent: 'oklch(0.74 0.075 240)',
      accentText: 'oklch(0.8 0.065 240)',
      accentSoft: 'oklch(0.29 0.03 240)',
      accentRing: 'oklch(0.45 0.05 240)',
    },
  },
  slate: {
    light: {
      accent: 'oklch(0.53 0.1 258)',
      accentText: 'oklch(0.47 0.1 258)',
      accentSoft: 'oklch(0.95 0.022 258)',
      accentRing: 'oklch(0.83 0.05 258)',
    },
    dark: {
      accent: 'oklch(0.73 0.1 258)',
      accentText: 'oklch(0.8 0.08 258)',
      accentSoft: 'oklch(0.3 0.04 258)',
      accentRing: 'oklch(0.46 0.07 258)',
    },
  },
};

/** 需要检查对比度的组合：[前景, 背景, 最低比值, 说明]。 */
export const CONTRAST_PAIRS: [keyof ColorTokens | keyof AccentTokens, keyof ColorTokens, number, string][] = [
  ['ink1', 'canvas', 4.5, '正文'],
  ['ink2', 'canvas', 4.5, '次要文字'],
  ['ink3', 'canvas', 4.5, '辅助文字'],
  ['ink3', 'surface', 4.5, '表面上的辅助文字'],
  ['ink3', 'raised', 4.5, '浮层上的辅助文字'],
  ['accentText', 'canvas', 4.5, '强调色文字、链接'],
  ['goodText', 'canvas', 4.5, '「完成」文字'],
  ['warnText', 'canvas', 4.5, '「报告过期」文字'],
  ['seriousText', 'canvas', 4.5, '「受阻」文字'],
  ['pausedText', 'canvas', 4.5, '「已暂停」文字'],
  ['goodText', 'goodSoft', 4.5, '浅底标签上的「完成」'],
  ['warnText', 'warnSoft', 4.5, '浅底标签上的「过期」'],
  ['seriousText', 'seriousSoft', 4.5, '浅底标签上的「受阻」'],
  ['pausedText', 'pausedSoft', 4.5, '浅底标签上的「已暂停」'],
  ['accent', 'canvas', 3, '阶段轴当前点、焦点环（图形）'],
  ['good', 'canvas', 3, '完成图形'],
  ['warn', 'canvas', 3, '过期图形'],
  ['serious', 'canvas', 3, '受阻图形'],
  ['paused', 'canvas', 3, '暂停图形'],
  ['unknown', 'canvas', 3, '未知图形'],
  ['border', 'canvas', 1.3, '默认边框（装饰性，不承载信息）'],
];
