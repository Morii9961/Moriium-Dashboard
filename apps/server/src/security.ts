/**
 * 本机阶段的安全措施（规划 05 第 10 节）：
 * - Host 头只接受 127.0.0.1 和 localhost（防 DNS 重绑定：别的网页把域名解析到本机，借浏览器访问这个服务）。
 * - 写请求校验 Origin，并要求自定义请求头；跨源页面发不出带这个头的请求，因为服务不回应预检。
 * - 严格的 CSP 和其他安全响应头；不允许内联脚本，不允许任何外部来源。
 */
import type { MiddlewareHandler } from 'hono';

export const WRITE_HEADER = 'x-moriium-dashboard';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

export function hostCheck(allowedHosts: readonly string[]): MiddlewareHandler {
  const allowed = new Set(allowedHosts.map((h) => h.toLowerCase()));
  return async (c, next) => {
    const host = c.req.header('host')?.toLowerCase();
    if (!host || !allowed.has(host)) {
      return c.json({ error: 'host_not_allowed' }, 421);
    }
    return next();
  };
}

export function writeGuard(allowedOrigins: readonly string[]): MiddlewareHandler {
  const allowed = new Set(allowedOrigins);
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) {
      // 不回应跨源预检：带自定义头的跨源写请求在浏览器那一步就会失败。
      if (c.req.method === 'OPTIONS') return c.body(null, 405);
      return next();
    }
    const origin = c.req.header('origin');
    if (!origin || !allowed.has(origin)) return c.json({ error: 'origin_not_allowed' }, 403);
    if (c.req.header(WRITE_HEADER) !== '1') return c.json({ error: 'missing_write_header' }, 403);
    return next();
  };
}

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

/** 放在最外层，所有响应（包括被拒绝的请求和出错的请求）都带上安全头。 */
export function securityHeaders(): MiddlewareHandler {
  return async (c, next) => {
    await next();
    // 直接改 c.res：被拒绝的请求和出错的请求也一样带上。
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) c.res.headers.set(name, value);
    if (c.req.path.startsWith('/api/')) c.res.headers.set('Cache-Control', 'no-store');
  };
}
