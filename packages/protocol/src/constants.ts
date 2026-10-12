/** 支持的协议版本。新增次版本时在末尾追加，并生成对应的校验器。 */
export const KNOWN_SCHEMA_VERSIONS = ['1.0', '1.1'] as const;
export type KnownSchemaVersion = (typeof KNOWN_SCHEMA_VERSIONS)[number];
export const LATEST_SCHEMA_VERSION: KnownSchemaVersion = '1.1';

/**
 * 接收规则的版本，随快照一起入库。哪些问题算错误、哪些算提醒、怎么规范化，
 * 有实质变化时加一，这样旧快照入库时的判断仍可追溯。
 */
export const RULES_VERSION = 1;

export const MAX_FILE_BYTES = 1024 * 1024;
export const SUMMARY_MAX_CODE_POINTS = 160;
/** snapshot_at 最多允许比当前时间晚这么多（机器时钟误差）。 */
export const FUTURE_TOLERANCE_MS = 10 * 60 * 1000;

export const STAGES = [
  'planning',
  'development',
  'integration',
  'acceptance',
  'launch_preparation',
  'live',
  'maintenance',
  'paused',
  'unknown',
] as const;
export type Stage = (typeof STAGES)[number];

/** 阶段轴上的七个阶段，按顺序。paused 与 unknown 不在轴上。 */
export const STAGE_AXIS = [
  'planning',
  'development',
  'integration',
  'acceptance',
  'launch_preparation',
  'live',
  'maintenance',
] as const satisfies readonly Stage[];

export const MILESTONE_STATUSES = ['not_started', 'in_progress', 'blocked', 'done', 'unknown'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const EVIDENCE_LEVELS = [
  'self_report',
  'repository',
  'existing_test',
  'morii_accepted',
  'unknown',
] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export const HUMAN_ACCEPTANCE = ['pending', 'accepted', 'rejected', 'not_required', 'unknown'] as const;
export type HumanAcceptance = (typeof HUMAN_ACCEPTANCE)[number];

export const PRIORITIES = ['P0', 'P1', 'P2'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const REPORTER_AGENTS = ['codex', 'claude', 'other'] as const;
export type ReporterAgent = (typeof REPORTER_AGENTS)[number];

/** project_id 的格式（03 第 5 节）：小写字母开头，至少一个点，例如 mori.meta。 */
export const PROJECT_ID_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

export interface RegisteredProject {
  id: string;
  name: string;
}

/** 首批登记的六个项目（03 第 8 节）。服务端用它初始化登记表；命令行检查工具默认用它。 */
export const PRESET_PROJECTS: readonly RegisteredProject[] = [
  { id: 'moriium.main', name: 'Moriium 主站' },
  { id: 'moriium.gallery', name: 'Moriium Gallery' },
  { id: 'mori.meta', name: 'MoriMeta' },
  { id: 'enouia.memory', name: 'Enouia Memory' },
  { id: 'enouia.runtime', name: 'Enouia Runtime' },
  { id: 'morii.dashboard', name: 'Moriium Dashboard' },
];
