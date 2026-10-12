/**
 * 极小的客户端路由：History API + useSyncExternalStore。页面不多、只有一个路径参数，
 * 不值得为此引入路由库。服务端对所有非 /api 的 GET 请求返回 index.html（apps/server/src/app.ts）。
 */
import { type AnchorHTMLAttributes, type MouseEvent, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const notify = () => {
  for (const l of listeners) l();
};
window.addEventListener('popstate', notify);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function navigate(to: string, { replace = false } = {}): void {
  if (to === window.location.pathname + window.location.search + window.location.hash) return;
  if (replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  notify();
}

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}

export { matchPath, type Route, resolveRoute } from './match.ts';

/** 站内链接：普通点击走客户端路由；带修饰键、中键或新窗口打开时交给浏览器。 */
export function Link({
  to,
  onClick,
  ...rest
}: { to: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (rest.target && rest.target !== '_self') return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={handle} {...rest} />;
}
