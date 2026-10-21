import { readFileSync } from 'node:fs';
import { parseUsage } from '../usage.ts';

try {
  const path = process.argv[2];
  if (!path) throw new Error();
  const r = parseUsage(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(path)));
  console.log(r.ok ? `UsageSnapshot ${r.snapshot.schema_version}: valid` : r.error);
  process.exitCode = r.ok ? 0 : 1;
} catch {
  console.log('usage_file_unreadable');
  process.exitCode = 1;
}
