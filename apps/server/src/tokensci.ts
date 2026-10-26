/**
 * 算力账本的数据源：tokens.ci 的公开主页（2026-10-25，Morii 决定）。
 *
 * - 这是服务端唯一一处访问外网：只读 https://tokens.ci/api/users/<用户名>，不发送任何本机数据。
 * - 用户名存在数据目录的 tokens-ci.json；精简后的数据缓存在 tokens-ci-cache.json。
 * - 缓存 10 分钟内直接用；过期或手动刷新时重新读取，失败就返回上次成功的数据并标出 stale。
 * - 原来的手动导入账本（usage/）保留不动，两者互不相干。
 */
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
  TokensCiClient,
  TokensCiDay,
  TokensCiError,
  TokensCiModel,
  TokensCiProfile,
  TokensCiResponse,
} from '@moriium-dashboard/protocol/tokens-ci-types';

export const TOKENS_CI_FILE = 'tokens-ci.json';
export const TOKENS_CI_CACHE_FILE = 'tokens-ci-cache.json';
export const TOKENS_CI_TTL_MS = 10 * 60 * 1000;
const ORIGIN = 'https://tokens.ci';
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 8 * 1024 * 1024;
/** GitHub 用户名的规则：字母数字和连字符，不以连字符开头，最长 39。 */
const USERNAME = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface TokensCiStore {
  dir: string;
  fetch?: Fetch;
  now?: () => Date;
}

export class TokensCiSettingsError extends Error {
  readonly code: 'invalid_username';
  constructor(code: 'invalid_username') {
    super(code);
    this.code = code;
  }
}

interface Cache {
  username: string;
  fetchedAt: string;
  profile: TokensCiProfile;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(path: string, value: unknown) {
  const tmp = `${path}.partial`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(tmp, path);
}

export function readUsername(store: TokensCiStore): string | null {
  const value = readJson(join(store.dir, TOKENS_CI_FILE)) as { username?: unknown } | null;
  return typeof value?.username === 'string' && USERNAME.test(value.username) ? value.username : null;
}

/** 保存用户名（去掉前导 @ 和空白）；空字符串表示清除。 */
export function saveUsername(store: TokensCiStore, input: unknown): string | null {
  if (typeof input !== 'string') throw new TokensCiSettingsError('invalid_username');
  const username = input.trim().replace(/^@/, '');
  if (username && !USERNAME.test(username)) throw new TokensCiSettingsError('invalid_username');
  writeJson(join(store.dir, TOKENS_CI_FILE), { username: username || null });
  return username || null;
}

function readCache(store: TokensCiStore, username: string): Cache | null {
  const value = readJson(join(store.dir, TOKENS_CI_CACHE_FILE)) as Cache | null;
  return value && value.username === username && typeof value.fetchedAt === 'string' && value.profile
    ? value
    : null;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
const obj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const byCost = <T extends { cost: number; tokens: number }>(a: T, b: T) =>
  b.cost - a.cost || b.tokens - a.tokens;

function normalizeClient(raw: unknown): TokensCiClient | null {
  const c = obj(raw);
  const client = str(c.client);
  if (!client) return null;
  const tokens = obj(c.tokens);
  const models: TokensCiModel[] = Object.entries(obj(c.models))
    .map(([model, m]) => {
      const x = obj(m);
      return { model, tokens: num(x.tokens), cost: num(x.cost), messages: num(x.messages) };
    })
    .sort(byCost);
  const tokenSum =
    num(tokens.input) +
    num(tokens.output) +
    num(tokens.cacheRead) +
    num(tokens.cacheWrite) +
    num(tokens.reasoning);
  return {
    client,
    tokens: tokenSum || models.reduce((n, m) => n + m.tokens, 0),
    cost: num(c.cost),
    messages: num(c.messages),
    input: num(tokens.input),
    output: num(tokens.output),
    models,
  };
}

function normalizeDay(raw: unknown): TokensCiDay | null {
  const d = obj(raw);
  const date = str(d.date);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const totals = obj(d.totals);
  const breakdown = obj(d.tokenBreakdown);
  const clients = (Array.isArray(d.clients) ? d.clients : [])
    .map(normalizeClient)
    .filter((c): c is TokensCiClient => c !== null)
    .sort(byCost);
  // tokens.ci 的日合计里消息数有时是 0，各客户端的消息数才是准的。
  const messages = num(totals.messages) || clients.reduce((n, c) => n + c.messages, 0);
  const tokens = num(totals.tokens);
  if (!tokens && !clients.length) return null;
  return {
    date,
    tokens,
    cost: num(totals.cost),
    messages,
    input: num(breakdown.input),
    output: num(breakdown.output),
    cacheRead: num(breakdown.cacheRead),
    cacheWrite: num(breakdown.cacheWrite),
    clients,
  };
}

/** 从 tokens.ci 的原始响应里只取页面和小票要用的字段。不合格时返回 null。 */
export function normalizeProfile(raw: unknown, username: string): TokensCiProfile | null {
  const r = obj(raw);
  const user = obj(r.user);
  const stats = obj(r.stats);
  if (!Array.isArray(r.contributions) || typeof stats.totalTokens !== 'number') return null;
  const days = r.contributions
    .map(normalizeDay)
    .filter((d): d is TokensCiDay => d !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    username: str(user.username) ?? username,
    displayName: str(user.displayName),
    rank: typeof user.rank === 'number' && user.rank > 0 ? user.rank : null,
    totals: {
      tokens: num(stats.totalTokens),
      cost: num(stats.totalCost),
      activeDays: num(stats.activeDays) || days.length,
      sessions: num(stats.sessionCount),
    },
    days,
    updatedAt: str(obj(r.submissionFreshness).lastUpdated) ?? str(r.updatedAt),
  };
}

async function download(store: TokensCiStore, username: string): Promise<TokensCiProfile | TokensCiError> {
  const doFetch = store.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${ORIGIN}/api/users/${encodeURIComponent(username)}`, {
      headers: {
        accept: 'application/json',
        'user-agent': 'Moriium-Dashboard (+https://github.com/Morii9961/Moriium-Dashboard)',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: 'error',
    });
  } catch {
    return 'unavailable';
  }
  if (res.status === 404) return 'not_found';
  if (!res.ok) return 'unavailable';
  const text = await res.text().catch(() => '');
  if (!text || text.length > MAX_BYTES) return 'invalid_response';
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return 'invalid_response';
  }
  return normalizeProfile(raw, username) ?? 'invalid_response';
}

const inflight = new Map<string, Promise<TokensCiProfile | TokensCiError>>();

/** 返回当前数据：缓存新鲜就直接用，否则（或 refresh）重新读取；同一时刻的重复请求共用一次读取。 */
export async function getTokensCi(store: TokensCiStore, refresh = false): Promise<TokensCiResponse> {
  const username = readUsername(store);
  if (!username) return { username: null, profile: null, fetchedAt: null, stale: false, error: null };
  const now = store.now?.() ?? new Date();
  const cache = readCache(store, username);
  if (cache && !refresh && now.getTime() - Date.parse(cache.fetchedAt) < TOKENS_CI_TTL_MS) {
    return { username, profile: cache.profile, fetchedAt: cache.fetchedAt, stale: false, error: null };
  }
  const key = `${store.dir}\n${username}`;
  let pending = inflight.get(key);
  if (!pending) {
    pending = download(store, username).finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  const result = await pending;
  if (typeof result === 'string') {
    return {
      username,
      profile: cache?.profile ?? null,
      fetchedAt: cache?.fetchedAt ?? null,
      stale: Boolean(cache),
      error: result,
    };
  }
  const fetchedAt = now.toISOString();
  writeJson(join(store.dir, TOKENS_CI_CACHE_FILE), { username, fetchedAt, profile: result } satisfies Cache);
  return { username, profile: result, fetchedAt, stale: false, error: null };
}
