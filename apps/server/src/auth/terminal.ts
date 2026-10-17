import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

export class SetupError extends Error {
  constructor(code: 'usage' | 'tty_required' | 'cancelled' | 'confirmation_mismatch') {
    super(code);
    this.name = 'SetupError';
  }
}
export async function readHidden(
  prompt: string,
  input = process.stdin,
  output = process.stdout,
): Promise<string> {
  if (!input.isTTY || !output.isTTY) throw new SetupError('tty_required');
  const previousRaw = !!input.isRaw;
  // readline owns editing and Unicode input; all its echo and cursor writes go to a sink.
  // historySize:0 prevents retention in readline history. Only the fixed prompt is visible.
  const sink = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  const rl = createInterface({ input, output: sink, terminal: true, historySize: 0 });
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  let answered = false;
  rl.once('SIGINT', () => controller.abort());
  rl.once('error', () => controller.abort());
  rl.once('close', () => {
    if (!answered) controller.abort();
  });
  output.write(prompt);
  try {
    const value = await rl.question('', { signal: controller.signal });
    if (controller.signal.aborted) throw new SetupError('cancelled');
    answered = true;
    return value;
  } catch {
    throw new SetupError('cancelled');
  } finally {
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
    rl.close();
    sink.end();
    if (!!input.isRaw !== previousRaw) input.setRawMode(previousRaw);
    // readline.close() pauses stdin. Resuming it here would keep a CLI process alive.
    output.write('\n');
  }
}
