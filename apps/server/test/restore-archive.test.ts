import { expect, it } from 'vitest';
import { parseExportJson, readArchive } from '../src/restore/archive.ts';
import { createZip } from '../src/zip.ts';

const now = new Date('2026-10-16T01:00:00.000Z');
const json = (value: unknown) => Buffer.from(JSON.stringify(value));
const entries = [
  { name: 'manifest.json', data: json({ app: 'demo' }) },
  { name: 'data.json', data: json({}) },
];
const good = createZip(entries, now);

it('reads writer output as bounded in-memory byte views', () => {
  const files = readArchive(good);
  expect([...files.keys()]).toEqual(['manifest.json', 'data.json']);
  expect(files.get('data.json')).toEqual(new Uint8Array(entries[1]?.data ?? []));
});

it('rejects duplicate, case-aliased and unsafe names before any disk extraction', () => {
  for (const name of [
    'manifest.json',
    'MANIFEST.JSON',
    '../escape',
    '/absolute',
    'a//b',
    'a/./b',
    'a\\b',
    'a:b',
    'a/',
  ])
    expect(() => readArchive(createZip([...entries, { name, data: json({}) }], now))).toThrow('zip_name');
});

it('rejects CRC errors, local/central mismatches, unsupported flags/methods, broken bounds and trailing bytes', () => {
  const central = new DataView(good.buffer).getUint32(good.length - 6, true);
  for (const [offset, value] of [
    [0, 0],
    [6, 1],
    [8, 8],
    [14, 1],
    [30, 0],
    [central + 10, 8],
    [central + 42, 1],
    [good.length - 10, 255],
  ] as const) {
    const bytes = good.slice();
    bytes[offset] = value;
    expect(() => readArchive(bytes)).toThrow();
  }
  const corrupt = good.slice();
  corrupt[30 + 'manifest.json'.length] = 0;
  expect(() => readArchive(corrupt)).toThrow('zip_crc');
  expect(() => readArchive(Buffer.concat([good, Buffer.from([0])]))).toThrow();
  for (let length = 0; length < 30; length++) expect(() => readArchive(good.subarray(0, length))).toThrow();
});

it('rejects oversized entries and entry counts from headers before allocation or traversal', () => {
  const tooMany = good.slice();
  new DataView(tooMany.buffer).setUint16(good.length - 12, 10_003, true);
  expect(() => readArchive(tooMany)).toThrow('zip_directory');
  const oversized = good.slice();
  const v = new DataView(oversized.buffer),
    central = v.getUint32(good.length - 6, true);
  v.setUint32(central + 20, 64 * 1024 + 1, true);
  v.setUint32(central + 24, 64 * 1024 + 1, true);
  expect(() => readArchive(oversized)).toThrow('entry_size');
});

it('rejects duplicate escaped JSON keys, invalid UTF-8, non-finite numbers and excessive nesting without echoing contents', () => {
  for (const value of ['{"a":1,"\\u0061":2}', '{"a":1e999}', `${'['.repeat(65)}0${']'.repeat(65)}`])
    expect(() => parseExportJson(Buffer.from(value))).toThrow();
  expect(() => parseExportJson(new Uint8Array([0xff]))).toThrow('invalid_json');
  expect(() => parseExportJson(Buffer.from(`{"value":"gh\\u0070_${'x'.repeat(40)}"}`))).toThrow(
    'suspected_secret',
  );
  expect(parseExportJson(json({ a: [1, { b: 'quoted {} [] : value' }], c: true }))).toEqual({
    a: [1, { b: 'quoted {} [] : value' }],
    c: true,
  });
});
