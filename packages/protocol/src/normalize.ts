/**
 * 接收规则里的规范化（03 第 6.2 节），在 Schema 校验之前做：
 * 去掉协议没有的字段、给缺失的数组和可空字段补默认值、
 * 未知次版本里把未知枚举值换成 unknown。每一步都留下记录，原文不动。
 */
import {
  EVIDENCE_LEVELS,
  HUMAN_ACCEPTANCE,
  MILESTONE_STATUSES,
  PRIORITIES,
  REPORTER_AGENTS,
  type RegisteredProject,
  STAGES,
} from './constants.ts';
import type { Issue, IssueParam, JsonPath, Normalization, NormalizationCode } from './types.ts';

type Obj = Record<string, unknown>;

export function isPlainObject(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const TOP_V10 = [
  'schema_version',
  'project_id',
  'project_name',
  'snapshot_at',
  'source',
  'stage',
  'summary',
  'overall_progress',
  'milestones',
  'blockers',
  'next_actions',
  'needs_morii',
] as const;
const SOURCE_KEYS = ['branch', 'commit_sha', 'basis', 'tests_rerun'] as const;
const MILESTONE_KEYS = [
  'id',
  'title',
  'status',
  'evidence_level',
  'evidence_refs',
  'human_acceptance',
] as const;
const BLOCKER_V10 = ['title', 'impact'] as const;
const NEXT_ACTION_V10 = ['title', 'priority', 'result'] as const;
const NEEDS_MORII_V10 = ['decision'] as const;
const REPORTER_KEYS = ['agent', 'note'] as const;

/** v1.1 新增的字段，在 v1.0 文件里出现时给出专门的说明。 */
const V11_TOP_ADDITIONS = ['reporter'];
const V11_ITEM_ADDITIONS = ['id'];

const ITEM_ARRAYS = ['blockers', 'next_actions', 'needs_morii'] as const;

export interface NormalizeInput {
  data: Obj;
  /** 用哪个已知版本的字段表：'1.0' 或 '1.1'。 */
  fieldsOf: '1.0' | '1.1';
  /** 文件写的是比已知更新的 1.x 次版本。 */
  newerMinor: boolean;
  registry: readonly RegisteredProject[];
}

export interface NormalizeOutput {
  candidate: Obj;
  normalizations: Normalization[];
  warnings: Issue[];
}

export function normalizeSnapshot({ data, fieldsOf, newerMinor, registry }: NormalizeInput): NormalizeOutput {
  const normalizations: Normalization[] = [];
  const warnings: Issue[] = [];
  const record = (code: NormalizationCode, path: JsonPath, params: Record<string, IssueParam> = {}) => {
    normalizations.push({ code, path, params });
    warnings.push({ code, severity: 'warning', path, params });
  };

  const isV11 = fieldsOf === '1.1';
  const candidate: Obj = structuredClone(data);

  const stripUnknown = (
    obj: Obj,
    path: JsonPath,
    allowed: readonly string[],
    v11Additions: readonly string[],
  ) => {
    for (const key of Object.keys(obj)) {
      if (allowed.includes(key)) continue;
      delete obj[key];
      if (!isV11 && v11Additions.includes(key)) {
        record('newer_version_field', [...path, key], { field: key, version: '1.1' });
      } else {
        record('unknown_field', [...path, key], { field: key, suggestion: suggestKey(key, allowed) });
      }
    }
  };

  stripUnknown(candidate, [], isV11 ? [...TOP_V10, 'reporter'] : TOP_V10, V11_TOP_ADDITIONS);

  // 缺失的数组按空数组处理。规范化逐项记录；提醒合成一条（03 第 11 节的示例）。
  const filledArrays: string[] = [];
  for (const key of ['milestones', ...ITEM_ARRAYS] as const) {
    if (!(key in candidate)) {
      candidate[key] = [];
      normalizations.push({ code: 'filled_empty_array', path: [key], params: { field: key } });
      filledArrays.push(key);
    }
  }
  if (filledArrays.length > 0) {
    warnings.push({
      code: 'filled_empty_array',
      severity: 'warning',
      path: filledArrays.length === 1 ? [filledArrays[0] as string] : [],
      params: { fields: filledArrays },
    });
  }

  if (!('overall_progress' in candidate)) {
    candidate.overall_progress = null;
    record('filled_null_progress', ['overall_progress']);
  }

  if (!('project_name' in candidate) && typeof candidate.project_id === 'string') {
    const registered = registry.find((p) => p.id === candidate.project_id);
    if (registered) {
      candidate.project_name = registered.name;
      record('filled_project_name', ['project_name'], { name: registered.name });
    }
  }

  const source = candidate.source;
  if (isPlainObject(source)) {
    stripUnknown(source, ['source'], SOURCE_KEYS, []);
    for (const key of ['branch', 'commit_sha'] as const) {
      if (!(key in source)) {
        source[key] = null;
        record('filled_null_source_field', ['source', key], { field: key });
      }
    }
  }

  if (isV11 && isPlainObject(candidate.reporter)) {
    stripUnknown(candidate.reporter, ['reporter'], REPORTER_KEYS, []);
  }

  const eachObject = (key: string, fn: (item: Obj, path: JsonPath) => void) => {
    const list = candidate[key];
    if (!Array.isArray(list)) return;
    list.forEach((item, index) => {
      if (isPlainObject(item)) fn(item, [key, index]);
    });
  };

  eachObject('milestones', (item, path) => stripUnknown(item, path, MILESTONE_KEYS, []));
  const itemFields = { blockers: BLOCKER_V10, next_actions: NEXT_ACTION_V10, needs_morii: NEEDS_MORII_V10 };
  for (const key of ITEM_ARRAYS) {
    const allowed = isV11 ? [...itemFields[key], 'id'] : itemFields[key];
    eachObject(key, (item, path) => stripUnknown(item, path, allowed, V11_ITEM_ADDITIONS));
  }

  if (newerMinor) {
    const mapEnum = (
      obj: Obj,
      key: string,
      path: JsonPath,
      allowed: readonly string[],
      fallback: string | null,
    ) => {
      const value = obj[key];
      if (typeof value === 'string' && !allowed.includes(value)) {
        obj[key] = fallback;
        record('unknown_enum_mapped', [...path, key], { value, mappedTo: fallback });
      }
    };
    mapEnum(candidate, 'stage', [], STAGES, 'unknown');
    eachObject('milestones', (item, path) => {
      mapEnum(item, 'status', path, MILESTONE_STATUSES, 'unknown');
      mapEnum(item, 'evidence_level', path, EVIDENCE_LEVELS, 'unknown');
      mapEnum(item, 'human_acceptance', path, HUMAN_ACCEPTANCE, 'unknown');
    });
    eachObject('next_actions', (item, path) => mapEnum(item, 'priority', path, PRIORITIES, null));
    if (isPlainObject(candidate.reporter))
      mapEnum(candidate.reporter, 'agent', ['reporter'], REPORTER_AGENTS, 'other');
  }

  return { candidate, normalizations, warnings };
}

/** 未知字段与已知字段很像时（例如 next_action），提示可能是拼写错误。 */
export function suggestKey(key: string, allowed: readonly string[]): string | null {
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of allowed) {
    const d = levenshtein(key.toLowerCase(), candidate);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best !== null && bestDistance <= Math.max(2, Math.floor(best.length / 4)) ? best : null;
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0] ?? 0;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j] ?? 0;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      prev[j] = Math.min(above + 1, (prev[j - 1] ?? 0) + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return prev[b.length] ?? 0;
}
