import { chromium } from '@playwright/test';

const out = process.argv[2],
  theme = process.argv[3] ?? 'light',
  q = process.argv[4] ?? '';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: theme });
const errors = [];
p.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
p.on('pageerror', (e) => errors.push(String(e)));
await p.goto(`http://127.0.0.1:5173/specimen.html?theme=${theme}${q}`, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/r2-top-${theme}.png` });
const card = p.locator('.pcard').nth(2);
await card.scrollIntoViewIfNeeded();
await card.hover();
await p.waitForTimeout(700);
await p.screenshot({ path: `${out}/r2-hover-${theme}.png` });
console.log('errors:', errors.length ? errors.join('\n') : 'none');
await b.close();
