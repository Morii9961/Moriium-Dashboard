/**
 * 数据库备份（04 第 12 节）：每天一次在线备份，迁移前强制备份一次。
 * 保留最近 14 份日备份和 8 份周备份；迁移前的备份保留最近 5 份。
 */
import { mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { backup } from 'node:sqlite';
import type { Database } from './db.ts';

export type BackupKind = 'daily' | 'pre-migration';

export interface BackupFile {
  name: string;
  kind: BackupKind;
  at: Date;
}

export const RETENTION = { daily: 14, weekly: 8, preMigration: 5 } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 20261012T013000Z */
function stamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

const NAME = /^(daily|pre-migration)-(?:v\d{4}-)?(\d{8}T\d{6}Z)\.sqlite$/;

export function backupName(kind: BackupKind, at: Date, schemaVersion?: number): string {
  const version = kind === 'pre-migration' ? `v${String(schemaVersion ?? 0).padStart(4, '0')}-` : '';
  return `${kind}-${version}${stamp(at)}.sqlite`;
}

export function parseBackupName(name: string): BackupFile | null {
  const m = NAME.exec(name);
  const s = m?.[2];
  if (!m || !s) return null;
  const at = new Date(
    `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`,
  );
  return Number.isNaN(at.getTime()) ? null : { name, kind: m[1] as BackupKind, at };
}

export function listBackups(dir: string): BackupFile[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .map(parseBackupName)
    .filter((b): b is BackupFile => b !== null)
    .sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** 先写到临时文件再改名，半截的备份不会被当成有效备份。 */
export async function createBackup(
  db: Database,
  dir: string,
  kind: BackupKind,
  now: Date,
  schemaVersion?: number,
): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const name = backupName(kind, now, schemaVersion);
  const tmp = join(dir, `${name}.partial`);
  await backup(db, tmp);
  const target = join(dir, name);
  renameSync(tmp, target);
  return target;
}

export function isDailyBackupDue(files: readonly BackupFile[], now: Date): boolean {
  const latest = files.find((f) => f.kind === 'daily');
  return !latest || now.getTime() - latest.at.getTime() >= DAY_MS;
}

/** ISO 周的键，例如 2026-W41。 */
export function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** 返回应当删除的备份文件名。最近 14 份日备份全留；更早的每周留最新一份，最多 8 周。 */
export function planRetention(files: readonly BackupFile[]): string[] {
  const newestFirst = [...files].sort((a, b) => b.at.getTime() - a.at.getTime());
  const daily = newestFirst.filter((f) => f.kind === 'daily');
  const keep = new Set(daily.slice(0, RETENTION.daily).map((f) => f.name));

  const weeksKept = new Set<string>();
  for (const f of daily.slice(RETENTION.daily)) {
    const week = isoWeekKey(f.at);
    if (weeksKept.has(week) || weeksKept.size >= RETENTION.weekly) continue;
    weeksKept.add(week);
    keep.add(f.name);
  }
  for (const f of newestFirst.filter((f) => f.kind === 'pre-migration').slice(0, RETENTION.preMigration)) {
    keep.add(f.name);
  }
  return newestFirst.filter((f) => !keep.has(f.name)).map((f) => f.name);
}

export function applyRetention(dir: string, now: Date = new Date()): string[] {
  const remove = planRetention(listBackups(dir));
  // 备份中途崩溃留下的半截文件：超过一天还在，就清掉。
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.partial')) continue;
    if (now.getTime() - statSync(join(dir, name)).mtimeMs > DAY_MS) remove.push(name);
  }
  for (const name of remove) rmSync(join(dir, name), { force: true });
  return remove;
}

/** 到时间就做一次日备份并清理旧备份；返回新备份的路径，没到时间返回 null。 */
export async function runDailyBackupIfDue(db: Database, dir: string, now: Date): Promise<string | null> {
  if (!isDailyBackupDue(listBackups(dir), now)) return null;
  const path = await createBackup(db, dir, 'daily', now);
  applyRetention(dir);
  return path;
}
