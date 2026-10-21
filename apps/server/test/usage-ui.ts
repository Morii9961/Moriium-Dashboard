/// <reference lib="dom" />
/** Standalone synthetic browser check. Memory-only DB; never runs main.ts or opens personal data. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { chromium, expect } from '@playwright/test';
import { createApp } from '../src/app.ts';
import { REPO_ROOT } from '../src/config.ts';
import { applyMigrations, loadMigrations, openDatabase } from '../src/db.ts';

const zonePreview = process.argv.includes('--zone-preview');
const out = join(REPO_ROOT, 'screenshots', zonePreview ? 'usage-zone' : 'usage');
mkdirSync(out, { recursive: true });
const db = openDatabase(':memory:');
applyMigrations(db, loadMigrations(join(REPO_ROOT, 'apps/server/migrations')));
const config = {
  allowedHosts: [] as string[],
  allowedOrigins: [] as string[],
  backupDir: join(tmpdir(), 'synthetic-usage-no-backups'),
};
let app: ReturnType<typeof createApp> | undefined;
const server = serve({
  fetch: (request) => (app ? app.fetch(request) : new Response(null, { status: 503 })),
  hostname: '127.0.0.1',
  port: 0,
});
await new Promise<void>((r) => server.once('listening', r));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('listen');
const base = `http://127.0.0.1:${address.port}`;
config.allowedHosts.push(`127.0.0.1:${address.port}`);
config.allowedOrigins.push(base);
app = createApp({
  db,
  config,
  startedAt: new Date(),
  version: 'synthetic',
  webDir: join(REPO_ROOT, zonePreview ? 'screenshots/usage-zone-preview/apps/web/dist' : 'apps/web/dist'),
});
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const failures: string[] = [],
  results: unknown[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.addInitScript(() => localStorage.setItem('moriium-dashboard.locale', 'zh-Hans'));
  page.on('pageerror', () => failures.push('pageerror'));
  await page.goto(`${base}/usage`);
  await expect(page.getByText('尚未导入用量', { exact: true }).last()).toBeVisible();
  await expect(page.locator('.usage-metrics')).toHaveCount(0);
  await page
    .locator('input[type=file]')
    .nth(0)
    .setInputFiles(join(REPO_ROOT, 'packages/protocol/usage/fixtures/valid-week.json'));
  await expect(page.getByText('导入预览 · 8 行', { exact: false })).toBeVisible();
  // Keyboard-only confirmation after native file selection.
  const confirm = page.getByRole('button', { name: '确认导入', exact: true });
  await confirm.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('导入完成，已保留历史')).toBeVisible();
  await page.locator('input[type=date]').fill('2026-10-26');
  await expect(page.locator('.usage-metrics')).toBeVisible();
  await expect(page.getByText('缺少价格表', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: join(out, 'unpriced.png') });
  await page
    .locator('input[type=file]')
    .nth(1)
    .setInputFiles(join(REPO_ROOT, 'fixtures/usage/catalog.synthetic.json'));
  await page
    .locator('select')
    .filter({ has: page.locator('option[value="synthetic-v1"]') })
    .selectOption('synthetic-v1');
  await page
    .locator('input[type=file]')
    .nth(2)
    .setInputFiles(join(REPO_ROOT, 'fixtures/usage/fx.synthetic.json'));
  await page
    .locator('select')
    .filter({ has: page.locator('option[value="synthetic-fx"]') })
    .selectOption('synthetic-fx');
  await expect(page.getByText('请求计价条件未知', { exact: true }).first()).toBeVisible();
  const freeze = page.getByRole('button', { name: '生成固定账单', exact: true });
  await expect(freeze).toBeEnabled();
  await freeze.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('正在查看不可变账单 · 修订 1', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '返回当前用量', exact: true }).click();
  // Duplicate file yields no confirmation or duplicate receipt.
  await page
    .locator('input[type=file]')
    .nth(0)
    .setInputFiles(join(REPO_ROOT, 'packages/protocol/usage/fixtures/valid-week.json'));
  await expect(page.getByRole('button', { name: '相同 hash 已存在 · 零变化' })).toBeDisabled();
  const fixture = JSON.parse(
    readFileSync(join(REPO_ROOT, 'packages/protocol/usage/fixtures/valid-week.json'), 'utf8'),
  );
  fixture.revision = '2';
  fixture.rows[0].counts.output_total = '200';
  await page
    .locator('input[type=file]')
    .nth(0)
    .setInputFiles({
      name: 'synthetic-revision.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(fixture)),
    });
  await expect(page.getByRole('button', { name: '确认导入', exact: true })).toBeDisabled();
  await page.getByRole('checkbox', { name: '已审核，选用本次覆盖范围（旧版保留）' }).check();
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.getByText('导入完成，已保留历史')).toBeVisible();
  await page
    .getByRole('button', { name: /修订 1 ·/ })
    .first()
    .click();
  await expect(page.getByText('正在查看不可变账单 · 修订 1', { exact: false })).toBeVisible();
  await page
    .locator('select')
    .filter({ has: page.locator('option[value="standard_short"]') })
    .selectOption('standard_short');
  const reprice = page.getByRole('button', { name: '显式重计价 · 生成新修订', exact: true });
  await expect(reprice).toBeEnabled();
  await reprice.click();
  await expect(page.getByText('正在查看不可变账单 · 修订 2', { exact: false })).toBeVisible();
  const apiHeaders = { 'X-Moriium-Dashboard': '1', origin: base };
  const bills = await (
    await page.request.get(`${base}/api/usage/bills?dataset=${fixture.dataset_id}&week=2026-10-26`)
  ).json();
  expect(bills.bills).toHaveLength(2);
  const b1 = await (await page.request.get(`${base}/api/usage/bills/${bills.bills[1].id}`)).json();
  const b2 = await (await page.request.get(`${base}/api/usage/bills/${bills.bills[0].id}`)).json();
  expect(b2.previous_id).toBe(b1.id);
  expect(b2.bill.source_snapshot_hashes).toEqual(b1.bill.source_snapshot_hashes);
  const rejected = await page.request.post(`${base}/api/usage/imports/preview`, {
    headers: apiHeaders,
    data: { snapshot: { private_content: 'synthetic-rejected' } },
  });
  expect(rejected.status()).toBe(400);
  await page
    .locator('input[type=file]')
    .nth(0)
    .setInputFiles(join(REPO_ROOT, 'packages/protocol/usage/v1.1/fixtures/valid-midnight-observation.json'));
  await expect(page.getByText('导入预览 · 1 行', { exact: false })).toBeVisible();
  await expect(
    page.locator('.usage-notice .usage-quality').getByText('缺少请求开始时间', { exact: false }),
  ).toBeVisible();
  await page.getByRole('checkbox', { name: '已审核，选用本次覆盖范围（旧版保留）' }).check();
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.getByText('导入完成，已保留历史')).toBeVisible();
  const fresh = await (
    await page.request.get(
      `${base}/api/usage/weeks/2026-10-26?dataset=${fixture.dataset_id}&catalog=synthetic-v1&mode=classified`,
    )
  ).json();
  expect(fresh.totals.measured_tokens).toBe('1100');
  expect(fresh.dataset_observations.unallocated).toHaveLength(1);
  await expect(page.locator('.usage-quality').getByText('缺少请求开始时间', { exact: false })).toBeVisible();
  await page.close();
  for (const locale of ['zh-Hans', 'ja', 'en'])
    for (const theme of ['light', 'dark'])
      for (const width of [1440, 375]) {
        const ctx = await browser.newContext({
          viewport: { width, height: 950 },
          colorScheme: theme as 'light' | 'dark',
          reducedMotion: 'reduce',
        });
        await ctx.addInitScript(
          ({ locale, theme }) => {
            localStorage.setItem('moriium-dashboard.locale', locale);
            localStorage.setItem('moriium-dashboard.theme', theme);
          },
          { locale, theme },
        );
        const p = await ctx.newPage();
        p.on('pageerror', () => failures.push('pageerror'));
        const external: string[] = [];
        p.on('request', (r) => {
          if (!r.url().startsWith(base)) external.push('external');
        });
        await p.goto(`${base}/usage`);
        await p.locator('input[type=date]').fill('2026-10-26');
        await p
          .locator('select')
          .filter({ has: p.locator('option[value="synthetic-v1"]') })
          .selectOption('synthetic-v1');
        await expect(p.locator('.usage-metrics')).toBeVisible();
        await expect(p.locator('.usage-quality')).toBeVisible();
        await p.evaluate(() => document.fonts.ready);
        const metrics = await p.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          lang: document.documentElement.lang,
          animations: document.getAnimations().filter((a) => a.playState === 'running').length,
          focusStyles: getComputedStyle(document.querySelector('input') as Element).outlineStyle,
        }));
        expect(metrics.overflow).toBe(0);
        expect(metrics.lang).toBe(locale);
        expect(metrics.animations).toBe(0);
        expect(external).toHaveLength(0);
        await p.locator('input[type=file]').first().focus();
        await p.keyboard.press('Tab');
        const focus = await p.evaluate(() => document.activeElement?.tagName);
        expect(focus).toBe('BUTTON');
        const focusRing = await p.evaluate(() => {
          const style = getComputedStyle(document.activeElement as Element);
          return { width: style.outlineWidth, style: style.outlineStyle };
        });
        expect(focusRing).toEqual({ width: '2px', style: 'solid' });
        await p.evaluate(() => window.scrollTo(0, 0));
        await p.screenshot({ path: join(out, `${locale}-${theme}-${width}.png`) });
        await p.locator('.usage-chart').scrollIntoViewIfNeeded();
        await p.screenshot({ path: join(out, `${locale}-${theme}-${width}-chart.png`) });
        if (width === 375) {
          const table = p.locator('.usage-table-wrap').first();
          await table.focus();
          await p.keyboard.press('ArrowRight');
          await expect.poll(() => table.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
        }
        results.push({ locale, theme, width, ...metrics });
        await ctx.close();
      }
  expect(failures).toEqual([]);
  writeFileSync(
    join(out, 'checks.json'),
    JSON.stringify(
      {
        flows: 'empty/import/preview/keyboard/duplicate/conflict/freeze/history/reprice/quality/unallocated',
        views: results,
        errors: failures,
      },
      null,
      2,
    ),
  );
  console.log(`Usage synthetic UI: ${results.length} views and lifecycle flow passed`);
} finally {
  await browser.close();
  await new Promise<void>((r, reject) => server.close((e) => (e ? reject(e) : r())));
  db.close();
}
