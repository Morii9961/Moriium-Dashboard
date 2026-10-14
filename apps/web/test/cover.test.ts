import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { stripWebpMetadata } from '../src/app/cover.ts';

const raw = readFileSync(resolve('fixtures/media/demo-encoded.webp'));
it('removes the browser ICC block and all opaque metadata without changing the encoded image', () => {
  const clean = Buffer.from(stripWebpMetadata(raw));
  expect(raw.includes(Buffer.from('ICCP'))).toBe(true);
  expect(clean.includes(Buffer.from('ICCP'))).toBe(false);
  expect(clean[20]).toBe(0);
  expect(clean.subarray(clean.indexOf('VP8 '))).toEqual(raw.subarray(raw.indexOf('VP8 ')));
  for (const tag of ['EXIF', 'XMP ', 'DEMO']) {
    const bytes = Buffer.concat([raw, Buffer.from(tag), Buffer.from([2, 0, 0, 0, 1, 2])]);
    bytes.writeUInt32LE(bytes.length - 8, 4);
    expect(Buffer.from(stripWebpMetadata(bytes))).toEqual(clean);
  }
});
it('rejects malformed and truncated container lengths', () => {
  expect(() => stripWebpMetadata(raw.subarray(0, raw.length - 1))).toThrow('invalid_cover');
  const bytes = Buffer.from(raw);
  bytes.writeUInt32LE(0xffffffff, 16);
  expect(() => stripWebpMetadata(bytes)).toThrow('invalid_cover');
});
