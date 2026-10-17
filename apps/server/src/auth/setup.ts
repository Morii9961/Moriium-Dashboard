/** Local operator tool. No secrets accepted from argv, environment or redirected input. */
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AuthError } from './errors.ts';
import { accountName, validatePassphrase } from './password.ts';
import { createAccount, openAuthDatabase, resetAccount } from './store.ts';
import { readHidden, SetupError } from './terminal.ts';

interface SetupIO {
  interactive: boolean;
  read: (prompt: string) => Promise<string>;
  log: (message: string) => void;
}
const terminal: SetupIO = {
  interactive: !!process.stdin.isTTY && !!process.stdout.isTTY,
  read: readHidden,
  log: console.log,
};
const USAGE =
  'Usage: pnpm auth:setup init --data <EXISTING_ABSOLUTE_DIR> --account <login> | reset --data <EXISTING_ABSOLUTE_DIR> --account <login> --confirm-reset';

export async function runAuthSetup(args: string[], io: SetupIO = terminal, now = new Date()) {
  if (args.length === 1 && args[0] === '--help') {
    io.log(USAGE);
    return;
  }
  const [mode, dataFlag, dataDir, accountFlag, login, confirmation] = args;
  if (
    !(
      (mode === 'init' && args.length === 5) ||
      (mode === 'reset' && args.length === 6 && confirmation === '--confirm-reset')
    ) ||
    dataFlag !== '--data' ||
    accountFlag !== '--account' ||
    !dataDir ||
    !isAbsolute(dataDir)
  )
    throw new SetupError('usage');
  accountName(login);
  if (!io.interactive) throw new SetupError('tty_required');
  if (mode === 'reset') io.log('重置会撤销全部会话并清除登录限速；不会启用认证或启动服务。');
  let first = '',
    second = '';
  try {
    first = await io.read('新口令（至少 15 个字符，输入不回显）：');
    validatePassphrase(first);
    second = await io.read('再次输入新口令：');
    if (first !== second) throw new SetupError('confirmation_mismatch');
    // Delay filesystem creation until both hidden inputs are complete and valid.
    const db = openAuthDatabase(join(dataDir, 'auth.sqlite'));
    try {
      if (mode === 'init') await createAccount(db, login, first, now);
      else await resetAccount(db, login, first, now);
    } finally {
      db.close();
    }
    io.log(
      JSON.stringify({
        status: mode === 'init' ? 'account_created' : 'credentials_reset',
        sessionsRevoked: mode === 'reset',
        authActivated: false,
        serviceStarted: false,
      }),
    );
  } finally {
    first = '';
    second = '';
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await runAuthSetup(process.argv.slice(2));
  } catch (error) {
    console.error(
      error instanceof AuthError || error instanceof SetupError ? error.message : 'auth_setup_failed',
    );
    console.error(USAGE);
    process.exitCode = 1;
  }
}
