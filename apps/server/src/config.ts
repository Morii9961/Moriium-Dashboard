/**
 * 服务端配置：数据目录、端口、允许的来源。
 * 数据目录必须在仓库外，也不放进 OneDrive 等同步目录（规划 05 第 6 节、04 第 12 节、R11）。
 */
import { isAbsolute, join, relative, resolve } from 'node:path';

export interface ServerConfig {
  dataDir: string;
  dbPath: string;
  backupDir: string;
  mediaDir: string;
  /** 只监听本机回环地址。 */
  hostname: '127.0.0.1';
  port: number;
  /** 允许的 Host 头（防 DNS 重绑定）。 */
  allowedHosts: string[];
  /** 写请求允许的 Origin。 */
  allowedOrigins: string[];
  /** 登录认证。默认关闭，只在本机使用；部署时必须显式开启（ADR 0005）。 */
  auth: AuthConfig;
  /** 经反向代理对外提供时的来源，例如 https://dash.example.com。只在开启认证时允许。 */
  publicOrigin: string | null;
}

export type AuthConfig =
  | { mode: 'off' }
  | {
      mode: 'required';
      /** 独立认证库的绝对路径：<MORIIUM_DASHBOARD_AUTH_DIR>/auth.sqlite，没有默认值。 */
      dbPath: string;
      /** 只信任本机回环上的反向代理传来的 X-Real-IP，用于登录失败日志。 */
      trustProxy: boolean;
    };

export interface ConfigInput {
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  homedir: string;
  /** 仓库根目录，用来拒绝把数据放进仓库。 */
  repoRoot: string;
}

export const DEFAULT_PORT = 5180;
const APP_DIR = 'moriium-dashboard';

export class ConfigError extends Error {}

/** 系统的应用数据目录（04 第 12 节建议的默认位置）。 */
export function defaultDataDir({ env, platform, homedir }: Omit<ConfigInput, 'repoRoot'>): string {
  if (platform === 'win32') return join(env.LOCALAPPDATA ?? join(homedir, 'AppData', 'Local'), APP_DIR);
  if (platform === 'darwin') return join(homedir, 'Library', 'Application Support', APP_DIR);
  return join(env.XDG_DATA_HOME ?? join(homedir, '.local', 'share'), APP_DIR);
}

const SYNC_FOLDER = /^(onedrive|dropbox|icloud ?drive|google ?drive)\b/i;

/** 路径是否落在常见的同步目录里。同步程序可能在写入途中复制数据库文件。 */
export function isInSyncedFolder(path: string, env: Record<string, string | undefined>): boolean {
  const normalized = resolve(path);
  const syncRoots = [env.OneDrive, env.OneDriveConsumer, env.OneDriveCommercial].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
  if (syncRoots.some((root) => isInside(root, normalized))) return true;
  return normalized.split(/[\\/]/).some((segment) => SYNC_FOLDER.test(segment));
}

export function isInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function parsePort(value: string | undefined): number {
  if (value === undefined || value === '') return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new ConfigError(`MORIIUM_DASHBOARD_PORT 应为 1024 到 65535 之间的整数，收到「${value}」。`);
  }
  return port;
}

export function resolveConfig(input: ConfigInput): ServerConfig {
  const { env } = input;
  const port = parsePort(env.MORIIUM_DASHBOARD_PORT);

  const configured = env.MORIIUM_DASHBOARD_DATA?.trim();
  if (configured && !isAbsolute(configured)) {
    throw new ConfigError('MORIIUM_DASHBOARD_DATA 必须是绝对路径。');
  }
  const dataDir = resolve(configured || defaultDataDir(input));

  if (isInside(input.repoRoot, dataDir)) {
    throw new ConfigError('数据目录在仓库里面。数据永远不进仓库，请把 MORIIUM_DASHBOARD_DATA 指到仓库之外。');
  }
  if (isInSyncedFolder(dataDir, env) && env.MORIIUM_DASHBOARD_ALLOW_SYNCED_DATA_DIR !== '1') {
    throw new ConfigError(
      [
        '数据目录在同步盘（OneDrive 等）里。同步程序可能在写入途中复制数据库文件，导致损坏。',
        '请把 MORIIUM_DASHBOARD_DATA 指到同步目录之外；需要异地保存时，只复制 backups 里的备份文件。',
        '确实要这样做，设置 MORIIUM_DASHBOARD_ALLOW_SYNCED_DATA_DIR=1。',
      ].join('\n'),
    );
  }

  const devOrigins = (env.MORIIUM_DASHBOARD_DEV_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  for (const origin of devOrigins) {
    if (!/^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/.test(origin)) {
      throw new ConfigError(
        `MORIIUM_DASHBOARD_DEV_ORIGINS 只接受本机地址，例如 http://localhost:5173，收到「${origin}」。`,
      );
    }
  }

  const auth = parseAuth(env);
  const publicOrigin = parsePublicOrigin(env.MORIIUM_DASHBOARD_PUBLIC_ORIGIN, auth);
  const publicHost = publicOrigin ? new URL(publicOrigin).host : null;

  return {
    dataDir,
    dbPath: join(dataDir, 'dashboard.sqlite'),
    backupDir: join(dataDir, 'backups'),
    mediaDir: join(dataDir, 'media'),
    hostname: '127.0.0.1',
    port,
    allowedHosts: [`127.0.0.1:${port}`, `localhost:${port}`, ...(publicHost ? [publicHost] : [])],
    allowedOrigins: [
      `http://127.0.0.1:${port}`,
      `http://localhost:${port}`,
      ...devOrigins,
      ...(publicOrigin ? [publicOrigin] : []),
    ],
    auth,
    publicOrigin,
  };
}

function parseAuth(env: Record<string, string | undefined>): AuthConfig {
  const mode = env.MORIIUM_DASHBOARD_AUTH?.trim() ?? '';
  const dir = env.MORIIUM_DASHBOARD_AUTH_DIR?.trim() ?? '';
  const proxy = env.MORIIUM_DASHBOARD_TRUST_PROXY?.trim() ?? '';
  if (proxy !== '' && proxy !== '1') {
    throw new ConfigError(`MORIIUM_DASHBOARD_TRUST_PROXY 只接受 1，收到「${proxy}」。`);
  }
  if (mode === '' || mode === 'off') {
    // 认证库路径或代理设置单独出现，多半是漏写了开关；不能悄悄当作免登录运行。
    if (dir || proxy) {
      throw new ConfigError(
        '设置了 MORIIUM_DASHBOARD_AUTH_DIR 或 MORIIUM_DASHBOARD_TRUST_PROXY，却没有开启认证。需要登录时设置 MORIIUM_DASHBOARD_AUTH=required。',
      );
    }
    return { mode: 'off' };
  }
  if (mode !== 'required') {
    throw new ConfigError(`MORIIUM_DASHBOARD_AUTH 只接受 required 或 off，收到「${mode}」。`);
  }
  if (!dir || !isAbsolute(dir)) {
    throw new ConfigError('开启认证时，MORIIUM_DASHBOARD_AUTH_DIR 必须是认证库所在目录的绝对路径。');
  }
  return { mode: 'required', dbPath: join(resolve(dir), 'auth.sqlite'), trustProxy: proxy === '1' };
}

function parsePublicOrigin(value: string | undefined, auth: AuthConfig): string | null {
  const raw = value?.trim() ?? '';
  if (!raw) return null;
  if (auth.mode !== 'required') {
    throw new ConfigError(
      '对外提供（MORIIUM_DASHBOARD_PUBLIC_ORIGIN）必须同时开启认证：MORIIUM_DASHBOARD_AUTH=required。',
    );
  }
  const invalid = () =>
    new ConfigError(
      `MORIIUM_DASHBOARD_PUBLIC_ORIGIN 应为不带路径的 https 来源，例如 https://dash.example.com，收到「${raw}」。`,
    );
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalid();
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' || url.username || url.password || url.origin !== raw || loopback) {
    throw invalid();
  }
  return url.origin;
}

/** 仓库根目录：apps/server/src 往上三级。 */
export const REPO_ROOT = resolve(import.meta.dirname, '..', '..', '..');
