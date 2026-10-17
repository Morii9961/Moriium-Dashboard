import { type Database, transaction } from '../db.ts';
import { AuthError, authRequire, authTime } from './errors.ts';
import { clearAccountFailures, reserveLogin } from './limits.ts';
import { verifyPassphrase } from './password.ts';
import { issueSession } from './sessions.ts';
import { readAccount, recordAuthEvent } from './store.ts';

/** Create once for the single server process. No HTTP routes or activation side effects. */
export function createAuthService(db: Database) {
  let busy = false;
  return {
    async login(login: unknown, value: unknown, now: Date, previous?: unknown): Promise<string> {
      if (busy) throw new AuthError('busy', 1);
      const at = authTime(now),
        account = readAccount(db);
      // All input account aliases share the single-account bucket, preventing username rotation bypass.
      reserveLogin(db, at);
      busy = true;
      try {
        let verified = false;
        try {
          verified = await verifyPassphrase(value, account.credential);
        } catch (error) {
          if (!(error instanceof AuthError) || error.message !== 'invalid_passphrase') throw error;
        }
        const token = transaction(db, () => {
          const current = readAccount(db);
          authRequire(
            current.revision === account.revision &&
              current.credential === account.credential &&
              current.login === account.login,
            'credentials_changed',
          );
          if (!verified || login !== account.login) {
            recordAuthEvent(db, 'failure', at);
            return null;
          }
          clearAccountFailures(db, at);
          const token = issueSession(db, account.revision, at, previous);
          recordAuthEvent(db, 'success', at);
          return token;
        });
        if (!token) throw new AuthError('invalid_credentials');
        return token;
      } finally {
        busy = false;
      }
    },
  };
}
