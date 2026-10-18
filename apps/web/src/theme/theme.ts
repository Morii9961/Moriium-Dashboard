/**
 * 主题：跟随系统、浅色「正片」、深色「负片」。
 *
 * 选择记在 localStorage（只是这台浏览器的偏好；以后可以改存服务端设置）。读写都包 try/catch：
 * 隐私窗口或禁用存储时照样能用，只是不记住。public/theme-init.js 在首帧前按同样的规则设置
 * data-theme，避免刷新时闪一下错误的主题。
 */
import type { Theme } from '../design/tokens.ts';

export type ThemePref = 'system' | Theme;
export const THEME_PREFS: readonly ThemePref[] = ['system', 'light', 'dark'];
export const THEME_KEY = 'moriium-dashboard.theme';

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return THEME_PREFS.find((p) => p === v) ?? 'system';
  } catch {
    return 'system';
  }
}

function writeThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // 存不了就只在本次打开期间生效。
  }
}

export function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function resolveTheme(pref: ThemePref): Theme {
  return pref === 'system' ? systemTheme() : pref;
}

function applyThemePref(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
}

/** 切换主题。灰阶尺没有过渡动画（DESIGN.md 第 7 节），直接换。 */
export function setThemePref(pref: ThemePref): void {
  writeThemePref(pref);
  applyThemePref(pref);
}
