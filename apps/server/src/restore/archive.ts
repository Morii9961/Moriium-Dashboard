/** Only the store-only UTF-8 ZIP profile emitted by zip.ts is accepted.
 * PKWARE APPNOTE 6.3.10 §4.3 / §4.4: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
 * No extraction to disk, decompression, ZIP64, links, extra records or ambiguous names.
 */
import { scanSecrets } from '@moriium-dashboard/protocol';
import { crc32 } from '../zip.ts';

export const MAX_RESTORE_BYTES = 256 * 1024 * 1024;
export class RestoreError extends Error {
  constructor(code: string) {
    super(code);
    this.name = 'RestoreError';
  }
}
export function requireRestore(condition: unknown, code = 'invalid_export'): asserts condition {
  if (!condition) throw new RestoreError(code);
}

export function readArchive(zip: Uint8Array): Map<string, Uint8Array> {
  requireRestore(zip.length >= 22 && zip.length <= MAX_RESTORE_BYTES, 'archive_size');
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.length - 22;
  requireRestore(v.getUint32(end, true) === 0x06054b50, 'zip_end');
  const count = v.getUint16(end + 10, true);
  const central = v.getUint32(end + 16, true);
  requireRestore(
    count >= 2 &&
      count <= 10_002 &&
      v.getUint16(end + 4, true) === 0 &&
      v.getUint16(end + 6, true) === 0 &&
      v.getUint16(end + 8, true) === count &&
      v.getUint16(end + 20, true) === 0 &&
      central + v.getUint32(end + 12, true) === end,
    'zip_directory',
  );
  const files = new Map<string, Uint8Array>();
  const names = new Set<string>();
  const dec = new TextDecoder('utf-8', { fatal: true });
  let p = central;
  let local = 0;
  for (let i = 0; i < count; i++) {
    requireRestore(p + 46 <= end && v.getUint32(p, true) === 0x02014b50, 'zip_header');
    const length = v.getUint16(p + 28, true);
    const size = v.getUint32(p + 24, true);
    requireRestore(
      length > 0 &&
        length <= 240 &&
        p + 46 + length <= end &&
        v.getUint16(p + 4, true) === 20 &&
        v.getUint16(p + 6, true) === 20 &&
        v.getUint16(p + 8, true) === 0x800 &&
        v.getUint16(p + 10, true) === 0 &&
        v.getUint32(p + 20, true) === size &&
        v.getUint16(p + 30, true) === 0 &&
        v.getUint16(p + 32, true) === 0 &&
        v.getUint16(p + 34, true) === 0 &&
        v.getUint16(p + 36, true) === 0 &&
        v.getUint32(p + 38, true) === 0 &&
        v.getUint32(p + 42, true) === local,
      'zip_profile',
    );
    let name: string;
    try {
      name = dec.decode(zip.subarray(p + 46, p + 46 + length));
    } catch {
      throw new RestoreError('zip_name');
    }
    requireRestore(
      /^[A-Za-z0-9+._/-]+$/.test(name) &&
        name.split('/').every((part) => part !== '' && part !== '.' && part !== '..') &&
        !names.has(name.toLowerCase()),
      'zip_name',
    );
    names.add(name.toLowerCase());
    const limit =
      name === 'data.json' || name === 'usage.json'
        ? 32 * 1024 * 1024
        : name === 'manifest.json'
          ? 64 * 1024
          : name.startsWith('media/')
            ? 5 * 1024 * 1024
            : 1024 * 1024;
    requireRestore(size <= limit, 'entry_size');
    requireRestore(local + 30 + length + size <= central, 'zip_bounds');
    requireRestore(v.getUint32(local, true) === 0x04034b50, 'zip_local');
    // Local and central names, timestamps, sizes, CRC, flags and method must agree.
    for (const [a, b, n] of [
      [4, 6, 22],
      [26, 28, 2],
    ] as const) {
      requireRestore(
        Buffer.from(zip.subarray(local + a, local + a + n)).equals(
          Buffer.from(zip.subarray(p + b, p + b + n)),
        ),
        'zip_local',
      );
    }
    requireRestore(
      v.getUint16(local + 28, true) === 0 &&
        Buffer.from(zip.subarray(local + 30, local + 30 + length)).equals(
          Buffer.from(zip.subarray(p + 46, p + 46 + length)),
        ),
      'zip_local',
    );
    const bytes = zip.subarray(local + 30 + length, local + 30 + length + size);
    requireRestore(crc32(bytes) === v.getUint32(p + 16, true), 'zip_crc');
    files.set(name, bytes);
    local += 30 + length + size;
    p += 46 + length;
  }
  requireRestore(local === central && p === end, 'zip_bounds');
  return files;
}

/** JSON.parse first establishes syntax. Token scanning then rejects duplicate keys
 * (including escaped aliases), non-finite numbers and excessive nesting.
 * Diagnostics never echo package contents, names or secrets.
 */
export function parseExportJson(bytes: Uint8Array): unknown {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    requireRestore(!scanSecrets(text).length, 'suspected_secret');
    const value: unknown = JSON.parse(text);
    const stack: (Set<string> | null)[] = [];
    const tokens = /"(?:[^"\\]|\\.)*"|[{}[\]]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
    for (const token of text.matchAll(tokens)) {
      const t = token[0];
      if (t === '{' || t === '[') {
        stack.push(t === '{' ? new Set() : null);
        requireRestore(stack.length <= 64, 'json_depth');
      } else if (t === '}' || t === ']') stack.pop();
      else if (t.startsWith('"')) {
        const decoded: unknown = JSON.parse(t);
        requireRestore(typeof decoded === 'string' && !scanSecrets(decoded).length, 'suspected_secret');
        if (/^\s*:/.test(text.slice((token.index ?? 0) + t.length))) {
          const key = decoded;
          const keys = stack.at(-1);
          requireRestore(typeof key === 'string' && keys && !keys.has(key), 'duplicate_key');
          keys.add(key);
        }
      } else requireRestore(Number.isFinite(Number(t)), 'invalid_number');
    }
    return value;
  } catch (error) {
    if (error instanceof RestoreError) throw error;
    throw new RestoreError('invalid_json');
  }
}
