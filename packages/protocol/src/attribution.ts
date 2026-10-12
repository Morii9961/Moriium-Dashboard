/**
 * 报告来自谁（03 第 10.1 节）：文件里的 reporter → 分支前缀推断 → 未注明。
 * Morii 在导入预览里的手动选择由界面处理，优先级在文件字段之后、分支推断之前。
 */
import { agentFromBranch } from './semantic.ts';
import type { Attribution, Snapshot } from './types.ts';

export function attributeSnapshot(snapshot: Pick<Snapshot, 'reporter' | 'source'>): Attribution {
  if (snapshot.reporter) {
    return { agent: snapshot.reporter.agent, source: 'file', note: snapshot.reporter.note ?? null };
  }
  const fromBranch = snapshot.source.branch ? agentFromBranch(snapshot.source.branch) : null;
  if (fromBranch) return { agent: fromBranch, source: 'branch', note: null };
  return { agent: null, source: 'none', note: null };
}
