/**
 * HTTP 接入（P6.2c，ADR 0005 第 6、7 条）。
 * 开启认证后，/api 下除登录、退出、会话状态和最小健康检查外，全部要求有效会话；拿不准时拒绝。
 * 前端页面本身不含数据，照常提供，由前端按会话状态显示登录页。
 */
import { existsSync } from 'node:fs';
import { isIP } from 'node:net';
import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Database } from '../db.ts';
import { readJsonObject } from '../routes/util.ts';
import { type AuthCode, AuthError } from './errors.ts';
import { createAuthService } from './service.ts';
import {
  clearSessionCookie,
  readSession,
  revokeAllSessions,
  revokeSession,
  SESSION_COOKIE,
  sessionCookie,
} from './sessions.ts';
import { openAuthDatabase, readAccount } from './store.ts';

export interface HttpAuth {
  db: Database;
  /** 只在请求来自本机回环（反向代理）时采用 X-Real-IP。 */
  trustProxy: boolean;
}

/** 不需要会话的接口。路径完全相同才放行；其余 /api 一律要求会话。 */
const PUBLIC_API = new Set(['/api/auth/login', '/api/auth/logout', '/api/auth/session', '/api/health']);

/**
 * 启动时打开认证库并确认已有账户。缺少文件时不新建（新建只交给 pnpm auth:setup），
 * 任何异常都抛出，由 main.ts 拒绝启动，不会退回免登录。
 */
export function openConfiguredAuth(dbPath: string): Database {
  if (!existsSync(dbPath)) throw new AuthError('not_configured');
  const db = openAuthDatabase(dbPath);
  try {
    readAccount(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

/** 启动失败的说明。只给固定文字，不输出路径或库里的内容。 */
export function authStartupMessage(error: unknown): string {
  const code = error instanceof AuthError ? (error.message as AuthCode) : null;
  if (code === 'not_configured')
    return '已开启认证，但认证库里还没有账户。先运行 pnpm auth:setup init 设置账户，再启动服务。';
  return '已开启认证，但认证库无法使用（目录、权限或文件内容不符合要求）。服务不会以免登录方式启动。';
}

/** 读取当前请求的会话。认证库出错时抛出，由调用方按拒绝处理。 */
function currentSession(c: Context, auth: HttpAuth, now: Date) {
  return readSession(auth.db, getCookie(c, SESSION_COOKIE), now);
}

export function requireSession(auth: HttpAuth, now: () => Date): MiddlewareHandler {
  return async (c, next) => {
    const path = c.req.path;
    if ((path !== '/api' && !path.startsWith('/api/')) || PUBLIC_API.has(path)) return next();
    let session: ReturnType<typeof currentSession> = null;
    try {
      session = currentSession(c, auth, now());
    } catch (error) {
      console.error('认证库读取失败：', error instanceof AuthError ? error.message : 'unexpected');
      return c.json({ error: 'auth_unavailable' }, 503);
    }
    if (!session) return c.json({ error: 'unauthenticated' }, 401);
    return next();
  };
}

/** 健康检查在开启认证、且没有会话时只回答服务是否在运行。 */
export function hasSession(c: Context, auth: HttpAuth, now: Date): boolean {
  try {
    return currentSession(c, auth, now) !== null;
  } catch {
    return false;
  }
}

/** 登录失败的来源地址，供 fail2ban 之类的工具匹配。只输出校验过的 IP，不输出用户名或口令。 */
function clientAddress(c: Context, auth: HttpAuth): string {
  let remote = '';
  try {
    remote = getConnInfo(c).remote.address ?? '';
  } catch {}
  if (auth.trustProxy && (remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1')) {
    const forwarded = c.req.header('x-real-ip')?.trim() ?? '';
    if (isIP(forwarded)) return forwarded;
  }
  return isIP(remote) ? remote : 'unknown';
}

export function authRoutes(app: Hono, auth: HttpAuth | undefined, now: () => Date) {
  app.get('/api/auth/session', (c) => {
    if (!auth) return c.json({ mode: 'local', authenticated: true });
    let session: ReturnType<typeof currentSession> = null;
    try {
      session = currentSession(c, auth, now());
    } catch {
      return c.json({ error: 'auth_unavailable' }, 503);
    }
    return c.json(
      session
        ? { mode: 'required', authenticated: true, login: session.login, expiresAt: session.expiresAt }
        : { mode: 'required', authenticated: false },
    );
  });
  if (!auth) return;

  const service = createAuthService(auth.db);

  app.post('/api/auth/login', async (c) => {
    const body = await readJsonObject(c);
    if (!body) return c.json({ error: 'invalid_json' }, 400);
    try {
      const token = await service.login(body.login, body.passphrase, now(), getCookie(c, SESSION_COOKIE));
      c.header('Set-Cookie', sessionCookie(token));
      return c.body(null, 204);
    } catch (error) {
      // 登录只碰认证库：库层面的意外错误也按「认证不可用」拒绝，不写出细节。
      if (!(error instanceof AuthError)) {
        console.error('登录时认证库出错：', 'unexpected');
        return c.json({ error: 'auth_unavailable' }, 503);
      }
      switch (error.message as AuthCode) {
        case 'invalid_credentials':
          console.warn(`moriium-auth failure from ${clientAddress(c, auth)}`);
          return c.json({ error: 'invalid_credentials' }, 401);
        case 'limited':
          console.warn(`moriium-auth limited from ${clientAddress(c, auth)}`);
          c.header('Retry-After', String(error.retryAfter));
          return c.json({ error: 'limited', retryAfter: error.retryAfter }, 429);
        case 'busy':
          c.header('Retry-After', '1');
          return c.json({ error: 'busy', retryAfter: 1 }, 429);
        case 'credentials_changed':
          return c.json({ error: 'credentials_changed' }, 409);
        default:
          console.error('登录时认证库出错：', error.message);
          return c.json({ error: 'auth_unavailable' }, 503);
      }
    }
  });

  // 没有有效会话也能退出：浏览器里的 cookie 总会被清掉。
  app.post('/api/auth/logout', (c) => {
    try {
      revokeSession(auth.db, getCookie(c, SESSION_COOKIE), now());
    } catch (error) {
      console.error('退出时认证库出错：', error instanceof AuthError ? error.message : 'unexpected');
    }
    c.header('Set-Cookie', clearSessionCookie());
    return c.body(null, 204);
  });

  // 经过 requireSession：只有已登录的人能让所有设备退出。
  app.post('/api/auth/revoke-all', (c) => {
    revokeAllSessions(auth.db, now());
    c.header('Set-Cookie', clearSessionCookie());
    return c.body(null, 204);
  });
}
