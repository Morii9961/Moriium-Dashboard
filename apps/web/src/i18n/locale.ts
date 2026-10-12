/**
 * 界面语言：简体中文（源语言）、日文、英文。
 * 选择记在 localStorage；没选过时按浏览器语言，都不匹配就用中文。public/theme-init.js 用同样的规则。
 */
export type Locale = 'zh-Hans' | 'ja' | 'en';
export const LOCALES: readonly Locale[] = ['zh-Hans', 'ja', 'en'];
export const LOCALE_KEY = 'moriium-dashboard.locale';

/** 语言名用它自己的文字写，切换时谁都认得出。 */
export const LOCALE_NAMES: Record<Locale, string> = { 'zh-Hans': '中文', ja: '日本語', en: 'English' };

export function detectLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const t = tag.toLowerCase();
    if (t.startsWith('zh')) return 'zh-Hans';
    if (t.startsWith('ja')) return 'ja';
    if (t.startsWith('en')) return 'en';
  }
  return 'zh-Hans';
}

export function readLocale(): Locale {
  try {
    const v = localStorage.getItem(LOCALE_KEY);
    const stored = LOCALES.find((l) => l === v);
    if (stored) return stored;
  } catch {
    // 存储不可用时按浏览器语言。
  }
  return detectLocale(navigator.languages ?? []);
}

export function writeLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // 存不了就只在本次打开期间生效。
  }
}
