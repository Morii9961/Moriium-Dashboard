/**
 * 设置 → 本机仓库（P7 · L2）。登记几个目录，导入时在这些目录和它们的下一层子目录里
 * 找 docs/status/project-status.json。只在本机实例出现：开启登录的实例没有这个接口。
 */
import { type FormEvent, useState } from 'react';
import { useI18n } from '../i18n/i18n.tsx';
import type { MessageKey } from '../i18n/messages/zh-Hans.ts';
import { ApiError, api } from './api.ts';
import { useInvalidate, useResource } from './data.tsx';

export const LOCAL_SCAN_MAX_ROOTS = 20;

export function useLocalScanRoots() {
  const { data } = useResource<{ roots: string[] }>('/api/local-scan/roots');
  return data?.roots ?? null;
}

export function LocalRepositories() {
  const { t } = useI18n();
  const invalidate = useInvalidate();
  const roots = useLocalScanRoots();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  if (!roots) return null;

  const save = async (next: string[]) => {
    setBusy(true);
    setError(null);
    try {
      await api('PUT', '/api/local-scan/roots', { roots: next });
      invalidate();
      return true;
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'unknown';
      setError(
        code === 'invalid_root'
          ? 'localScan.invalidRoot'
          : code === 'too_many_roots'
            ? 'localScan.tooMany'
            : code === 'offline'
              ? 'apiError.offline'
              : 'apiError.unknown',
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    if (await save([...roots, draft.trim()])) setDraft('');
  };

  return (
    <section className="settings-group" aria-labelledby="set-local-repos">
      <h2 id="set-local-repos" className="settings-title">
        {t('settings.localRepos')}
      </h2>
      {roots.length > 0 ? (
        <ul className="scan-roots">
          {roots.map((root) => (
            <li key={root} className="scan-root">
              <span className="mono scan-path">{root}</span>
              <button
                type="button"
                className="icon-btn"
                disabled={busy}
                aria-label={t('localScan.remove', { path: root })}
                onClick={() => void save(roots.filter((r) => r !== root))}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form className="scan-add" onSubmit={add}>
        <label className="field">
          <span className="field-label">{t('localScan.pathLabel')}</span>
          <input
            className="mono"
            value={draft}
            maxLength={1024}
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={error === 'localScan.invalidRoot' ? true : undefined}
            onChange={(e) => {
              setDraft(e.currentTarget.value);
              setError(null);
            }}
          />
        </label>
        <button
          type="submit"
          className="btn"
          disabled={busy || !draft.trim() || roots.length >= LOCAL_SCAN_MAX_ROOTS}
        >
          {t('localScan.add')}
        </button>
      </form>
      <p className="reg-status is-error" role="alert">
        {error ? t(error, { max: LOCAL_SCAN_MAX_ROOTS }) : ''}
      </p>
    </section>
  );
}
