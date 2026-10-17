import { type Database, transaction } from '../db.ts';
import { AuthError } from './errors.ts';
import { recordAuthEvent } from './store.ts';

export const LOGIN_WINDOW_MS = 15 * 60_000;
const LIMITS = { global: 60, account: 10 } as const;
interface Limit {
  start_ms: number;
  attempts: number;
  notified: number;
}
/** Reserve before async hashing. Both buckets survive restarts and aliases cannot create new buckets. */
export function reserveLogin(db: Database, at: number) {
  const retry = transaction(db, () => {
    let seconds = 0;
    for (const [bucket, limit] of Object.entries(LIMITS)) {
      let row = db
        .prepare('SELECT start_ms,attempts,notified FROM auth_limits WHERE bucket=?')
        .get(bucket) as unknown as Limit | undefined;
      if (!row || at - row.start_ms >= LOGIN_WINDOW_MS) {
        db.prepare(`INSERT INTO auth_limits VALUES(?,?,0,0) ON CONFLICT(bucket)
          DO UPDATE SET start_ms=excluded.start_ms,attempts=0,notified=0`).run(bucket, at);
        row = { start_ms: at, attempts: 0, notified: 0 };
      }
      if (row.attempts >= limit || at < row.start_ms) {
        seconds = Math.max(seconds, Math.ceil((row.start_ms + LOGIN_WINDOW_MS - at) / 1000));
        if (!row.notified) {
          db.prepare('UPDATE auth_limits SET notified=1 WHERE bucket=?').run(bucket);
          recordAuthEvent(db, 'limited', at);
        }
      }
    }
    if (!seconds) db.exec('UPDATE auth_limits SET attempts=attempts+1');
    return seconds;
  });
  if (retry) throw new AuthError('limited', retry);
}
export function clearAccountFailures(db: Database, at: number) {
  db.prepare("UPDATE auth_limits SET attempts=0,start_ms=?,notified=0 WHERE bucket='account'").run(at);
}
