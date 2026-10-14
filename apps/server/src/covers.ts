/** Container guard, not an image decoder. The browser encodes pixels first.
 * Format: https://developers.google.com/speed/webp/docs/riff_container
 * Reject metadata, unknown chunks, animation, trailing bytes and dimensions >800.
 */
export function validateCover(bytes: Uint8Array): boolean {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    b.length < 26 ||
    b.length > 5 * 1024 * 1024 ||
    b.toString('latin1', 0, 4) !== 'RIFF' ||
    b.toString('latin1', 8, 12) !== 'WEBP' ||
    b.readUInt32LE(4) !== b.length - 8
  )
    return false;
  let width = 0,
    height = 0,
    canvasWidth = 0,
    canvasHeight = 0,
    alpha = false,
    image = false;
  const seen = new Set<string>();
  for (let at = 12; at < b.length; ) {
    if (at + 8 > b.length) return false;
    const kind = b.toString('latin1', at, at + 4),
      size = b.readUInt32LE(at + 4),
      start = at + 8,
      end = start + size;
    if (
      end + (size % 2) > b.length ||
      seen.has(kind) ||
      !['VP8X', 'ALPH', 'VP8 ', 'VP8L'].includes(kind) ||
      image
    )
      return false;
    if (size % 2 && b[end] !== 0) return false;
    seen.add(kind);
    if (kind === 'VP8X') {
      if (at !== 12 || size !== 10 || (b[start] ?? 0) & ~0x10 || b.readUIntLE(start + 1, 3) !== 0)
        return false;
      alpha = !!((b[start] ?? 0) & 0x10);
      canvasWidth = 1 + b.readUIntLE(start + 4, 3);
      canvasHeight = 1 + b.readUIntLE(start + 7, 3);
    } else if (kind === 'ALPH') {
      if (!alpha || size < 1) return false;
    } else if (kind === 'VP8 ') {
      if (
        size < 10 ||
        (b[start] ?? 1) & 1 ||
        b[start + 3] !== 0x9d ||
        b[start + 4] !== 1 ||
        b[start + 5] !== 0x2a
      )
        return false;
      width = b.readUInt16LE(start + 6) & 0x3fff;
      height = b.readUInt16LE(start + 8) & 0x3fff;
      if (b.readUInt16LE(start + 6) > 0x3fff || b.readUInt16LE(start + 8) > 0x3fff) return false;
      image = true;
    } else {
      if (size < 6 || b[start] !== 0x2f || seen.has('ALPH')) return false;
      const bits = b.readUInt32LE(start + 1);
      if (bits >>> 29) return false;
      width = 1 + (bits & 0x3fff);
      height = 1 + ((bits >>> 14) & 0x3fff);
      image = true;
    }
    at = end + (size % 2);
  }
  return (
    image &&
    width > 0 &&
    height > 0 &&
    width <= 800 &&
    height <= 800 &&
    (!canvasWidth || (canvasWidth === width && canvasHeight === height)) &&
    (!seen.has('ALPH') || seen.has('VP8 '))
  );
}
