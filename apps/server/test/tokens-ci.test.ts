import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { REPO_ROOT } from '../src/config.ts';
import { applyMigrations, type Database, loadMigrations, openDatabase } from '../src/db.ts';
import {
  type Fetch,
  getTokensCi,
  normalizeProfile,
  readUsername,
  saveUsername,
  TOKENS_CI_CACHE_FILE,
  TOKENS_CI_TTL_MS,
  TokensCiSettingsError,
} from '../src/tokensci.ts';

const host = '127.0.0.1:5180';
const write = {
  host,
  origin: `http://${host}`,
  'x-moriium-dashboard': '1',
  'content-type': 'application/json',
};

/** 合成的 tokens.ci 响应：字段形状与 /api/users/<name> 一致，数值是编的。 */
const sample = {
  user: { username: 'demo-user', displayName: 'Demo', rank: 12, isPrivate: false },
  stats: { totalTokens: 3_000_000, totalCost: 42.5, activeDays: 2, sessionCount: 9 },
  submissionFreshness: { lastUpdated: '2026-10-25T09:00:00.000Z' },
  contributions: [
    {
      date: '2026-10-25',
      totals: { tokens: 2_000_000, cost: 30, messages: 0 },
      tokenBreakdown: { input: 100, output: 200, cacheRead: 1_999_700, cacheWrite: 0, reasoning: 0 },
      clients: [
        {
          client: 'codex',
          tokens: { input: 50, output: 100, cacheRead: 499_850, cacheWrite: 0, reasoning: 0 },
          cost: 10,
          messages: 40,
          models: {
            'model-b': { tokens: 100_000, cost: 1, messages: 10 },
            'model-a': { tokens: 400_000, cost: 9, messages: 30 },
          },
        },
        {
          client: 'claude',
          tokens: { input: 50, output: 100, cacheRead: 1_499_850, cacheWrite: 0, reasoning: 0 },
          cost: 20,
          messages: 60,
          models: { 'model-c': { tokens: 1_500_000, cost: 20, messages: 60 } },
        },
      ],
    },
    { date: '2026-10-20', totals: { tokens: 1_000_000, cost: 12.5, messages: 7 }, clients: [] },
    { date: 'not-a-date', totals: { tokens: 5, cost: 1 } },
  ],
};

function fakeFetch(responses: (Response | Error)[]) {
  const calls: string[] = [];
  const fn: Fetch = async (url) => {
    calls.push(url);
    const next = responses.shift() ?? new Error('no more responses');
    if (next instanceof Error) throw next;
    return next;
  };
  return { fn, calls };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dashboard-tokens-ci-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe('normalizeProfile', () => {
  it('keeps only the fields the page needs, sorts days and clients, and fills missing message totals', () => {
    const p = normalizeProfile(sample, 'demo-user');
    expect(p?.rank).toBe(12);
    expect(p?.totals).toEqual({ tokens: 3_000_000, cost: 42.5, activeDays: 2, sessions: 9 });
    expect(p?.days.map((d) => d.date)).toEqual(['2026-10-20', '2026-10-25']);
    const day = p?.days[1];
    expect(day?.messages).toBe(100);
    expect(day?.cacheRead).toBe(1_999_700);
    expect(day?.clients.map((c) => c.client)).toEqual(['claude', 'codex']);
    expect(day?.clients[1]?.models.map((m) => m.model)).toEqual(['model-a', 'model-b']);
    expect(day?.clients[1]?.tokens).toBe(500_000);
    expect(JSON.stringify(p)).not.toContain('isPrivate');
  });

  it('rejects a response without stats or contributions', () => {
    expect(normalizeProfile({ user: {} }, 'x')).toBeNull();
    expect(normalizeProfile('nope', 'x')).toBeNull();
  });
});

describe('username', () => {
  it('accepts GitHub-style names, strips @, and clears on empty', () => {
    const store = { dir };
    expect(readUsername(store)).toBeNull();
    expect(saveUsername(store, ' @demo-user ')).toBe('demo-user');
    expect(readUsername(store)).toBe('demo-user');
    for (const bad of ['-lead', 'has space', 'a/b', 'x'.repeat(40), 42]) {
      expect(() => saveUsername(store, bad), String(bad)).toThrow(TokensCiSettingsError);
    }
    expect(saveUsername(store, '')).toBeNull();
    expect(readUsername(store)).toBeNull();
  });
});

describe('getTokensCi', () => {
  it('returns nothing until a username is set', async () => {
    const f = fakeFetch([]);
    expect(await getTokensCi({ dir, fetch: f.fn })).toMatchObject({
      username: null,
      profile: null,
      error: null,
    });
    expect(f.calls).toEqual([]);
  });

  it('caches for ten minutes, refreshes on demand, and falls back to the last good copy', async () => {
    let now = new Date('2026-10-25T10:00:00Z');
    const f = fakeFetch([json(sample), json(sample), new Error('offline')]);
    const store = { dir, fetch: f.fn, now: () => now };
    saveUsername(store, 'demo-user');

    const first = await getTokensCi(store);
    expect(f.calls).toEqual(['https://tokens.ci/api/users/demo-user']);
    expect(first).toMatchObject({ stale: false, error: null, fetchedAt: now.toISOString() });
    expect(existsSync(join(dir, TOKENS_CI_CACHE_FILE))).toBe(true);
    expect(readFileSync(join(dir, TOKENS_CI_CACHE_FILE), 'utf8')).not.toContain('isPrivate');

    now = new Date(now.getTime() + TOKENS_CI_TTL_MS - 1000);
    await getTokensCi(store);
    expect(f.calls).toHaveLength(1);

    await getTokensCi(store, true);
    expect(f.calls).toHaveLength(2);

    now = new Date(now.getTime() + TOKENS_CI_TTL_MS + 1000);
    const offline = await getTokensCi(store);
    expect(offline).toMatchObject({ stale: true, error: 'unavailable' });
    expect(offline.profile?.totals.tokens).toBe(3_000_000);
  });

  it('reports a missing profile and a malformed answer', async () => {
    const f = fakeFetch([json({ error: 'nope' }, 404), new Response('<html>', { status: 200 })]);
    const store = { dir, fetch: f.fn };
    saveUsername(store, 'nobody');
    expect(await getTokensCi(store)).toMatchObject({ profile: null, error: 'not_found', stale: false });
    expect(await getTokensCi(store, true)).toMatchObject({ profile: null, error: 'invalid_response' });
  });
});

describe('/api/tokens-ci', () => {
  let db: Database;
  beforeEach(() => {
    db = openDatabase(join(dir, 'test.sqlite'));
    applyMigrations(db, loadMigrations(join(REPO_ROOT, 'apps', 'server', 'migrations')));
  });
  afterEach(() => db.close());

  it('saves the username, then serves the trimmed profile', async () => {
    const f = fakeFetch([json(sample)]);
    const app = createApp({
      db,
      config: { allowedHosts: [host], allowedOrigins: [`http://${host}`], backupDir: join(dir, 'b') },
      startedAt: new Date(),
      version: 'test',
      tokensCi: { dir, fetch: f.fn },
    });
    const empty = await app.request('/api/tokens-ci', { headers: { host } });
    expect(await empty.json()).toMatchObject({ username: null });

    const bad = await app.request('/api/tokens-ci/settings', {
      method: 'PUT',
      headers: write,
      body: JSON.stringify({ username: 'a b' }),
    });
    expect(bad.status).toBe(400);

    const saved = await app.request('/api/tokens-ci/settings', {
      method: 'PUT',
      headers: write,
      body: JSON.stringify({ username: 'demo-user' }),
    });
    expect(saved.status).toBe(200);
    const body = (await saved.json()) as { profile: { days: unknown[] } };
    expect(body.profile.days).toHaveLength(2);

    const cached = await app.request('/api/tokens-ci', { headers: { host } });
    expect(cached.status).toBe(200);
    expect(f.calls).toHaveLength(1);
  });
});
