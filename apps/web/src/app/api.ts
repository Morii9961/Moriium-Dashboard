/**
 * 调用本机服务。写请求带上自定义头（服务端据此拒绝跨源写入，见 apps/server/src/security.ts）。
 * 出错时抛出 ApiError：code 来自服务端（如 exists、invalid_id），连不上时为 offline。
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field: string | undefined;
  constructor(status: number, code: string, field?: string) {
    super(code);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

export async function api<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
) {
  const headers: Record<string, string> = {};
  if (method !== 'GET') headers['X-Moriium-Dashboard'] = '1';
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      cache: 'no-store',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError(0, 'offline');
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // 非 JSON 响应（例如代理报错页）按出错处理。
  }
  if (!res.ok) {
    const err = (data ?? {}) as { error?: unknown; field?: unknown };
    throw new ApiError(
      res.status,
      typeof err.error === 'string' ? err.error : res.status === 502 ? 'offline' : 'unknown',
      typeof err.field === 'string' ? err.field : undefined,
    );
  }
  return data as T;
}
