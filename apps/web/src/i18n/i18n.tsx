/**
 * 三语框架：ICU 消息（intl-messageformat）、按界面语言格式化日期、数字和相对时间。
 *
 * 用法：在根上放 <I18nProvider>，组件里 const { t, locale } = useI18n(); t('gap.remaining', { n: 3 })。
 * 切换语言时同时更新 <html lang>，字体栈随 lang 切换（styles/base.css）。
 */
import { IntlMessageFormat } from 'intl-messageformat';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { type Locale, readLocale, writeLocale } from './locale.ts';
import { en } from './messages/en.ts';
import { ja } from './messages/ja.ts';
import { type MessageKey, type Messages, zhHans } from './messages/zh-Hans.ts';

export const CATALOGS: Record<Locale, Messages> = { 'zh-Hans': zhHans, ja, en };

export type MessageValues = Record<string, string | number>;

const cache = new Map<string, IntlMessageFormat>();

/** 格式化一条消息。出错时退回原文，不让整页崩掉（测试保证每条消息都能解析）。 */
export function formatMessage(locale: Locale, key: MessageKey, values?: MessageValues): string {
  const id = `${locale}|${key}`;
  let fmt = cache.get(id);
  if (!fmt) {
    fmt = new IntlMessageFormat(CATALOGS[locale][key], locale);
    cache.set(id, fmt);
  }
  try {
    return String(fmt.format(values));
  } catch {
    return CATALOGS[locale][key];
  }
}

export interface I18n {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, values?: MessageValues) => string;
  /** 相对时间：「19 小时前」「3 days ago」。 */
  relative: (fromMs: number, now: Date) => string;
  /** 按快照原文的时区显示月、日、时、分。 */
  snapshotTime: (utcMs: number, offsetMinutes: number) => string;
  fullDate: (d: Date) => string;
  list: (items: string[]) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    writeLocale(l);
    setLocaleState(l);
  }, []);

  const value = useMemo<I18n>(() => {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    const snap = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'UTC',
    });
    const full = new Intl.DateTimeFormat(locale, { dateStyle: 'full' });
    const lf = new Intl.ListFormat(locale, { type: 'conjunction' });
    return {
      locale,
      setLocale,
      t: (key, values) => formatMessage(locale, key, values),
      relative: (fromMs, now) => {
        // 不足一小时按分钟说；numeric: 'auto' 下 0 小时会说成「这一时间」，所以不用它。
        const minutes = Math.round((fromMs - now.getTime()) / 60_000);
        if (Math.abs(minutes) < 1) return rtf.format(0, 'second');
        if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
        const hours = Math.round(minutes / 60);
        if (Math.abs(hours) < 48) return rtf.format(hours, 'hour');
        return rtf.format(Math.round(hours / 24), 'day');
      },
      // 把时刻挪到原文时区再按 UTC 显示，得到「原文写的那个钟点」。
      snapshotTime: (utcMs, offsetMinutes) => snap.format(new Date(utcMs + offsetMinutes * 60_000)),
      fullDate: (d) => full.format(d),
      list: (items) => lf.format(items),
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n 必须在 <I18nProvider> 里使用');
  return ctx;
}
