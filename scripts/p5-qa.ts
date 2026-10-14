/// <reference lib="dom" />
/** Synthetic local QA only. Never opens the user's database. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';
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
  for (const width of process.env.QA_WIDTH ? [Number(process.env.QA_WIDTH)] : [1440, 375])
    for (const theme of ['light', 'dark'] as const)
      for (const locale of process.env.QA_LOCALE ? [process.env.QA_LOCALE] : ['zh-Hans', 'ja', 'en']) {
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
        if (process.env.QA_SLOW_FOCUS)
          await page.route('**/api/focus/*', async (route) => {
            if (route.request().method() === 'GET') await new Promise((done) => setTimeout(done, 500));
            await route.continue();
          });
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
          await page.evaluate(() => window.scrollTo(0, 0));
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
              undefined,
              { timeout: process.env.QA_SLOW_FOCUS ? 2000 : 30000 },
            );
          }
          await page.waitForFunction(() => document.querySelectorAll('.focus-list li').length === 3);
          await page.locator('.focus-list li').last().locator('button').first().click();
          await page.waitForFunction(() =>
            document.querySelectorAll('.focus-list li')[1]?.textContent?.includes('Prepare a longer'),
          );
          await page.locator('.focus-list input[type="checkbox"]').first().click();
          await page.locator('.focus-list input:checked').waitFor();
          await page.reload({ waitUntil: 'networkidle' });
          if (!(await page.locator('.focus-list input[type="checkbox"]').first().isChecked()))
            throw new Error('Focus completion did not persist');
          await page.evaluate(() => window.scrollTo(0, 0));
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
          await page.evaluate(() => window.scrollTo(0, 0));
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
          if (phase === 'p5-3' || phase === 'p5-5') {
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
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({
              path: `${out}/tasks-${width}-${theme}-${locale}-demo.png`,
              fullPage: true,
            });
            if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
              throw new Error('Tasks overflow');
            if (phase === 'p5-5') await auditFilteredDraft(page, 'task');
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
          if (phase === 'p5-4' || phase === 'p5-5') {
            const jpeg = await page.evaluate(async () => {
              const canvas = document.createElement('canvas');
              canvas.width = 1600;
              canvas.height = 900;
              const context = canvas.getContext('2d');
              if (!context) throw new Error('No canvas');
              context.fillStyle = '#517d97';
              context.fillRect(0, 0, 1600, 900);
              const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
              if (!blob) throw new Error('No JPEG');
              return Array.from(new Uint8Array(await blob.arrayBuffer()));
            });
            const marker = Buffer.from('demo-private-location\0');
            const exif = Buffer.alloc(6 + 26 + marker.length);
            exif.write('Exif', 0);
            exif.write('II', 6);
            exif.writeUInt16LE(42, 8);
            exif.writeUInt32LE(8, 10);
            exif.writeUInt16LE(1, 14);
            exif.writeUInt16LE(0x013b, 16);
            exif.writeUInt16LE(2, 18);
            exif.writeUInt32LE(marker.length, 20);
            exif.writeUInt32LE(26, 24);
            marker.copy(exif, 32);
            const segment = Buffer.alloc(4);
            segment[0] = 0xff;
            segment[1] = 0xe1;
            segment.writeUInt16BE(exif.length + 2, 2);
            const originalJpeg = Buffer.concat([
              Buffer.from(jpeg.slice(0, 2)),
              segment,
              exif,
              Buffer.from(jpeg.slice(2)),
            ]);
            page.on('request', (r) => {
              if (r.method() === 'PUT' && r.url().includes('/cover') && r.postDataBuffer()?.includes(marker))
                errors.push('Original EXIF marker leaked');
            });
            await page.goto(`${base}/studio`, { waitUntil: 'networkidle' });
            const title = `演示照片集 ${width}/${theme}/${locale}`;
            for (const [text, kind] of [
              [title, 'photos'],
              ['A longer demonstration article about making something useful', 'article'],
            ]) {
              await page.locator('.works-panel .section-heading button').click();
              await page
                .locator('.work-editor input')
                .first()
                .fill(text as string);
              await page
                .locator('.work-editor select')
                .first()
                .selectOption(kind as string);
              await page.locator('.work-editor select').last().selectOption('demo.beta');
              await page
                .locator('.work-editor textarea')
                .fill('虚构成果说明：光线与色彩经过重新整理，没有真实个人数据。');
              await page.locator('.work-editor button[type="submit"]').focus();
              await page.keyboard.press('Enter');
              await page.waitForFunction(() => !document.querySelector('.work-editor'));
            }
            const card = page.locator('.work-card').filter({ hasText: title });
            await card
              .locator('input[type="file"]')
              .setInputFiles({ name: 'demo-photo.jpg', mimeType: 'image/jpeg', buffer: originalJpeg });
            await card.locator('.work-cover').waitFor();
            await page.waitForFunction(() =>
              Array.from(document.querySelectorAll<HTMLImageElement>('.work-cover')).some(
                (img) => img.naturalWidth === 800 && img.naturalHeight === 450,
              ),
            );
            await card.locator('.work-controls button').nth(1).click();
            await card.locator('p').filter({ hasText: '★' }).waitFor();
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({
              path: `${out}/works-${width}-${theme}-${locale}-demo.png`,
              fullPage: true,
            });
            if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
              throw new Error('Works overflow');
            await page.locator('.work-filters select').first().selectOption('photos');
            if ((await page.locator('.work-card').count()) !== 1) throw new Error('Work filter failed');
            await page.locator('.work-filters select').first().selectOption('');
            if (phase === 'p5-5') await auditFilteredDraft(page, 'work');
            await page.goto(base, { waitUntil: 'networkidle' });
            await page.locator('.delivery-list a[href^="/studio#work-"]').first().waitFor();
            if ((await page.locator('.delivery-list a[href^="/studio#work-"]').count()) !== 2)
              throw new Error('Recent works missing');
            await page.locator('.delivery-list a[href^="/studio#work-"]').first().focus();
            await page.keyboard.press('Enter');
            await page.locator('.work-card').first().waitFor();
            await card.locator('.work-controls button').last().click();
            await page.waitForFunction(() => document.querySelectorAll('.work-card').length === 1);
            await page.locator('.work-trash summary').click();
            const trashed = page.locator('.work-trash p').filter({ hasText: title });
            await trashed.locator('button').click();
            await page.waitForFunction(() => document.querySelectorAll('.work-card').length === 2);
            await page.locator('.work-card').first().locator('.work-controls button').last().click();
            await page.waitForFunction(() => document.querySelectorAll('.work-card').length === 1);
            await page.locator('.work-card').first().locator('.work-controls button').last().click();
            await page.waitForFunction(() => !document.querySelector('.work-card'));
          }
        }
        if (phase === 'p5-5') await auditPersonalUi(page, base);
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

async function auditFilteredDraft(page: Page, kind: 'task' | 'work') {
  let dialogs = 0;
  const dismiss = async (dialog: import('@playwright/test').Dialog) => {
    dialogs++;
    await dialog.dismiss();
  };
  page.on('dialog', dismiss);
  try {
    const row = page.locator(kind === 'task' ? '.tasks-panel > .task-list .task-row' : '.work-card').first();
    await row
      .locator(kind === 'task' ? '.page-actions > button' : '.work-controls > button')
      .first()
      .click();
    const editor = row.locator(`.${kind}-editor`);
    await editor.locator(`input[name="${kind}-title"]`).fill('演示保留草稿');
    const actions =
      kind === 'task' ? row.locator('.task-check input') : row.locator('.work-controls > button');
    if (!(await actions.last().isDisabled())) throw new Error('Editing row has conflicting action');
    const filter = page.locator(kind === 'task' ? '.task-filter select' : '.work-filters select').first();
    await filter.selectOption(kind === 'task' ? 'demo.beta' : 'article');
    if (
      dialogs !== 1 ||
      (await filter.inputValue()) !== '' ||
      (await editor.locator(`input[name="${kind}-title"]`).inputValue()) !== '演示保留草稿'
    )
      throw new Error('Filter discarded draft without agreement');
    page.off('dialog', dismiss);
    page.once('dialog', (dialog) => dialog.accept());
    await editor.locator('button[type="button"]').click();
    await editor.waitFor({ state: 'detached' });
  } finally {
    page.off('dialog', dismiss);
  }
}

async function auditPersonalUi(page: Page, base: string) {
  let accept = false;
  const dialogs: string[] = [];
  const handle = async (dialog: import('@playwright/test').Dialog) => {
    dialogs.push(dialog.type());
    if (accept) await dialog.accept();
    else await dialog.dismiss();
  };
  page.on('dialog', handle);
  const settle = () =>
    page.evaluate(
      () => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
    );
  const formLabels = async () => {
    const errors = await page
      .locator('.personal-editor')
      .evaluateAll((forms) =>
        forms.flatMap((form) =>
          Array.from(form.querySelectorAll<HTMLInputElement>('input,select,textarea')).flatMap((input) =>
            input.labels?.length && input.name ? [] : [input.outerHTML],
          ),
        ),
      );
    if (errors.length) throw new Error(`Form labels/names missing: ${errors.length}`);
  };
  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.locator('.focus-add input').fill('演示尚未保存的焦点');
    await settle();
    await page.locator('a[href="/planner"]:visible').first().click();
    if (
      new URL(page.url()).pathname !== '/' ||
      (await page.locator('.focus-add input').inputValue()) !== '演示尚未保存的焦点' ||
      dialogs.length !== 1
    )
      throw new Error('Draft navigation rejection failed');
    accept = true;
    await page.locator('a[href="/planner"]:visible').first().click();
    await page.waitForURL('**/planner');
    const newTask = page.locator('.tasks-panel .section-heading button');
    await newTask.focus();
    await page.keyboard.press('Enter');
    await page.locator('.task-editor legend').waitFor();
    await page.keyboard.press('Tab');
    if ((await page.evaluate(() => document.activeElement?.getAttribute('name'))) !== 'task-title')
      throw new Error('Editor keyboard entry failed');
    await page.keyboard.type('演示未保存任务');
    await formLabels();
    await settle();
    accept = false;
    const before = dialogs.length;
    await page.goBack();
    await page.waitForURL('**/planner');
    if (
      dialogs.length !== before + 1 ||
      (await page.locator('.task-editor input[name="task-title"]').inputValue()) !== '演示未保存任务'
    )
      throw new Error('Back rejection lost draft');
    accept = true;
    await page.goBack();
    await page.waitForURL(`${base}/`);
    await page.locator('a[href="/studio"]:visible').first().click();
    await page.waitForURL('**/studio');
    const newWork = page.locator('.works-panel .section-heading button');
    await newWork.focus();
    await page.keyboard.press('Enter');
    await page.locator('.work-editor legend').waitFor();
    await page.keyboard.press('Tab');
    await page.keyboard.type('演示未保存成果');
    await formLabels();
    await settle();
    accept = false;
    const unloadBefore = dialogs.length;
    try {
      await page.reload({ waitUntil: 'commit', timeout: 1500 });
    } catch (e) {
      if (
        !(e instanceof Error) ||
        (!e.message.includes('ERR_ABORTED') &&
          !(
            e.name === 'TimeoutError' &&
            dialogs.length === unloadBefore + 1 &&
            dialogs.at(-1) === 'beforeunload'
          ))
      )
        throw e;
    }
    if (
      dialogs.length !== unloadBefore + 1 ||
      dialogs.at(-1) !== 'beforeunload' ||
      (await page.locator('.work-editor input[name="work-title"]').inputValue()) !== '演示未保存成果'
    )
      throw new Error('Reload guard lost draft');
    accept = true;
    await page.locator('.work-editor button[type="button"]').click();
    await page.waitForFunction(() => !document.querySelector('.work-editor'));
    if (!(await newWork.evaluate((el) => el === document.activeElement)))
      throw new Error('Editor close lost focus');
    for (let i = 0; i < 18; i++) {
      await page.keyboard.press('Tab');
      const covered = await page.evaluate(() => {
        const el = document.activeElement;
        if (!(el instanceof HTMLElement) || el.tagName === 'BODY') return false;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!hit && !el.contains(hit) && !hit.contains(el);
      });
      if (covered) throw new Error('Focused element covered by fixed UI');
    }
    await page.goto(`${base}/projects/demo.beta`, { waitUntil: 'networkidle' });
    await page
      .locator('.detail-tabs button')
      .filter({ hasText: /任务|タスク|Tasks/ })
      .click();
    await page.locator('.tasks-panel .section-heading button').click();
    await page.locator('.task-editor input[name="task-title"]').fill('演示页签草稿');
    accept = false;
    const tabBefore = dialogs.length;
    await page.locator('.detail-tabs button').first().click();
    if (dialogs.length !== tabBefore + 1 || !(await page.locator('.task-editor').isVisible()))
      throw new Error('Section discarded draft without agreement');
    accept = true;
    await page.locator('.detail-tabs button').first().click();
    await page.locator('.task-editor').waitFor({ state: 'detached' });
  } finally {
    page.off('dialog', handle);
  }
}
