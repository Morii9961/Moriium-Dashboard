/**
 * 主题：跟随系统、浅色「雾」、深色「夜」。
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

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * 切换主题。实际颜色变了、浏览器支持 View Transitions、且没有要求减少动画时，
 * 新主题从按下的按钮处以圆形揭开（520ms）；否则直接切换。
 */
export function setThemePref(pref: ThemePref, origin?: { x: number; y: number }): void {
  const before = resolveTheme(readThemePref());
  writeThemePref(pref);
  const after = resolveTheme(pref);
  if (before === after || !origin || reducedMotion() || !('startViewTransition' in document)) {
    applyThemePref(pref);
    return;
  }
  const transition = document.startViewTransition(() => applyThemePref(pref));
  const radius = Math.hypot(
    Math.max(origin.x, window.innerWidth - origin.x),
    Math.max(origin.y, window.innerHeight - origin.y),
  );
  transition.ready
    .then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${origin.x}px ${origin.y}px)`,
            `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
          ],
        },
        {
          duration: 520,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      );
    })
    .catch(() => {
      // 过渡被跳过时主题已经切好，不需要处理。
    });
}
