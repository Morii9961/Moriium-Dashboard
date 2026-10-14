/** 服务端接口返回的数据形状（与 apps/server/src 里的定义保持一致）。 */

export type Attention = 'active' | 'waiting' | 'incubating' | 'paused' | 'archived';
export const ATTENTION: readonly Attention[] = ['active', 'waiting', 'incubating', 'paused', 'archived'];

export interface Project {
  attentionNote: string;
  nameJa: string;
  nameEn: string;
  category: 'research' | 'website' | 'creation' | 'life' | 'learning' | 'exploration';
  priority: 'focus' | 'normal' | 'later';
  agentAssignments: { agent: ReporterAgent; scope: string }[];
  repositoryUrl: string;
  websiteUrl: string;
  workingOn: string;
  nextStep: string;
  keyDate: string;
  keyDateLabel: string;
  manualLang: 'zh-Hans' | 'ja' | 'en';
  id: string;
  name: string;
  tracking: 'protocol' | 'manual';
  attention: Attention;
  freshnessDays: number;
  coreMilestones: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type ReporterAgent = 'claude' | 'codex' | 'other';

export interface Reporter {
  agent: ReporterAgent | null;
  source: 'file' | 'branch' | 'chosen' | 'none';
  note: string | null;
}

export interface SnapshotBrief {
  id: number;
  projectId: string;
  snapshotAt: string;
  utcMs: number;
  offsetMinutes: number;
  importedAt: string;
  deleted: boolean;
  superseded: boolean;
}

export interface SnapshotRecord extends SnapshotBrief {
  schemaVersion: string;
  fileName: string;
  batchId: number | null;
  reporter: Reporter;
  warnings: unknown[];
  normalizations: unknown[];
  snapshot: import('@moriium-dashboard/protocol').Snapshot;
}

export interface ProjectWithCurrent extends Project {
  current: SnapshotRecord | null;
  snapshotCount: number;
  acceptances: AcceptanceRecord[];
  reviewItems: ReviewItem[];
  manualMilestones: ManualMilestone[];
}

export interface ManualMilestone {
  id: number;
  projectId: string;
  title: string;
  lang: 'zh-Hans' | 'ja' | 'en';
  status: import('@moriium-dashboard/protocol').Milestone['status'];
  targetDate: string | null;
  sortOrder: number;
  at: string;
}
export const CATEGORIES = ['research', 'website', 'creation', 'life', 'learning', 'exploration'] as const;
export const PRIORITIES = ['focus', 'normal', 'later'] as const;
export const localizedName = (p: Project, locale: string) =>
  locale === 'ja' ? p.nameJa || p.name : locale === 'en' ? p.nameEn || p.name : p.name;

export interface ItemState {
  projectId: string;
  kind: 'needs_morii' | 'blockers';
  key: string;
  text: string;
  status: 'open' | 'decided' | 'later' | 'not_applicable' | 'acknowledged';
  conclusion: string;
  dueDate: string | null;
  at: string;
  snapshotId: number;
}
export interface ReviewItem {
  kind: ItemState['kind'];
  key: string;
  text: string;
  impact: string | null;
  state: ItemState | null;
  gone: boolean;
  pending: boolean;
  repeated: boolean;
}

export interface AcceptanceRecord {
  projectId: string;
  milestoneId: string;
  status: 'accepted' | 'rejected';
  note: string;
  at: string;
  snapshotId: number;
}

export interface ProjectDetail extends ProjectWithCurrent {
  stageEntry: { snapshotAt: string; utcMs: number; offsetMinutes: number; onlySnapshot: boolean } | null;
}

export interface OverviewData {
  recentWorks: import('./Works.tsx').Work[];
  projects: ProjectWithCurrent[];
  pending: {
    projectId: string;
    projectName: string;
    snapshotId: number;
    utcMs: number;
    kind: 'decision' | 'acceptance';
    key: string;
    title: string;
    item: ReviewItem | null;
    milestoneId: string | null;
  }[];
  latestReports: {
    agent: ReporterAgent | null;
    projectId: string;
    projectName: string;
    snapshotAt: string;
    utcMs: number;
    offsetMinutes: number;
    importedAt: string;
    reporterSource: Reporter['source'];
  }[];
  recentDelivery: (AcceptanceRecord & { projectName: string; title: string })[];
}

/** 协议包给出的问题说明（中文），加上 JSON Pointer。 */
export interface ShownIssue {
  code: string;
  severity: 'error' | 'warning';
  pointer: string;
  line?: number;
  location: string;
  problem: string;
  received?: string;
  fix?: string;
}

export type PlacementView =
  | { kind: 'latest'; replaces: SnapshotBrief | null }
  | { kind: 'history'; currentLatest: SnapshotBrief | null; inBatch: boolean }
  | { kind: 'duplicate'; of: SnapshotBrief | null; deleted: boolean; inBatch: boolean }
  | { kind: 'conflict'; with: SnapshotBrief | null; inBatch: boolean };

export type FilePreview =
  | { status: 'needs_choice'; fileName: string; choice: 'code_fence' }
  | { status: 'rejected'; fileName: string; errors: ShownIssue[]; warnings: ShownIssue[]; fixPrompt: string }
  | {
      status: 'accepted';
      fileName: string;
      projectId: string;
      projectName: string;
      snapshotAt: string;
      utcMs: number;
      offsetMinutes: number;
      stage: import('@moriium-dashboard/protocol').Stage;
      attribution: { agent: ReporterAgent | null; source: 'file' | 'branch' | 'none'; note: string | null };
      warnings: ShownIssue[];
      normalizationCount: number;
      placement: PlacementView;
      diff: import('@moriium-dashboard/protocol').SnapshotDiff | null;
    };

export type FileOutcome =
  | {
      fileName: string;
      outcome: 'imported';
      projectId: string;
      snapshotId: number;
      placement: 'latest' | 'history' | 'replaced';
    }
  | {
      fileName: string;
      outcome: 'skipped';
      projectId: string;
      reason: 'duplicate' | 'conflict';
      existingId: number | null;
    }
  | { fileName: string; outcome: 'rejected' | 'needs_choice' };

export interface BatchView {
  id: number;
  at: string;
  fileCount: number;
  importedCount: number;
  skippedCount: number;
  undoneAt: string | null;
  results: FileOutcome[];
}

export interface HistoryItem extends SnapshotBrief {
  stage: import('@moriium-dashboard/protocol').Stage;
  milestonesDone: number;
  milestonesTotal: number;
  pending: number;
  reporter: Reporter;
  supersededBy: number | null;
  deletedAt: string | null;
  fileName: string;
}

export interface CompareResult {
  before: SnapshotBrief;
  after: SnapshotBrief;
  diff: import('@moriium-dashboard/protocol').SnapshotDiff;
}
