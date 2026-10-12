/**
 * Project Status Protocol：Schema 校验、接收规则、规范化、指纹、差异与历史定位。
 * 前端和服务端共用，不依赖 React，也不依赖服务端。
 */
export { attributeSnapshot } from './attribution.ts';
export { type CheckOptions, checkSnapshot } from './check.ts';
export * from './constants.ts';
export { parseSnapshotAt } from './datetime.ts';
export {
  diffSnapshots,
  type ItemDiff,
  isEmptyDiff,
  itemKey,
  type MilestoneChange,
  matchItems,
  normalizeItemText,
  type SnapshotDiff,
} from './diff.ts';
export { canonicalize, contentFingerprint, sha256Hex } from './fingerprint.ts';
export {
  agentPath,
  displayValue,
  type FormattedIssue,
  formatFixPrompt,
  formatIssue,
  formatIssueLine,
  humanPath,
  MILESTONE_STATUS_LABELS,
  STAGE_LABELS,
} from './messages/zh-Hans.ts';
export {
  currentLatest,
  type ExistingSnapshot,
  orderForImport,
  type Placement,
  placeSnapshot,
} from './placement.ts';
export { type SecretHit, type SecretPattern, scanSecrets, TOKEN_PATTERNS } from './secrets.ts';
export type * from './types.ts';
