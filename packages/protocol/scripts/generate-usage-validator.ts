import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const standalone = require('ajv/dist/standalone/index.js')
  .default as typeof import('ajv/dist/standalone/index.js').default;
export function usageValidatorSource() {
  const schema = JSON.parse(
    readFileSync(new URL('../usage/usage-snapshot.v1.schema.json', import.meta.url), 'utf8'),
  );
  const ajv = new Ajv2020({
    strict: true,
    allErrors: true,
    code: { source: true, esm: true },
    schemas: [schema],
  });
  const code = standalone(ajv, { validateUsage: schema.$id }).replaceAll(
    'require("ajv/dist/runtime/ucs2length")',
    '__ucs2length',
  );
  if (/\brequire\(|new Function|\beval\(/.test(code)) throw new Error('unexpected dynamic runtime');
  return `// biome-ignore-all lint: generated\nimport { ucs2lengthModule as __ucs2length } from '../ajv-runtime.ts';\n${code}`;
}
if (process.argv[1] === import.meta.filename) {
  writeFileSync(new URL('../src/generated/usage-validator.js', import.meta.url), usageValidatorSource());
  writeFileSync(
    new URL('../src/generated/usage-validator.d.ts', import.meta.url),
    "import type { CompiledValidator } from './validators.js';\nexport declare const validateUsage: CompiledValidator;\n",
  );
}
