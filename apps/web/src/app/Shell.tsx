/**
 * 应用外壳：导航、服务横幅、页面区域（02 第 2、3 节；外观见 DESIGN.md 第 5、10 节）。
 *
 * 灰阶尺的导航是一列竖排小字，没有图标、没有侧栏底色：
 * - ≥ 820：固定在左边距，当前页前面一个 8px 方块。
 * - < 820：左上角「目录」按钮，打开原生 <dialog> 抽屉（自带焦点锁定和 Esc 关闭）。
 */
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/i18n.tsx';
import { LOCALE_NAMES, LOCALES, type Locale } from '../i18n/locale.ts';
import type { MessageKey } from '../i18n/messages/zh-Hans.ts';
import { readThemePref, setThemePref, THEME_PREFS, type ThemePref } from '../theme/theme.ts';
import { CommandButton } from './Commands.tsx';
import { useImport } from './ImportDialog.tsx';
import { Link, usePath } from './router.tsx';
import { useService } from './service.tsx';

interface NavItem {
  to: string;
  label: MessageKey;
  /** 子页面也算在这一项里，例如 /projects/x 属于「项目」。 */
  match: (path: string) => boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'nav.overview', match: (p) => p === '/' },
  { to: '/inbox', label: 'nav.inbox', match: (p) => p === '/inbox' },
  { to: '/projects', label: 'nav.projects', match: (p) => p.startsWith('/projects') },
  { to: '/agents', label: 'nav.agents', match: (p) => p.startsWith('/agents') },
  { to: '/studio', label: 'nav.studio', match: (p) => p.startsWith('/studio') },
  { to: '/planner', label: 'nav.planner', match: (p) => p.startsWith('/planner') },
];

function Brand() {
  return (
    <Link to="/" className="brand-mark">
      <span className="brand-word">Moriium</span>
      <span className="brand-sub">Dashboard</span>
    </Link>
  );
}

function NavList({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  const { t } = useI18n();
  const { open: openImport } = useImport();
  return (
    <>
      <nav className="nav" aria-label={t('nav.label')}>
        <ul className="nav-list">
          {NAV.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                className={`nav-link${item.match(path) ? ' is-active' : ''}`}
                aria-current={path === item.to ? 'page' : undefined}
                onClick={onNavigate}
              >
                {t(item.label)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <ul className="nav-list nav-actions">
        <li>
          <CommandButton beforeOpen={onNavigate} />
        </li>
        <li>
          <button
            type="button"
            className="nav-link"
            onClick={() => {
              onNavigate?.();
              openImport();
            }}
          >
            {t('nav.import')}
          </button>
        </li>
        <li>
          <Link
            to="/settings"
            className={`nav-link${path === '/settings' ? ' is-active' : ''}`}
            aria-current={path === '/settings' ? 'page' : undefined}
            onClick={onNavigate}
          >
            {t('nav.settings')}
          </Link>
        </li>
      </ul>
    </>
  );
}

function ThemeButton() {
  const { t } = useI18n();
  const [pref, setPref] = useState<ThemePref>(readThemePref);
  const next = THEME_PREFS[(THEME_PREFS.indexOf(pref) + 1) % THEME_PREFS.length] ?? 'system';
  return (
    <button
      type="button"
      className="nav-link nav-small"
      onClick={() => {
        setThemePref(next);
        setPref(next);
      }}
      aria-label={`${t('theme.legend')}：${t(`theme.${pref}`)}`}
    >
      {t(`theme.${pref}`)}
    </button>
  );
}

function LocaleSelect() {
  const { t, locale, setLocale } = useI18n();
  return (
    <label className="locale-select">
      <span className="sr-only">{t('locale.legend')}</span>
      <select value={locale} onChange={(e) => setLocale(e.currentTarget.value as Locale)}>
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

function SideFoot() {
  return (
    <div className="side-foot">
      <ThemeButton />
      <LocaleSelect />
    </div>
  );
}

function ServiceBanner() {
  const { t } = useI18n();
  const { state, retry } = useService();
  if (state.kind !== 'down') return null;
  return (
    <div className="banner" role="status">
      <p className="banner-text">
        <strong>{t('banner.down')}</strong> <span>{t('banner.how', { command: 'pnpm server' })}</span>
      </p>
      <button type="button" className="btn" onClick={retry}>
        {t('banner.retry')}
      </button>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const path = usePath();
  const drawer = useRef<HTMLDialogElement>(null);
  const first = useRef(true);

  // 换页：回到顶部，焦点移到新页面的标题（首次加载除外）。
  // biome-ignore lint/correctness/useExhaustiveDependencies: path 就是触发条件，每次换页都要运行。
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const target = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
    if (target) target.scrollIntoView({ block: 'start' });
    else window.scrollTo(0, 0);
    (target ?? document.querySelector<HTMLElement>('main .page-title'))?.focus({ preventScroll: true });
  }, [path]);

  const closeDrawer = () => drawer.current?.close();

  return (
    <div className="app">
      <a className="skip" href="#main">
        {t('a11y.skip')}
      </a>

      <aside className="sidebar">
        <Brand />
        <NavList path={path} />
        <SideFoot />
      </aside>

      <header className="mobilebar">
        <button
          type="button"
          className="nav-toggle"
          aria-label={t('nav.menu')}
          aria-haspopup="dialog"
          onClick={() => drawer.current?.showModal()}
        >
          {t('nav.contents')}
        </button>
        <Brand />
      </header>

      {/* biome-ignore lint/a11y/useKeyWithClickEvents: 点遮罩关闭只是鼠标的快捷方式；键盘用 Esc 关闭（原生 dialog）。 */}
      <dialog
        className="drawer"
        ref={drawer}
        aria-label={t('nav.label')}
        onClick={(e) => {
          // 点在抽屉外的遮罩上时关闭。
          if (e.target === e.currentTarget) closeDrawer();
        }}
      >
        <div className="drawer-inner">
          <div className="drawer-head">
            <Brand />
            <button type="button" className="btn btn-quiet" onClick={closeDrawer}>
              {t('nav.close')}
            </button>
          </div>
          <NavList path={path} onNavigate={closeDrawer} />
          <SideFoot />
        </div>
      </dialog>

      <div className="main-col">
        <ServiceBanner />
        <main id="main" className="app-main">
          {children}
        </main>
      </div>
    </div>
  );
}
