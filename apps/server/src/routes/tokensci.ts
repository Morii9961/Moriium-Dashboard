/** /api/tokens-ci：算力账本的数据（tokens.ci 公开主页，见 ../tokensci.ts）。 */
import type { Hono } from 'hono';
import type { AppContext } from '../app.ts';
import { getTokensCi, saveUsername, TokensCiSettingsError } from '../tokensci.ts';
import { readJsonObject } from './util.ts';

export function tokensCiRoutes(app: Hono, ctx: AppContext) {
  const store = ctx.tokensCi;
  if (!store) return;

  app.get('/api/tokens-ci', async (c) => c.json(await getTokensCi(store, c.req.query('refresh') === '1')));

  app.put('/api/tokens-ci/settings', async (c) => {
    const body = await readJsonObject(c);
    if (!body) return c.json({ error: 'invalid_json' }, 400);
    try {
      saveUsername(store, body.username);
    } catch (error) {
      if (error instanceof TokensCiSettingsError) return c.json({ error: error.code }, 400);
      throw error;
    }
    return c.json(await getTokensCi(store, true));
  });
}
