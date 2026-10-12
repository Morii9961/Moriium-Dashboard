/**
 * P2.3 的页面：先把骨架和空状态做对（02 第 12 节）。真实数据在 P3（导入）和 P4（概览、项目）接上。
 * 项目登记表暂时用协议包里预置的六个项目；P3 起改为从服务端读取。
 */
import { PRESET_PROJECTS } from '@moriium-dashboard/protocol';
import { ArrowRight } from '@phosphor-icons/react';
import { type ChangeEvent, useMemo, useState } from 'react';
import { CopyLine } from '../components/CopyLine.tsx';
import { Segmented } from '../components/Segmented.tsx';
import { type MapLine, TransitMap } from '../components/TransitMap.tsx';
import { useI18n } from '../i18n/i18n.tsx';
import { LOCALE_NAMES, LOCALES, type Locale } from '../i18n/locale.ts';
import { readThemePref, setThemePref, THEME_PREFS, type ThemePref } from '../theme/theme.ts';
import { Link } from './router.tsx';
import { useService } from './service.tsx';
import { EmptyState, PageHeader, SNAPSHOT_PHRASE, SnapshotSteps } from './ui.tsx';

const projectPath = (id: string) => `/projects/${encodeURIComponent(id)}`;

export function OverviewPage() {
  const { t, fullDate } = useI18n();
  const now = useMemo(() => new Date(), []);
  const lines: MapLine[] = PRESET_PROJECTS.map((p) => ({
    href: projectPath(p.id),
    name: p.name,
    stage: null,
    progress: '',
    progressLabel: '',
    pending: 0,
  }));
  return (
    <>
      <PageHeader
        meta={<time dateTime={now.toISOString().slice(0, 10)}>{fullDate(now)}</time>}
        title={t('overview.emptyTitle', { count: PRESET_PROJECTS.length })}
      />
      <TransitMap lines={lines} />
      <SnapshotSteps />
    </>
  );
}

export function InboxPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('nav.inbox')} />
      <EmptyState title={t('inbox.empty')} />
    </>
  );
}

export function ProjectsPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader
        title={t('nav.projects')}
        lede={t('projects.registered', { count: PRESET_PROJECTS.length })}
      />
      <ul className="project-list">
        {PRESET_PROJECTS.map((p) => (
          <li key={p.id}>
            <Link to={projectPath(p.id)} className="project-row">
              <span className="project-row-name">{p.name}</span>
              <span className="project-row-id mono">{p.id}</span>
              <span className="project-row-state">{t('map.noSnapshot')}</span>
              <ArrowRight className="project-row-go" size={18} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function ProjectPage({ id }: { id: string }) {
  const { t } = useI18n();
  const project = PRESET_PROJECTS.find((p) => p.id === id);
  if (!project) {
    return (
      <>
        <PageHeader title={t('project.unknown')} />
        <EmptyState title={t('project.unknownBody', { id })}>
          <Link to="/projects" className="btn">
            {t('nav.projects')}
          </Link>
        </EmptyState>
      </>
    );
  }
  return (
    <>
      <PageHeader meta={<span className="mono">{project.id}</span>} title={project.name} />
      <EmptyState title={t('project.empty')}>
        <p className="empty-body">{t('project.emptyHint')}</p>
        <CopyLine text={SNAPSHOT_PHRASE} lang="zh-Hans" />
      </EmptyState>
    </>
  );
}

export function AgentsPage({ agent }: { agent?: string }) {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={agent ?? t('nav.agents')} />
      <EmptyState title={t('agents.empty')} />
    </>
  );
}

export function StudioPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('nav.studio')} />
      <EmptyState title={t('studio.empty')} />
    </>
  );
}

export function PlannerPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('nav.planner')} />
      <EmptyState title={t('planner.empty')} />
    </>
  );
}

export function ImportsPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t('imports.title')} />
      <EmptyState title={t('imports.empty')} />
      <SnapshotSteps importAction={false} />
    </>
  );
}

export function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const { state } = useService();
  const [pref, setPref] = useState<ThemePref>(readThemePref);
  const onTheme = (p: ThemePref, e: ChangeEvent<HTMLInputElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setThemePref(p, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
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
