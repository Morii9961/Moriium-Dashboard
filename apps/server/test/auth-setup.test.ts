import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createAuthService } from '../src/auth/service.ts';
import { readSession } from '../src/auth/sessions.ts';
import { runAuthSetup } from '../src/auth/setup.ts';
import { openAuthDatabase, readAccount, resetAccount } from '../src/auth/store.ts';
import { readHidden, SetupError } from '../src/auth/terminal.ts';
import { REPO_ROOT } from '../src/config.ts';

const now = new Date('2026-10-17T01:00:00.000Z');
const demoPhrase = 'Synthetic phrase for local setup 2026';
const nextPhrase = 'Replacement phrase for local setup 2026';
let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dashboard-auth-setup-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
const args = (mode = 'init', account = 'demo-user') => [
  mode,
  '--data',
  dir,
  '--account',
  account,
  ...(mode === 'reset' ? ['--confirm-reset'] : []),
];
function ioFor(values = [demoPhrase, demoPhrase]) {
  const output: string[] = [],
    prompts: string[] = [];
  return {
    interactive: true,
    output,
    prompts,
    log: (s: string) => {
      output.push(s);
    },
    read: async (s: string) => {
      prompts.push(s);
      const value = values.shift();
      if (value === undefined) throw new SetupError('cancelled');
      return value;
    },
  };
}

it('creates only an auth store after two matching inputs and never activates a service or replaces an owner', async () => {
  const io = ioFor();
  await runAuthSetup(args(), io, now);
  expect(JSON.parse(io.output.at(-1) ?? '{}')).toMatchObject({
    status: 'account_created',
    authActivated: false,
    serviceStarted: false,
  });
  expect(existsSync(join(dir, 'dashboard.sqlite'))).toBe(false);
  const db = openAuthDatabase(join(dir, 'auth.sqlite'));
  const encoded = readAccount(db).credential;
  try {
    expect(await createAuthService(db).login('demo-user', demoPhrase, now)).toBeTruthy();
  } finally {
    db.close();
  }
  await expect(runAuthSetup(args(), ioFor(), now)).rejects.toThrow('account_exists');
  const after = openAuthDatabase(join(dir, 'auth.sqlite'));
  try {
    expect(readAccount(after).credential).toBe(encoded);
  } finally {
    after.close();
  }
  expect(io.output.join('')).not.toContain(demoPhrase);
  expect(io.output.join('')).not.toContain(encoded);
  expect(io.output.join('')).not.toContain(dir);
});

it('does not create an auth file on cancellation, invalid input or confirmation mismatch', async () => {
  for (const values of [[], ['short'], [demoPhrase], [demoPhrase, nextPhrase]]) {
    await expect(runAuthSetup(args(), ioFor(values), now)).rejects.toThrow();
    expect(existsSync(join(dir, 'auth.sqlite'))).toBe(false);
  }
});

it('rejects noninteractive input, secret flags, relative data and unconfirmed reset before prompting', async () => {
  for (const invalid of [
    [],
    ['init', '--password', demoPhrase],
    args('reset').slice(0, -1),
    ['init', '--data', 'relative', '--account', 'demo-user'],
    [...args(), '--extra'],
  ]) {
    const io = ioFor();
    await expect(runAuthSetup(invalid, io, now)).rejects.toThrow('usage');
    expect(io.prompts).toEqual([]);
  }
  const io = { ...ioFor(), interactive: false };
  await expect(runAuthSetup(args(), io, now)).rejects.toThrow('tty_required');
  expect(io.prompts).toEqual([]);
  expect(existsSync(join(dir, 'auth.sqlite'))).toBe(false);
});

it('resets only the named existing account, revokes sessions and clears locks without touching business data', async () => {
  await runAuthSetup(args(), ioFor(), now);
  let db = openAuthDatabase(join(dir, 'auth.sqlite'));
  const oldToken = await createAuthService(db).login('demo-user', demoPhrase, now);
  db.exec('UPDATE auth_limits SET attempts=60');
  db.close();
  await expect(
    runAuthSetup(args('reset', 'other-user'), ioFor([nextPhrase, nextPhrase]), now),
  ).rejects.toThrow('invalid_account');
  const io = ioFor([nextPhrase, nextPhrase]);
  await runAuthSetup(args('reset'), io, now);
  db = openAuthDatabase(join(dir, 'auth.sqlite'));
  try {
    expect(readAccount(db).revision).toBe(2);
    expect(readSession(db, oldToken, now)).toBeNull();
    expect(db.prepare('SELECT COUNT(*) AS n FROM auth_limits').get()?.n).toBe(0);
    const auth = createAuthService(db);
    await expect(auth.login('demo-user', demoPhrase, now)).rejects.toThrow('invalid_credentials');
    expect(await auth.login('demo-user', nextPhrase, now)).toBeTruthy();
    expect(JSON.parse(io.output.at(-1) ?? '{}')).toMatchObject({
      status: 'credentials_reset',
      sessionsRevoked: true,
      authActivated: false,
    });
  } finally {
    db.close();
  }
  expect(existsSync(join(dir, 'dashboard.sqlite'))).toBe(false);
  expect(io.output.join('')).not.toContain(nextPhrase);
}, 15_000);

it('refuses a concurrent credential revision change while deriving a reset', async () => {
  await runAuthSetup(args(), ioFor(), now);
  const db = openAuthDatabase(join(dir, 'auth.sqlite'));
  try {
    const old = readAccount(db).credential;
    const pending = resetAccount(db, 'demo-user', nextPhrase, now);
    db.exec('UPDATE auth_account SET revision=revision+1');
    await expect(pending).rejects.toThrow('credentials_changed');
    expect(readAccount(db).credential).toBe(old);
  } finally {
    db.close();
  }
});

it('the real CLI refuses piped secrets and ignores credential-like environment values; help is safe without a terminal', () => {
  const result = spawnSync(process.execPath, ['apps/server/src/auth/setup.ts', ...args()], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 15_000,
    input: `${demoPhrase}\n${demoPhrase}\n`,
    env: { ...process.env, MORIIUM_DASHBOARD_PASSWORD: demoPhrase },
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('tty_required');
  expect(result.stderr).not.toContain(demoPhrase);
  expect(result.stderr).not.toContain(dir);
  expect(existsSync(join(dir, 'auth.sqlite'))).toBe(false);
  const help = spawnSync(process.execPath, ['apps/server/src/auth/setup.ts', '--help'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 15_000,
  });
  expect(help.status).toBe(0);
  expect(help.stdout).toContain('Usage:');
});

function fakeTerminal() {
  const input = Object.assign(new PassThrough(), {
    isTTY: true,
    isRaw: false,
    setRawMode(flag: boolean) {
      this.isRaw = flag;
      return this;
    },
  });
  const output = Object.assign(new PassThrough(), { isTTY: true });
  const shown: string[] = [];
  output.on('data', (chunk: Buffer) => shown.push(chunk.toString()));
  return {
    input,
    output,
    shown,
    read: () =>
      readHidden(
        'Hidden input: ',
        input as unknown as typeof process.stdin,
        output as unknown as typeof process.stdout,
      ),
  };
}

it('hidden terminal input supports split UTF-8 bytes and backspace without echoing text, and restores raw mode', async () => {
  const tty = fakeTerminal();
  const pending = tty.read();
  const bytes = Buffer.from('架空の合言葉テスト');
  tty.input.write(bytes.subarray(0, 2));
  tty.input.write(bytes.subarray(2));
  tty.input.write('x\x7f\r');
  expect(await pending).toBe('架空の合言葉テスト');
  expect(tty.shown.join('')).toBe('Hidden input: \n');
  expect(tty.input.isRaw).toBe(false);
  expect(tty.input.isPaused()).toBe(true);
  tty.input.destroy();
  tty.output.destroy();
});

it('cancels hidden input on Ctrl-C and EOF, restores terminal state, and removes temporary signal listeners', async () => {
  for (const key of ['\x03', '\x04']) {
    const tty = fakeTerminal(),
      before = process.listenerCount('SIGINT');
    const pending = tty.read();
    tty.input.write(key);
    await expect(pending).rejects.toThrow('cancelled');
    expect(tty.input.isRaw).toBe(false);
    expect(process.listenerCount('SIGINT')).toBe(before);
    expect(tty.shown.join('')).toBe('Hidden input: \n');
    tty.input.destroy();
    tty.output.destroy();
  }
});
