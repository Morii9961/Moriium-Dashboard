/**
 * HTTP 应用。只负责路由和中间件，不碰进程、端口和定时任务（那些在 main.ts），方便测试。
 */
import { Hono } from 'hono';
import { listBackups } from './backup.ts';
import type { ServerConfig } from './config.ts';
import { currentSchemaVersion, type Database } from './db.ts';
import { hostCheck, securityHeaders, writeGuard } from './security.ts';

export interface AppContext {
  db: Database;
  config: Pick<ServerConfig, 'allowedHosts' | 'allowedOrigins' | 'backupDir'>;
  startedAt: Date;
  version: string;
}

export function createApp(ctx: AppContext) {
  const app = new Hono();

  app.use('*', securityHeaders());
  app.use('*', hostCheck(ctx.config.allowedHosts));
  app.use('/api/*', writeGuard(ctx.config.allowedOrigins));

  app.get('/api/health', (c) => {
    // 不返回任何路径：以后部署到 VPS 时这个接口也不该泄露服务器信息。
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

  app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

  // 细节只写进服务端日志，不返回给浏览器。
  app.onError((error, c) => {
    console.error(`${c.req.method} ${c.req.path} 出错：`, error);
    return c.json({ error: 'internal_error' }, 500);
  });

  return app;
}
