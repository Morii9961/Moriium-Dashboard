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
        if (phase === 'p5-1') {
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
        } else {
          await page.goto(`${base}/planner`, { waitUntil: 'networkidle' });
          await page.locator('.today-panel').waitFor();
          const input = page.locator('.focus-add input');
          for (const title of [
            '整理虚构照片集',
            '確認用の書類を読む',
            'Prepare a longer demonstration delivery note',
          ]) {
            await input.fill(title);
            await page.locator('.focus-add button').focus();
            await page.keyboard.press('Enter');
            await page.waitForFunction(
              () => document.querySelector<HTMLInputElement>('.focus-add input')?.value === '',
            );
          }
          if ((await page.locator('.focus-list li').count()) !== 3) throw new Error('Focus list missing');
          await page.locator('.focus-list li').last().locator('button').first().click();
          await page.waitForFunction(() =>
            document.querySelectorAll('.focus-list li')[1]?.textContent?.includes('Prepare a longer'),
          );
          await page.locator('.focus-list input[type="checkbox"]').first().click();
          await page.locator('.focus-list input:checked').waitFor();
          await page.reload({ waitUntil: 'networkidle' });
          if (!(await page.locator('.focus-list input[type="checkbox"]').first().isChecked()))
            throw new Error('Focus completion did not persist');
          await page.screenshot({ path: `${out}/${width}-${theme}-${locale}-demo.png`, fullPage: true });
          if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
            throw new Error('Focus overflow');
          await page.goto(base, { waitUntil: 'networkidle' });
          await page.locator('input[value="low"]').click();
          await page.locator('.energy-collapsed').waitFor();
          if ((await page.locator('.energy-collapsed').getAttribute('open')) !== null)
            throw new Error('Low content was not collapsed');
          await page.locator('input[value="rest"]').click();
          await page.waitForFunction(() => !document.querySelector('.overview-layout'));
          if (await page.locator('.age-list').count()) throw new Error('Rest shows freshness');
          await page.screenshot({ path: `${out}/rest-${width}-${theme}-${locale}-demo.png`, fullPage: true });
          await page.locator('input[value="normal"]').click();
          await page.locator('.overview-layout').waitFor();
          for (let i = 0; i < 3; i++) {
            await page.locator('.focus-list li').last().locator('button').last().click();
            await page.waitForFunction(
              (n) => document.querySelectorAll('.focus-list li').length === n,
              2 - i,
            );
          }
          if (phase === 'p5-3') {
            await page.goto(`${base}/projects/demo.beta`, { waitUntil: 'networkidle' });
            await page.locator('.task-transfer button').first().click();
            await page
              .locator('.task-transfer .save-status')
              .filter({ hasText: /已保存|保存しました|Saved/ })
              .first()
              .waitFor();
            await page.goto(`${base}/planner`, { waitUntil: 'networkidle' });
            const openTasks = page.locator('.tasks-panel > .task-list .task-row');
            await openTasks.first().waitFor();
            await openTasks.first().locator('.focus-transfer button').click();
            await page.locator('.focus-list li').waitFor();
            await page.locator('.tasks-panel .section-heading button').click();
            await page
              .locator('.task-editor input')
              .first()
              .fill(`虚构任务 ${width}/${theme}/${locale} with a longer delivery description`);
            await page.locator('.task-editor select').first().selectOption('demo.beta');
            await page.locator('.task-editor input[type="date"]').fill('2026-10-30');
            await page.locator('.task-editor select').last().selectOption('doing');
            await page.locator('.task-editor button[type="submit"]').focus();
            await page.keyboard.press('Enter');
            await page.waitForFunction(() => !document.querySelector('.task-editor'));
            if ((await openTasks.count()) !== 2) throw new Error('Task creation failed');
            await page.screenshot({
              path: `${out}/tasks-${width}-${theme}-${locale}-demo.png`,
              fullPage: true,
            });
            if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
              throw new Error('Tasks overflow');
            await page.locator('.focus-list input').click();
            await page.waitForFunction(
              () => document.querySelectorAll('.tasks-panel > .task-list .task-row').length === 1,
            );
            await page.locator('.closed-tasks summary').click();
            const source = page.locator('.closed-tasks a[href*="snapshot="]').first();
            await source.click();
            await page.locator('.source-panel h3').waitFor();
            if (
              !(await page
                .locator('.source-panel')
                .last()
                .textContent()
                .then((s) => s?.includes(original.next_actions[0].title)))
            )
              throw new Error('Exact source snapshot not visible');
            await page.goto(`${base}/planner`, { waitUntil: 'networkidle' });
            await openTasks.first().locator('input[type="checkbox"]').click();
            await page.waitForFunction(
              () => document.querySelectorAll('.tasks-panel > .task-list .task-row').length === 0,
            );
            await page.locator('.focus-list li button').last().click();
            await page.waitForFunction(() => !document.querySelector('.focus-list li'));
          }
        }
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
