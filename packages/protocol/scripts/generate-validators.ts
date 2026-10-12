/**
 * 从 docs/protocol/schema/ 生成预编译校验器 src/generated/validators.js。
 *
 * 为什么预编译：Ajv 运行时用 new Function 生成校验函数，浏览器在严格 CSP 下不允许；
 * 预编译之后前端和服务端跑同一份代码。
 *
 * 用法：pnpm --filter @moriium-dashboard/protocol generate
 * 改了 Schema 或 Ajv 版本后要重新生成；测试会检查生成结果是否过期。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formats } from '../src/ajv-runtime.ts';
import { KNOWN_SCHEMA_VERSIONS } from '../src/constants.ts';

const require = createRequire(import.meta.url);
// ajv 是 CommonJS 包，用 require 取命名导出最稳妥。
const { Ajv2020, _ } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const standaloneCode = require('ajv/dist/standalone/index.js')
  .default as typeof import('ajv/dist/standalone/index.js').default;

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
export const outputPath = join(here, '..', 'src', 'generated', 'validators.js');

export function exportName(version: string): string {
  return `validateV${version.replace('.', '_')}`;
}

export function loadSchema(version: string): { $id: string } & Record<string, unknown> {
  const path = join(repoRoot, 'docs', 'protocol', 'schema', `project-status.v${version}.schema.json`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

const RUNTIME_IMPORT =
  "import { formats as __formats, ucs2lengthModule as __ucs2length } from '../ajv-runtime.ts';";

export function generateValidatorsSource(): string {
  const schemas = KNOWN_SCHEMA_VERSIONS.map(loadSchema);
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    schemas,
    formats,
    code: { source: true, esm: true, formats: _`__formats` },
  });
  const exportsMap = Object.fromEntries(
    KNOWN_SCHEMA_VERSIONS.map((v, i) => [exportName(v), schemas[i]?.$id ?? '']),
  );
  let code = standaloneCode(ajv, exportsMap);

  code = code.replaceAll('require("ajv/dist/runtime/ucs2length")', '__ucs2length');
  if (/\brequire\(/.test(code)) throw new Error('生成代码里还有未处理的 require()');
  if (/new Function|\beval\(/.test(code)) throw new Error('生成代码里出现了动态求值');

  code = code.replace(/^"use strict";/, '');
  return [
    '// 由 packages/protocol/scripts/generate-validators.ts 生成，不要手改。',
    '// biome-ignore-all lint: generated',
    RUNTIME_IMPORT,
    code,
    '',
  ].join('\n');
}

export function generateTypesSource(): string {
  const lines = [
    '// 由 packages/protocol/scripts/generate-validators.ts 生成，不要手改。',
    "import type { ErrorObject } from 'ajv';",
    '',
    'export interface CompiledValidator {',
    '  (data: unknown): boolean;',
    '  errors?: ErrorObject[] | null;',
    '}',
    '',
    ...KNOWN_SCHEMA_VERSIONS.map((v) => `export declare const ${exportName(v)}: CompiledValidator;`),
    '',
  ];
  return lines.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, generateValidatorsSource());
  writeFileSync(outputPath.replace(/\.js$/, '.d.ts'), generateTypesSource());
  console.log(`已生成 ${KNOWN_SCHEMA_VERSIONS.map(exportName).join('、')}`);
}
