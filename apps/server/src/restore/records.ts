/** Portable export fields -> fixed SQLite columns. Never interpolate package keys into SQL. */

import type { SQLInputValue } from 'node:sqlite';
import { PROJECT_ID_PATTERN } from '@moriium-dashboard/protocol';
import type { Database } from '../db.ts';
import { cleanName, isCalendarDate } from '../projects.ts';
import { requireRestore } from './archive.ts';

export type RecordValue = Record<string, unknown>;
type Codec = (value: unknown) => SQLInputValue;
type Fields = Record<string, readonly [string, Codec]>;
export function object(value: unknown): RecordValue {
  requireRestore(value !== null && typeof value === 'object' && !Array.isArray(value));
  return value as RecordValue;
}
export function array(value: unknown, max = 10_000): unknown[] {
  requireRestore(Array.isArray(value) && value.length <= max);
  return value;
}
export const text =
  (max = 2000, nonempty = false): Codec =>
  (v) => {
    requireRestore(typeof v === 'string' && v.length <= max && (!nonempty || v.trim().length > 0));
    return v;
  };
export const integer =
  (min = 0, max = Number.MAX_SAFE_INTEGER): Codec =>
  (v) => {
    requireRestore(typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max);
    return v;
  };
export const nullable =
  (codec: Codec): Codec =>
  (v) =>
    v === null ? null : codec(v);
export const choice =
  (...allowed: string[]): Codec =>
  (v) => {
    requireRestore(typeof v === 'string' && allowed.includes(v));
    return v;
  };
export const bool: Codec = (v) => {
  requireRestore(typeof v === 'boolean');
  return Number(v);
};
export const timestamp: Codec = (v) => {
  requireRestore(
    typeof v === 'string' &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) &&
      Number.isFinite(Date.parse(v)) &&
      new Date(v).toISOString() === v,
  );
  return v;
};
const date: Codec = (v) => {
  requireRestore(typeof v === 'string' && isCalendarDate(v));
  return v;
};
const url: Codec = (v) => {
  text()(v);
  if (v === '') return '';
  try {
    const u = new URL(v as string);
    requireRestore(u.protocol === 'https:' && !u.username && !u.password);
  } catch {
    requireRestore(false);
  }
  return v as string;
};
const json =
  (check: (v: unknown) => void): Codec =>
  (v) => {
    check(v);
    return JSON.stringify(v);
  };
const id = integer(1);
const lang = choice('zh-Hans', 'ja', 'en');
const projectId: Codec = (v) => {
  requireRestore(typeof v === 'string' && v.length <= 64 && PROJECT_ID_PATTERN.test(v));
  return v;
};
const stringList = json((v) => {
  const values = array(v, 200);
  values.forEach((s) => {
    text(120)(s);
  });
  requireRestore(new Set(values).size === values.length);
});
const fields = {
  projects: {
    id: ['id', projectId],
    name: [
      'name',
      (v) => {
        requireRestore(typeof v === 'string' && cleanName(v) === v);
        return v;
      },
    ],
    tracking: ['tracking', choice('protocol', 'manual')],
    attention: ['attention', choice('active', 'waiting', 'incubating', 'paused', 'archived')],
    freshnessDays: ['freshness_days', integer(1, 365)],
    coreMilestones: ['core_milestones', stringList],
    sortOrder: ['sort_order', integer(-Number.MAX_SAFE_INTEGER)],
    createdAt: ['created_at', timestamp],
    updatedAt: ['updated_at', timestamp],
    attentionNote: ['attention_note', text()],
    nameJa: ['name_ja', text(80)],
    nameEn: ['name_en', text(80)],
    category: ['category', choice('research', 'website', 'creation', 'life', 'learning', 'exploration')],
    priority: ['priority', choice('focus', 'normal', 'later')],
    agentAssignments: [
      'agent_assignments',
      json((v) => {
        const agents = array(v, 3).map((a) => {
          const r = object(a);
          requireRestore(Object.keys(r).every((k) => ['agent', 'scope'].includes(k)));
          choice('claude', 'codex', 'other')(r.agent);
          text()(r.scope);
          return r.agent;
        });
        requireRestore(new Set(agents).size === agents.length);
      }),
    ],
    repositoryUrl: ['repository_url', url],
    websiteUrl: ['website_url', url],
    workingOn: ['working_on', text()],
    nextStep: ['next_step', text()],
    keyDate: ['key_date', (v) => (v === '' ? '' : date(v))],
    keyDateLabel: ['key_date_label', text(80)],
    manualLang: ['manual_lang', lang],
  },
  importBatches: {
    id: ['id', id],
    at: ['at', timestamp],
    fileCount: ['file_count', integer(1, 20)],
    importedCount: ['imported_count', integer(0, 20)],
    skippedCount: ['skipped_count', integer(0, 20)],
    undoneAt: ['undone_at', nullable(timestamp)],
    results: [
      'results',
      json((v) => {
        array(v, 20);
      }),
    ],
  },
  acceptances: {
    projectId: ['project_id', projectId],
    milestoneId: ['milestone_id', text(120, true)],
    status: ['status', choice('accepted', 'rejected')],
    note: ['note', text()],
    at: ['at', timestamp],
    snapshotId: ['snapshot_id', id],
  },
  itemStates: {
    projectId: ['project_id', projectId],
    kind: ['kind', choice('needs_morii', 'blockers')],
    key: ['item_key', text(200, true)],
    text: ['text', text()],
    status: ['status', choice('open', 'decided', 'later', 'not_applicable', 'acknowledged')],
    conclusion: ['conclusion', text()],
    dueDate: ['due_date', nullable(date)],
    at: ['at', timestamp],
    snapshotId: ['snapshot_id', id],
  },
  manualMilestones: {
    id: ['id', id],
    projectId: ['project_id', projectId],
    title: ['title', text(2000, true)],
    lang: ['lang', lang],
    status: ['status', choice('not_started', 'in_progress', 'blocked', 'done', 'unknown')],
    targetDate: ['target_date', nullable(date)],
    sortOrder: ['sort_order', integer()],
    at: ['at', timestamp],
  },
  tasks: {
    id: ['id', id],
    title: ['title', text(2000, true)],
    lang: ['lang', lang],
    projectId: ['project_id', nullable(projectId)],
    dueDate: ['due_date', nullable(date)],
    status: ['status', choice('todo', 'doing', 'done', 'dropped')],
    sourceSnapshotId: ['source_snapshot_id', nullable(id)],
    sourceAction: ['source_action', nullable(json(object))],
    sourceKey: ['source_key', nullable(text(200, true))],
    revision: ['revision', id],
    createdAt: ['created_at', timestamp],
    updatedAt: ['updated_at', timestamp],
    completedAt: ['completed_at', nullable(timestamp)],
  },
  works: {
    id: ['id', id],
    title: ['title', text(2000, true)],
    lang: ['lang', lang],
    kind: ['kind', choice('release', 'launch', 'photos', 'video', 'design', 'article', 'other')],
    date: ['date', date],
    projectId: ['project_id', nullable(projectId)],
    link: ['link', url],
    note: ['note', text()],
    treasured: ['treasured', bool],
    revision: ['revision', id],
    createdAt: ['created_at', timestamp],
    updatedAt: ['updated_at', timestamp],
    deletedAt: ['deleted_at', nullable(timestamp)],
  },
} satisfies Record<string, Fields>;
export type Collection = keyof typeof fields;
const tables: Record<Collection, string> = {
  projects: 'projects',
  importBatches: 'import_batches',
  acceptances: 'acceptance_records',
  itemStates: 'item_states',
  manualMilestones: 'manual_milestones',
  tasks: 'tasks',
  works: 'works',
};
const derived: Partial<Record<Collection, string[]>> = { tasks: ['gone'], works: ['hasCover', 'coverFile'] };

export function insertRecords(db: Database, collection: Collection, records: RecordValue[]) {
  const entries = Object.entries(fields[collection]);
  const allowed = new Set([...entries.map(([key]) => key), ...(derived[collection] ?? [])]);
  const statement = db.prepare(
    `INSERT INTO ${tables[collection]} (${entries.map(([, [column]]) => column).join(',')}) VALUES (${entries.map(() => '?').join(',')})`,
  );
  for (const record of records) {
    requireRestore(Object.keys(record).every((key) => allowed.has(key)));
    statement.run(...entries.map(([key, [, codec]]) => codec(record[key])));
  }
}
