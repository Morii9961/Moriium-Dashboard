/** 导出接口（P3.5）：GET /api/export、GET /api/export/snapshots。 */
import type { Hono } from 'hono';
import type { AppContext } from '../app.ts';
import { audit } from '../audit.ts';
import { exportAll, exportSnapshots } from '../export.ts';

export function exportRoutes(app: Hono, ctx: AppContext) {
  const now = () => ctx.now?.() ?? new Date();
  const send = (body: Uint8Array, name: string) =>
    new Response(body, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${name}"`,
      },
    });

  app.get('/api/export', () => {
    const at = now();
    const zip = exportAll(ctx.db, at, ctx.version);
    audit(ctx.db, 'export', null, '导出全部数据', at);
    return send(zip, `moriium-dashboard-export-${at.toISOString().slice(0, 10)}.zip`);
  });

  app.get('/api/export/snapshots', () => {
    const at = now();
    const zip = exportSnapshots(ctx.db, at);
    audit(ctx.db, 'export.snapshots', null, '只导出快照原文', at);
    return send(zip, `moriium-dashboard-snapshots-${at.toISOString().slice(0, 10)}.zip`);
  });
}
