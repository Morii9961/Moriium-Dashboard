/**
 * 内容指纹（04 第 3 节）：RFC 8785 JSON Canonicalization Scheme 规范化后取 SHA-256。
 * 同一份内容换了缩进或键的顺序，指纹仍然相同。
 *
 * RFC 8785 的数字和字符串写法就是 ECMAScript 的 JSON.stringify，键按 UTF-16 码元排序，
 * 所以这里直接用 JSON.stringify 处理标量，用默认的 sort 排键。
 * 用 Web Crypto 计算哈希，浏览器和 Node 都能用。
 */

export function canonicalize(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('JSON 里不能有非有限数字');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(',')}}`;
  }
  throw new TypeError(`不能规范化的类型：${typeof value}`);
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function contentFingerprint(parsed: unknown): Promise<string> {
  return sha256Hex(canonicalize(parsed));
}
