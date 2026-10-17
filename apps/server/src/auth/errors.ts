export type AuthCode =
  | 'invalid_account'
  | 'invalid_passphrase'
  | 'auth_database'
  | 'account_exists'
  | 'not_configured'
  | 'invalid_credentials'
  | 'limited'
  | 'busy'
  | 'credentials_changed';
export class AuthError extends Error {
  readonly retryAfter: number;
  constructor(code: AuthCode, retryAfter = 0) {
    super(code);
    this.name = 'AuthError';
    this.retryAfter = retryAfter;
  }
}
export function authRequire(condition: unknown, code: AuthCode = 'auth_database'): asserts condition {
  if (!condition) throw new AuthError(code);
}
export function authTime(now: Date): number {
  const at = now.getTime();
  authRequire(Number.isSafeInteger(at) && at >= 0);
  return at;
}
