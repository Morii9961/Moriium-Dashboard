/**
 * Schema 表达不了的检查：03 第 5 节的跨字段一致性、项目登记、时间是否在未来，
 * 以及 6.4 节的「本机路径和 IP 会保存在私有数据里」。
 *
 * 在 Schema 校验之后运行，但不假设结构一定正确：每一步都先检查类型，
 * 这样结构错误和语义错误能在同一次检查里全部列出来。
 */
import { FUTURE_TOLERANCE_MS, PROJECT_ID_PATTERN, type RegisteredProject } from './constants.ts';
import { parseSnapshotAt } from './datetime.ts';
import { isPlainObject } from './normalize.ts';
import type { Issue, IssueParam, JsonPath } from './types.ts';

type Obj = Record<string, unknown>;

export interface SemanticInput {
  candidate: Obj;
  isV11: boolean;
  registry: readonly RegisteredProject[];
  now: Date;
  expectedProjectId: string | undefined;
  /** project_name 是由登记名称补上的，就不再比较。 */
  projectNameFilled: boolean;
}

const objectsOf = (value: unknown): [Obj, number][] =>
  Array.isArray(value)
    ? value.flatMap((item, i) => (isPlainObject(item) ? [[item, i] as [Obj, number]] : []))
    : [];

const isBlank = (value: unknown) => typeof value === 'string' && value.trim() === '';

export function semanticChecks(input: SemanticInput): Issue[] {
  const { candidate: c, isV11, registry, now } = input;
  const issues: Issue[] = [];
  const error = (code: Issue['code'], path: JsonPath, params: Record<string, IssueParam> = {}) =>
    issues.push({ code, severity: 'error', path, params });
  const warn = (code: Issue['code'], path: JsonPath, params: Record<string, IssueParam> = {}) =>
    issues.push({ code, severity: 'warning', path, params });

  if (typeof c.summary === 'string' && c.summary.length > 0 && isBlank(c.summary))
    error('summary_blank', ['summary']);

  // 项目登记
  const projectId =
    typeof c.project_id === 'string' && PROJECT_ID_PATTERN.test(c.project_id) ? c.project_id : null;
  const registered = projectId ? registry.find((p) => p.id === projectId) : undefined;
  if (projectId && !registered) {
    error('project_unregistered', ['project_id'], { id: projectId, registered: registry.map((p) => p.id) });
  }
  if (projectId && registered && input.expectedProjectId && input.expectedProjectId !== projectId) {
    const expected = registry.find((p) => p.id === input.expectedProjectId);
    error('project_mismatch', ['project_id'], {
      expectedId: input.expectedProjectId,
      expectedName: expected?.name ?? input.expectedProjectId,
      actualId: projectId,
      actualName: registered.name,
    });
  }
  if (
    registered &&
    !input.projectNameFilled &&
    typeof c.project_name === 'string' &&
    c.project_name.length > 0
  ) {
    if (c.project_name !== registered.name) {
      warn('project_name_mismatch', ['project_name'], {
        fileName: c.project_name,
        registeredName: registered.name,
      });
    }
  }

  // 时间
  if (typeof c.snapshot_at === 'string') {
    const parsed = parseSnapshotAt(c.snapshot_at);
    if (parsed && parsed.utcMs - now.getTime() > FUTURE_TOLERANCE_MS) {
      error('snapshot_in_future', ['snapshot_at'], {
        aheadMinutes: Math.round((parsed.utcMs - now.getTime()) / 60_000),
      });
    }
  }

  // ID 唯一
  const duplicates = (list: unknown, key: string, code: 'duplicate_milestone_id' | 'duplicate_item_id') => {
    const firstIndex = new Map<string, number>();
    for (const [item, index] of objectsOf(list)) {
      const id = item.id;
      if (typeof id !== 'string') continue;
      const first = firstIndex.get(id);
      if (first === undefined) firstIndex.set(id, index);
      else error(code, [key, index], { id, firstItem: first + 1, item: index + 1, list: key });
    }
  };
  duplicates(c.milestones, 'milestones', 'duplicate_milestone_id');
  if (isV11)
    for (const key of ['blockers', 'next_actions', 'needs_morii'])
      duplicates(c[key], key, 'duplicate_item_id');

  // 里程碑的一致性（第 5 节第 2 到 4 条）
  const milestones = objectsOf(c.milestones);
  for (const [m, i] of milestones) {
    const path: JsonPath = ['milestones', i];
    const id = typeof m.id === 'string' ? m.id : null;
    if (
      m.evidence_level === 'morii_accepted' &&
      typeof m.human_acceptance === 'string' &&
      m.human_acceptance !== 'accepted'
    ) {
      warn('evidence_acceptance_conflict', path, { id, humanAcceptance: m.human_acceptance });
    }
    if (
      m.human_acceptance === 'accepted' &&
      typeof m.evidence_level === 'string' &&
      m.evidence_level !== 'morii_accepted'
    ) {
      warn('accepted_without_evidence', path, { id, evidenceLevel: m.evidence_level });
    }
    if (
      (m.evidence_level === 'repository' || m.evidence_level === 'existing_test') &&
      Array.isArray(m.evidence_refs) &&
      m.evidence_refs.length === 0
    ) {
      warn('evidence_refs_missing', path, { id, evidenceLevel: m.evidence_level });
    }
  }

  // 第 5 节第 6 到 9 条
  const source = isPlainObject(c.source) ? c.source : null;
  if (source?.tests_rerun === true) warn('tests_rerun_claimed', ['source', 'tests_rerun']);
  if (c.stage === 'paused' && objectsOf(c.next_actions).some(([a]) => a.priority === 'P0')) {
    warn('paused_with_p0', ['stage']);
  }
  if (c.overall_progress === 100) {
    const unfinished = milestones.filter(([m]) => typeof m.status === 'string' && m.status !== 'done').length;
    if (unfinished > 0) warn('progress_100_incomplete', ['overall_progress'], { unfinished });
  }
  if (source && Array.isArray(source.basis) && source.basis.length === 0)
    warn('basis_empty', ['source', 'basis']);

  // 第 5 节第 11 条：报告者与分支前缀
  if (isV11 && isPlainObject(c.reporter) && source && typeof source.branch === 'string') {
    const fromBranch = agentFromBranch(source.branch);
    const agent = c.reporter.agent;
    if (fromBranch && (agent === 'claude' || agent === 'codex') && agent !== fromBranch) {
      warn('reporter_branch_mismatch', ['reporter', 'agent'], {
        agent,
        branch: source.branch,
        branchAgent: fromBranch,
      });
    }
  }

  // 空的影响和结果
  for (const [b, i] of objectsOf(c.blockers)) {
    if (isBlank(b.impact)) warn('blocker_impact_empty', ['blockers', i, 'impact']);
  }
  for (const [a, i] of objectsOf(c.next_actions)) {
    if (isBlank(a.result)) warn('next_action_result_empty', ['next_actions', i, 'result']);
  }

  const privateInfo = findPrivateInfo(c);
  if (privateInfo.paths.length > 0) {
    warn('private_info_present', [], { kinds: privateInfo.kinds, fields: privateInfo.paths.slice(0, 5) });
  }

  return issues;
}

export function agentFromBranch(branch: string): 'claude' | 'codex' | null {
  if (branch.startsWith('claude/')) return 'claude';
  if (branch.startsWith('codex/')) return 'codex';
  return null;
}

const LOCAL_PATH = /(?<![A-Za-z0-9])[A-Za-z]:(?:\\|\/(?!\/))|\/(?:Users|home)\/[^/\s]+|\\(?:Users)\\/;
const IPV4 = /(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/g;

function findPrivateInfo(root: unknown): { kinds: string[]; paths: string[] } {
  const kinds = new Set<string>();
  const paths: string[] = [];
  const visit = (value: unknown, path: JsonPath) => {
    if (typeof value === 'string') {
      let hit = false;
      if (LOCAL_PATH.test(value)) {
        kinds.add('local_path');
        hit = true;
      }
      for (const match of value.matchAll(IPV4)) {
        const ok = match[0].split('.').every((o) => Number(o) <= 255);
        if (ok && match[0] !== '127.0.0.1' && match[0] !== '0.0.0.0') {
          kinds.add('ip_address');
          hit = true;
          break;
        }
      }
      if (hit) paths.push(toPointer(path));
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => {
        visit(v, [...path, i]);
      });
    } else if (isPlainObject(value)) {
      for (const [k, v] of Object.entries(value)) visit(v, [...path, k]);
    }
  };
  visit(root, []);
  return { kinds: [...kinds], paths };
}

export function toPointer(path: JsonPath): string {
  return path.map((p) => `/${String(p).replaceAll('~', '~0').replaceAll('/', '~1')}`).join('');
}
