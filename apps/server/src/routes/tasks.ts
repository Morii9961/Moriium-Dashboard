import type { Context, Hono } from 'hono';
import type { AppContext } from '../app.ts';
import { listProjects } from '../projects.ts';
import { ReviewError } from '../review.ts';
import { saveTask, TaskError, taskRecords } from '../tasks.ts';
import { readJsonObject } from './util.ts';
export function taskRoutes(app: Hono, ctx: AppContext) {
  app.get('/api/tasks', (c) => c.json({ tasks: taskRecords(ctx.db), projects: listProjects(ctx.db) }));
  const save = async (c: Context, id: number | null) => {
    const body = await readJsonObject(c);
    if (!body || (id !== null && (!Number.isSafeInteger(id) || id < 1)))
      return c.json({ error: 'invalid_field' }, 400);
    try {
      return c.json({ task: saveTask(ctx.db, id, body, ctx.now?.() ?? new Date()) }, id === null ? 201 : 200);
    } catch (e) {
      if (e instanceof TaskError || e instanceof ReviewError)
        return c.json(
          { error: e.code },
          e.code === 'not_found'
            ? 404
            : ['exists', 'task_changed', 'snapshot_changed'].includes(e.code)
              ? 409
              : 400,
        );
      throw e;
    }
  };
  app.post('/api/tasks', (c) => save(c, null));
  app.patch('/api/tasks/:id', (c) => save(c, Number(c.req.param('id'))));
}
