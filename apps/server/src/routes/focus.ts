import type { Hono } from 'hono';
import type { AppContext } from '../app.ts';
import { dayInShanghai, FocusError, readFocus, saveFocus } from '../focus.ts';
import { ReviewError } from '../review.ts';
import { readJsonObject } from './util.ts';
export function focusRoutes(app: Hono, ctx: AppContext) {
  app.get('/api/focus/:date', (c) => {
    const now = ctx.now?.() ?? new Date();
    if (c.req.param('date') !== dayInShanghai(now)) return c.json({ error: 'date_changed' }, 409);
    return c.json(readFocus(ctx.db, now));
  });
  app.put('/api/focus/:date', async (c) => {
    const body = await readJsonObject(c);
    if (!body) return c.json({ error: 'invalid_field' }, 400);
    try {
      return c.json(saveFocus(ctx.db, c.req.param('date'), body, ctx.now?.() ?? new Date()));
    } catch (e) {
      if (e instanceof FocusError || e instanceof ReviewError)
        return c.json({ error: e.code }, e.code === 'focus_changed' || e.code === 'date_changed' ? 409 : 400);
      throw e;
    }
  });
}
