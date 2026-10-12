import { MAX_FILE_BYTES } from './constants.ts';

export type DecodeResult =
  | { ok: true; text: string; hadBom: boolean }
  | { ok: false; reason: 'too_large' | 'utf16' | 'utf32' | 'not_utf8'; size: number };

/**
 * 03 第 2 节：只接受 UTF-8。带 BOM 的去掉 BOM 后接受（调用方记提醒）；
 * UTF-16、UTF-32 和无效的 UTF-8（例如 GBK）一律拒绝。
 */
export function decodeSnapshotBytes(bytes: Uint8Array): DecodeResult {
  const size = bytes.length;
  if (size > MAX_FILE_BYTES) return { ok: false, reason: 'too_large', size };

  const b = (i: number) => bytes[i];
  if (b(0) === 0x00 && b(1) === 0x00 && b(2) === 0xfe && b(3) === 0xff)
    return { ok: false, reason: 'utf32', size };
  if (b(0) === 0xff && b(1) === 0xfe && b(2) === 0x00 && b(3) === 0x00)
    return { ok: false, reason: 'utf32', size };
  if ((b(0) === 0xff && b(1) === 0xfe) || (b(0) === 0xfe && b(1) === 0xff))
    return { ok: false, reason: 'utf16', size };
  if (looksLikeUtf16WithoutBom(bytes)) return { ok: false, reason: 'utf16', size };

  const hadBom = b(0) === 0xef && b(1) === 0xbb && b(2) === 0xbf;
  try {
    // ignoreBOM: true 让解码器保留 BOM，下面自己去掉，确保 hadBom 与结果一致。
    const decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    return { ok: true, text: hadBom ? decoded.slice(1) : decoded, hadBom };
  } catch {
    return { ok: false, reason: 'not_utf8', size };
  }
}

/** 没有 BOM 的 UTF-16：JSON 的 ASCII 字符会在奇数或偶数位置留下大量 0 字节。 */
function looksLikeUtf16WithoutBom(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 512);
  if (n < 4) return false;
  let evenZeros = 0;
  let oddZeros = 0;
  for (let i = 0; i < n; i++) {
    if (bytes[i] === 0) {
      if (i % 2 === 0) evenZeros++;
      else oddZeros++;
    }
  }
  const half = n / 2;
  return evenZeros > half * 0.3 || oddZeros > half * 0.3;
}
