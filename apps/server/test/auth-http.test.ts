import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.ts';
import { AuthError } from '../src/auth/errors.ts';
import { authStartupMessage, openConfiguredAuth } from '../src/auth/http.ts';
import { hashPassphrase } from '../src/auth/password.ts';
import { SESSION_COOKIE } from '../src/auth/sessions.ts';
import { openAuthDatabase } from '../src/auth/store.ts';
import { ConfigError, REPO_ROOT, resolveConfig } from '../src/config.ts';
import { applyMigrations, type Database, loadMigrations, openDatabase } from '../src/db.ts';

const host = '127.0.0.1:5180';
const origin = `http://${host}`;
const write = { host, origin, 'x-moriium-dashboard': '1', 'content-type': 'application/json' };
const demoPhrase = 'Synthetic phrase for demo only 2026';
const now = new Date('2026-10-17T01:00:00.000Z');
let encoded: string;
let dir: string;
let db: Database;
let authDb: Database;

beforeAll(async () => {
  encoded = await hashPassphrase(demoPhrase);
}, 15_000);
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dashboard-auth-http-'));
  db = openDatabase(join(dir, 'test.sqlite'));
  applyMigrations(db, loadMigrations(join(REPO_ROOT, 'apps', 'server', 'migrations')));
  authDb = openAuthDatabase(':memory:');
  authDb
    .prepare('INSERT INTO auth_account VALUES(1,?,?,1,?,?)')
    .run('demo-user', encoded, now.getTime(), now.getTime());
});
afterEach(() => {
  vi.restoreAllMocks();
  db.close();
  try {
    authDb.close();
  } catch {}
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

function makeApp(withAuth = true) {
  const webDir = join(dir, 'web');
  mkdirSync(webDir, { recursive: true });
  writeFileSync(join(webDir, 'index.html'), '<!doctype html><title>shell</title>');
  return createApp({
    db,
    config: { allowedHosts: [host], allowedOrigins: [origin], backupDir: join(dir, 'backups') },
    startedAt: now,
    version: 'test',
    webDir,
    now: () => now,
    ...(withAuth ? { auth: { db: authDb, trustProxy: false } } : {}),
  });
}
const get = (app: ReturnType<typeof createApp>, path: string, cookie?: string) =>
  app.request(path, { headers: { host, ...(cookie ? { cookie } : {}) } });
const login = (app: ReturnType<typeof createApp>, body: unknown, headers: Record<string, string> = write) =>
  app.request('/api/auth/login', { method: 'POST', headers, body: JSON.stringify(body) });
function cookieFrom(res: Response): string {
  const value = res.headers.get('set-cookie') ?? '';
  return value.split(';')[0] ?? '';
}

describe('with authentication required', () => {
  it('denies every business API without a session, but serves the data-free page shell', async () => {
    const app = makeApp();
    for (const path of [
      '/api/projects',
      '/api/overview',
      '/api/agents',
      '/api/imports',
      '/api/export',
      '/api',
    ]) {
      const res = await get(app, path);
      expect(res.status, path).toBe(401);
    }
    const write401 = await app.request('/api/tasks', { method: 'POST', headers: write, body: '{}' });
    expect(write401.status).toBe(401);
    expect(await (await get(app, '/api/health')).json()).toEqual({ status: 'ok' });
    expect(await (await get(app, '/api/auth/session')).json()).toEqual({
      mode: 'required',
      authenticated: false,
    });
    const shell = await get(app, '/projects/demo');
    expect(shell.status).toBe(200);
    expect(await shell.text()).toContain('shell');
  });

  it('keeps the write guard on login, rejects wrong input generically, and logs only the source', async () => {
    const app = makeApp();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await login(app, { login: 'demo-user', passphrase: demoPhrase }, { host, origin })).status).toBe(
      403,
    );
    const wrong = await login(app, { login: 'demo-user', passphrase: 'Synthetic wrong phrase 2026' });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual({ error: 'invalid_credentials' });
    expect(wrong.headers.get('set-cookie')).toBeNull();
    const alias = await login(app, { login: 'someone-else', passphrase: demoPhrase });
    expect(alias.status).toBe(401);
    expect(warn.mock.calls.map((call) => call.join(' '))).toEqual([
      'moriium-auth failure from unknown',
      'moriium-auth failure from unknown',
    ]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('Synthetic');
  });

  it('issues a strict host-only cookie that unlocks the API, and logout revokes it', async () => {
    const app = makeApp();
    const ok = await login(app, { login: 'demo-user', passphrase: demoPhrase });
    expect(ok.status).toBe(204);
    const header = ok.headers.get('set-cookie') ?? '';
    expect(header).toMatch(new RegExp(`^${SESSION_COOKIE}=[A-Za-z0-9_-]{43}; `));
    expect(header).toContain('Path=/; HttpOnly; Secure; SameSite=Strict');
    expect(header).not.toMatch(/Domain=/i);
    const cookie = cookieFrom(ok);

    expect((await get(app, '/api/projects', cookie)).status).toBe(200);
    const health = (await (await get(app, '/api/health', cookie)).json()) as Record<string, unknown>;
    expect(health.version).toBe('test');
    const session = (await (await get(app, '/api/auth/session', cookie)).json()) as Record<string, unknown>;
    expect(session).toMatchObject({ mode: 'required', authenticated: true, login: 'demo-user' });

    const out = await app.request('/api/auth/logout', { method: 'POST', headers: { ...write, cookie } });
    expect(out.status).toBe(204);
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await get(app, '/api/projects', cookie)).status).toBe(401);
    // Logging out again without a valid session still clears the browser cookie.
    expect((await app.request('/api/auth/logout', { method: 'POST', headers: write })).status).toBe(204);
  });

  it('lets a signed-in user end every session, and rejects malformed or foreign cookies', async () => {
    const app = makeApp();
    const a = cookieFrom(await login(app, { login: 'demo-user', passphrase: demoPhrase }));
    const b = cookieFrom(await login(app, { login: 'demo-user', passphrase: demoPhrase }));
    expect((await app.request('/api/auth/revoke-all', { method: 'POST', headers: write })).status).toBe(401);
    expect(
      (await app.request('/api/auth/revoke-all', { method: 'POST', headers: { ...write, cookie: a } }))
        .status,
    ).toBe(204);
    expect((await get(app, '/api/projects', a)).status).toBe(401);
    expect((await get(app, '/api/projects', b)).status).toBe(401);
    for (const bad of [`${SESSION_COOKIE}=x`, `${SESSION_COOKIE}=${'A'.repeat(43)}`, 'other=1']) {
      expect((await get(app, '/api/projects', bad)).status).toBe(401);
    }
  });

  it('answers a lockout with 429 and Retry-After without verifying the passphrase', async () => {
    const app = makeApp();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    authDb.prepare("INSERT INTO auth_limits VALUES('account',?,10,0)").run(now.getTime());
    const res = await login(app, { login: 'demo-user', passphrase: demoPhrase });
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('900');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('fails closed with 503 when the authentication database becomes unusable', async () => {
    const app = makeApp();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const cookie = cookieFrom(await login(app, { login: 'demo-user', passphrase: demoPhrase }));
    authDb.close();
    expect((await get(app, '/api/projects', cookie)).status).toBe(503);
    expect((await get(app, '/api/projects')).status).toBe(401);
    expect((await get(app, '/api/auth/session', cookie)).status).toBe(503);
    expect(await (await get(app, '/api/health', cookie)).json()).toEqual({ status: 'ok' });
    expect((await login(app, { login: 'demo-user', passphrase: demoPhrase })).status).toBe(503);
  });
});

describe('without authentication', () => {
  it('keeps the local behaviour and exposes no login routes', async () => {
    const app = makeApp(false);
    expect((await get(app, '/api/projects')).status).toBe(200);
    expect(await (await get(app, '/api/auth/session')).json()).toEqual({
      mode: 'local',
      authenticated: true,
    });
    expect((await login(app, { login: 'demo-user', passphrase: demoPhrase })).status).toBe(404);
  });
});

describe('startup and configuration', () => {
  it('refuses to start without an existing configured auth database, and never creates one', () => {
    const missing = join(dir, 'auth.sqlite');
    expect(() => openConfiguredAuth(missing)).toThrow(AuthError);
    expect(existsSync(missing)).toBe(false);
    openAuthDatabase(missing).close();
    let caught: unknown;
    try {
      openConfiguredAuth(missing);
    } catch (error) {
      caught = error;
    }
    expect(authStartupMessage(caught)).toContain('pnpm auth:setup init');
    expect(authStartupMessage(new Error('x'))).not.toContain(dir);
  });

  const base = { platform: 'linux' as const, homedir: '/opt/demo', repoRoot: '/srv/code/dashboard' };
  const env = (extra: Record<string, string>) => ({ MORIIUM_DASHBOARD_DATA: '/var/lib/moriium', ...extra });

  it('requires an explicit switch and an absolute auth folder, and rejects half-configured auth', () => {
    expect(resolveConfig({ ...base, env: env({}) }).auth).toEqual({ mode: 'off' });
    const on = resolveConfig({
      ...base,
      env: env({ MORIIUM_DASHBOARD_AUTH: 'required', MORIIUM_DASHBOARD_AUTH_DIR: '/var/lib/moriium-auth' }),
    });
    expect(on.auth).toEqual({
      mode: 'required',
      dbPath: join(resolve('/var/lib/moriium-auth'), 'auth.sqlite'),
      trustProxy: false,
    });
    for (const bad of [
      { MORIIUM_DASHBOARD_AUTH: 'required' },
      { MORIIUM_DASHBOARD_AUTH: 'required', MORIIUM_DASHBOARD_AUTH_DIR: 'relative' },
      { MORIIUM_DASHBOARD_AUTH: 'yes', MORIIUM_DASHBOARD_AUTH_DIR: '/x' },
      { MORIIUM_DASHBOARD_AUTH_DIR: '/x' },
      { MORIIUM_DASHBOARD_TRUST_PROXY: '1' },
      {
        MORIIUM_DASHBOARD_AUTH: 'required',
        MORIIUM_DASHBOARD_AUTH_DIR: '/x',
        MORIIUM_DASHBOARD_TRUST_PROXY: 'true',
      },
    ]) {
      expect(() => resolveConfig({ ...base, env: env(bad) }), JSON.stringify(bad)).toThrow(ConfigError);
    }
  });

  it('accepts a public https origin only together with authentication', () => {
    const auth = { MORIIUM_DASHBOARD_AUTH: 'required', MORIIUM_DASHBOARD_AUTH_DIR: '/var/lib/moriium-auth' };
    const c = resolveConfig({
      ...base,
      env: env({ ...auth, MORIIUM_DASHBOARD_PUBLIC_ORIGIN: 'https://dash.example.com' }),
    });
    expect(c.hostname).toBe('127.0.0.1');
    expect(c.allowedHosts).toContain('dash.example.com');
    expect(c.allowedOrigins).toContain('https://dash.example.com');
    expect(() =>
      resolveConfig({ ...base, env: env({ MORIIUM_DASHBOARD_PUBLIC_ORIGIN: 'https://dash.example.com' }) }),
    ).toThrow(/认证/);
    for (const bad of [
      'http://dash.example.com',
      'https://dash.example.com/',
      'https://dash.example.com/app',
      'https://user:x@dash.example.com',
      'https://localhost',
      'https://127.0.0.1',
      'https://[::1]',
      'dash.example.com',
    ]) {
      expect(
        () => resolveConfig({ ...base, env: env({ ...auth, MORIIUM_DASHBOARD_PUBLIC_ORIGIN: bad }) }),
        bad,
      ).toThrow(ConfigError);
    }
  });
});
