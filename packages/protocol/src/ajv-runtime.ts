/**
 * 预编译校验器（src/generated/validators.js）运行时需要的两样东西。
 * 生成脚本把 Ajv 输出里的 require(...) 改写成从这里导入，
 * 这样校验器是纯 ESM，运行时不依赖 ajv，也不用 new Function（严格 CSP 下可用）。
 */
import { isValidDateTime } from './datetime.ts';

/** 按 Unicode 码位计算长度，与 JSON Schema 对 maxLength 的定义一致。 */
function ucs2length(str: string): number {
  let length = 0;
  for (const _ of str) length++;
  return length;
}

/** 生成代码里写的是 `require("ajv/dist/runtime/ucs2length").default`。 */
export const ucs2lengthModule = { default: ucs2length };

export const formats = {
  'date-time': { type: 'string' as const, validate: isValidDateTime },
};
