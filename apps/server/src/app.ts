/**
 * HTTP 应用。只负责路由和中间件，不碰进程、端口和定时任务（那些在 main.ts），方便测试。
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { agentReports } from './agents.ts';
import { authRoutes, type HttpAuth, hasSession, requireSession } from './auth/http.ts';
import { listBackups } from './backup.ts';
import type { ServerConfig } from './config.ts';
import { currentSchemaVersion, type Database } from './db.ts';
import { overview } from './overview.ts';
import { exportRoutes } from './routes/export.ts';
import { focusRoutes } from './routes/focus.ts';
import { historyRoutes } from './routes/history.ts';
import { importRoutes } from './routes/imports.ts';
import { localScanRoutes } from './routes/localScan.ts';
import { projectRoutes } from './routes/projects.ts';
import { reviewRoutes } from './routes/review.ts';
import { taskRoutes } from './routes/tasks.ts';
import { usageRoutes } from './routes/usage.ts';
import { workRoutes } from './routes/works.ts';
import { hostCheck, securityHeaders, writeGuard } from './security.ts';

export interface AppContext {
  db: Database;
  config: Pick<ServerConfig, 'allowedHosts' | 'allowedOrigins' | 'backupDir'>;
  startedAt: Date;
  version: string;
  /** 前端构建产物目录（apps/web/dist）。不传时只提供 /api。 */
  webDir?: string;
  /** 测试里固定当前时间。 */
  now?: () => Date;
  /** 开启认证时的认证库。不传表示只在本机使用、不要求登录。 */
  auth?: HttpAuth;
  /** 本机仓库扫描的目录记录文件。只在本机实例（未开启认证）提供。 */
  localScan?: { file: string };
}

export function createApp(ctx: AppContext) {
  const app = new Hono();

  app.use('*', securityHeaders());
  app.use('*', hostCheck(ctx.config.allowedHosts));
  app.use('/api/*', writeGuard(ctx.config.allowedOrigins));
  if (ctx.auth)
    app.use(
      '*',
      requireSession(ctx.auth, () => ctx.now?.() ?? new Date()),
    );
  // 普通接口的请求体很小；导入接口另设上限（20 个文件 × 1 MiB，base64 之后约 28 MiB）。
  app.use('/api/*', async (c, next) => {
    if (c.req.path.startsWith('/api/imports')) return next();
    if (c.req.path.startsWith('/api/usage/'))
      return bodyLimit({
        maxSize: 1024 * 1024 + 4096,
        onError: (c2) => c2.json({ error: 'body_too_large' }, 413),
      })(c, next);
    if (/^\/api\/works\/\d+\/cover$/.test(c.req.path))
      return bodyLimit({
        maxSize: 5 * 1024 * 1024,
        onError: (c2) => c2.json({ error: 'body_too_large' }, 413),
      })(c, next);
    return bodyLimit({ maxSize: 64 * 1024, onError: (c2) => c2.json({ error: 'body_too_large' }, 413) })(
      c,
      next,
    );
  });

  app.get('/api/health', (c) => {
    // 不返回任何路径：以后部署到 VPS 时这个接口也不该泄露服务器信息。
    // 开启认证时，未登录只能知道服务在运行。
    if (ctx.auth && !hasSession(c, ctx.auth, ctx.now?.() ?? new Date())) return c.json({ status: 'ok' });
    try {
      const schemaVersion = currentSchemaVersion(ctx.db);
      const lastBackup = listBackups(ctx.config.backupDir).find((b) => b.kind === 'daily');
      return c.json({
        status: 'ok',
        version: ctx.version,
        schemaVersion,
        lastBackupAt: lastBackup?.at.toISOString() ?? null,
        uptimeSeconds: Math.round((Date.now() - ctx.startedAt.getTime()) / 1000),
      });
    } catch {
      return c.json({ status: 'degraded', version: ctx.version }, 503);
    }
  });

  authRoutes(app, ctx.auth, () => ctx.now?.() ?? new Date());
  projectRoutes(app, ctx);
  app.get('/api/agents', (c) => c.json(agentReports(ctx.db, ctx.now?.() ?? new Date())));
  app.get('/api/overview', (c) => c.json(overview(ctx.db, ctx.now?.() ?? new Date())));
  reviewRoutes(app, ctx);
  focusRoutes(app, ctx);
  taskRoutes(app, ctx);
  usageRoutes(app, ctx);
  workRoutes(app, ctx);
  importRoutes(app, ctx);
  localScanRoutes(app, ctx);
  historyRoutes(app, ctx);
  exportRoutes(app, ctx);

  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

  if (ctx.webDir) mountWeb(app, ctx.webDir);

  // 细节只写进服务端日志，不返回给浏览器。
  app.onError((error, c) => {
    console.error(`${c.req.method} ${c.req.path} 出错：`, error);
    return c.json({ error: 'internal_error' }, 500);
  });

  return app;
}

/**
 * 托管前端：先按文件提供（带哈希的 /assets/* 长期缓存），找不到文件时回退到 index.html，
 * 由前端路由处理（/projects/x 这类地址刷新也能打开）。带扩展名却找不到的路径返回 404，不回退。
 */
const STATIC_FILE = /\.(?:m?js|css|map|woff2?|png|jpe?g|gif|svg|ico|webp|json|txt|html|webmanifest)$/i;

function mountWeb(app: Hono, webDir: string) {
  app.use('/assets/*', async (c, next) => {
    await next();
    if (c.res.status === 200) c.res.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  });
  app.use('*', serveStatic({ root: webDir }));
  app.get('*', async (c, next) => {
    // 项目 ID 里有点（/projects/moriium.main），所以只按静态文件的扩展名判断。
    if (STATIC_FILE.test(c.req.path)) return c.text('Not Found', 404);
    if (!existsSync(join(webDir, 'index.html'))) {
      return c.text('前端还没有构建：在仓库根目录运行 pnpm build，然后刷新这一页。', 503);
    }
    c.header('Cache-Control', 'no-cache');
    return serveStatic({ root: webDir, path: 'index.html' })(c, next);
  });
}
