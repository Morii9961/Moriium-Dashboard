/**
 * 服务端入口：node apps/server/src/main.ts
 * 读配置 → 准备数据目录 → 打开数据库 → （有待执行的迁移时先备份）迁移 → 日备份 → 只在 127.0.0.1 上监听。
 */
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { createBackup, runDailyBackupIfDue } from './backup.ts';
import { ConfigError, REPO_ROOT, resolveConfig } from './config.ts';
import {
  applyMigrations,
  currentSchemaVersion,
  loadMigrations,
  openDatabase,
  pendingMigrations,
} from './db.ts';

const VERSION = '0.0.0';
const BACKUP_CHECK_INTERVAL_MS = 60 * 60 * 1000;

async function main() {
  let config: ReturnType<typeof resolveConfig>;
  try {
    config = resolveConfig({
      env: process.env,
      platform: process.platform,
      homedir: homedir(),
      repoRoot: REPO_ROOT,
    });
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  for (const dir of [config.dataDir, config.backupDir, config.mediaDir]) mkdirSync(dir, { recursive: true });
  const existed = existsSync(config.dbPath);
  const db = openDatabase(config.dbPath);

  const pending = pendingMigrations(db, loadMigrations(join(REPO_ROOT, 'apps', 'server', 'migrations')));
  if (pending.length > 0) {
    // 每次迁移前强制备份（04 第 12 节）。全新的空数据库没有可备份的内容。
    if (existed)
      await createBackup(db, config.backupDir, 'pre-migration', new Date(), currentSchemaVersion(db));
    applyMigrations(db, pending);
    console.log(`数据库迁移到版本 ${currentSchemaVersion(db)}`);
  }

  const backupNow = async () => {
    try {
      const path = await runDailyBackupIfDue(db, config.backupDir, new Date());
      if (path) console.log('已完成每日备份');
    } catch (error) {
      console.error('每日备份失败：', error instanceof Error ? error.message : error);
    }
  };
  await backupNow();
  const timer = setInterval(backupNow, BACKUP_CHECK_INTERVAL_MS);
  timer.unref();

  const app = createApp({
    db,
    config,
    startedAt: new Date(),
    version: VERSION,
    webDir: join(REPO_ROOT, 'apps', 'web', 'dist'),
  });
  const server = serve({ fetch: app.fetch, hostname: config.hostname, port: config.port }, (info) => {
    console.log(`Moriium Dashboard 服务端：http://${config.hostname}:${info.port}`);
    console.log(`数据目录：${config.dataDir}`);
  });

  const shutdown = () => {
    clearInterval(timer);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

await main();
