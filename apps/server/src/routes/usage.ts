import type { Context, Hono } from 'hono';
import type { AppContext } from '../app.ts';
import { calculateWeek, createBill, listBills, readBill } from '../usage/bills.ts';
import { exactKeys, type PricingMode, requireUsage, UsageError } from '../usage/pricing.ts';
import {
  getUsageImport,
  importUsage,
  previewUsage,
  savePricing,
  selectUsage,
  usageDatasets,
  usagePricing,
} from '../usage/store.ts';
import { readJsonObject } from './util.ts';
/** No scanner or raw-log endpoint. Global Host/session/writeGuard middleware applies to every route. */
export function usageRoutes(app: Hono, ctx: AppContext) {
  const now = () => ctx.now?.() ?? new Date();
  const guard = (fn: (c: Context) => unknown | Promise<unknown>) => async (c: Context) => {
    try {
      return (await fn(c)) as Response;
    } catch (error) {
      // SQLite and validator exceptions can embed values; never send them to global logging.
      const code = error instanceof UsageError ? error.code : 'usage_internal';
      return c.json(
        { error: code },
        code === 'usage_not_found'
          ? 404
          : [
                'usage_changed',
                'usage_revision_conflict',
                'usage_source_conflict',
                'usage_review_required',
                'usage_immutable',
              ].includes(code)
            ? 409
            : code === 'usage_internal'
              ? 500
              : 400,
      );
    }
  };
  app.get(
    '/api/usage/datasets',
    guard((c) => c.json({ datasets: usageDatasets(ctx.db) })),
  );
  app.get(
    '/api/usage/pricing',
    guard((c) => c.json(usagePricing(ctx.db))),
  );
  app.post(
    '/api/usage/catalogs',
    guard(async (c) => c.json(savePricing(ctx.db, 'catalog', await readJsonObject(c)))),
  );
  app.post(
    '/api/usage/fx',
    guard(async (c) => c.json(savePricing(ctx.db, 'fx', await readJsonObject(c)))),
  );
  app.post(
    '/api/usage/imports/preview',
    guard(async (c) => {
      const body = await readJsonObject(c);
      exactKeys(body, ['snapshot']);
      return c.json(previewUsage(ctx.db, body.snapshot));
    }),
  );
  app.post(
    '/api/usage/imports',
    guard(async (c) => {
      const body = await readJsonObject(c);
      exactKeys(body, ['snapshot', 'expected_state', 'replace']);
      requireUsage(typeof body.replace === 'boolean');
      return c.json(importUsage(ctx.db, body.snapshot, body.expected_state, body.replace, now()));
    }),
  );
  app.post(
    '/api/usage/imports/:hash/select',
    guard(async (c) => {
      const body = await readJsonObject(c);
      exactKeys(body, ['expected_state', 'undo']);
      requireUsage(typeof body.undo === 'boolean');
      return c.json(selectUsage(ctx.db, c.req.param('hash') ?? '', body.expected_state, body.undo, now()));
    }),
  );
  app.get(
    '/api/usage/imports/:hash/preview',
    guard((c) => {
      const record = getUsageImport(ctx.db, c.req.param('hash') ?? '');
      return c.json(previewUsage(ctx.db, JSON.parse(record.snapshot)));
    }),
  );
  app.get(
    '/api/usage/weeks/:start',
    guard((c) => {
      const q = c.req.query();
      requireUsage(!q.previous || (Number.isSafeInteger(Number(q.previous)) && Number(q.previous) > 0));
      const previous = q.previous ? readBill(ctx.db, Number(q.previous)) : null;
      requireUsage(
        !previous ||
          (previous.bill.dataset_id === q.dataset && previous.bill.week_start === c.req.param('start')),
      );
      return c.json({
        ...calculateWeek(
          ctx.db,
          q.dataset ?? '',
          c.req.param('start') ?? '',
          q.catalog || null,
          q.fx || null,
          (q.mode ?? 'classified') as PricingMode,
          previous?.bill.selections,
        ),
        basis_bill_id: previous?.id ?? null,
      });
    }),
  );
  app.get(
    '/api/usage/bills',
    guard((c) =>
      c.json({ bills: listBills(ctx.db, c.req.query('dataset') ?? '', c.req.query('week') ?? '') }),
    ),
  );
  app.get(
    '/api/usage/bills/:id',
    guard((c) => {
      const id = Number(c.req.param('id'));
      requireUsage(Number.isSafeInteger(id) && id > 0);
      return c.json(readBill(ctx.db, id));
    }),
  );
  app.post(
    '/api/usage/bills',
    guard(async (c) => {
      const body = await readJsonObject(c);
      exactKeys(body, ['dataset', 'week', 'catalog', 'fx', 'mode', 'previous']);
      requireUsage(
        typeof body.dataset === 'string' &&
          typeof body.week === 'string' &&
          (body.catalog === null || typeof body.catalog === 'string') &&
          (body.fx === null || typeof body.fx === 'string') &&
          (body.previous === null || (Number.isSafeInteger(body.previous) && Number(body.previous) > 0)),
      );
      return c.json(
        createBill(
          ctx.db,
          body.dataset,
          body.week,
          body.catalog as string | null,
          body.fx as string | null,
          body.mode as PricingMode,
          body.previous as number | null,
          now(),
        ),
        201,
      );
    }),
  );
}
