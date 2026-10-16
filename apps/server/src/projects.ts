/**
 * 项目登记表（P3.1）。快照只按 project_id 精确匹配这张表（04 第 6 节），不自动建项目。
 */
import { PROJECT_ID_PATTERN, type RegisteredProject, scanSecrets } from '@moriium-dashboard/protocol';
import type { Database } from './db.ts';

export const ATTENTION = ['active', 'waiting', 'incubating', 'paused', 'archived'] as const;
export type Attention = (typeof ATTENTION)[number];
export const TRACKING = ['protocol', 'manual'] as const;
export type Tracking = (typeof TRACKING)[number];
export const CATEGORIES = ['research', 'website', 'creation', 'life', 'learning', 'exploration'] as const;
export const PRIORITIES = ['focus', 'normal', 'later'] as const;
export interface ProjectMetadata {
  attentionNote: string;
  nameJa: string;
  nameEn: string;
  category: (typeof CATEGORIES)[number];
  priority: (typeof PRIORITIES)[number];
  agentAssignments: { agent: 'claude' | 'codex' | 'other'; scope: string }[];
  repositoryUrl: string;
  websiteUrl: string;
  workingOn: string;
  nextStep: string;
  keyDate: string;
  keyDateLabel: string;
  manualLang: 'zh-Hans' | 'ja' | 'en';
}

export interface Project extends ProjectMetadata {
  id: string;
  name: string;
  tracking: Tracking;
  attention: Attention;
  freshnessDays: number;
  coreMilestones: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** 请求不合法时抛出；code 原样返回给前端，由前端翻译成三语文案。 */
export type ProjectErrorCode =
  | 'invalid_id'
  | 'invalid_name'
  | 'invalid_field'
  | 'exists'
  | 'not_found'
  | 'suspected_secret'
  | 'project_changed';

export class ProjectError extends Error {
  readonly code: ProjectErrorCode;
  readonly field: string | undefined;
  constructor(code: ProjectErrorCode, field?: string) {
    super(code);
    this.code = code;
    this.field = field;
  }
}

interface Row {
  attention_note: string;
  name_ja: string;
  name_en: string;
  category: Project['category'];
  priority: Project['priority'];
  agent_assignments: string;
  repository_url: string;
  website_url: string;
  working_on: string;
  next_step: string;
  key_date: string;
  key_date_label: string;
  manual_lang: Project['manualLang'];
  id: string;
  name: string;
  tracking: Tracking;
  attention: Attention;
  freshness_days: number;
  core_milestones: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

function toProject(r: Row): Project {
  let core: unknown;
  try {
    core = JSON.parse(r.core_milestones);
  } catch {
    core = [];
  }
  return {
    attentionNote: r.attention_note,
    nameJa: r.name_ja,
    nameEn: r.name_en,
    category: r.category,
    priority: r.priority,
    agentAssignments: JSON.parse(r.agent_assignments) as Project['agentAssignments'],
    repositoryUrl: r.repository_url,
    websiteUrl: r.website_url,
    workingOn: r.working_on,
    nextStep: r.next_step,
    keyDate: r.key_date,
    keyDateLabel: r.key_date_label,
    manualLang: r.manual_lang,
    id: r.id,
    name: r.name,
    tracking: r.tracking,
    attention: r.attention,
    freshnessDays: r.freshness_days,
    coreMilestones: Array.isArray(core) ? core.filter((x): x is string => typeof x === 'string') : [],
    sortOrder: r.sort_order,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const MAX_NAME = 80;
// 控制字符和双向控制符：名称会显示在各处，不允许藏东西。
const range = (from: number, to = from) => `${String.fromCodePoint(from)}-${String.fromCodePoint(to)}`;
const UNSAFE_CHARS = new RegExp(
  `[${[range(0, 0x1f), range(0x7f), range(0x200b, 0x200f), range(0x202a, 0x202e), range(0x2066, 0x2069), range(0xfeff)].join('')}]`,
);

export function cleanName(value: unknown): string {
  if (typeof value !== 'string') throw new ProjectError('invalid_name', 'name');
  const name = value.trim().replace(/\s+/g, ' ');
  if (scanSecrets(name).length) throw new ProjectError('suspected_secret');
  if (!name || name.length > MAX_NAME || UNSAFE_CHARS.test(name))
    throw new ProjectError('invalid_name', 'name');
  return name;
}

export function listProjects(db: Database): Project[] {
  const rows = db.prepare('SELECT * FROM projects ORDER BY sort_order, id').all() as unknown as Row[];
  return rows.map(toProject);
}

export function getProject(db: Database, id: string): Project | undefined {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as unknown as Row | undefined;
  return row ? toProject(row) : undefined;
}

/** 给协议校验用的登记表：所有登记过的项目（包括已归档的）。 */
export function registry(db: Database): RegisteredProject[] {
  return listProjects(db)
    .filter((p) => p.tracking === 'protocol')
    .map((p) => ({ id: p.id, name: p.name }));
}

export function createProject(db: Database, input: Record<string, unknown>, now: Date): Project {
  const id = input.id;
  if (typeof id !== 'string' || id.length > 64 || !PROJECT_ID_PATTERN.test(id)) {
    throw new ProjectError('invalid_id', 'id');
  }
  const name = cleanName(input.name);
  const tracking = input.tracking ?? 'protocol';
  if (!TRACKING.includes(tracking as Tracking)) throw new ProjectError('invalid_field', 'tracking');
  if (getProject(db, id)) throw new ProjectError('exists', 'id');
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM projects').get() as { m: number };
  const at = now.toISOString();
  db.prepare(
    'INSERT INTO projects (id, name, tracking, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, name, tracking as string, max.m + 10, at, at);
  return getProject(db, id) as Project;
}

export function updateProject(db: Database, id: string, patch: Record<string, unknown>, now: Date): Project {
  const current = getProject(db, id);
  if (!current) throw new ProjectError('not_found');
  if ('expectedUpdatedAt' in patch && patch.expectedUpdatedAt !== current.updatedAt)
    throw new ProjectError('project_changed');
  const sets: string[] = [];
  const values: (string | number)[] = [];
  for (const [key, column, max] of [
    ['nameJa', 'name_ja', 80],
    ['attentionNote', 'attention_note', 2000],
    ['nameEn', 'name_en', 80],
    ['repositoryUrl', 'repository_url', 1000],
    ['websiteUrl', 'website_url', 1000],
    ['workingOn', 'working_on', 2000],
    ['nextStep', 'next_step', 2000],
    ['keyDateLabel', 'key_date_label', 80],
  ] as const) {
    if (!(key in patch)) continue;
    if (['workingOn', 'nextStep', 'keyDateLabel'].includes(key) && current.tracking !== 'manual')
      throw new ProjectError('invalid_field', key);
    const value = projectText(patch[key], max);
    if ((key === 'repositoryUrl' || key === 'websiteUrl') && value) {
      try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
      } catch {
        throw new ProjectError('invalid_field', key);
      }
    }
    sets.push(`${column} = ?`);
    values.push(value);
  }
  for (const [key, column, allowed] of [
    ['category', 'category', CATEGORIES],
    ['priority', 'priority', PRIORITIES],
    ['manualLang', 'manual_lang', ['zh-Hans', 'ja', 'en']],
  ] as const)
    if (key in patch) {
      if (!(allowed as readonly unknown[]).includes(patch[key])) throw new ProjectError('invalid_field', key);
      sets.push(`${column} = ?`);
      values.push(patch[key] as string);
    }
  if ('keyDate' in patch) {
    if (
      current.tracking !== 'manual' ||
      typeof patch.keyDate !== 'string' ||
      (patch.keyDate && !isCalendarDate(patch.keyDate))
    )
      throw new ProjectError('invalid_field', 'keyDate');
    sets.push('key_date = ?');
    values.push(patch.keyDate);
  }
  if ('agentAssignments' in patch) {
    const a = patch.agentAssignments;
    if (
      !Array.isArray(a) ||
      a.length > 3 ||
      !a.every((v) => v && typeof v === 'object' && ['claude', 'codex', 'other'].includes(v.agent)) ||
      new Set(a.map((v) => v.agent)).size !== a.length
    )
      throw new ProjectError('invalid_field', 'agentAssignments');
    const clean = a.map((v) => ({ agent: v.agent as string, scope: projectText(v.scope, 2000) }));
    sets.push('agent_assignments = ?');
    values.push(JSON.stringify(clean));
  }
  if ('name' in patch) {
    sets.push('name = ?');
    values.push(cleanName(patch.name));
  }
  if ('attention' in patch) {
    if (!ATTENTION.includes(patch.attention as Attention))
      throw new ProjectError('invalid_field', 'attention');
    sets.push('attention = ?');
    values.push(patch.attention as string);
  }
  if ('freshnessDays' in patch) {
    const d = patch.freshnessDays;
    if (typeof d !== 'number' || !Number.isInteger(d) || d < 1 || d > 365) {
      throw new ProjectError('invalid_field', 'freshnessDays');
    }
    sets.push('freshness_days = ?');
    values.push(d);
  }
  if ('coreMilestones' in patch) {
    const c = patch.coreMilestones;
    if (!Array.isArray(c) || c.length > 200 || !c.every((x) => typeof x === 'string' && x.length <= 120)) {
      throw new ProjectError('invalid_field', 'coreMilestones');
    }
    sets.push('core_milestones = ?');
    values.push(JSON.stringify([...new Set(c)]));
  }
  if ('sortOrder' in patch) {
    const o = patch.sortOrder;
    if (typeof o !== 'number' || !Number.isInteger(o)) throw new ProjectError('invalid_field', 'sortOrder');
    sets.push('sort_order = ?');
    values.push(o);
  }
  if (sets.length === 0) return current;
  sets.push('updated_at = ?');
  const previousAt = Date.parse(current.updatedAt);
  values.push(
    new Date(Math.max(now.getTime(), Number.isFinite(previousAt) ? previousAt + 1 : 0)).toISOString(),
    id,
  );
  db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  return getProject(db, id) as Project;
}

export function projectText(value: unknown, max = 2000) {
  if (typeof value !== 'string' || value.length > max) throw new ProjectError('invalid_field');
  if (scanSecrets(value).length) throw new ProjectError('suspected_secret');
  return value.trim();
}
export function isCalendarDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
