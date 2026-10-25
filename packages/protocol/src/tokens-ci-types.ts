/**
 * 算力账本（2026-10-25 起）的数据来自 tokens.ci 的公开主页。服务端读取 /api/users/<用户名>，
 * 只保留这些字段交给前端；原始响应不落盘、不转发。金额是 tokens.ci 按 API 价格估算的美元，不是实际账单。
 */

export interface TokensCiModel {
  model: string;
  tokens: number;
  cost: number;
  messages: number;
}

/** 一个客户端（claude、codex……）在一天里的用量。 */
export interface TokensCiClient {
  client: string;
  tokens: number;
  cost: number;
  messages: number;
  input: number;
  output: number;
  /** 按费用从高到低。 */
  models: TokensCiModel[];
}

export interface TokensCiDay {
  /** YYYY-MM-DD，tokens.ci 按提交时的本地日期归日。 */
  date: string;
  tokens: number;
  cost: number;
  messages: number;
  input: number;
  output: number;
  /** 按费用从高到低。 */
  clients: TokensCiClient[];
}

export interface TokensCiProfile {
  username: string;
  displayName: string | null;
  rank: number | null;
  totals: { tokens: number; cost: number; activeDays: number; sessions: number };
  /** 只有有用量的日子，按日期从早到晚。 */
  days: TokensCiDay[];
  /** tokens.ci 最近一次收到提交的时间。 */
  updatedAt: string | null;
}

export type TokensCiError = 'not_found' | 'unavailable' | 'invalid_response';

export interface TokensCiResponse {
  /** 还没设置用户名时为 null。 */
  username: string | null;
  profile: TokensCiProfile | null;
  /** 服务端最近一次成功读取 tokens.ci 的时间。 */
  fetchedAt: string | null;
  /** 这次刷新失败、返回的是上次成功的数据。 */
  stale: boolean;
  error: TokensCiError | null;
}
