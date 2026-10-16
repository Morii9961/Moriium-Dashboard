/// <reference lib="dom" />
/** Synthetic local QA. Does not open the user's database or the running instance. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { chromium } from '@playwright/test';
import { createApp } from '../apps/server/src/app.ts';
import { applyMigrations, loadMigrations, openDatabase } from '../apps/server/src/db.ts';
import { en } from '../apps/web/src/i18n/messages/en.ts';
import { ja } from '../apps/web/src/i18n/messages/ja.ts';
import { zhHans } from '../apps/web/src/i18n/messages/zh-Hans.ts';
import { auditCommands } from './p5-commands-qa.ts';

const { serve } = createRequire(resolve('apps/server/package.json'))('@hono/node-server');
const dir = mkdtempSync(join(tmpdir(), 'dashboard-p5-extras-'));
if (!resolve(dir).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe cleanup');
const db = openDatabase(join(dir, 'test.sqlite'));
applyMigrations(db, loadMigrations(resolve('apps/server/migrations')));
db.exec('DELETE FROM projects');
const at = new Date().toISOString();
db.prepare('INSERT INTO projects(id,name,name_ja,name_en,created_at,updated_at) VALUES(?,?,?,?,?,?)').run(
  'demo.beta',
  '演示研发项目',
  '架空の開発プロジェクト',
  'Demonstration research project',
  at,
  at,
);
if (process.argv[2] === 'commands') {
  for (let i = 0; i < 60; i++)
    db.prepare('INSERT INTO projects(id,name,created_at,updated_at) VALUES(?,?,?,?)').run(
      `demo.extra-${String(i).padStart(2, '0')}`,
      `虚构项目 ${i} · Longer demonstration project`,
      at,
      at,
    );
}
const port = 5192;
const base = `http://127.0.0.1:${port}`;
const app = createApp({
  db,
  config: { allowedHosts: [`127.0.0.1:${port}`], allowedOrigins: [base], backupDir: join(dir, 'backups') },
  startedAt: new Date(),
  version: 'qa',
  webDir: resolve('screenshots/p5-extras-dist'),
});
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port });
const browser = await chromium.launch({ channel: 'chrome' });
const phase = process.argv[2] ?? 'paste';
const out = `screenshots/p5-${phase}`;
mkdirSync(out, { recursive: true });
const fixture = JSON.parse(readFileSync('fixtures/protocol/history/t1-base.json', 'utf8'));
const count = () => (db.prepare('SELECT COUNT(*) AS n FROM status_snapshots').get() as { n: number }).n;
let sequence = 0;
try {
  for (const width of [1440, 375])
    for (const theme of ['light', 'dark'] as const)
      for (const locale of ['zh-Hans', 'ja', 'en'] as const) {
        const messages = { 'zh-Hans': zhHans, ja, en }[locale];
        const page = await browser.newPage({
          viewport: { width, height: 900 },
          colorScheme: theme,
          reducedMotion: 'reduce',
        });
        const errors: string[] = [];
        await page.addInitScript(
          ({ theme, locale }) => {
            localStorage.setItem('moriium-dashboard.theme', theme);
            localStorage.setItem('moriium-dashboard.locale', locale);
          },
          { theme, locale },
        );
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (e) => {
          if (e.type() === 'error') errors.push(e.text());
        });
        page.on('request', (r) => {
          if (!r.url().startsWith(base)) errors.push('External request');
          if (phase === 'commands' && !['GET', 'HEAD'].includes(r.method()))
            errors.push('Unexpected command write request');
        });
        await page.goto(base, { waitUntil: 'networkidle' });
        if (phase === 'paste') {
          const open = () => page.getByRole('button', { name: messages['nav.import'], exact: true }).click();
          const dialog = page.locator('.idialog');
          const text = dialog.locator('textarea[name="snapshot-json"]');
          const add = dialog.getByRole('button', { name: messages['import.previewPaste'], exact: true });
          const cards = dialog.locator('.icard');
          const snapshot = structuredClone(fixture);
          snapshot.summary += ` ${++sequence}`;
          snapshot.snapshot_at = new Date(Date.parse(fixture.snapshot_at) + sequence * 1000).toISOString();
          const raw = ` \r\n${JSON.stringify(snapshot, null, 2)}\r\n `;
          const old = {
            ...snapshot,
            snapshot_at: new Date(Date.parse(snapshot.snapshot_at) - 86400000).toISOString(),
            summary: `Earlier fictional report ${sequence}`,
          };
          const before = count();
          await open();
          await dialog.locator('.paste-snapshot summary').focus();
          await page.keyboard.press('Enter');
          await text.fill('{unfinished draft');
          page.once('dialog', (d) => d.dismiss());
          await page.keyboard.press('Escape');
          if (!(await dialog.isVisible()) || (await text.inputValue()) !== '{unfinished draft')
            throw new Error('Escape lost paste');
          await text.fill('あ'.repeat(350000));
          await add.click();
          await text.locator('..').getByRole('alert').waitFor();
          if ((await text.inputValue()).length !== 350000 || (await cards.count()))
            throw new Error('Oversize paste was lost or queued');
          await text.fill('{ invalid JSON');
          await add.click();
          await dialog.locator('.icard.tone-bad').waitFor();
          if (count() !== before) throw new Error('Preview wrote a snapshot');
          await cards.locator('.icard-remove').click();
          await text.fill(`\x60\x60\x60json\n${JSON.stringify(snapshot)}\n\x60\x60\x60`);
          await add.click();
          await dialog.getByRole('button', { name: messages['import.fence.extract'], exact: true }).click();
          await dialog.locator('.icard.tone-good').waitFor();
          await cards.locator('.icard-remove').click();
          await dialog.locator('input[type="file"]').setInputFiles({
            name: 'demo-old.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify(old)),
          });
          await dialog.locator('.icard-meta').waitFor();
          await text.fill(raw);
          const pastedValue = await text.inputValue();
          await add.focus();
          await page.keyboard.press('Enter');
          await page.waitForFunction(
            () => document.querySelectorAll('.icard.tone-good,.icard.tone-muted').length === 2,
          );
          if (count() !== before) throw new Error('Combined preview wrote a snapshot');
          if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
            throw new Error('Paste overflow');
          await page.screenshot({ path: `${out}/${width}-${theme}-${locale}.png`, fullPage: true });
          const commit = dialog.locator('.idialog-actions .btn-primary');
          await commit.click();
          await dialog.locator('.iresult').waitFor();
          if (count() !== before + 2) throw new Error('Mixed file and paste import failed');
          const saved = db
            .prepare(
              "SELECT raw FROM status_snapshots WHERE file_name='pasted-snapshot.json' ORDER BY id DESC LIMIT 1",
            )
            .get() as { raw: Uint8Array };
          if (Buffer.from(saved.raw).toString('utf8') !== pastedValue)
            throw new Error('Textarea bytes changed during import');
          await dialog.getByRole('button', { name: messages['import.close'], exact: true }).click();
          await open();
          await dialog.locator('.paste-snapshot summary').click();
          if (await text.inputValue()) throw new Error('Previous paste retained');
          await text.fill(raw);
          await add.click();
          await dialog.locator('.icard.tone-muted').waitFor();
          if (!(await commit.isDisabled()) || count() !== before + 2)
            throw new Error('Duplicate paste can be imported');
          await dialog.getByRole('button', { name: messages['import.cancel'], exact: true }).last().click();
        } else if (phase === 'commands') {
          const before = {
            snapshots: count(),
            tasks: db.prepare('SELECT COUNT(*) AS n FROM tasks').get()?.n,
            works: db.prepare('SELECT COUNT(*) AS n FROM works').get()?.n,
          };
          await auditCommands(page, messages, `${out}/${width}-${theme}-${locale}.png`);
          if (
            count() !== before.snapshots ||
            db.prepare('SELECT COUNT(*) AS n FROM tasks').get()?.n !== before.tasks ||
            db.prepare('SELECT COUNT(*) AS n FROM works').get()?.n !== before.works
          )
            throw new Error('Command wrote business data');
        } else throw new Error('Unknown QA phase');
        if (errors.length) throw new Error(errors.join('\n'));
        console.log(`${phase}: ${width}/${theme}/${locale} passed`);
        await page.close();
      }
} finally {
  await browser.close();
  await new Promise<void>((done, reject) => server.close((e: Error | undefined) => (e ? reject(e) : done())));
  db.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
}
