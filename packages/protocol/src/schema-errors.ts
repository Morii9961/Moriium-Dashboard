/**
 * 把 Ajv 的错误转换成协议自己的问题条目（04 第 7 节：位置 · 问题 · 收到了什么 · 怎么改）。
 * 文案在 messages/ 里，这里只给出代码和参数。
 */
import type { ErrorObject } from 'ajv';
import { describeDateTimeProblem } from './datetime.ts';
import type { Issue, IssueParam, JsonPath } from './types.ts';

export function parseInstancePath(instancePath: string): JsonPath {
  if (instancePath === '') return [];
  return instancePath
    .slice(1)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));
}

export function valueAt(data: unknown, path: JsonPath): unknown {
  let current: unknown = data;
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string | number, unknown>)[key];
  }
  return current;
}

export type ValueType = 'string' | 'number' | 'integer' | 'boolean' | 'null' | 'array' | 'object' | 'missing';

export function typeOfValue(value: unknown): ValueType {
  if (value === undefined) return 'missing';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value as ValueType;
}

const DISPLAY_LIMIT = 80;

/** 收到的值，给人看的版本。只给标量；对象和数组只报类型。 */
export function receivedParams(value: unknown): Record<string, IssueParam> {
  const receivedType = typeOfValue(value);
  let receivedValue: string | null = null;
  if (typeof value === 'string') {
    const chars = [...value];
    receivedValue = chars.length > DISPLAY_LIMIT ? `${chars.slice(0, DISPLAY_LIMIT).join('')}…` : value;
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    receivedValue = String(value);
  }
  return { receivedType, receivedValue };
}

const asList = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(',') : [];

export function mapSchemaErrors(errors: readonly ErrorObject[], data: unknown): Issue[] {
  const issues: Issue[] = [];
  const missingByParent = new Map<string, { path: JsonPath; fields: string[] }>();

  for (const error of errors) {
    const path = parseInstancePath(error.instancePath);
    const value = valueAt(data, path);
    const last = path[path.length - 1];
    const push = (
      code: Issue['code'],
      params: Record<string, IssueParam> = {},
      severity: Issue['severity'] = 'error',
    ) => issues.push({ code, severity, path, params });

    switch (error.keyword) {
      case 'required': {
        const field = String((error.params as { missingProperty?: unknown }).missingProperty ?? '');
        if (path.length === 0) {
          issues.push({
            code: 'required_missing',
            severity: 'error',
            path: [field],
            params: { fields: [field] },
          });
        } else {
          const key = error.instancePath;
          const entry = missingByParent.get(key) ?? { path, fields: [] };
          entry.fields.push(field);
          missingByParent.set(key, entry);
        }
        break;
      }
      case 'type': {
        const expected = asList((error.params as { type?: unknown }).type);
        if (expected.includes('integer') && typeof value === 'number' && !Number.isInteger(value)) {
          push('not_integer', { expected, ...receivedParams(value) });
        } else {
          push('type_mismatch', { expected, ...receivedParams(value) });
        }
        break;
      }
      case 'enum':
        push('enum_invalid', {
          allowed: asList((error.params as { allowedValues?: unknown }).allowedValues),
          ...receivedParams(value),
        });
        break;
      case 'minLength':
        push('empty_string');
        break;
      case 'maxLength': {
        const limit = Number((error.params as { limit?: unknown }).limit);
        const length = typeof value === 'string' ? [...value].length : 0;
        if (path.length === 1 && last === 'summary') push('summary_too_long', { limit, length }, 'warning');
        else push('too_long', { limit, length });
        break;
      }
      case 'minimum':
      case 'maximum':
        push('out_of_range', { min: 0, max: 100, ...receivedParams(value) });
        break;
      case 'maxItems':
        push('too_many_items', { limit: Number((error.params as { limit?: unknown }).limit) });
        break;
      case 'pattern':
        if (last === 'project_id') push('project_id_format', receivedParams(value));
        else if (last === 'snapshot_at')
          push('snapshot_at_format', {
            ...receivedParams(value),
            ...(typeof value === 'string' ? describeDateTimeProblem(value) : {}),
          });
        else if (last === 'commit_sha') push('commit_sha_format', receivedParams(value));
        else push('id_format', receivedParams(value));
        break;
      case 'format':
        push('snapshot_at_invalid', receivedParams(value));
        break;
      case 'additionalProperties':
        push('unknown_field_rejected', {
          field: String((error.params as { additionalProperty?: unknown }).additionalProperty ?? ''),
        });
        break;
      case 'const':
        push('version_malformed', receivedParams(value));
        break;
      default:
        push('type_mismatch', { expected: [], ...receivedParams(value) });
    }
  }

  for (const { path, fields } of missingByParent.values()) {
    issues.push({ code: 'required_missing', severity: 'error', path, params: { fields } });
  }

  // 同一位置已经说了更根本的问题，就不再重复：格式不对时不说日期不存在，类型不对时不说值不可用。
  const pathsWith = (code: Issue['code']) =>
    new Set(issues.filter((i) => i.code === code).map((i) => JSON.stringify(i.path)));
  const hasFormatIssue = pathsWith('snapshot_at_format');
  const hasTypeIssue = pathsWith('type_mismatch');
  const seen = new Set<string>();
  return issues.filter((issue) => {
    if (issue.code === 'snapshot_at_invalid' && hasFormatIssue.has(JSON.stringify(issue.path))) return false;
    if (issue.code === 'enum_invalid' && hasTypeIssue.has(JSON.stringify(issue.path))) return false;
    const key = `${issue.code}|${JSON.stringify(issue.path)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
