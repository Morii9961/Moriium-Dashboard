/**
 * SQLite 访问层。驱动用 Node 内置的 node:sqlite（Node 24.15 起为 release candidate，见 ADR 0003）。
 * 数据访问集中在这一层，以后需要换成 better-sqlite3 时只改这里（规划 R9）。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type Database = DatabaseSync;

export function openDatabase(path: string): Database {
  const db = new DatabaseSync(path, { timeout: 5000, enableForeignKeyConstraints: true });
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  return db;
}

/** 在一个事务里执行；出错时回滚并重新抛出。 */
export function transaction<T>(db: Database, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  }
}

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const MIGRATION_FILE = /^(\d{4})_([a-z0-9_]+)\.sql$/;

/** 读取迁移目录：0001_init.sql、0002_xxx.sql……版本号必须从 1 开始连续。 */
export function loadMigrations(dir: string): Migration[] {
  const migrations = readdirSync(dir)
    .map((file) => ({ file, match: MIGRATION_FILE.exec(file) }))
    .filter((entry): entry is { file: string; match: RegExpExecArray } => entry.match !== null)
    .map(({ file, match }) => ({
      version: Number(match[1]),
      name: match[2] ?? '',
      sql: readFileSync(join(dir, file), 'utf8'),
    }))
    .sort((a, b) => a.version - b.version);
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error(`迁移版本不连续：期望 ${i + 1}，看到 ${m.version}（${m.name}）`);
  });
  return migrations;
}

function ensureMigrationsTable(db: Database) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  ) STRICT`);
}

export function currentSchemaVersion(db: Database): number {
  ensureMigrationsTable(db);
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number | null };
  return row.v ?? 0;
}

export function pendingMigrations(db: Database, migrations: readonly Migration[]): Migration[] {
  const current = currentSchemaVersion(db);
  if (current > migrations.length) {
    throw new Error(
      `数据库的结构版本（${current}）比这个程序认识的（${migrations.length}）新，请升级 Dashboard。`,
    );
  }
  return migrations.filter((m) => m.version > current);
}

/** 依次执行待执行的迁移，每个迁移一个事务。 */
export function applyMigrations(
  db: Database,
  migrations: readonly Migration[],
  now: () => Date = () => new Date(),
) {
  ensureMigrationsTable(db);
  for (const m of migrations) {
    transaction(db, () => {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        m.version,
        m.name,
        now().toISOString(),
      );
    });
  }
}
