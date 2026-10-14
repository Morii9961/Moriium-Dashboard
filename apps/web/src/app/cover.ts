import { ApiError } from './api.ts';
/** Encode only decoded pixels. The original bytes and filename never leave the browser. */
export async function encodeCover(file: File): Promise<Blob> {
  if (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new ApiError(400, 'invalid_cover');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ApiError(400, 'invalid_cover');
  }
  try {
    if (bitmap.width * bitmap.height > 80000000) throw new ApiError(400, 'invalid_cover');
    const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new ApiError(400, 'invalid_cover');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/webp', 0.86));
    // The standard permits PNG fallback when WebP encoding isn't supported.
    if (blob?.type !== 'image/webp' || blob.size > 5 * 1024 * 1024) throw new ApiError(400, 'invalid_cover');
    return new Blob([stripWebpMetadata(new Uint8Array(await blob.arrayBuffer())).buffer], {
      type: 'image/webp',
    });
  } finally {
    bitmap.close();
  }
}

/** The canvas uses sRGB pixels; keep only image chunks and clear metadata flags.
 * Canvas serialization can add a default ICC profile. Strip that too, so the
 * server accepts no opaque metadata chunk from any upload path.
 */
export function stripWebpMetadata(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const tag = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WEBP') throw new ApiError(400, 'invalid_cover');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) !== bytes.length - 8) throw new ApiError(400, 'invalid_cover');
  const chunks: Uint8Array[] = [];
  for (let at = 12; at < bytes.length; ) {
    if (at + 8 > bytes.length) throw new ApiError(400, 'invalid_cover');
    const kind = tag(at),
      size = view.getUint32(at + 4, true),
      end = at + 8 + size + (size % 2);
    if (end > bytes.length) throw new ApiError(400, 'invalid_cover');
    if (['VP8X', 'ALPH', 'VP8 ', 'VP8L'].includes(kind)) {
      const chunk = bytes.slice(at, end);
      if (kind === 'VP8X') {
        if (size !== 10) throw new ApiError(400, 'invalid_cover');
        chunk[8] = (chunk[8] ?? 0) & 0x10;
      }
      chunks.push(chunk);
    }
    at = end;
  }
  const result = new Uint8Array(12 + chunks.reduce((n, c) => n + c.length, 0));
  result.set(bytes.subarray(0, 12));
  let at = 12;
  for (const chunk of chunks) {
    result.set(chunk, at);
    at += chunk.length;
  }
  new DataView(result.buffer).setUint32(4, result.length - 8, true);
  return result;
}
export async function uploadCover(id: number, revision: number, blob: Blob) {
  let response: Response;
  try {
    response = await fetch(`/api/works/${id}/cover?revision=${revision}`, {
      method: 'PUT',
      headers: { 'X-Moriium-Dashboard': '1', 'Content-Type': 'image/webp' },
      body: blob,
    });
  } catch {
    throw new ApiError(0, 'offline');
  }
  if (!response.ok) {
    const data = (await response.json()) as { error?: string };
    throw new ApiError(response.status, data.error ?? 'unknown');
  }
}
