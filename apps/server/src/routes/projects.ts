/** /api/projects：项目登记表（P3.1）。 */
import type { Hono } from 'hono';
import type { AppContext } from '../app.ts';
import { audit } from '../audit.ts';
import { transaction } from '../db.ts';
import { createProject, getProject, listProjects, ProjectError, updateProject } from '../projects.ts';
import { currentSnapshot, currentSnapshots, snapshotCounts } from '../snapshots.ts';
import { readJsonObject } from './util.ts';

const STATUS = {
  invalid_id: 400,
  invalid_name: 400,
  invalid_field: 400,
  exists: 409,
  not_found: 404,
} as const;

export function projectRoutes(app: Hono, ctx: AppContext) {
  const now = () => ctx.now?.() ?? new Date();

  // 每个项目带上当前快照（没有时为 null）和有效快照份数。数据量很小，一次取回。
  app.get('/api/projects', (c) => {
    const current = currentSnapshots(ctx.db);
    const counts = snapshotCounts(ctx.db);
    return c.json({
      projects: listProjects(ctx.db).map((p) => ({
        ...p,
        current: current.get(p.id) ?? null,
        snapshotCount: counts.get(p.id) ?? 0,
      })),
    });
  });

  app.get('/api/projects/:id', (c) => {
    const project = getProject(ctx.db, c.req.param('id'));
    if (!project) return c.json({ error: 'not_found' }, 404);
    return c.json({ project: { ...project, current: currentSnapshot(ctx.db, project.id) ?? null } });
  });

  app.post('/api/projects', async (c) => {
    const body = await readJsonObject(c);
    if (!body) return c.json({ error: 'invalid_json' }, 400);
    try {
      const project = transaction(ctx.db, () => {
        const p = createProject(ctx.db, body, now());
        audit(ctx.db, 'project.create', p.id, `登记项目 ${p.id}`, now());
        return p;
      });
      return c.json({ project }, 201);
    } catch (error) {
      if (error instanceof ProjectError)
        return c.json({ error: error.code, field: error.field }, STATUS[error.code]);
      throw error;
    }
  });

  app.patch('/api/projects/:id', async (c) => {
    const body = await readJsonObject(c);
    if (!body) return c.json({ error: 'invalid_json' }, 400);
    const id = c.req.param('id');
    try {
      const project = transaction(ctx.db, () => {
        const p = updateProject(ctx.db, id, body, now());
        audit(ctx.db, 'project.update', id, `修改项目 ${id}：${Object.keys(body).join('、')}`, now());
        return p;
      });
      return c.json({ project });
    } catch (error) {
      if (error instanceof ProjectError)
        return c.json({ error: error.code, field: error.field }, STATUS[error.code]);
      throw error;
    }
  });
}
