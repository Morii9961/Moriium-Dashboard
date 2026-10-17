import { createHash, randomBytes } from 'node:crypto';
import { type Database, transaction } from '../db.ts';
import { authRequire, authTime } from './errors.ts';
import { readAccount, recordAuthEvent } from './store.ts';

export const SESSION_LIFETIME_MS = 24 * 60 * 60_000;
export const SESSION_IDLE_MS = 2 * 60 * 60_000;
export const SESSION_COOKIE = '__Host-moriium_session';
const ATTRIBUTES = 'Path=/; HttpOnly; Secure; SameSite=Strict';
export function tokenDigest(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  const bytes = Buffer.from(value, 'base64url');
  if (bytes.length !== 32 || bytes.toString('base64url') !== value) return null;
  return createHash('sha256').update(bytes).digest('hex');
}
export function sessionCookie(value: string) {
  authRequire(tokenDigest(value));
  return `${SESSION_COOKIE}=${value}; ${ATTRIBUTES}; Max-Age=${SESSION_LIFETIME_MS / 1000}`;
}
export const clearSessionCookie = () => `${SESSION_COOKIE}=; ${ATTRIBUTES}; Max-Age=0`;

/** Trusted internal primitive; only call after successful credential verification. */
export function issueSession(db: Database, revision: number, at: number, previous?: unknown): string {
  const value = randomBytes(32).toString('base64url'),
    digest = tokenDigest(value);
  authRequire(digest);
  const old = tokenDigest(previous);
  if (old) db.prepare('DELETE FROM auth_sessions WHERE digest=?').run(old);
  db.prepare('INSERT INTO auth_sessions VALUES(?,?,?,?)').run(digest, revision, at, at);
  db.prepare('DELETE FROM auth_sessions WHERE created_ms<=? OR seen_ms<=? OR revision!=?').run(
    at - SESSION_LIFETIME_MS,
    at - SESSION_IDLE_MS,
    revision,
  );
  db.exec(
    'DELETE FROM auth_sessions WHERE digest NOT IN (SELECT digest FROM auth_sessions ORDER BY created_ms DESC,rowid DESC LIMIT 5)',
  );
  return value;
}
export function readSession(
  db: Database,
  value: unknown,
  now: Date,
): { login: string; expiresAt: string } | null {
  const digest = tokenDigest(value);
  if (!digest) return null;
  const at = authTime(now);
  return transaction(db, () => {
    const row = db
      .prepare(`SELECT s.created_ms,s.seen_ms,a.login FROM auth_sessions s JOIN auth_account a
      ON a.id=1 AND a.revision=s.revision WHERE digest=?`)
      .get(digest) as { created_ms: number; seen_ms: number; login: string } | undefined;
    if (
      !row ||
      at < row.created_ms ||
      at < row.seen_ms ||
      at - row.created_ms >= SESSION_LIFETIME_MS ||
      at - row.seen_ms >= SESSION_IDLE_MS
    ) {
      db.prepare('DELETE FROM auth_sessions WHERE digest=?').run(digest);
      return null;
    }
    if (at - row.seen_ms >= 60_000)
      db.prepare('UPDATE auth_sessions SET seen_ms=? WHERE digest=?').run(at, digest);
    return { login: row.login, expiresAt: new Date(row.created_ms + SESSION_LIFETIME_MS).toISOString() };
  });
}
export function revokeSession(db: Database, value: unknown, now: Date) {
  const digest = tokenDigest(value),
    at = authTime(now);
  if (!digest) return;
  transaction(db, () => {
    if (db.prepare('DELETE FROM auth_sessions WHERE digest=?').run(digest).changes)
      recordAuthEvent(db, 'logout', at);
  });
}
export function revokeAllSessions(db: Database, now: Date) {
  transaction(db, () => {
    readAccount(db);
    db.exec('DELETE FROM auth_sessions');
    recordAuthEvent(db, 'revoke', authTime(now));
  });
}
