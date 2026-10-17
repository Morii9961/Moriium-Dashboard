/** /api/local-scan：本机仓库扫描（P7 · L2）。只在本机实例挂载。 */
import type { Hono } from 'hono';
import type { AppContext } from '../app.ts';
import { previewImport } from '../imports.ts';
import { findSnapshots, readRoots, ScanError, saveRoots } from '../localScan.ts';
import { readJsonObject } from './util.ts';

export function localScanRoutes(app: Hono, ctx: AppContext) {
  const scan = ctx.localScan;
  if (!scan) return;
  const now = () => ctx.now?.() ?? new Date();

  app.get('/api/local-scan/roots', (c) => c.json({ roots: readRoots(scan.file) }));

  app.put('/api/local-scan/roots', async (c) => {
    const body = await readJsonObject(c);
    if (!body) return c.json({ error: 'invalid_json' }, 400);
    try {
      return c.json({ roots: saveRoots(scan.file, body.roots) });
    } catch (error) {
      if (error instanceof ScanError) return c.json({ error: error.code, field: error.field }, 400);
      throw error;
    }
  });

  // 只返回 Dashboard 还没有的快照：和已导入内容相同的、项目没登记的都先在服务端滤掉。
  app.get('/api/local-scan/snapshots', async (c) => {
    const roots = readRoots(scan.file);
    const found = findSnapshots(roots);
    const previews = await previewImport(ctx.db, found.files, now());
    let duplicate = 0;
    let unregistered = 0;
    const files = found.files.filter((_, i) => {
      const p = previews[i];
      if (p?.status === 'accepted' && p.placement.kind === 'duplicate') {
        duplicate++;
        return false;
      }
      if (p?.status === 'rejected' && p.errors.some((e) => e.code === 'project_unregistered')) {
        unregistered++;
        return false;
      }
      return true;
    });
    return c.json({
      roots: roots.length,
      scanned: found.scanned,
      found: found.files.length,
      duplicate,
      unregistered,
      truncated: found.truncated,
      files,
    });
  });
}
