/**
 * 登录（P6.2d）。服务端未开启认证时（本机使用）直接显示应用，行为和以前一样；
 * 开启后先问 /api/auth/session，没有会话就只显示登录页，应用和数据请求都不挂载。
 * 任何接口返回 unauthenticated（会话过期、在别处退出）时回到登录页。
 */
import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Segmented } from '../components/Segmented.tsx';
import { useI18n } from '../i18n/i18n.tsx';
import { LOCALE_NAMES, LOCALES, type Locale } from '../i18n/locale.ts';
import type { MessageKey } from '../i18n/messages/zh-Hans.ts';
import { ApiError, api, UNAUTHENTICATED_EVENT } from './api.ts';

type SessionInfo =
  | { mode: 'local'; authenticated: true }
  | { mode: 'required'; authenticated: true; login: string; expiresAt: string }
  | { mode: 'required'; authenticated: false };

type GateState =
  | { kind: 'checking' }
  | { kind: 'open'; session: SessionInfo }
  | { kind: 'login'; notice: MessageKey | null };

interface AuthContextValue {
  /** 已登录的账户；本机模式或尚未确认时为 null。 */
  account: { login: string; expiresAt: string } | null;
  logout: (everywhere?: boolean) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({ account: null, logout: async () => {} });
export const useAuth = () => useContext(AuthContext);

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ kind: 'checking' });

  const check = useCallback(async (notice: MessageKey | null = null) => {
    try {
      const session = await api<SessionInfo>('GET', '/api/auth/session');
      setState(session.authenticated ? { kind: 'open', session } : { kind: 'login', notice });
    } catch (error) {
      // 连不上服务时照常显示应用：顶部的服务横幅会说明情况，恢复后接口会把需要登录的情况报回来。
      if (error instanceof ApiError && error.code === 'offline') {
        setState({ kind: 'open', session: { mode: 'local', authenticated: true } });
      } else {
        setState({ kind: 'login', notice: 'auth.unavailable' });
      }
    }
  }, []);

  useEffect(() => {
    void check();
    const onExpired = () => setState({ kind: 'login', notice: 'auth.expired' });
    window.addEventListener(UNAUTHENTICATED_EVENT, onExpired);
    return () => window.removeEventListener(UNAUTHENTICATED_EVENT, onExpired);
  }, [check]);

  const logout = useCallback(async (everywhere = false) => {
    try {
      await api('POST', everywhere ? '/api/auth/revoke-all' : '/api/auth/logout');
    } finally {
      setState({ kind: 'login', notice: null });
    }
  }, []);

  if (state.kind === 'checking') return null;
  if (state.kind === 'login') return <LoginPage notice={state.notice} onSignedIn={() => void check()} />;
  const session = state.session;
  const account =
    session.mode === 'required' && session.authenticated
      ? { login: session.login, expiresAt: session.expiresAt }
      : null;
  return <AuthContext.Provider value={{ account, logout }}>{children}</AuthContext.Provider>;
}

const ERRORS: Record<string, MessageKey> = {
  invalid_credentials: 'auth.invalid',
  busy: 'auth.busy',
  credentials_changed: 'auth.changed',
  offline: 'auth.offline',
};

function LoginPage({ notice, onSignedIn }: { notice: MessageKey | null; onSignedIn: () => void }) {
  const { t, locale, setLocale } = useI18n();
  const [login, setLogin] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [pending, setPending] = useState(false);
  // 存消息键而不是译好的文字：切换界面语言时提示跟着换。
  const [error, setError] = useState<{ key: MessageKey; minutes?: number } | null>(
    notice ? { key: notice } : null,
  );
  const accountRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = `${t('auth.heading')} · Moriium Dashboard`;
  }, [t]);
  useEffect(() => {
    accountRef.current?.focus();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await api('POST', '/api/auth/login', { login: login.trim(), passphrase });
      setPassphrase('');
      onSignedIn();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'unknown';
      if (code === 'limited' && err instanceof ApiError) {
        setError({ key: 'auth.limited', minutes: Math.max(1, Math.ceil((err.retryAfter ?? 60) / 60)) });
      } else {
        setError({ key: ERRORS[code] ?? 'auth.unavailable' });
      }
      setPassphrase('');
      setPending(false);
      passRef.current?.focus();
    }
  };

  return (
    <main className="auth" aria-labelledby="auth-title">
      <div className="auth-rail" aria-hidden="true">
        <span className="auth-run" />
        <span className="auth-stops">
          <span />
          <span />
          <span />
        </span>
        <span className="auth-here" />
      </div>
      <div className="auth-panel">
        <p className="auth-brand">Moriium Dashboard</p>
        <h1 id="auth-title" className="auth-title">
          {t('auth.heading')}
        </h1>
        <form className="auth-form" onSubmit={submit} noValidate>
          <label className="field">
            <span className="field-label">{t('auth.account')}</span>
            <input
              ref={accountRef}
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={64}
              required
              value={login}
              onChange={(e) => setLogin(e.currentTarget.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">{t('auth.passphrase')}</span>
            <input
              ref={passRef}
              type="password"
              name="password"
              autoComplete="current-password"
              maxLength={1024}
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'auth-error' : undefined}
              value={passphrase}
              onChange={(e) => setPassphrase(e.currentTarget.value)}
            />
          </label>
          <p id="auth-error" className="auth-error" role="alert">
            {error
              ? t(error.key, error.minutes === undefined ? undefined : { minutes: error.minutes })
              : null}
          </p>
          <button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={pending || !login.trim() || !passphrase}
          >
            {pending ? t('auth.checking') : t('auth.submit')}
          </button>
        </form>
        <Segmented
          legend={t('locale.legend')}
          name="auth-locale"
          value={locale}
          onChange={(l: Locale) => setLocale(l)}
          options={LOCALES.map((l) => [l, LOCALE_NAMES[l]] as const)}
        />
      </div>
    </main>
  );
}
