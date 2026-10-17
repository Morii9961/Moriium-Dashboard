import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthError } from '../src/auth/errors.ts';
import { LOGIN_WINDOW_MS, reserveLogin } from '../src/auth/limits.ts';
import { hashPassphrase, verifyPassphrase } from '../src/auth/password.ts';
import { createAuthService } from '../src/auth/service.ts';
import {
  clearSessionCookie,
  issueSession,
  readSession,
  revokeAllSessions,
  revokeSession,
  SESSION_IDLE_MS,
  SESSION_LIFETIME_MS,
  sessionCookie,
} from '../src/auth/sessions.ts';
import { createAccount, openAuthDatabase, readAccount, recordAuthEvent } from '../src/auth/store.ts';
import { REPO_ROOT } from '../src/config.ts';
import { applyMigrations, type Database, loadMigrations, openDatabase } from '../src/db.ts';
import { exportAll } from '../src/export.ts';

const now = new Date('2026-10-17T01:00:00.000Z');
const at = now.getTime();
const demoPhrase = 'Synthetic phrase for demo only 2026';
let encoded: string;
let db: Database;
let dir: string;
const later = (milliseconds: number) => new Date(at + milliseconds);
const seed = (target: Database) =>
  target.prepare('INSERT INTO auth_account VALUES(1,?,?,1,?,?)').run('demo-user', encoded, at, at);
beforeAll(async () => {
  encoded = await hashPassphrase(demoPhrase);
}, 15_000);
beforeEach(() => {
  db = openAuthDatabase(':memory:');
  seed(db);
  dir = mkdtempSync(join(tmpdir(), 'dashboard-auth-test-'));
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

it('uses a fresh salt and verifies the real fixed-cost scrypt without normalizing the passphrase', async () => {
  const different = await hashPassphrase(demoPhrase);
  expect(different).not.toBe(encoded);
  expect(encoded).not.toContain(demoPhrase);
  expect(await verifyPassphrase(demoPhrase, encoded)).toBe(true);
  expect(await verifyPassphrase(`${demoPhrase} `, encoded)).toBe(false);
  const unicode = '架空の合言葉と日本語入力テスト';
  expect(await verifyPassphrase(unicode, await hashPassphrase(unicode))).toBe(true);
}, 15_000);

it('rejects short, huge, malformed Unicode and whitespace input, and rejects unknown or malformed credential encodings', async () => {
  for (const value of [
    '',
    'short',
    ' '.repeat(15),
    'a'.repeat(1025),
    String.fromCodePoint(0xd800).repeat(15),
  ])
    await expect(hashPassphrase(value)).rejects.toThrow('invalid_passphrase');
  for (const stored of [
    '{}',
    encoded.replace('"version":1', '"version":2'),
    encoded.replace('"salt":', '"extra":1,"salt":'),
    `${encoded} `,
  ])
    await expect(verifyPassphrase(demoPhrase, stored)).rejects.toThrow('auth_database');
});

it('creates an account only once and cannot silently replace the owner', async () => {
  db.exec('DELETE FROM auth_account');
  await createAccount(db, 'demo-user', demoPhrase, now);
  expect(readAccount(db).login).toBe('demo-user');
  await expect(createAccount(db, 'other-user', demoPhrase, now)).rejects.toThrow('account_exists');
  expect(readAccount(db).login).toBe('demo-user');
  expect(db.prepare('SELECT event FROM auth_events').all()).toEqual([{ event: 'setup' }]);
});

it('issues a new opaque session, stores only its digest, rotates the presented session, and keeps cookies strict', async () => {
  const auth = createAuthService(db);
  const first = await auth.login('demo-user', demoPhrase, now);
  expect(readSession(db, first, now)).toMatchObject({ login: 'demo-user' });
  const second = await auth.login('demo-user', demoPhrase, later(60_000), first);
  expect(second).not.toBe(first);
  expect(readSession(db, first, later(60_000))).toBeNull();
  expect(readSession(db, second, later(60_000))).toMatchObject({ login: 'demo-user' });
  expect(JSON.stringify(db.prepare('SELECT * FROM auth_sessions').all())).not.toContain(second);
  expect(sessionCookie(second)).toContain('Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400');
  expect(sessionCookie(second)).toMatch(/^__Host-moriium_session=/);
  expect(sessionCookie(second)).not.toContain('Domain=');
  expect(db.prepare("SELECT attempts FROM auth_limits WHERE bucket='account'").get()?.attempts).toBe(0);
  expect(db.prepare("SELECT attempts FROM auth_limits WHERE bucket='global'").get()?.attempts).toBe(2);
  expect(clearSessionCookie()).toContain('Max-Age=0');
  expect(() => sessionCookie('bad\r\nvalue')).toThrow();
});

it('caps retained sessions at five and keeps the most recently issued session usable', () => {
  const tokens = Array.from({ length: 6 }, () => issueSession(db, 1, at));
  expect(readSession(db, tokens[0], now)).toBeNull();
  for (const value of tokens.slice(1)) expect(readSession(db, value, now)).not.toBeNull();
  expect(db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get()?.n).toBe(5);
});

it('expires idle sessions, enforces an absolute lifetime despite activity, and rejects time rollback', async () => {
  const auth = createAuthService(db);
  const idle = await auth.login('demo-user', demoPhrase, now);
  expect(readSession(db, idle, later(SESSION_IDLE_MS))).toBeNull();
  const active = await auth.login('demo-user', demoPhrase, now);
  for (let hour = 1; hour < 24; hour++)
    expect(readSession(db, active, later(hour * 60 * 60_000))).not.toBeNull();
  expect(readSession(db, active, later(SESSION_LIFETIME_MS))).toBeNull();
  const rollback = await auth.login('demo-user', demoPhrase, now);
  expect(readSession(db, rollback, later(-1))).toBeNull();
}, 15_000);

it('invalidates sessions on logout, revoke-all or a credential revision change; malformed and foreign tokens fail closed', async () => {
  const auth = createAuthService(db);
  const first = await auth.login('demo-user', demoPhrase, now);
  revokeSession(db, first, now);
  expect(readSession(db, first, now)).toBeNull();
  const second = await auth.login('demo-user', demoPhrase, now);
  revokeAllSessions(db, now);
  expect(readSession(db, second, now)).toBeNull();
  const third = await auth.login('demo-user', demoPhrase, now);
  db.exec('UPDATE auth_account SET revision=revision+1');
  expect(readSession(db, third, now)).toBeNull();
  for (const value of [null, '', 'x'.repeat(43), 'x'.repeat(100_000), ['bad'], third.slice(1)])
    expect(readSession(db, value, now)).toBeNull();
}, 15_000);

it('returns generic failures for unknown accounts and wrong inputs without storing submitted text', async () => {
  const auth = createAuthService(db);
  for (const [login, phrase] of [
    ['unknown-user', demoPhrase],
    ['demo-user', 'Wrong synthetic phrase 2026'],
    ['demo-user', 'short'],
  ])
    await expect(auth.login(login, phrase, now)).rejects.toThrow('invalid_credentials');
  expect(db.prepare('SELECT event FROM auth_events').all()).toEqual([
    { event: 'failure' },
    { event: 'failure' },
    { event: 'failure' },
  ]);
  expect(JSON.stringify(db.prepare('SELECT * FROM auth_events').all())).not.toMatch(
    /unknown-user|phrase|demo-user/,
  );
});

it('bounds simultaneous memory-hard verification and refuses a session if credentials change while hashing', async () => {
  const auth = createAuthService(db);
  const first = auth.login('demo-user', demoPhrase, now);
  await expect(auth.login('demo-user', demoPhrase, now)).rejects.toThrow('busy');
  db.exec('UPDATE auth_account SET revision=revision+1');
  await expect(first).rejects.toThrow('credentials_changed');
  expect(db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get()?.n).toBe(0);
  expect(await auth.login('demo-user', demoPhrase, now)).toBeTruthy();
});

describe('persistent limits and database boundaries', () => {
  it('refuses repository, sync-folder and directory targets before creating an authentication file', () => {
    const repository = join(REPO_ROOT, 'screenshots', 'auth-rejected.sqlite');
    expect(existsSync(repository)).toBe(false);
    expect(() => openAuthDatabase(repository)).toThrow('auth_database');
    expect(existsSync(repository)).toBe(false);
    const synced = join(dir, 'OneDrive');
    mkdirSync(synced);
    const target = join(synced, 'auth.sqlite');
    expect(() => openAuthDatabase(target)).toThrow('auth_database');
    expect(existsSync(target)).toBe(false);
    expect(() => openAuthDatabase(dir)).toThrow('auth_database');
  });

  it('blocks the eleventh reserved attempt across all aliases, does not extend the lock, and resets only after the window', () => {
    for (let i = 0; i < 10; i++) reserveLogin(db, at);
    for (const offset of [0, 1000, LOGIN_WINDOW_MS - 1]) {
      try {
        reserveLogin(db, at + offset);
        throw new Error('should block');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).retryAfter).toBe(Math.ceil((LOGIN_WINDOW_MS - offset) / 1000));
      }
    }
    expect(db.prepare("SELECT COUNT(*) AS n FROM auth_events WHERE event='limited'").get()?.n).toBe(1);
    expect(() => reserveLogin(db, at + LOGIN_WINDOW_MS)).not.toThrow();
    expect(() => reserveLogin(db, at - 1)).toThrow('limited');
  });

  it('retains limits and session validity across database reopen, and global limits survive successful logins', async () => {
    const path = join(dir, 'auth.sqlite');
    let disk = openAuthDatabase(path);
    if (process.platform !== 'win32') expect(statSync(path).mode & 0o777).toBe(0o600);
    seed(disk);
    const token = await createAuthService(disk).login('demo-user', demoPhrase, now);
    disk.prepare("UPDATE auth_limits SET attempts=60 WHERE bucket='global'").run();
    disk.close();
    disk = openAuthDatabase(path);
    try {
      expect(readSession(disk, token, now)).toMatchObject({ login: 'demo-user' });
      await expect(createAuthService(disk).login('demo-user', demoPhrase, now)).rejects.toThrow('limited');
      expect(disk.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get()?.n).toBe(1);
    } finally {
      disk.close();
    }
  });

  it('refuses a business database and an unknown auth schema without altering their tables', () => {
    const path = join(dir, 'business.sqlite');
    const business = openDatabase(path);
    applyMigrations(business, loadMigrations(join(REPO_ROOT, 'apps/server/migrations')));
    const before = business.prepare('SELECT name,sql FROM sqlite_schema ORDER BY name').all();
    expect(Buffer.from(exportAll(business, now, 'test')).includes(Buffer.from(encoded))).toBe(false);
    business.close();
    expect(() => openAuthDatabase(path)).toThrow('auth_database');
    const after = openDatabase(path);
    try {
      expect(after.prepare('SELECT name,sql FROM sqlite_schema ORDER BY name').all()).toEqual(before);
    } finally {
      after.close();
    }
    const brokenPath = join(dir, 'broken.sqlite'),
      broken = openDatabase(brokenPath);
    broken.exec('CREATE TABLE unknown(id INTEGER)');
    broken.close();
    expect(() => openAuthDatabase(brokenPath)).toThrow('auth_database');
    expect(() => openAuthDatabase('relative.sqlite')).toThrow('auth_database');
  });

  it('keeps login events bounded and never creates a business schema or exportable credentials in it', () => {
    for (let i = 0; i < 1010; i++) recordAuthEvent(db, 'failure', at + i);
    expect(db.prepare('SELECT COUNT(*) AS n FROM auth_events').get()?.n).toBe(1000);
    expect(db.prepare('SELECT MIN(at_ms) AS first FROM auth_events').get()?.first).toBe(at + 10);
    expect(
      db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name='status_snapshots'").get(),
    ).toBeUndefined();
  });
});
