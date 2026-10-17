/** Node 24 crypto.scrypt, fixed OWASP scrypt parameters; no caller-controlled cost.
 * https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt
 */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { authRequire } from './errors.ts';

const COST = { N: 131_072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 } as const;
interface Credential {
  version: 1;
  salt: string;
  hash: string;
}
export function accountName(value: unknown): string {
  authRequire(typeof value === 'string' && /^[a-z][a-z0-9._-]{0,63}$/.test(value), 'invalid_account');
  return value;
}
function passphrase(value: unknown): string {
  authRequire(
    typeof value === 'string' &&
      value.length <= 1024 &&
      value.isWellFormed() &&
      Buffer.byteLength(value, 'utf8') <= 1024 &&
      [...value].length >= 15 &&
      value.trim().length > 0,
    'invalid_passphrase',
  );
  return value;
}
const derive = (value: string, salt: Uint8Array) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(value, salt, 32, COST, (error, key) => (error ? reject(error) : resolve(key)));
  });
function decode(value: unknown, length: number): Buffer {
  authRequire(typeof value === 'string' && /^[A-Za-z0-9_-]+$/.test(value));
  const bytes = Buffer.from(value, 'base64url');
  authRequire(bytes.length === length && bytes.toString('base64url') === value);
  return bytes;
}
function credential(serialized: string): Credential {
  authRequire(typeof serialized === 'string' && serialized.length <= 200);
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch {
    authRequire(false);
  }
  authRequire(value && typeof value === 'object' && !Array.isArray(value));
  const v = value as Record<string, unknown>;
  authRequire(
    Object.keys(v).length === 3 &&
      v.version === 1 &&
      typeof v.salt === 'string' &&
      typeof v.hash === 'string',
  );
  decode(v.salt, 16);
  decode(v.hash, 32);
  // Require our canonical encoding, so duplicates or alternate representations do not pass.
  authRequire(JSON.stringify({ version: 1, salt: v.salt, hash: v.hash }) === serialized);
  return v as unknown as Credential;
}
export async function hashPassphrase(value: unknown): Promise<string> {
  const input = passphrase(value);
  const salt = randomBytes(16);
  const key = await derive(input, salt);
  try {
    return JSON.stringify({ version: 1, salt: salt.toString('base64url'), hash: key.toString('base64url') });
  } finally {
    key.fill(0);
  }
}
export async function verifyPassphrase(value: unknown, serialized: string): Promise<boolean> {
  const input = passphrase(value),
    stored = credential(serialized);
  const key = await derive(input, decode(stored.salt, 16));
  const expected = decode(stored.hash, 32);
  try {
    return timingSafeEqual(key, expected);
  } finally {
    key.fill(0);
    expected.fill(0);
  }
}
