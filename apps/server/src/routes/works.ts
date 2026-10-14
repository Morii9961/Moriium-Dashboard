import type { Context, Hono } from 'hono';
import type { AppContext } from '../app.ts';
import { listProjects } from '../projects.ts';
import { ReviewError } from '../review.ts';
import {
  getWork,
  saveCover,
  saveWork,
  trashWork,
  type Work,
  WorkError,
  workCover,
  workRecords,
} from '../works.ts';
import { readJsonObject } from './util.ts';
export function workRoutes(app: Hono, ctx: AppContext) {
  const now = () => ctx.now?.() ?? new Date();
  const run = (c: Context, fn: () => { work: Work | null }, create = false) => {
    try {
      return c.json(fn(), create ? 201 : 200);
    } catch (e) {
      if (e instanceof WorkError || e instanceof ReviewError)
        return c.json(
          { error: e.code },
          e.code === 'not_found' ? 404 : e.code === 'work_changed' ? 409 : 400,
        );
      throw e;
    }
  };
  app.get('/api/works', (c) => c.json({ works: workRecords(ctx.db), projects: listProjects(ctx.db) }));
  app.post('/api/works', async (c) => {
    const body = await readJsonObject(c);
    return body
      ? run(c, () => ({ work: saveWork(ctx.db, null, body, now()) }), true)
      : c.json({ error: 'invalid_field' }, 400);
  });
  app.patch('/api/works/:id', async (c) => {
    const body = await readJsonObject(c);
    return body
      ? run(c, () => ({ work: saveWork(ctx.db, Number(c.req.param('id')), body, now()) }))
      : c.json({ error: 'invalid_field' }, 400);
  });
  app.delete('/api/works/:id', (c) =>
    run(c, () => ({
      work: trashWork(ctx.db, Number(c.req.param('id')), Number(c.req.query('revision')), now()),
    })),
  );
  app.post('/api/works/:id/restore', async (c) => {
    const body = await readJsonObject(c);
    return body
      ? run(c, () => ({ work: trashWork(ctx.db, Number(c.req.param('id')), body.revision, now(), true) }))
      : c.json({ error: 'invalid_field' }, 400);
  });
  app.get('/api/works/:id/cover', (c) => {
    const id = Number(c.req.param('id')),
      work = getWork(ctx.db, id),
      bytes = workCover(ctx.db, id);
    return work && !work.deletedAt && bytes
      ? new Response(new Uint8Array(bytes).buffer, { headers: { 'Content-Type': 'image/webp' } })
      : c.json({ error: 'not_found' }, 404);
  });
  app.put('/api/works/:id/cover', async (c) => {
    if (c.req.header('content-type') !== 'image/webp') return c.json({ error: 'invalid_cover' }, 400);
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    return run(c, () => ({
      work: saveCover(ctx.db, Number(c.req.param('id')), Number(c.req.query('revision')), bytes, now()),
    }));
  });
  app.delete('/api/works/:id/cover', (c) =>
    run(c, () => ({
      work: saveCover(ctx.db, Number(c.req.param('id')), Number(c.req.query('revision')), null, now()),
    })),
  );
}
