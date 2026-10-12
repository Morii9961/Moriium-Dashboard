/**
 * 本机服务的连接状态：定期请求 /api/health。
 * 连不上时界面顶部显示横幅，已经加载的内容保留（02 第 11.4 节）；连上后横幅自动消失。
 */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';

export interface Health {
  status: 'ok' | 'degraded';
  version: string;
  schemaVersion?: number;
  lastBackupAt?: string | null;
  uptimeSeconds?: number;
}

export type ServiceState =
  | { kind: 'checking' }
  | { kind: 'up'; health: Health }
  | { kind: 'down'; since: number };

interface ServiceContextValue {
  state: ServiceState;
  retry: () => void;
}

const ServiceContext = createContext<ServiceContextValue | null>(null);

const UP_INTERVAL_MS = 60_000;
const DOWN_INTERVAL_MS = 5_000;

export function ServiceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ServiceState>({ kind: 'checking' });
  const timer = useRef<number | undefined>(undefined);

  const check = useCallback(async () => {
    window.clearTimeout(timer.current);
    let next: ServiceState;
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      const body = (await res.json()) as Health;
      next =
        body && typeof body.version === 'string'
          ? { kind: 'up', health: body }
          : { kind: 'down', since: Date.now() };
    } catch {
      next = { kind: 'down', since: Date.now() };
    }
    setState((prev) => (next.kind === 'down' && prev.kind === 'down' ? prev : next));
    timer.current = window.setTimeout(check, next.kind === 'up' ? UP_INTERVAL_MS : DOWN_INTERVAL_MS);
  }, []);

  useEffect(() => {
    void check();
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    return () => {
      window.clearTimeout(timer.current);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
    };
  }, [check]);

  return (
    <ServiceContext.Provider value={{ state, retry: () => void check() }}>{children}</ServiceContext.Provider>
  );
}

export function useService(): ServiceContextValue {
  const ctx = useContext(ServiceContext);
  if (!ctx) throw new Error('useService 必须在 <ServiceProvider> 里使用');
  return ctx;
}
