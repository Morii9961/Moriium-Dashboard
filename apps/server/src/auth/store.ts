/** Separate private auth database: business exports/restores never carry credentials or sessions.
 * This module has no default path and is not connected to main.ts yet.
 */
import { chmodSync, closeSync, lstatSync, openSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { isInSyncedFolder, isInside, REPO_ROOT } from '../config.ts';
import { type Database, transaction } from '../db.ts';
import { authRequire, authTime } from './errors.ts';
import { accountName, hashPassphrase } from './password.ts';

const TABLES = ['auth_meta', 'auth_account', 'auth_sessions', 'auth_limits', 'auth_events'];
const SCHEMA = `
  CREATE TABLE auth_meta (id INTEGER PRIMARY KEY CHECK(id=1), version INTEGER NOT NULL CHECK(version=1)) STRICT;
  INSERT INTO auth_meta VALUES(1,1);
  CREATE TABLE auth_account (id INTEGER PRIMARY KEY CHECK(id=1), login TEXT NOT NULL, credential TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK(revision>0), created_ms INTEGER NOT NULL, updated_ms INTEGER NOT NULL) STRICT;
  CREATE TABLE auth_sessions (digest TEXT PRIMARY KEY CHECK(length(digest)=64), revision INTEGER NOT NULL,
    created_ms INTEGER NOT NULL, seen_ms INTEGER NOT NULL) STRICT;
  CREATE TABLE auth_limits (bucket TEXT PRIMARY KEY CHECK(bucket IN ('global','account')), start_ms INTEGER NOT NULL,
    attempts INTEGER NOT NULL, notified INTEGER NOT NULL CHECK(notified IN (0,1))) STRICT;
  CREATE TABLE auth_events (id INTEGER PRIMARY KEY, at_ms INTEGER NOT NULL,
    event TEXT NOT NULL CHECK(event IN ('setup','success','failure','limited','logout','revoke'))) STRICT;
`;
export function openAuthDatabase(path: string): Database {
  authRequire(path === ':memory:' || isAbsolute(path));
  let target = path;
  if (path !== ':memory:') {
    const parent = realpathSync(dirname(path));
    target = join(parent, basename(path));
    authRequire(!isInside(realpathSync(REPO_ROOT), target) && !isInSyncedFolder(target, process.env));
    // Private files in an owner-controlled directory; Windows uses the parent's ACL.
    authRequire(process.platform === 'win32' || (statSync(parent).mode & 0o022) === 0);
    try {
      closeSync(openSync(target, 'wx', 0o600));
    } catch (error) {
      authRequire((error as NodeJS.ErrnoException).code === 'EEXIST');
      const info = lstatSync(target);
      authRequire(info.isFile() && !info.isSymbolicLink());
    }
  }
  const db = new DatabaseSync(target, { timeout: 5000, enableForeignKeyConstraints: true });
  try {
    const tables = db
      .prepare("SELECT name FROM sqlite_schema WHERE type='table'")
      .all()
      .map((r) => r.name);
    // Inspect before changing journaling or schema: never initialize over a business database.
    if (tables.length === 0) transaction(db, () => db.exec(SCHEMA));
    else
      authRequire(
        tables.length === TABLES.length &&
          TABLES.every((name) => tables.includes(name)) &&
          db.prepare('SELECT version FROM auth_meta WHERE id=1').get()?.version === 1,
      );
    if (target !== ':memory:') chmodSync(target, 0o600);
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
export interface Account {
  login: string;
  credential: string;
  revision: number;
}
export function readAccount(db: Database): Account {
  const row = db.prepare('SELECT login,credential,revision FROM auth_account WHERE id=1').get() as unknown as
    | Account
    | undefined;
  authRequire(row, 'not_configured');
  accountName(row.login);
  authRequire(Number.isSafeInteger(row.revision) && row.revision > 0);
  return row;
}
export type AuthEvent = 'setup' | 'success' | 'failure' | 'limited' | 'logout' | 'revoke';
export function recordAuthEvent(db: Database, event: AuthEvent, at: number) {
  db.prepare('INSERT INTO auth_events(at_ms,event) VALUES(?,?)').run(at, event);
  db.exec('DELETE FROM auth_events WHERE id NOT IN (SELECT id FROM auth_events ORDER BY id DESC LIMIT 1000)');
}
export async function createAccount(db: Database, login: unknown, value: unknown, now: Date) {
  const name = accountName(login),
    at = authTime(now);
  authRequire(!db.prepare('SELECT 1 FROM auth_account').get(), 'account_exists');
  const encoded = await hashPassphrase(value);
  transaction(db, () => {
    authRequire(!db.prepare('SELECT 1 FROM auth_account').get(), 'account_exists');
    db.prepare('INSERT INTO auth_account VALUES(1,?,?,1,?,?)').run(name, encoded, at, at);
    recordAuthEvent(db, 'setup', at);
  });
}
