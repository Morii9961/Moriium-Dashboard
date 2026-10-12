import type {
  EvidenceLevel,
  HumanAcceptance,
  MilestoneStatus,
  Priority,
  ReporterAgent,
  Stage,
} from './constants.ts';

/** 校验和规范化之后的快照。字段与 v1.1 相同；v1.0 文件没有 reporter 和条目 id。 */
export interface Snapshot {
  /** 文件里写的原始版本号，例如 "1.0"；未知次版本时可能是 "1.4"。 */
  schema_version: string;
  project_id: string;
  project_name: string;
  snapshot_at: string;
  source: {
    branch: string | null;
    commit_sha: string | null;
    basis: string[];
    tests_rerun: boolean;
  };
  reporter?: { agent: ReporterAgent; note?: string | null };
  stage: Stage;
  summary: string;
  overall_progress: number | null;
  milestones: Milestone[];
  blockers: Blocker[];
  next_actions: NextAction[];
  needs_morii: NeedsMoriiItem[];
}

export interface Milestone {
  id: string;
  title: string;
  status: MilestoneStatus;
  evidence_level: EvidenceLevel;
  evidence_refs: string[];
  human_acceptance: HumanAcceptance;
}

export interface Blocker {
  id?: string;
  title: string;
  impact: string;
}

export interface NextAction {
  id?: string;
  title: string;
  /** 只有更新的 1.x 次版本里出现未知优先级时为 null，界面显示「优先级未知」。 */
  priority: Priority | null;
  result: string;
}

export interface NeedsMoriiItem {
  id?: string;
  decision: string;
}

/** JSON 路径，例如 ['milestones', 2, 'status']。空数组表示整份文件。 */
export type JsonPath = (string | number)[];

export type Severity = 'error' | 'warning';

export type IssueParam = string | number | boolean | null | string[];

export interface Issue {
  code: IssueCode;
  severity: Severity;
  path: JsonPath;
  /** 只有与原始文本位置有关的问题（语法、密钥）才有行列。 */
  line?: number;
  column?: number;
  params: Record<string, IssueParam>;
}

export type IssueCode =
  // 文件与编码
  | 'file_too_large'
  | 'encoding_utf16'
  | 'encoding_utf32'
  | 'encoding_not_utf8'
  | 'bom_stripped'
  | 'secret_detected'
  | 'json_syntax'
  | 'json_not_object'
  | 'json_too_deep'
  | 'code_fence_extracted'
  // 版本
  | 'version_missing'
  | 'version_not_string'
  | 'version_malformed'
  | 'version_unsupported_major'
  | 'version_unknown_minor'
  // 结构（来自 Schema）
  | 'required_missing'
  | 'type_mismatch'
  | 'not_integer'
  | 'enum_invalid'
  | 'out_of_range'
  | 'empty_string'
  | 'too_long'
  | 'too_many_items'
  | 'project_id_format'
  | 'id_format'
  | 'commit_sha_format'
  | 'snapshot_at_format'
  | 'snapshot_at_invalid'
  | 'unknown_field_rejected'
  // 接收规则：规范化与提醒
  | 'summary_too_long'
  | 'unknown_field'
  | 'newer_version_field'
  | 'filled_empty_array'
  | 'filled_null_progress'
  | 'filled_null_source_field'
  | 'filled_project_name'
  | 'unknown_enum_mapped'
  // 语义
  | 'summary_blank'
  | 'duplicate_milestone_id'
  | 'duplicate_item_id'
  | 'project_unregistered'
  | 'project_mismatch'
  | 'project_name_mismatch'
  | 'snapshot_in_future'
  | 'evidence_acceptance_conflict'
  | 'accepted_without_evidence'
  | 'evidence_refs_missing'
  | 'tests_rerun_claimed'
  | 'paused_with_p0'
  | 'progress_100_incomplete'
  | 'basis_empty'
  | 'reporter_branch_mismatch'
  | 'blocker_impact_empty'
  | 'next_action_result_empty'
  | 'private_info_present';

export type NormalizationCode = Extract<
  IssueCode,
  | 'bom_stripped'
  | 'code_fence_extracted'
  | 'unknown_field'
  | 'newer_version_field'
  | 'filled_empty_array'
  | 'filled_null_progress'
  | 'filled_null_source_field'
  | 'filled_project_name'
  | 'unknown_enum_mapped'
>;

/** 记录在快照上的规范化：做了什么、在哪里。原文不改。 */
export interface Normalization {
  code: NormalizationCode;
  path: JsonPath;
  params: Record<string, IssueParam>;
}

export type AttributionSource = 'file' | 'branch' | 'none';

export interface Attribution {
  agent: ReporterAgent | null;
  source: AttributionSource;
  note: string | null;
}

export interface CheckMeta {
  schemaVersion: string;
  /** 实际用来校验的 Schema 版本。 */
  validatedAs: string;
  rulesVersion: number;
  /** RFC 8785 规范化后的 SHA-256，十六进制。 */
  contentFingerprint: string;
  /** 文件原始字节的 SHA-256，十六进制。 */
  rawFingerprint: string;
  snapshotAtUtcMs: number;
  /** snapshot_at 原文里的时区偏移，单位分钟。 */
  snapshotAtOffsetMinutes: number;
  attribution: Attribution;
}

export type CheckResult =
  | {
      kind: 'accepted';
      snapshot: Snapshot;
      warnings: Issue[];
      normalizations: Normalization[];
      meta: CheckMeta;
    }
  | {
      kind: 'rejected';
      errors: Issue[];
      warnings: Issue[];
      /** 文件声明的版本；读到版本之前就失败时为 null。用于修复说明。 */
      schemaVersion: string | null;
    }
  /** 文件被 Markdown 代码块包着，由 Morii 决定是否提取（03 第 6.3 节）。 */
  | { kind: 'needs_choice'; choice: 'code_fence' };
