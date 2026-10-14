/// <reference lib="dom" />
/** Synthetic local QA only. Never opens the user's database. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { createApp } from '../apps/server/src/app.ts';
import { applyMigrations, loadMigrations, openDatabase } from '../apps/server/src/db.ts';

const { serve } = createRequire(resolve('apps/server/package.json'))('@hono/node-server');
const dir = mkdtempSync(join(tmpdir(), 'dashboard-p5-qa-'));
if (!resolve(dir).startsWith(`${resolve(tmpdir())}\\`) && !resolve(dir).startsWith(`${resolve(tmpdir())}/`))
  throw new Error('Unsafe QA cleanup');
const db = openDatabase(join(dir, 'test.sqlite'));
applyMigrations(db, loadMigrations(resolve('apps/server/migrations')));
db.exec('DELETE FROM projects');
const now = new Date();
db.prepare("INSERT INTO projects(id,name,created_at,updated_at) VALUES('demo.beta','演示研发项目',?,?)").run(
  now.toISOString(),
  now.toISOString(),
);
const port = 5191;
const host = `127.0.0.1:${port}`;
const base = `http://${host}`;
const app = createApp({
  db,
  config: { allowedHosts: [host], allowedOrigins: [base], backupDir: join(dir, 'backups') },
  startedAt: now,
  version: 'qa',
  webDir: resolve('apps/web/dist'),
});
const original = JSON.parse(readFileSync('fixtures/protocol/history/t1-base.json', 'utf8'));
for (const day of [2, 1]) {
  const s = structuredClone(original);
  s.snapshot_at = new Date(now.getTime() - day * 86400000).toISOString();
  s.schema_version = '1.1';
  s.reporter = { agent: day === 2 ? 'claude' : 'codex', note: '虚构报告，用于界面验证' };
  const r = await app.request('/api/imports', {
    method: 'POST',
    headers: { host, origin: base, 'x-moriium-dashboard': '1', 'content-type': 'application/json' },
    body: JSON.stringify({
      files: [{ name: 'demo.json', base64: Buffer.from(JSON.stringify(s)).toString('base64') }],
    }),
  });
  if (!r.ok) throw new Error(`QA import: ${r.status}`);
}
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port });
const browser = await chromium.launch({ channel: 'chrome' });
const phase = process.argv[2] ?? 'p5-1';
const out = `screenshots/${phase}`;
mkdirSync(out, { recursive: true });
try {
  for (const width of [1440, 375])
    for (const theme of ['light', 'dark'] as const)
      for (const locale of ['zh-Hans', 'ja', 'en']) {
        const page = await browser.newPage({
          viewport: { width, height: 900 },
          colorScheme: theme,
          reducedMotion: 'reduce',
        });
        await page.addInitScript(
          ({ theme, locale }) => {
            localStorage.setItem('moriium-dashboard.theme', theme);
            localStorage.setItem('moriium-dashboard.locale', locale);
          },
          { theme, locale },
        );
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('response', (r) => {
          if (r.status() >= 400) console.log(`HTTP ${r.status()}: ${r.url()}`);
        });
        page.on('console', (e) => {
          if (e.type() === 'error') errors.push(`${e.text()} at ${e.location().url}`);
        });
        page.on('request', (r) => {
          if (!r.url().startsWith(base)) errors.push(`External request: ${r.url()}`);
        });
        await page.goto(`${base}/agents`, { waitUntil: 'networkidle' });
        await page.locator('.agent-card').first().waitFor();
        if ((await page.locator('.agent-card').count()) !== 4) throw new Error('Agent groups missing');
        if ((await page.locator('.agent-reports li').count()) !== 2)
          throw new Error('Report records missing');
        await page.screenshot({ path: `${out}/${width}-${theme}-${locale}-demo.png`, fullPage: true });
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
          throw new Error(`Overflow: ${width}/${theme}/${locale}`);
        await page.locator('.agent-card a[href="/agents/codex"]').focus();
        await page.keyboard.press('Enter');
        await page.waitForURL('**/agents/codex');
        await page.locator('.agent-reports li').waitFor();
        if ((await page.locator('.agent-card').count()) !== 1) throw new Error('Agent filter failed');
        if (errors.length) throw new Error(errors.join('\n'));
        console.log(`${width}/${theme}/${locale}: rendered, keyboard, overflow, CSP and network passed`);
        await page.close();
      }
} finally {
  await browser.close();
  await new Promise<void>((done, reject) => server.close((e: Error | undefined) => (e ? reject(e) : done())));
  db.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}
