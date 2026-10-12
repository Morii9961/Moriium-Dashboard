/** 操作记录（05 第 7 节 audit_log）：导入、删除、恢复、登记、验收等。摘要不写任何文件路径。 */
import type { Database } from './db.ts';

export function audit(
  db: Database,
  action: string,
  target: string | null,
  summary: string,
  now = new Date(),
) {
  db.prepare('INSERT INTO audit_log (at, action, target, summary) VALUES (?, ?, ?, ?)').run(
    now.toISOString(),
    action,
    target,
    summary,
  );
}
