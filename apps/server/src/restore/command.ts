/** Offline restore; never uses the running instance or a default data directory. */
import {
  chmodSync,
  closeSync,
  fstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  unlinkSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT, resolveConfig } from '../config.ts';
import { MAX_RESTORE_BYTES, RestoreError, requireRestore } from './archive.ts';
import { buildRestoredDatabase } from './build.ts';

export function readExportFile(file: string): Uint8Array {
  const fd = openSync(file, 'r');
  try {
    const before = fstatSync(fd);
    requireRestore(before.isFile() && before.size >= 22 && before.size <= MAX_RESTORE_BYTES, 'archive_size');
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(fd, bytes, offset, bytes.length - offset, offset);
      requireRestore(count > 0, 'archive_changed');
      offset += count;
    }
    const after = fstatSync(fd);
    requireRestore(
      before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs,
      'archive_changed',
    );
    return bytes;
  } finally {
    closeSync(fd);
  }
}

export async function runRestore(args: string[], log: (line: string) => void = console.log) {
  const [mode, file, flag, target] = args;
  requireRestore(
    (mode === '--check' && args.length === 2) ||
      (mode === '--apply' && args.length === 4 && flag === '--target' && !!target),
    'usage',
  );
  requireRestore(file, 'usage');
  let destination: string | undefined;
  if (mode === '--apply') {
    requireRestore(target && isAbsolute(target), 'absolute_target_required');
    // Resolve the existing parent before applying repo/sync-folder restrictions.
    // mkdir below refuses any existing final component, including symlinks and empty directories.
    destination = join(realpathSync(dirname(resolve(target))), basename(resolve(target)));
    const repoRoot = realpathSync(REPO_ROOT);
    resolveConfig({
      env: {
        ...process.env,
        MORIIUM_DASHBOARD_DATA: destination,
        MORIIUM_DASHBOARD_ALLOW_SYNCED_DATA_DIR: '0',
      },
      platform: process.platform,
      homedir: homedir(),
      repoRoot,
    });
  }
  const restored = await buildRestoredDatabase(readExportFile(file));
  try {
    log(JSON.stringify({ status: 'checked', exportedAt: restored.exportedAt, counts: restored.counts }));
    if (!destination) return;
    // Exclusively reserve a NEW directory. No existing directory or database is opened for writing.
    // If disk writing fails, leave this directory for inspection; never recurse-delete user paths.
    mkdirSync(destination, { mode: 0o700 });
    const stagedPath = join(destination, '.restore.sqlite');
    await backup(restored.db, stagedPath);
    chmodSync(stagedPath, 0o600);
    const published = new DatabaseSync(stagedPath, { readOnly: true });
    try {
      requireRestore(
        published.prepare('PRAGMA quick_check').get()?.quick_check === 'ok' &&
          published.prepare('PRAGMA foreign_key_check').all().length === 0,
        'written_integrity_check',
      );
      for (const [table, count] of [
        ['projects', restored.counts.projects],
        ['status_snapshots', restored.counts.snapshots],
        ['tasks', restored.counts.tasks],
        ['works', restored.counts.works],
      ] as const)
        requireRestore(
          published.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n === count,
          'written_count_mismatch',
        );
    } finally {
      published.close();
    }
    // Same-directory hard link publishes the verified file atomically and refuses overwrite.
    linkSync(stagedPath, join(destination, 'dashboard.sqlite'));
    unlinkSync(stagedPath);
    log(JSON.stringify({ status: 'restored', counts: restored.counts, serviceStarted: false }));
  } finally {
    restored.db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await runRestore(process.argv.slice(2));
  } catch (error) {
    // Do not expose arbitrary filesystem paths or untrusted package content in diagnostics.
    console.error(error instanceof RestoreError ? error.message : 'restore_failed');
    console.error(
      'Usage: pnpm data:restore --check <export.zip> | --apply <export.zip> --target <NEW_ABSOLUTE_DIR>',
    );
    process.exitCode = 1;
  }
}
