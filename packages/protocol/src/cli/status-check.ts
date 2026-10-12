/**
 * 命令行检查工具：pnpm status:check <文件...>
 *
 * 输出与导入预览一致的问题说明（06 P1.5）。只读文件，不访问网络，不写任何东西。
 * 退出码：0 全部可以导入；1 有文件无法导入；2 有文件需要先做选择（代码块）。
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { checkSnapshot } from '../check.ts';
import { PRESET_PROJECTS, type RegisteredProject } from '../constants.ts';
import {
  displayValue,
  formatFixPrompt,
  formatIssueLine,
  MILESTONE_STATUS_LABELS,
  STAGE_LABELS,
} from '../messages/zh-Hans.ts';
import type { Attribution, CheckResult, Snapshot } from '../types.ts';

const HELP = `用法：pnpm status:check <文件...> [选项]

检查 Project Status Protocol 快照文件，输出和 Dashboard 导入预览一致的说明。
只读取文件，不访问网络，不保存任何内容。

选项：
  --register <id[=名称]>   临时登记一个项目 ID（可重复）。默认只认六个预置项目
  --expect-project <id>    模拟在某个项目页导入：文件属于别的项目时报错
  --extract-code-fence     文件被 Markdown 代码块包着时，提取其中的 JSON 再检查
  --json                   输出机器可读的 JSON
  --now <时间>             判断「时间在未来」用的当前时间，默认是现在
  -h, --help               显示这段说明

退出码：0 全部可以导入；1 有文件无法导入；2 有文件需要先做选择。`;

export interface Io {
  out: (text: string) => void;
  err: (text: string) => void;
  readFile: (path: string) => Uint8Array;
}

const defaultIo: Io = {
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
  readFile: (path) => readFileSync(path),
};

const AGENT_NAMES = { claude: 'Claude', codex: 'Codex', other: '其他 Agent' } as const;

function attributionText(a: Attribution): string {
  if (a.agent === null) return '报告来自：未注明';
  const who = AGENT_NAMES[a.agent];
  return a.source === 'file' ? `报告来自 ${who}（文件里的 reporter）` : `报告来自 ${who}（据分支前缀推断）`;
}

/** 按快照原文的时区显示时间，例如「2026-10-11 22:45（UTC+08:00）」。 */
function formatSnapshotTime(utcMs: number, offsetMinutes: number): string {
  const local = new Date(utcMs + offsetMinutes * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const date = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
  const time = `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
  return `${date} ${time}（UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}）`;
}

function age(utcMs: number, now: Date): string {
  const minutes = Math.round((now.getTime() - utcMs) / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

/** 里程碑：完成几个，以及完成的那些各属于哪一层证据（三层分开，03 第 9 节）。 */
function milestoneLine(s: Snapshot): string {
  const total = s.milestones.length;
  if (total === 0) return '里程碑：无';
  const done = s.milestones.filter((m) => m.status === 'done');
  const layers = {
    self: done.filter((m) => m.evidence_level === 'self_report' || m.evidence_level === 'unknown').length,
    evidence: done.filter((m) => m.evidence_level === 'repository' || m.evidence_level === 'existing_test')
      .length,
    accepted: done.filter((m) => m.evidence_level === 'morii_accepted').length,
  };
  const others = (['in_progress', 'blocked', 'not_started', 'unknown'] as const)
    .map((status) => [status, s.milestones.filter((m) => m.status === status).length] as const)
    .filter(([, n]) => n > 0)
    .map(([status, n]) => `${MILESTONE_STATUS_LABELS[status]} ${n}`);
  const doneText =
    done.length > 0
      ? `完成 ${done.length}（自报 ${layers.self} · 有证据 ${layers.evidence} · 据报告已验收 ${layers.accepted}）`
      : '完成 0';
  return `里程碑 ${total} 个：${[doneText, ...others].join(' · ')}`;
}

function progressText(progress: number | null): string {
  return progress === null ? '整体进度：不估算' : `整体进度 ${progress}（Agent 估算，不是验收比例）`;
}

function clipSummary(text: string): string {
  const chars = [...displayValue(text)];
  return chars.length > 160 ? `${chars.slice(0, 160).join('')}…` : chars.join('');
}

export function formatResult(
  file: string,
  result: CheckResult,
  registry: readonly RegisteredProject[],
  now: Date,
): string {
  const name = displayValue(basename(file));
  const lines: string[] = [];

  if (result.kind === 'needs_choice') {
    lines.push(`? 需要你决定 · ${name}`);
    lines.push('  文件被 Markdown 代码块包着。确认要用其中的 JSON 时，加 --extract-code-fence 再检查一次。');
    return lines.join('\n');
  }

  if (result.kind === 'rejected') {
    lines.push(`✕ 无法导入 · ${result.errors.length} 个错误 · ${result.warnings.length} 条提醒 · ${name}`);
    lines.push('', '错误');
    result.errors.forEach((issue, i) => {
      lines.push(`  ${i + 1}. ${formatIssueLine(issue)}`);
    });
    if (result.warnings.length > 0) {
      lines.push('', '提醒（修好错误后仍会出现）');
      result.warnings.forEach((issue, i) => {
        lines.push(`  ${i + 1}. ${formatIssueLine(issue)}`);
      });
    }
    lines.push('', '给 Agent 的修复说明（可以直接粘贴回 Agent 会话）', '');
    lines.push(
      ...formatFixPrompt(result.errors, { schemaVersion: result.schemaVersion })
        .split('\n')
        .map((l) => `  ${l}`),
    );
    return lines.join('\n');
  }

  const { snapshot: s, meta } = result;
  const registeredName = registry.find((p) => p.id === s.project_id)?.name ?? s.project_name;
  lines.push(
    `✓ 可以导入${result.warnings.length > 0 ? ` · ${result.warnings.length} 条提醒` : ''} · ${name}`,
  );
  lines.push(
    `  ${displayValue(registeredName)}（${s.project_id}）· 快照 ${formatSnapshotTime(meta.snapshotAtUtcMs, meta.snapshotAtOffsetMinutes)}，${age(meta.snapshotAtUtcMs, now)} · 协议 ${displayValue(meta.schemaVersion)}`,
  );
  lines.push(`  ${attributionText(meta.attribution)}`);
  lines.push(`  阶段 ${STAGE_LABELS[s.stage]} · ${progressText(s.overall_progress)}`);
  lines.push(`  ${milestoneLine(s)}`);
  const nextP0 = s.next_actions.filter((a) => a.priority === 'P0').length;
  lines.push(
    `  阻塞 ${s.blockers.length} · 下一步 ${s.next_actions.length}${nextP0 > 0 ? `（P0 ${nextP0}）` : ''} · 需要 Morii 决定 ${s.needs_morii.length}`,
  );
  lines.push(`  摘要：${clipSummary(s.summary)}`);
  lines.push(`  内容指纹 ${meta.contentFingerprint.slice(0, 12)} · 规则版本 ${meta.rulesVersion}`);
  if (result.warnings.length > 0) {
    lines.push('', '提醒');
    result.warnings.forEach((issue, i) => {
      lines.push(`  ${i + 1}. ${formatIssueLine(issue)}`);
    });
  }
  return lines.join('\n').replaceAll('） · ', '）· ');
}

export function parseRegister(values: readonly string[]): RegisteredProject[] {
  return values.map((value) => {
    const [id = '', ...rest] = value.split('=');
    return { id: id.trim(), name: rest.join('=').trim() || id.trim() };
  });
}

export async function runStatusCheck(argv: readonly string[], io: Io = defaultIo): Promise<number> {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(argv);
  } catch (error) {
    io.err(`${error instanceof Error ? error.message : String(error)}\n\n${HELP}`);
    return 1;
  }
  const { values, positionals } = parsed;
  if (values.help || positionals.length === 0) {
    (values.help ? io.out : io.err)(HELP);
    return values.help ? 0 : 1;
  }

  const now = values.now ? new Date(values.now) : new Date();
  if (Number.isNaN(now.getTime())) {
    io.err(`--now 不是有效的时间：${displayValue(values.now ?? '')}`);
    return 1;
  }
  const registry = [...PRESET_PROJECTS, ...parseRegister(values.register ?? [])];

  let exit = 0;
  const jsonResults: unknown[] = [];
  for (const [index, file] of positionals.entries()) {
    let bytes: Uint8Array;
    try {
      bytes = io.readFile(file);
    } catch {
      io.err(`✕ 读不到文件：${displayValue(file)}`);
      exit = 1;
      continue;
    }
    const result = await checkSnapshot(bytes, {
      registry,
      now,
      ...(values['expect-project'] ? { expectedProjectId: values['expect-project'] } : {}),
      codeFence: values['extract-code-fence'] ? 'extract' : 'ask',
    });
    if (result.kind === 'rejected') exit = 1;
    else if (result.kind === 'needs_choice' && exit === 0) exit = 2;

    if (values.json) jsonResults.push({ file, ...result });
    else io.out(`${index > 0 ? '\n' : ''}${formatResult(file, result, registry, now)}`);
  }
  if (values.json) io.out(JSON.stringify(jsonResults, null, 2));
  return exit;
}

function parse(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    allowPositionals: true,
    strict: true,
    options: {
      register: { type: 'string', multiple: true },
      'expect-project': { type: 'string' },
      'extract-code-fence': { type: 'boolean' },
      json: { type: 'boolean' },
      now: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await runStatusCheck(process.argv.slice(2));
}
