import type { Hono } from 'hono';
import type { AppContext } from '../app.ts';
import { audit } from '../audit.ts';
import { transaction } from '../db.ts';
import { ReviewError, saveAcceptance } from '../review.ts';
import { readJsonObject } from './util.ts';

export function reviewRoutes(app: Hono, ctx: AppContext) {
  app.put('/api/acceptance/:project/:milestone', async (c) => {
    const body = await readJsonObject(c);
    if (!body) return c.json({ error: 'invalid_json' }, 400);
    try {
      const record = transaction(ctx.db, () => {
        const now = ctx.now?.() ?? new Date();
        const r = saveAcceptance(ctx.db, c.req.param('project'), c.req.param('milestone'), body, now);
        audit(ctx.db, 'acceptance.save', `${r.projectId}/${r.milestoneId}`, r.status, now);
        return r;
      });
      return c.json({ record });
    } catch (e) {
      if (e instanceof ReviewError)
        return c.json(
          { error: e.code },
          e.code === 'not_found' ? 404 : e.code === 'snapshot_changed' ? 409 : 400,
        );
      throw e;
    }
  });
}
