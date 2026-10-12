/**
 * 把 tokens.ts 渲染成静态 CSS（src/styles/tokens.css）。
 * 静态文件不依赖运行时脚本，也不需要放宽 CSP；主题靠 <html data-theme> 和系统偏好切换。
 */
import { type ColorTokens, MOTION, RADIUS, SPACE, type Theme, TYPE, tokensFor } from './tokens.ts';

const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

function colorVars(theme: Theme, indent: string): string {
  const t: ColorTokens = tokensFor(theme);
  const lines = [`${indent}color-scheme: ${theme};`];
  for (const [role, value] of Object.entries(t)) lines.push(`${indent}--c-${kebab(role)}: ${value};`);
  return lines.join('\n');
}

function scaleVars(indent: string): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(SPACE)) lines.push(`${indent}--space-${k}: ${v}px;`);
  for (const [k, v] of Object.entries(RADIUS)) lines.push(`${indent}--radius-${k}: ${v}px;`);
  for (const [k, v] of Object.entries(TYPE)) lines.push(`${indent}--text-${k}: ${v};`);
  lines.push(`${indent}--ease: ${MOTION.ease};`);
  for (const k of ['fast', 'base', 'slow'] as const) lines.push(`${indent}--dur-${k}: ${MOTION[k]};`);
  return lines.join('\n');
}

export function renderTokensCss(): string {
  return `/* 由 apps/web/scripts/gen-tokens.ts 根据 src/design/tokens.ts 生成，不要手改。运行 pnpm tokens 重新生成。 */

:root {
${scaleVars('  ')}
}

/* 浅色「雾」：默认，也是 data-theme="light"。 */
:root,
:root[data-theme="light"] {
${colorVars('light', '  ')}
}

/* 深色「夜」：手动选择深色。 */
:root[data-theme="dark"] {
${colorVars('dark', '  ')}
}

/* 跟随系统：没有手动选择时按系统偏好。 */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${colorVars('dark', '    ')}
  }
}
`;
}
