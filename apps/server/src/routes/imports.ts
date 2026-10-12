/** /api/imports：导入预览、写入、撤销、导入记录（P3.3）。 */
import type { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppContext } from '../app.ts';
import {
  commitImport,
  ImportError,
  listBatches,
  parseImportFiles,
  previewImport,
  undoImport,
} from '../imports.ts';
import { readJsonObject } from './util.ts';

const STATUS = { invalid_request: 400, too_many_files: 400, not_found: 404, already_undone: 409 } as const;

export function importRoutes(app: Hono, ctx: AppContext) {
  const now = () => ctx.now?.() ?? new Date();

  // 20 个文件 × 1 MiB，base64 之后约 28 MiB。
  app.use(
    '/api/imports/*',
    bodyLimit({ maxSize: 30 * 1024 * 1024, onError: (c) => c.json({ error: 'body_too_large' }, 413) }),
  );
  app.use(
    '/api/imports',
    bodyLimit({ maxSize: 30 * 1024 * 1024, onError: (c) => c.json({ error: 'body_too_large' }, 413) }),
  );

  const handle = (error: unknown) => {
    if (error instanceof ImportError) return { body: { error: error.code }, status: STATUS[error.code] };
    throw error;
  };

  app.get('/api/imports', (c) => c.json({ batches: listBatches(ctx.db) }));

  app.post('/api/imports/check', async (c) => {
    const body = await readJsonObject(c);
    if (!body) return c.json({ error: 'invalid_json' }, 400);
    try {
      const files = parseImportFiles(body);
      return c.json({ files: await previewImport(ctx.db, files, now()) });
    } catch (error) {
      const r = handle(error);
      return c.json(r.body, r.status);
    }
  });

  app.post('/api/imports', async (c) => {
    const body = await readJsonObject(c);
    if (!body) return c.json({ error: 'invalid_json' }, 400);
    try {
      const files = parseImportFiles(body);
      return c.json(await commitImport(ctx.db, files, now()), 201);
    } catch (error) {
      const r = handle(error);
      return c.json(r.body, r.status);
    }
  });

  app.delete('/api/imports/:batch', (c) => {
    const id = Number(c.req.param('batch'));
    if (!Number.isInteger(id) || id < 1) return c.json({ error: 'not_found' }, 404);
    try {
      return c.json(undoImport(ctx.db, id, now()));
    } catch (error) {
      const r = handle(error);
      return c.json(r.body, r.status);
    }
  });
}
