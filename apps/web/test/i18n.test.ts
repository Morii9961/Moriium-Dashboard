import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { IntlMessageFormat } from 'intl-messageformat';
import { describe, expect, it } from 'vitest';
import { renderTokensCss } from '../src/design/tokens-css.ts';
import { CATALOGS, formatMessage } from '../src/i18n/i18n.tsx';
import { detectLocale, LOCALES } from '../src/i18n/locale.ts';
import type { MessageKey } from '../src/i18n/messages/zh-Hans.ts';

/** 收集一条 ICU 消息里出现的参数名（包括 plural、select 内部嵌套的）。 */
function argNames(message: string, locale: string): string[] {
  const names = new Set<string>();
  const walk = (nodes: unknown[]) => {
    for (const node of nodes as {
      type: number;
      value?: unknown;
      options?: Record<string, { value: unknown[] }>;
    }[]) {
      // 类型 0 是纯文本、7 是 #，其余都带参数名。
      if (node.type !== 0 && node.type !== 7 && typeof node.value === 'string') names.add(node.value);
      if (node.options) for (const opt of Object.values(node.options)) walk(opt.value);
    }
  };
  walk(new IntlMessageFormat(message, locale).getAst() as unknown[]);
  return [...names].sort();
}

const keys = Object.keys(CATALOGS['zh-Hans']) as MessageKey[];

describe('message catalogs', () => {
  it.each(LOCALES)('%s has exactly the source keys', (locale) => {
    expect(Object.keys(CATALOGS[locale]).sort()).toEqual([...keys].sort());
  });

  it.each(LOCALES)('every %s message parses and uses the same arguments as the source', (locale) => {
    for (const key of keys) {
      expect(argNames(CATALOGS[locale][key], locale), `${locale} ${key}`).toEqual(
        argNames(CATALOGS['zh-Hans'][key], 'zh-Hans'),
      );
    }
  });

  it('puts a space between Chinese and Latin letters, digits or placeholders', () => {
    const han = '\\p{Script=Han}';
    const tight = new RegExp(`${han}[A-Za-z0-9]|[A-Za-z0-9]${han}|${han}\\{\\w+\\}|\\{\\w+\\}${han}`, 'u');
    expect('还差3个').toMatch(tight);
    expect('展开{name}').toMatch(tight);
    for (const key of keys) expect(CATALOGS['zh-Hans'][key], key).not.toMatch(tight);
  });

  it('writes Japanese sentences in the polite form', () => {
    for (const key of keys) {
      const m = CATALOGS.ja[key];
      if (m.endsWith('。')) expect(m, key).toMatch(/(です|ます|ません|ください|でした|ました)か?。$/);
    }
  });

  it('keeps English calm: no exclamation marks', () => {
    for (const key of keys) expect(CATALOGS.en[key], key).not.toContain('!');
  });

  it('formats plurals and placeholders', () => {
    expect(formatMessage('zh-Hans', 'gap.remaining', { n: 3 })).toBe('还差 3 个里程碑');
    expect(formatMessage('en', 'gap.remaining', { n: 1 })).toBe('1 milestone to go');
    expect(formatMessage('en', 'gap.remaining', { n: 4 })).toBe('4 milestones to go');
    expect(formatMessage('ja', 'strip.stale', { days: 16 })).toBe('報告から 16 日');
  });
});

describe('locale detection', () => {
  it('follows the first supported browser language and falls back to Chinese', () => {
    expect(detectLocale(['ja-JP', 'en-US'])).toBe('ja');
    expect(detectLocale(['en-GB'])).toBe('en');
    expect(detectLocale(['zh-CN', 'ja'])).toBe('zh-Hans');
    expect(detectLocale(['fr-FR'])).toBe('zh-Hans');
    expect(detectLocale([])).toBe('zh-Hans');
  });
});

describe('generated tokens.css', () => {
  it('is up to date with tokens.ts (run pnpm tokens)', () => {
    const file = readFileSync(resolve(import.meta.dirname, '..', 'src', 'styles', 'tokens.css'), 'utf8');
    expect(file.replaceAll('\r\n', '\n')).toBe(renderTokensCss());
  });
});
