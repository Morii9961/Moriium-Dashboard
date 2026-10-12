/// <reference lib="dom" />
/**
 * 界面截图：桌面（1440）和窄屏（375）、浅色和深色，整页。
 *
 * 用法：先启动开发服务器，再运行
 *   node scripts/screenshots.ts [页面地址] [--demo] [--out <目录>] [--query a=b&c=d]
 * 默认地址 http://127.0.0.1:5173/specimen.html，输出到 screenshots/（已被 .gitignore 排除）。
 * 不加 --demo 时页面会读本机真实快照，截图只能自己看，不能放进 PR；放进 PR 的截图一律加 --demo。
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from '@playwright/test';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    demo: { type: 'boolean' },
    out: { type: 'string' },
    query: { type: 'string' },
  },
});

const base = positionals[0] ?? 'http://127.0.0.1:5173/specimen.html';
const outDir = values.out ?? 'screenshots';
mkdirSync(outDir, { recursive: true });

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
];
const themes = ['light', 'dark'] as const;

const browser = await chromium.launch();
try {
  for (const vp of viewports) {
    for (const theme of themes) {
      const page = await browser.newPage({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: theme,
        deviceScaleFactor: vp.name === 'mobile' ? 2 : 1,
      });
      const url = new URL(base);
      url.searchParams.set('theme', theme);
      if (values.demo) url.searchParams.set('demo', '');
      for (const [k, v] of new URLSearchParams(values.query ?? '')) url.searchParams.set(k, v);
      await page.goto(url.toString(), { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      // 检查横向滚动：窄屏不应出现整页横向滚动。
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const file = join(outDir, `${vp.name}-${theme}${values.demo ? '-demo' : ''}.png`);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`${file}${overflow > 0 ? `  ⚠ 横向溢出 ${overflow}px` : ''}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
