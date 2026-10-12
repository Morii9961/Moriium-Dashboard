import type { Context } from 'hono';

/** 读取 JSON 对象请求体；不是合法 JSON 或不是对象时返回 null。 */
export async function readJsonObject(c: Context): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await c.req.json();
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
