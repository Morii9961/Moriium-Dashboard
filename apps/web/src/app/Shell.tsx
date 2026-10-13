/**
 * 应用外壳：导航、服务横幅、页面区域（02 第 2、3 节）。
 *
 * 导航随宽度变化：
 * - ≥ 1280：左侧 224px。导航画成一条竖线上的几个站，当前页是雾蓝的站点，和阶段轴同一种语言。
 * - 1024 到 1279：收成 64px 图标栏，图标聚焦或悬停时显示文字。
 * - 768 到 1023：顶栏加抽屉（原生 <dialog>，自带焦点锁定和 Esc 关闭）。
 * - < 768：底部五个标签，顶栏放导入和设置。
 */
import {
  CalendarCheck,
  DownloadSimple,
  Folders,
  GearSix,
  House,
  type Icon,
  List,
  Monitor,
  Moon,
  Robot,
  Sparkle,
  Sun,
  X,
} from '@phosphor-icons/react';
import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/i18n.tsx';
import { LOCALE_NAMES, LOCALES, type Locale } from '../i18n/locale.ts';
import type { MessageKey } from '../i18n/messages/zh-Hans.ts';
import { readThemePref, setThemePref, THEME_PREFS, type ThemePref } from '../theme/theme.ts';
import { useImport } from './ImportDialog.tsx';
import { Link, usePath } from './router.tsx';
import { useService } from './service.tsx';

interface NavItem {
  to: string;
  label: MessageKey;
  icon: Icon;
  /** 子页面也算在这一站里，例如 /projects/x 属于「项目」。 */
  match: (path: string) => boolean;
  sub?: { to: string; label: MessageKey };
}

const NAV: NavItem[] = [
  {
    to: '/',
    label: 'nav.overview',
    icon: House,
    match: (p) => p === '/' || p === '/inbox',
    sub: { to: '/inbox', label: 'nav.inbox' },
  },
  { to: '/projects', label: 'nav.projects', icon: Folders, match: (p) => p.startsWith('/projects') },
  { to: '/agents', label: 'nav.agents', icon: Robot, match: (p) => p.startsWith('/agents') },
  { to: '/studio', label: 'nav.studio', icon: Sparkle, match: (p) => p.startsWith('/studio') },
  { to: '/planner', label: 'nav.planner', icon: CalendarCheck, match: (p) => p.startsWith('/planner') },
];

const THEME_ICON: Record<ThemePref, Icon> = { system: Monitor, light: Sun, dark: Moon };

function Brand() {
  return (
    <Link to="/" className="brand-mark">
      <span className="brand-word">Moriium</span>
      <span className="brand-sub">Dashboard</span>
    </Link>
  );
}

/** 侧栏和抽屉里的线路导航。 */
function RailNav({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  const { t } = useI18n();
  return (
    <nav className="rail" aria-label={t('nav.label')}>
      <ol className="rail-list">
        {NAV.map((item) => {
          const active = item.match(path);
          const exact = path === item.to;
          const ItemIcon = item.icon;
          return (
            <li key={item.to} className={`rail-item${active ? ' is-active' : ''}`}>
              <Link
                to={item.to}
                className="rail-link"
                aria-current={exact ? 'page' : undefined}
                onClick={onNavigate}
              >
                <span className="rail-dot" aria-hidden="true" />
                <ItemIcon className="rail-icon" size={20} aria-hidden="true" />
                <span className="rail-label">{t(item.label)}</span>
              </Link>
              {item.sub ? (
                <Link
                  to={item.sub.to}
                  className="rail-sub"
                  aria-current={path === item.sub.to ? 'page' : undefined}
                  onClick={onNavigate}
                >
                  <span className="rail-subdot" aria-hidden="true" />
                  <span className="rail-label">{t(item.sub.label)}</span>
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ThemeButton() {
  const { t } = useI18n();
  const [pref, setPref] = useState<ThemePref>(readThemePref);
  const next = THEME_PREFS[(THEME_PREFS.indexOf(pref) + 1) % THEME_PREFS.length] ?? 'system';
  const ThemeIcon = THEME_ICON[pref];
  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setThemePref(next, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    setPref(next);
  };
  return (
    <button
      type="button"
      className="icon-btn"
      onClick={onClick}
      aria-label={`${t('theme.legend')}：${t(`theme.${pref}`)}`}
      title={`${t('theme.legend')}：${t(`theme.${pref}`)}`}
    >
      <ThemeIcon size={18} aria-hidden="true" />
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

function SideActions({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  const { t } = useI18n();
  const { open: openImport } = useImport();
  return (
    <div className="side-actions">
      <button
        type="button"
        className="side-action side-action-primary"
        onClick={() => {
          onNavigate?.();
          openImport();
        }}
      >
        <DownloadSimple size={18} aria-hidden="true" />
        <span className="rail-label">{t('nav.import')}</span>
      </button>
      <Link
        to="/settings"
        className="side-action"
        aria-current={path === '/settings' ? 'page' : undefined}
        onClick={onNavigate}
      >
        <GearSix size={18} aria-hidden="true" />
        <span className="rail-label">{t('nav.settings')}</span>
      </Link>
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
      <button type="button" className="btn btn-quiet" onClick={retry}>
        {t('banner.retry')}
      </button>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { open: openImport } = useImport();
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
        <RailNav path={path} />
        <SideActions path={path} />
        <div className="side-foot">
          <ThemeButton />
          <LocaleSelect />
        </div>
      </aside>

      <header className="mobilebar">
        <button
          type="button"
          className="icon-btn mobilebar-menu"
          aria-label={t('nav.menu')}
          onClick={() => drawer.current?.showModal()}
        >
          <List size={22} aria-hidden="true" />
        </button>
        <Brand />
        <div className="mobilebar-actions">
          <button
            type="button"
            className="icon-btn"
            aria-label={t('nav.import')}
            onClick={() => openImport()}
          >
            <DownloadSimple size={20} aria-hidden="true" />
          </button>
          <Link to="/settings" className="icon-btn" aria-label={t('nav.settings')}>
            <GearSix size={20} aria-hidden="true" />
          </Link>
        </div>
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
            <button type="button" className="icon-btn" aria-label={t('nav.close')} onClick={closeDrawer}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <RailNav path={path} onNavigate={closeDrawer} />
          <SideActions path={path} onNavigate={closeDrawer} />
          <div className="side-foot">
            <ThemeButton />
            <LocaleSelect />
          </div>
        </div>
      </dialog>

      <div className="main-col">
        <ServiceBanner />
        <main id="main" className="main">
          {children}
        </main>
      </div>

      <nav className="tabbar" aria-label={t('nav.label')}>
        {NAV.map((item) => {
          const ItemIcon = item.icon;
          const active = item.match(path);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`tab${active ? ' is-active' : ''}`}
              aria-current={path === item.to ? 'page' : undefined}
            >
              <ItemIcon size={22} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
              <span>{t(item.label)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
