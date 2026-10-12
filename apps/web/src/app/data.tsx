/**
 * 读取服务端数据的小工具：useResource(路径) 取数据；写入成功后调用 invalidate()，
 * 所有正在显示的数据一起重新读取。服务从断开恢复时也会重新读取。
 * 数据量很小（几十个项目），不做缓存层和分页。
 */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ApiError, api } from './api.ts';
import { useService } from './service.tsx';

const RevisionContext = createContext<{ revision: number; invalidate: () => void } | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [revision, setRevision] = useState(0);
  const invalidate = useCallback(() => setRevision((r) => r + 1), []);
  const { state } = useService();
  const wasDown = useRef(false);
  useEffect(() => {
    if (state.kind === 'down') wasDown.current = true;
    if (state.kind === 'up' && wasDown.current) {
      wasDown.current = false;
      invalidate();
    }
  }, [state.kind, invalidate]);
  return <RevisionContext.Provider value={{ revision, invalidate }}>{children}</RevisionContext.Provider>;
}

export function useInvalidate(): () => void {
  const ctx = useContext(RevisionContext);
  if (!ctx) throw new Error('useInvalidate 必须在 <DataProvider> 里使用');
  return ctx.invalidate;
}

export interface Resource<T> {
  data: T | undefined;
  error: ApiError | undefined;
  loading: boolean;
}

export function useResource<T>(path: string | null): Resource<T> {
  const ctx = useContext(RevisionContext);
  if (!ctx) throw new Error('useResource 必须在 <DataProvider> 里使用');
  const [state, setState] = useState<Resource<T>>({ data: undefined, error: undefined, loading: true });
  // biome-ignore lint/correctness/useExhaustiveDependencies: revision 变了就要重新读取，这是它唯一的用途。
  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    api<T>('GET', path)
      .then((data) => !cancelled && setState({ data, error: undefined, loading: false }))
      // 出错时保留上次成功的数据（02 第 11.4 节：服务断开时已加载的内容保留）。
      .catch(
        (error: unknown) =>
          !cancelled &&
          setState((s) => ({
            data: s.data,
            error: error instanceof ApiError ? error : new ApiError(0, 'unknown'),
            loading: false,
          })),
      );
    return () => {
      cancelled = true;
    };
  }, [path, ctx.revision]);
  return state;
}
