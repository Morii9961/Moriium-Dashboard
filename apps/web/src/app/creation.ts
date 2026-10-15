import { useEffect, useSyncExternalStore } from 'react';
import { navigate } from './router.tsx';

type Kind = 'task' | 'work';
const listeners = new Set<() => void>();
let pending: { kind: Kind } | null = null;
const notify = () => {
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Open an existing editor; navigating away still goes through the shared draft guard. */
export function requestCreation(kind: Kind) {
  const target = kind === 'task' ? '/planner' : '/studio';
  if (location.pathname !== target) navigate(target);
  if (location.pathname !== target) return;
  pending = { kind };
  notify();
}

export function useCreationCommand(kind: Kind, open: (() => void) | null) {
  const intent = useSyncExternalStore(subscribe, () => pending);
  useEffect(() => {
    if (!open || intent?.kind !== kind || pending !== intent) return;
    pending = null;
    notify();
    open();
  }, [intent, kind, open]);
}
