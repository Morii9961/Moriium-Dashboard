/// <reference lib="dom" />
import type { Page } from '@playwright/test';
import type { en } from '../apps/web/src/i18n/messages/en.ts';

export async function auditCommands(page: Page, messages: typeof en, screenshot: string) {
  const dialog = page.locator('.command-dialog');
  const input = dialog.locator('input[name="command-search"]');
  const trigger = page.getByRole('button', { name: messages['commands.open'], exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await input.waitFor();
  if (!(await input.evaluate((el) => el === document.activeElement)))
    throw new Error('Command search not focused');
  await page.waitForFunction(() => document.querySelectorAll('.command-results button').length === 50);
  await input.fill('demo.extra-59');
  await dialog.locator('.command-results button').filter({ hasText: 'demo.extra-59' }).waitFor();
  for (const alias of [
    '演示研发',
    '架空の開発',
    'Demonstration research',
    'ＤＥＭＯ．ＢＥＴＡ',
    'demo beta',
  ]) {
    await input.fill(alias);
    await dialog.locator('.command-results button').filter({ hasText: 'demo.beta' }).waitFor();
    if ((await dialog.locator('.command-results button').count()) !== 1)
      throw new Error('Project alias search failed');
  }
  await page.keyboard.press('ArrowDown');
  if (!(await dialog.locator('.command-results button').evaluate((el) => el === document.activeElement)))
    throw new Error('Arrow navigation failed');
  await page.keyboard.press('ArrowUp');
  if (!(await input.evaluate((el) => el === document.activeElement))) throw new Error('Arrow return failed');
  await dialog.screenshot({ path: screenshot });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    throw new Error('Command overflow');
  await input.fill('no-result-demonstration');
  await dialog.getByText(messages['commands.empty'], { exact: true }).waitFor();
  await page.keyboard.press('Enter');
  if (!(await dialog.isVisible())) throw new Error('Empty result executed');
  await page.keyboard.press('Escape');
  if (!(await trigger.evaluate((el) => el === document.activeElement)))
    throw new Error('Escape lost command trigger');
  const open = async () => {
    await page.keyboard.press('Control+k');
    await input.waitFor();
  };
  const select = async (label: string) => {
    await input.fill(label);
    await page.keyboard.press('Enter');
  };
  await open();
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    if (!(await dialog.evaluate((el) => el.contains(document.activeElement))))
      throw new Error('Modal focus escaped');
  }
  await input.focus();
  await input.fill(messages['tasks.new']);
  await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true });
  if (!(await dialog.isVisible())) throw new Error('IME confirmation executed a command');
  await page.keyboard.press('Enter');
  await page.waitForURL('**/planner');
  const task = page.locator('.tasks-panel > .task-editor');
  await task.waitFor();
  await page.waitForFunction(() => document.activeElement?.matches('.task-editor legend'));
  await task.locator('input[name="task-title"]').fill('演示未保存任务');
  await open();
  page.once('dialog', (d) => d.dismiss());
  await select('demo.beta');
  if (
    new URL(page.url()).pathname !== '/planner' ||
    (await task.locator('input[name="task-title"]').inputValue()) !== '演示未保存任务'
  )
    throw new Error('Rejected command navigation lost draft');
  await open();
  await select(messages['tasks.new']);
  if ((await task.locator('input[name="task-title"]').inputValue()) !== '演示未保存任务')
    throw new Error('New task command replaced draft');
  await open();
  page.once('dialog', (d) => d.accept());
  await select('demo.beta');
  await page.waitForURL('**/projects/demo.beta');
  await open();
  await select(messages['works.new']);
  await page.waitForURL('**/studio');
  const work = page.locator('.works-panel > .work-editor');
  await work.waitFor();
  await page.waitForFunction(() => document.activeElement?.matches('.work-editor legend'));
  await work.locator('input[name="work-title"]').fill('演示未保存成果');
  await open();
  await select(messages['nav.import']);
  await page.locator('.idialog[open]').waitFor();
  await page.locator('.idialog .paste-snapshot summary').click();
  await page.locator('.idialog textarea').fill('演示未保存 JSON');
  await page.keyboard.press('Control+k');
  if ((await dialog.isVisible()) || !(await page.locator('.idialog').isVisible()))
    throw new Error('Command shortcut took over another modal');
  if ((await page.locator('.idialog textarea').inputValue()) !== '演示未保存 JSON')
    throw new Error('Command shortcut lost paste draft');
  page.once('dialog', (d) => d.accept());
  await page.locator('.idialog .idialog-actions .btn-quiet').click();
  await open();
  await select(messages['works.new']);
  if ((await work.locator('input[name="work-title"]').inputValue()) !== '演示未保存成果')
    throw new Error('New work command replaced draft');
  page.once('dialog', (d) => d.accept());
  await work.locator('button[type="button"]').click();
  await work.waitFor({ state: 'detached' });
  await page.keyboard.press('Meta+k');
  await input.waitFor();
  await page.keyboard.press('Meta+k');
  await dialog.waitFor({ state: 'hidden' });
}
