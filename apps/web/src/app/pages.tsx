/**
 * 页面。P2.3 先把骨架和空状态做对（02 第 12 节）；P3 起项目登记表从服务端读取，
 * 快照导入后概览和项目页显示真实状态。
 */
import { useState } from 'react';
import { Segmented } from '../components/Segmented.tsx';
import { useI18n } from '../i18n/i18n.tsx';
import { LOCALE_NAMES, LOCALES, type Locale } from '../i18n/locale.ts';
import { readThemePref, setThemePref, THEME_PREFS, type ThemePref } from '../theme/theme.ts';
import { useAuth } from './auth.tsx';
import { LocalRepositories } from './localScan.tsx';
import { ProjectRegistry } from './registry.tsx';
import { Link } from './router.tsx';
import { useService } from './service.tsx';
import { EmptyState, PageHeader } from './ui.tsx';

export function InboxPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('nav.inbox')} />
      <EmptyState title={t('inbox.empty')} />
    </>
  );
}

export function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const { state } = useService();
  const { account, logout } = useAuth();
  const [pref, setPref] = useState<ThemePref>(readThemePref);
  const onTheme = (p: ThemePref) => {
    setThemePref(p);
    setPref(p);
  };
  const health = state.kind === 'up' ? state.health : null;
  const backup = health?.lastBackupAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(health.lastBackupAt),
      )
    : t('settings.noBackup');

  return (
    <>
      <PageHeader title={t('nav.settings')} />
      <section className="settings-group" aria-labelledby="set-display">
        <h2 id="set-display" className="settings-title">
          {t('settings.display')}
        </h2>
        <div className="settings-row">
          <Segmented
            legend={t('theme.legend')}
            showLegend
            name="settings-theme"
            value={pref}
            onChange={onTheme}
            options={THEME_PREFS.map((p) => [p, t(`theme.${p}`)] as const)}
          />
        </div>
        <div className="settings-row">
          <Segmented
            legend={t('locale.legend')}
            showLegend
            name="settings-locale"
            value={locale}
            onChange={(l: Locale) => setLocale(l)}
            options={LOCALES.map((l) => [l, LOCALE_NAMES[l]] as const)}
          />
        </div>
      </section>

      <ProjectRegistry />

      <LocalRepositories />

      <section className="settings-group" aria-labelledby="set-data">
        <h2 id="set-data" className="settings-title">
          {t('settings.data')}
        </h2>
        <div className="page-actions settings-actions">
          <Link className="btn" to="/usage">
            {t('usage.title')}
          </Link>
          <a className="btn" href="/api/export" download>
            {t('export.all')}
          </a>
          <a className="btn" href="/api/export/snapshots" download>
            {t('export.snapshots')}
          </a>
        </div>
      </section>

      <section className="settings-group" aria-labelledby="set-service">
        <h2 id="set-service" className="settings-title">
          {t('settings.service')}
        </h2>
        <dl className="settings-dl">
          <dt>{t('settings.status')}</dt>
          <dd>
            <span className={`dot-state is-${state.kind}`} aria-hidden="true" />
            {health ? t('settings.connected') : t('settings.offline')}
          </dd>
          {health ? (
            <>
              <dt>{t('settings.version')}</dt>
              <dd className="mono">{health.version}</dd>
              <dt>{t('settings.schema')}</dt>
              <dd className="mono">{health.schemaVersion ?? '—'}</dd>
              <dt>{t('settings.lastBackup')}</dt>
              <dd>{backup}</dd>
            </>
          ) : null}
        </dl>
      </section>

      {account ? (
        <section className="settings-group" aria-labelledby="set-account">
          <h2 id="set-account" className="settings-title">
            {t('settings.account')}
          </h2>
          <dl className="settings-dl">
            <dt>{t('settings.signedInAs')}</dt>
            <dd className="mono">{account.login}</dd>
            <dt>{t('settings.sessionEnds')}</dt>
            <dd>
              {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
                new Date(account.expiresAt),
              )}
            </dd>
          </dl>
          <div className="page-actions settings-actions">
            <button type="button" className="btn" onClick={() => void logout()}>
              {t('auth.logout')}
            </button>
            <button type="button" className="btn btn-quiet" onClick={() => void logout(true)}>
              {t('auth.logoutAll')}
            </button>
          </div>
        </section>
      ) : null}

      <section className="settings-group" aria-labelledby="set-about">
        <h2 id="set-about" className="settings-title">
          {t('settings.about')}
        </h2>
        <p className="settings-note">{t('settings.fonts')}</p>
      </section>
    </>
  );
}

export function NotFoundPage({ path }: { path: string }) {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('notFound.title')} />
      <EmptyState title={t('notFound.body', { path })}>
        <Link to="/" className="btn">
          {t('notFound.back')}
        </Link>
      </EmptyState>
    </>
  );
}
