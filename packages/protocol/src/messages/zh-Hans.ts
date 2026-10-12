/**
 * 问题说明的简体中文文案（04 第 7 节：位置 · 问题 · 收到了什么 · 怎么改）。
 * 命令行检查工具和界面共用。日文、英文在 P2.2 的多语言框架里补上，代码和参数不变。
 */
import { type MILESTONE_STATUSES, type PRIORITIES, STAGES } from '../constants.ts';
import type { JsonSyntaxReason } from '../json-syntax.ts';
import type { Issue, IssueParam, JsonPath } from '../types.ts';

export interface FormattedIssue {
  location: string;
  problem: string;
  received?: string;
  fix?: string;
}

const str = (v: IssueParam | undefined): string => (v === null || v === undefined ? '' : String(v));
const list = (v: IssueParam | undefined): string[] => (Array.isArray(v) ? v : []);

/**
 * 文件里的文本原样显示，但去掉控制字符和双向文本控制符：
 * 前者会在终端里执行转义序列，后者会让显示顺序和实际内容不一致。
 */
const cp = String.fromCodePoint;
/** C0、C1 控制字符和双向文本控制符。用码位构造，源码里不出现这些不可见字符。 */
const UNSAFE_CHARS = new RegExp(
  `[${cp(0x00)}-${cp(0x1f)}${cp(0x7f)}-${cp(0x9f)}${cp(0x202a)}-${cp(0x202e)}${cp(0x2066)}-${cp(0x2069)}]`,
  'g',
);
const REPLACEMENT_CHAR = cp(0xfffd);

export function displayValue(value: string): string {
  return value.replace(UNSAFE_CHARS, REPLACEMENT_CHAR);
}

const PARAM_LIMIT = 120;
const clip = (s: string) => {
  const chars = [...s];
  return chars.length > PARAM_LIMIT ? `${chars.slice(0, PARAM_LIMIT).join('')}…` : s;
};

/** 参数里可能有来自文件的文本（字段名、ID、路径）：统一去掉不可见字符并截短。 */
function sanitizeParams(params: Issue['params']): Issue['params'] {
  const out: Issue['params'] = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') out[key] = clip(displayValue(value));
    else if (Array.isArray(value)) out[key] = value.map((v) => clip(displayValue(v)));
    else out[key] = value;
  }
  return out;
}

const q = (v: IssueParam | undefined) => `「${displayValue(str(v))}」`;

export function humanPath(path: JsonPath): string {
  if (path.length === 0) return '整份文件';
  return path.map((p) => (typeof p === 'number' ? `第 ${p + 1} 项` : clip(displayValue(p)))).join(' → ');
}

/** 给 Agent 看的路径写法：milestones[0].status。 */
export function agentPath(path: JsonPath): string {
  return path
    .map((p, i) => (typeof p === 'number' ? `[${p}]` : `${i === 0 ? '' : '.'}${clip(displayValue(p))}`))
    .join('');
}

const TYPE_NAMES: Record<string, string> = {
  string: '字符串',
  integer: '整数',
  number: '数字',
  boolean: 'true 或 false',
  null: 'null',
  array: '数组',
  object: '对象',
  missing: '缺失',
};

function received(params: Issue['params']): string | undefined {
  const type = str(params.receivedType);
  if (!type) return undefined;
  const value = params.receivedValue;
  if (type === 'string') return `字符串${q(value)}`;
  if (type === 'integer' || type === 'number' || type === 'boolean') return displayValue(str(value));
  if (type === 'null') return 'null';
  return `一个${TYPE_NAMES[type] ?? type}`;
}

const PROGRESS_FIX = '应为 0 到 100 的整数或 null。没有严格依据时请写 null。';
const TIME_FIX = '应写成 2026-10-11T20:00:00+08:00。';
const VERSION_FIX = '写成 "1.1"（带引号的字符串）。';
const SUMMARY_FIX = '写一句 160 字以内的中文摘要。';

const REQUIRED_HINTS: Record<string, string> = {
  schema_version: VERSION_FIX,
  project_id: '写上项目 ID，例如 mori.meta。',
  project_name: '写上项目名称。',
  snapshot_at: `写上生成时间，${TIME_FIX}`,
  source: '需要 { branch, commit_sha, basis, tests_rerun }。',
  stage: `写上阶段，可用值：${STAGES.join('、')}。`,
  summary: SUMMARY_FIX,
  basis: '列出判断依据，例如仓库里的文档路径；没有也要写 []。',
  tests_rerun: '写 false。',
  agent: '可用值：codex、claude、other。',
};

const ITEM_FIELDS: Record<string, string> = {
  milestones: 'id、title、status、evidence_level、evidence_refs、human_acceptance',
  blockers: 'title、impact',
  next_actions: 'title、priority、result',
  needs_morii: 'decision',
};

const SYNTAX: Record<JsonSyntaxReason, string> = {
  trailing_comma: '最后一项后面多了逗号。',
  unexpected_end: '文件在 JSON 结束之前就断了，可能少了 } 或 ]。',
  missing_comma: '两项之间缺少逗号。',
  missing_colon: '属性名后面缺少冒号。',
  property_name_not_string: '属性名必须用双引号括起来。',
  unterminated_string: '字符串缺少结尾的双引号。',
  control_character_in_string: '字符串里有未转义的换行或控制字符，换行要写成 \\n。',
  invalid_escape: '字符串里有无效的转义：反斜杠后面的字符不对。',
  invalid_number: '数字的写法不对。',
  trailing_content: 'JSON 结束之后还有多余的内容。',
  empty: '文件是空的。',
  unexpected_character: '这里出现了 JSON 不允许的字符。',
};

function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} 小时`;
  return `${Math.round(hours / 24)} 天`;
}

export function formatIssue(issue: Issue): FormattedIssue {
  const p = sanitizeParams(issue.params);
  const location = humanPath(issue.path);
  const field = issue.path[issue.path.length - 1];
  const isProgress = issue.path.length === 1 && field === 'overall_progress';

  switch (issue.code) {
    case 'file_too_large':
      return {
        location,
        problem: `文件有 ${Math.ceil(Number(p.size) / 1024)} KB，超过 1 MiB 的上限。`,
        fix: '正常快照只有几 KB，请检查是否写进了别的内容。',
      };
    case 'encoding_utf16':
      return {
        location,
        problem: '文件是 UTF-16 编码。',
        fix: '请让 Agent 用 UTF-8（无 BOM）重新写入。PowerShell 的 Out-File 和 > 默认会写成 UTF-16。',
      };
    case 'encoding_utf32':
      return { location, problem: '文件是 UTF-32 编码。', fix: '请让 Agent 用 UTF-8（无 BOM）重新写入。' };
    case 'encoding_not_utf8':
      return {
        location,
        problem: '文件不是有效的 UTF-8，可能是 GBK 等编码。',
        fix: '请让 Agent 用 UTF-8（无 BOM）重新写入。',
      };
    case 'bom_stripped':
      return {
        location,
        problem: '文件以 UTF-8 BOM 开头，已去掉 BOM 再读取。',
        fix: '协议要求不带 BOM，下次生成时可以让 Agent 去掉。',
      };
    case 'secret_detected':
      return {
        location: `第 ${issue.line} 行`,
        problem: `疑似包含${str(p.label)}，已停止处理，内容没有保存。`,
        fix: '请让 Agent 删掉后重新生成。',
      };
    case 'json_syntax':
      return {
        location: `第 ${issue.line} 行第 ${issue.column} 列附近`,
        problem: `不是合法的 JSON：${SYNTAX[str(p.reason) as JsonSyntaxReason] ?? SYNTAX.unexpected_character}`,
        ...(str(p.excerpt) ? { received: displayValue(str(p.excerpt)) } : {}),
        fix: '文件必须是单个 JSON 对象，不带注释和尾逗号。',
      };
    case 'json_not_object':
      return { location, problem: '顶层必须是一个 JSON 对象（{ … }）。', ...withReceived(p) };
    case 'json_too_deep':
      return {
        location,
        problem: `嵌套超过 ${str(p.limit)} 层，协议的结构不会这么深。`,
        fix: '请检查文件是否写进了别的内容。',
      };
    case 'code_fence_extracted':
      return {
        location,
        problem: '文件被 Markdown 代码块包着，已按你的选择提取其中的 JSON。',
        fix: '协议要求文件里只有 JSON，下次生成时不要加代码块。',
      };
    case 'version_missing':
      return { location: 'schema_version', problem: '缺少 schema_version。', fix: VERSION_FIX };
    case 'version_not_string':
      return { location, problem: 'schema_version 必须是字符串。', ...withReceived(p), fix: VERSION_FIX };
    case 'version_malformed':
      return {
        location,
        problem: 'schema_version 应写成「主版本.次版本」，例如 "1.1"。',
        ...withReceived(p),
        fix: VERSION_FIX,
      };
    case 'version_unsupported_major':
      return {
        location,
        problem: `这份文件使用协议 ${str(p.version)}，当前 Dashboard 只支持 1.x。`,
        fix: '请升级 Dashboard，或让 Agent 按 1.1 重新生成。',
      };
    case 'version_unknown_minor':
      return {
        location,
        problem: `这份文件使用协议 ${str(p.version)}，比 Dashboard 认识的版本新，已按 ${str(p.validatedAs)} 校验；不认识的字段会被忽略。`,
        fix: '升级 Dashboard 后可以完整读取。',
      };
    case 'required_missing': {
      const fields = list(p.fields);
      const parent = issue.path[0];
      if (issue.path.length === 1 && fields.length === 1) {
        return { location, problem: '缺失。', fix: REQUIRED_HINTS[str(fields[0])] ?? '请补上这个字段。' };
      }
      const itemFields =
        typeof parent === 'string' && typeof issue.path[1] === 'number' ? ITEM_FIELDS[parent] : undefined;
      const fieldHint = REQUIRED_HINTS[str(fields[0])];
      return {
        location,
        problem: `缺少 ${fields.join('、')}。`,
        ...(itemFields
          ? { fix: `每一项都需要 ${itemFields}。` }
          : fields.length === 1 && fieldHint
            ? { fix: fieldHint }
            : {}),
      };
    }
    case 'type_mismatch': {
      const expected = list(p.expected).map((t) => TYPE_NAMES[t] ?? t);
      return {
        location,
        problem: expected.length > 0 ? spaced(`类型不对，应为${expected.join('或')}。`) : '类型不对。',
        ...withReceived(p),
        ...(isProgress ? { fix: PROGRESS_FIX } : {}),
      };
    }
    case 'not_integer':
      return {
        location,
        problem: '必须是整数。',
        ...withReceived(p),
        ...(isProgress ? { fix: PROGRESS_FIX } : {}),
      };
    case 'enum_invalid':
      return {
        location,
        problem: `${q(p.receivedValue)}不是可用值。`,
        fix: `可用值：${list(p.allowed).join('、')}。`,
      };
    case 'out_of_range':
      return { location, problem: '超出范围，应在 0 到 100 之间。', ...withReceived(p), fix: PROGRESS_FIX };
    case 'empty_string':
      return { location, problem: '不能为空。' };
    case 'too_long':
      return {
        location,
        problem: `有 ${str(p.length)} 个字符，超过上限 ${str(p.limit)}。`,
        fix: '这个上限只用来挡住异常文件，请检查内容是否写错了位置。',
      };
    case 'too_many_items':
      return { location, problem: `超过 ${str(p.limit)} 项的上限。` };
    case 'project_id_format':
      return {
        location,
        problem: '项目 ID 格式不对：应为小写字母、数字和连字符组成的段，用点分隔，至少两段。',
        ...withReceived(p),
        fix: '例如 mori.meta、enouia.runtime。',
      };
    case 'id_format':
      return {
        location,
        problem: 'ID 格式不对：只能用字母、数字、点、下划线和连字符，以字母或数字开头，最长 64 个字符。',
        ...withReceived(p),
      };
    case 'commit_sha_format':
      return { location, problem: 'commit_sha 应为 7 到 64 位小写十六进制，或 null。', ...withReceived(p) };
    case 'snapshot_at_format': {
      const parts: string[] = [];
      if (p.missingT === true) parts.push('日期和时间之间缺少 T');
      if (p.missingSeconds === true) parts.push('缺少秒');
      if (p.missingTimezone === true) parts.push('没有时区，无法确定是哪个时刻');
      return {
        location,
        problem: parts.length > 0 ? `${parts.join('，')}。` : '时间格式不对。',
        ...withReceived(p),
        fix: TIME_FIX,
      };
    }
    case 'snapshot_at_invalid':
      return { location, problem: '这个日期或时间不存在。', ...withReceived(p), fix: TIME_FIX };
    case 'unknown_field_rejected':
      return { location, problem: `出现了协议没有的字段 ${str(p.field)}。` };
    case 'summary_too_long':
      return {
        location,
        problem: `有 ${str(p.length)} 个字，超过 160 字。原样保存，卡片上会截断显示。`,
        fix: '下次生成时可以让 Agent 写短一些。',
      };
    case 'unknown_field':
      return {
        location,
        problem: `协议没有 ${str(p.field)} 这个字段，已忽略（原文里保留）。${p.suggestion ? `可能是 ${str(p.suggestion)} 的拼写错误。` : ''}`,
      };
    case 'newer_version_field':
      return {
        location,
        problem: `${str(p.field)} 是协议 ${str(p.version)} 才有的字段，这份文件声明的是 1.0，已忽略。`,
        fix: '把 schema_version 改为 "1.1" 就会保留它。',
      };
    case 'filled_empty_array':
      return {
        location,
        problem: `缺少 ${(list(p.fields).length > 0 ? list(p.fields) : [str(p.field)]).join('、')}，按空列表处理。`,
        fix: '没有内容时也请写 []。',
      };
    case 'filled_null_progress':
      return {
        location,
        problem: '缺少 overall_progress，按 null 处理，不显示进度。',
        fix: '没有严格依据时也请写出 "overall_progress": null。',
      };
    case 'filled_null_source_field':
      return { location, problem: `缺少 ${str(p.field)}，按 null 处理。` };
    case 'filled_project_name':
      return { location, problem: `缺少 project_name，将使用登记名称「${str(p.name)}」。` };
    case 'unknown_enum_mapped':
      return {
        location,
        problem: `${q(p.value)}不是 Dashboard 认识的值，按${p.mappedTo === null ? '「未知」' : ` ${str(p.mappedTo)} `}显示。`,
      };
    case 'summary_blank':
      return { location, problem: '摘要只有空白。', fix: SUMMARY_FIX };
    case 'duplicate_milestone_id':
      return {
        location: `milestones 第 ${str(p.firstItem)} 项和第 ${str(p.item)} 项`,
        problem: `id 都是${q(p.id)}。ID 用来对比历史，必须唯一。`,
      };
    case 'duplicate_item_id':
      return {
        location: `${str(p.list)} 第 ${str(p.firstItem)} 项和第 ${str(p.item)} 项`,
        problem: `id 都是${q(p.id)}。ID 用来跨快照追踪处理状态，必须唯一。`,
      };
    case 'project_unregistered':
      return {
        location,
        problem: `项目 ID${q(p.id)}没有登记。`,
        fix: `已登记：${list(p.registered).join('、')}。如果是新项目，请先在设置里登记。`,
      };
    case 'project_mismatch':
      return {
        location,
        problem: `你在 ${str(p.expectedName)} 页面导入，但这份文件属于 ${str(p.actualId)}。`,
        fix: `可以改为导入到 ${str(p.actualName)}。`,
      };
    case 'project_name_mismatch':
      return {
        location,
        problem: `文件里的名称${q(p.fileName)}和登记名称「${str(p.registeredName)}」不同，界面使用登记名称。`,
      };
    case 'snapshot_in_future':
      return {
        location,
        problem: `snapshot_at 比现在晚 ${duration(Number(p.aheadMinutes))}。`,
        fix: '请检查 Agent 所在机器的时间或时区。',
      };
    case 'evidence_acceptance_conflict':
      return {
        location,
        problem: `里程碑${q(p.id)}的证据层级是 morii_accepted，但 human_acceptance 是 ${str(p.humanAcceptance)}，两处说法矛盾。`,
      };
    case 'accepted_without_evidence':
      return {
        location,
        problem: `里程碑${q(p.id)}写着已验收（accepted），但证据层级是 ${str(p.evidenceLevel)}，没有验收证据。`,
      };
    case 'evidence_refs_missing':
      return {
        location,
        problem: `里程碑${q(p.id)}声称${p.evidenceLevel === 'repository' ? '有仓库证据' : '有测试记录'}，但没写证据位置。`,
        fix: '在 evidence_refs 里写出文件、提交或测试记录的位置。',
      };
    case 'tests_rerun_claimed':
      return {
        location,
        problem:
          'tests_rerun 是 true。v1 约定统一写 false；界面会显示「Agent 称已重跑测试」，这不算 Dashboard 核实。',
      };
    case 'paused_with_p0':
      return { location, problem: '阶段是已暂停（paused），但下一步里有 P0。' };
    case 'progress_100_incomplete':
      return { location, problem: `overall_progress 是 100，但还有 ${str(p.unfinished)} 个里程碑没有完成。` };
    case 'basis_empty':
      return { location, problem: 'basis 是空的，没有说明依据，整份快照按自报看待。' };
    case 'reporter_branch_mismatch':
      return {
        location,
        problem: `reporter.agent 写的是 ${str(p.agent)}，但分支 ${displayValue(str(p.branch))} 的前缀表示 ${str(p.branchAgent)}。以文件里的 reporter 为准。`,
      };
    case 'blocker_impact_empty':
      return { location, problem: 'impact 是空的，看不出这个阻塞影响什么。' };
    case 'next_action_result_empty':
      return { location, problem: 'result 是空的，看不出完成后得到什么。' };
    case 'private_info_present': {
      const kinds = list(p.kinds).map((k) => (k === 'local_path' ? '本机绝对路径' : 'IP 地址'));
      return {
        location,
        problem: `包含${kinds.join('和')}（${list(p.fields).join('、')}）。这些信息会保存在你的私有数据里，不会公开。`,
      };
    }
  }
}

function withReceived(params: Issue['params']): { received?: string } {
  const r = received(params);
  return r ? { received: r } : {};
}

// 只算汉字和假名：中文标点前后不加空格。
const CJK = new RegExp(`[${cp(0x3040)}-${cp(0x30ff)}${cp(0x3400)}-${cp(0x9fff)}]`);
const LATIN = /[A-Za-z0-9]/;

/** 中文与英文、数字之间加空格（文案约定）。只处理相邻字符，不改其他内容。 */
export function spaced(text: string): string {
  const chars = [...text];
  let out = '';
  chars.forEach((c, i) => {
    const prev = chars[i - 1];
    if (prev && ((CJK.test(prev) && LATIN.test(c)) || (LATIN.test(prev) && CJK.test(c)))) out += ' ';
    out += c;
  });
  return out;
}

/** 拼接两段中文：前一段以中文标点结尾时不加空格，否则按中英文规则处理。 */
function joinZh(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  const last = a.at(-1) ?? '';
  const first = b[0] ?? '';
  const needsSpace = (CJK.test(last) && LATIN.test(first)) || (LATIN.test(last) && CJK.test(first));
  return `${a}${needsSpace ? ' ' : ''}${b}`;
}

const receivedPhrase = (r: string) => joinZh('收到', r);

/** 一行文字：位置：问题。收到……。怎么改。 */
export function formatIssueLine(issue: Issue): string {
  const f = formatIssue(issue);
  let line = `${f.location}：${f.problem}`;
  if (f.received) line = joinZh(line, `${receivedPhrase(f.received)}。`);
  if (f.fix) line = joinZh(line, f.fix);
  return line;
}

/** 「复制给 Agent 的修复说明」（04 第 7 节）。只列错误。 */
export function formatFixPrompt(
  errors: readonly Issue[],
  options: { schemaVersion?: string | null | undefined } = {},
): string {
  const lines = errors.map((issue, i) => {
    const f = formatIssue(issue);
    const where =
      issue.line !== undefined ? f.location : issue.path.length > 0 ? agentPath(issue.path) : '整份文件';
    let text = `${f.problem}${f.received ? `（${receivedPhrase(f.received)}）` : ''}`;
    if (f.fix) text = joinZh(text, f.fix);
    return `${i + 1}. ${where}：${text}`;
  });
  const version = options.schemaVersion === '1.0' ? '1.0' : '1.1';
  return [
    '请修正 docs/status/project-status.json，然后重新生成：',
    ...lines,
    `其余内容不要改动。协议见 Project Status Protocol v${version}。`,
  ].join('\n');
}

/** 界面和命令行用到的枚举中文名（03 第 4 节）。 */
export const STAGE_LABELS: Record<(typeof STAGES)[number], string> = {
  planning: '规划中',
  development: '开发中',
  integration: '集成中',
  acceptance: '验收中',
  launch_preparation: '上线准备',
  live: '已上线',
  maintenance: '维护中',
  paused: '已暂停',
  unknown: '未知',
};

export const MILESTONE_STATUS_LABELS: Record<(typeof MILESTONE_STATUSES)[number], string> = {
  not_started: '未开始',
  in_progress: '进行中',
  blocked: '受阻',
  done: '完成',
  unknown: '未知',
};

export const PRIORITY_LABELS: Record<(typeof PRIORITIES)[number], string> = { P0: 'P0', P1: 'P1', P2: 'P2' };
