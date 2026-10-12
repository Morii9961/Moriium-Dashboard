/** 生成 src/styles/tokens.css。用法：pnpm tokens */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { renderTokensCss } from '../src/design/tokens-css.ts';

const out = resolve(import.meta.dirname, '..', 'src', 'styles', 'tokens.css');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, renderTokensCss());
console.log(`已生成 ${out}`);
