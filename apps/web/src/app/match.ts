/** 路由匹配：纯函数，便于测试。 */
export interface Route<Name extends string = string> {
  name: Name;
  pattern: string;
}

/** 把 /projects/:id 这样的模式和路径对上，返回参数；对不上返回 null。 */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const a = pattern.split('/').filter(Boolean);
  const b = path.replace(/\/+$/, '').split('/').filter(Boolean);
  if (a.length !== b.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < a.length; i++) {
    const p = a[i] as string;
    const v = b[i] as string;
    if (p.startsWith(':')) {
      try {
        params[p.slice(1)] = decodeURIComponent(v);
      } catch {
        return null;
      }
    } else if (p !== v) return null;
  }
  return params;
}

export function resolveRoute<Name extends string>(
  routes: readonly Route<Name>[],
  path: string,
): { route: Route<Name>; params: Record<string, string> } | null {
  for (const route of routes) {
    const params = matchPath(route.pattern, path);
    if (params) return { route, params };
  }
  return null;
}
