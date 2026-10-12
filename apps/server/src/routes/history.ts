/** 历史接口（P3.4）：/api/projects/:id/snapshots、/api/snapshots/…（05 第 11 节）。 */
import type { Hono } from 'hono';
import type { AppContext } from '../app.ts';
import {
  compareSnapshots,
  HistoryError,
  projectHistory,
  rawSnapshot,
  restoreSnapshot,
  trashSnapshot,
} from '../history.ts';
import { getProject } from '../projects.ts';
import { getSnapshot } from '../snapshots.ts';

const STATUS = { not_found: 404, conflict: 409, not_deleted: 409, invalid_request: 400 } as const;

const idOf = (v: string | undefined) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export function historyRoutes(app: Hono, ctx: AppContext) {
  const now = () => ctx.now?.() ?? new Date();

  const run = <T>(fn: () => T) => {
    try {
      return { ok: true as const, value: fn() };
    } catch (error) {
      if (error instanceof HistoryError) return { ok: false as const, code: error.code };
      throw error;
    }
  };

  app.get('/api/projects/:id/snapshots', (c) => {
    const id = c.req.param('id');
    if (!getProject(ctx.db, id)) return c.json({ error: 'not_found' }, 404);
    return c.json({ snapshots: projectHistory(ctx.db, id) });
  });

  // compare 要写在 :id 之前，否则会被当成快照 ID。
  app.get('/api/snapshots/compare', (c) => {
    const a = idOf(c.req.query('a'));
    const b = idOf(c.req.query('b'));
    if (a === null || b === null) return c.json({ error: 'invalid_request' }, 400);
    const r = run(() => compareSnapshots(ctx.db, a, b));
    return r.ok ? c.json(r.value) : c.json({ error: r.code }, STATUS[r.code]);
  });

  app.get('/api/snapshots/:id', (c) => {
    const id = idOf(c.req.param('id'));
    const s = id === null ? undefined : getSnapshot(ctx.db, id);
    return s ? c.json({ snapshot: s }) : c.json({ error: 'not_found' }, 404);
  });

  // 原文逐字节返回，作为下载（不在浏览器里当网页渲染）。
  app.get('/api/snapshots/:id/raw', (c) => {
    const id = idOf(c.req.param('id'));
    const r = id === null ? undefined : rawSnapshot(ctx.db, id);
    if (!r) return c.json({ error: 'not_found' }, 404);
    const ascii = r.fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    c.header('Content-Type', 'application/octet-stream');
    c.header(
      'Content-Disposition',
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(r.fileName)}`,
    );
    return c.body(new Uint8Array(r.raw));
  });

  app.delete('/api/snapshots/:id', (c) => {
    const id = idOf(c.req.param('id'));
    if (id === null) return c.json({ error: 'not_found' }, 404);
    const r = run(() => trashSnapshot(ctx.db, id, now()));
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.code }, STATUS[r.code]);
  });

  app.post('/api/snapshots/:id/restore', (c) => {
    const id = idOf(c.req.param('id'));
    if (id === null) return c.json({ error: 'not_found' }, 404);
    const r = run(() => restoreSnapshot(ctx.db, id, now()));
    return r.ok ? c.json({ ok: true }) : c.json({ error: r.code }, STATUS[r.code]);
  });
}
