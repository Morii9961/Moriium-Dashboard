/**
 * 检查一份快照文件：04 第 3 节的处理流水线（第 1 到 6 步）。
 * 前端预览和服务端复核调用同一个函数。第 7、8 步（定位、对比）见 placement.ts、diff.ts。
 *
 * 与 04 第 3 节顺序的一处不同：密钥扫描放在 JSON 解析之前。解析失败时错误信息会引用
 * 出错位置附近的原文，先扫描可以保证疑似密钥永远不会出现在任何输出里。
 */
import { attributeSnapshot } from './attribution.ts';
import {
  KNOWN_SCHEMA_VERSIONS,
  type KnownSchemaVersion,
  LATEST_SCHEMA_VERSION,
  type RegisteredProject,
  RULES_VERSION,
} from './constants.ts';
import { parseSnapshotAt } from './datetime.ts';
import { decodeSnapshotBytes } from './encoding.ts';
import { contentFingerprint, sha256Hex } from './fingerprint.ts';
import { validateV1_0, validateV1_1 } from './generated/validators.js';
import { extractCodeFence, locateJsonSyntaxError } from './json-syntax.ts';
import { isPlainObject, normalizeSnapshot } from './normalize.ts';
import { mapSchemaErrors, receivedParams } from './schema-errors.ts';
import { scanSecrets } from './secrets.ts';
import { semanticChecks } from './semantic.ts';
import type { CheckResult, Issue, Normalization, Snapshot } from './types.ts';

export interface CheckOptions {
  /** 已登记的项目。必须显式传入，避免无意中跳过登记检查。 */
  registry: readonly RegisteredProject[];
  /** 判断「时间在未来」用的当前时间。 */
  now?: Date;
  /** 从某个项目页导入时，期望的 project_id。 */
  expectedProjectId?: string;
  /** 文件被 Markdown 代码块包着时：'ask' 返回 needs_choice（默认），'extract' 提取后继续。 */
  codeFence?: 'ask' | 'extract';
}

const VALIDATORS = { '1.0': validateV1_0, '1.1': validateV1_1 } as const satisfies Record<
  KnownSchemaVersion,
  unknown
>;

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const fileError = (code: Issue['code'], params: Issue['params'] = {}): Issue => ({
  code,
  severity: 'error',
  path: [],
  params,
});

export async function checkSnapshot(bytes: Uint8Array, options: CheckOptions): Promise<CheckResult> {
  const now = options.now ?? new Date();
  const warnings: Issue[] = [];
  const normalizations: Normalization[] = [];
  let schemaVersion: string | null = null;
  const reject = (errors: Issue[], extraWarnings: Issue[] = []): CheckResult => ({
    kind: 'rejected',
    errors,
    warnings: extraWarnings,
    schemaVersion,
  });

  // 1 读取与编码
  const decoded = decodeSnapshotBytes(bytes);
  if (!decoded.ok) {
    const code = {
      too_large: 'file_too_large',
      utf16: 'encoding_utf16',
      utf32: 'encoding_utf32',
      not_utf8: 'encoding_not_utf8',
    } as const;
    return reject([fileError(code[decoded.reason], { size: decoded.size })]);
  }
  if (decoded.hadBom) {
    normalizations.push({ code: 'bom_stripped', path: [], params: {} });
    warnings.push({ code: 'bom_stripped', severity: 'warning', path: [], params: {} });
  }

  // 安全扫描（在解析之前，见文件头注释）
  const secretHits = scanSecrets(decoded.text);
  if (secretHits.length > 0) {
    return reject(
      secretHits.map((hit) => ({
        code: 'secret_detected',
        severity: 'error',
        path: [],
        line: hit.line,
        params: { label: hit.label },
      })),
    );
  }

  // 2 解析；2a 代码块
  let text = decoded.text;
  let lineOffset = 0;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const fence = extractCodeFence(text);
    if (fence) {
      if (options.codeFence !== 'extract') return { kind: 'needs_choice', choice: 'code_fence' };
      text = fence.inner;
      lineOffset = fence.lineOffset;
      normalizations.push({ code: 'code_fence_extracted', path: [], params: {} });
      warnings.push({ code: 'code_fence_extracted', severity: 'warning', path: [], params: {} });
    }
    try {
      parsed = JSON.parse(text);
    } catch {
      const located = locateJsonSyntaxError(text);
      const line = (located?.line ?? 1) + lineOffset;
      const lineText = text.split(/\r\n|\r|\n/)[(located?.line ?? 1) - 1] ?? '';
      return reject(
        [
          {
            code: 'json_syntax',
            severity: 'error',
            path: [],
            line,
            column: located?.column ?? 1,
            params: {
              reason: located?.reason ?? 'unexpected_character',
              excerpt: excerptAround(lineText, located?.column ?? 1),
            },
          },
        ],
        warnings,
      );
    }
  }

  if (!isPlainObject(parsed)) {
    return reject([fileError('json_not_object', receivedParams(parsed))], warnings);
  }
  // 协议的结构只有四五层；过深的嵌套会让后面的递归处理耗尽调用栈。
  if (exceedsDepth(parsed, MAX_DEPTH))
    return reject([fileError('json_too_deep', { limit: MAX_DEPTH })], warnings);

  // 4 版本
  const rawVersion = parsed.schema_version;
  if (rawVersion === undefined) return reject([fileError('version_missing')], warnings);
  if (typeof rawVersion !== 'string') {
    return reject(
      [{ ...fileError('version_not_string', receivedParams(rawVersion)), path: ['schema_version'] }],
      warnings,
    );
  }
  schemaVersion = rawVersion;
  const versionMatch = VERSION.exec(rawVersion);
  if (!versionMatch) {
    return reject(
      [{ ...fileError('version_malformed', receivedParams(rawVersion)), path: ['schema_version'] }],
      warnings,
    );
  }
  if (versionMatch[1] !== '1') {
    return reject(
      [{ ...fileError('version_unsupported_major', { version: rawVersion }), path: ['schema_version'] }],
      warnings,
    );
  }
  const known = (KNOWN_SCHEMA_VERSIONS as readonly string[]).includes(rawVersion);
  const latestMinor = Number(LATEST_SCHEMA_VERSION.split('.')[1]);
  const newerMinor = !known && Number(versionMatch[2]) > latestMinor;
  if (!known && !newerMinor) {
    return reject(
      [{ ...fileError('version_malformed', receivedParams(rawVersion)), path: ['schema_version'] }],
      warnings,
    );
  }
  const validatedAs: KnownSchemaVersion = known ? (rawVersion as KnownSchemaVersion) : LATEST_SCHEMA_VERSION;
  if (newerMinor) {
    warnings.push({
      code: 'version_unknown_minor',
      severity: 'warning',
      path: ['schema_version'],
      params: { version: rawVersion, validatedAs },
    });
  }

  // 规范化（03 第 6.2 节）
  const normalized = normalizeSnapshot({
    data: parsed,
    fieldsOf: validatedAs,
    newerMinor,
    registry: options.registry,
  });
  normalizations.push(...normalized.normalizations);
  warnings.push(...normalized.warnings);
  const candidate = normalized.candidate;

  // 5 Schema 校验
  const validate = VALIDATORS[validatedAs];
  const forValidation = newerMinor
    ? validationCopyForNewerMinor(candidate, normalized.normalizations, validatedAs)
    : candidate;
  const schemaIssues = validate(forValidation) ? [] : mapSchemaErrors(validate.errors ?? [], forValidation);

  // 6 语义校验
  const semanticIssues = semanticChecks({
    candidate,
    isV11: validatedAs === '1.1',
    registry: options.registry,
    now,
    expectedProjectId: options.expectedProjectId,
    projectNameFilled: normalized.normalizations.some((n) => n.code === 'filled_project_name'),
  });

  const all = [...schemaIssues, ...semanticIssues];
  const errors = all.filter((i) => i.severity === 'error');
  warnings.push(...all.filter((i) => i.severity === 'warning'));
  if (errors.length > 0) return reject(errors, warnings);

  const snapshot = candidate as unknown as Snapshot;
  const time = parseSnapshotAt(snapshot.snapshot_at);
  if (!time) throw new Error('snapshot_at 通过了校验却无法解析');

  return {
    kind: 'accepted',
    snapshot,
    warnings,
    normalizations,
    meta: {
      schemaVersion: rawVersion,
      validatedAs,
      rulesVersion: RULES_VERSION,
      contentFingerprint: await contentFingerprint(parsed),
      rawFingerprint: await sha256Hex(bytes),
      snapshotAtUtcMs: time.utcMs,
      snapshotAtOffsetMinutes: time.offsetMinutes,
      attribution: attributeSnapshot(snapshot),
    },
  };
}

const MAX_DEPTH = 32;

/** 迭代计算嵌套深度，不用递归。 */
function exceedsDepth(root: unknown, limit: number): boolean {
  const stack: [unknown, number][] = [[root, 1]];
  while (stack.length > 0) {
    const [value, depth] = stack.pop() as [unknown, number];
    if (value === null || typeof value !== 'object') continue;
    if (depth > limit) return true;
    for (const child of Object.values(value)) stack.push([child, depth + 1]);
  }
  return false;
}

/**
 * 未知次版本：按已知最新版本校验。规范化已把未知枚举值换成 unknown，
 * 但优先级没有 unknown，换成了 null（界面显示「优先级未知」）；
 * 校验用的副本里给它一个合法值，免得 Schema 因为这个替换本身报错。
 */
function validationCopyForNewerMinor(
  candidate: Record<string, unknown>,
  normalizations: readonly Normalization[],
  validatedAs: KnownSchemaVersion,
): Record<string, unknown> {
  const copy = structuredClone(candidate);
  copy.schema_version = validatedAs;
  for (const n of normalizations) {
    if (n.code !== 'unknown_enum_mapped' || n.params.mappedTo !== null) continue;
    const [list, index, key] = n.path;
    const items = copy[String(list)];
    if (Array.isArray(items) && typeof index === 'number' && isPlainObject(items[index])) {
      (items[index] as Record<string, unknown>)[String(key)] = 'P2';
    }
  }
  return copy;
}

/** 出错位置附近约 40 个字符（04 第 3 节）。 */
function excerptAround(lineText: string, column: number): string {
  const chars = [...lineText];
  const start = Math.max(0, column - 1 - 25);
  const end = Math.min(chars.length, start + 40);
  return `${start > 0 ? '…' : ''}${chars.slice(start, end).join('').trim()}${end < chars.length ? '…' : ''}`;
}
