import { type RefObject, useEffect } from 'react';
import { useI18n } from '../i18n/i18n.tsx';
import { registerDraft } from './router.tsx';
export function useDraftGuard(dirty: boolean) {
  const { t } = useI18n();
  const message = t('personal.discard');
  useEffect(() => (dirty ? registerDraft(message) : undefined), [dirty, message]);
  return () => !dirty || window.confirm(message);
}
export function restoreEditorFocus(ref: RefObject<HTMLButtonElement | null>) {
  const fallback = ref.current
    ?.closest('section')
    ?.querySelector<HTMLButtonElement>('.section-heading button');
  requestAnimationFrame(() => (ref.current ?? fallback)?.focus());
}
