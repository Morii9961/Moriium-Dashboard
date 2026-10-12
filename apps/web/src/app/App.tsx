/** 路由表和页面标题。 */
import { type ReactNode, useEffect } from 'react';
import { useI18n } from '../i18n/i18n.tsx';
import type { MessageKey } from '../i18n/messages/zh-Hans.ts';
import { ErrorBoundary } from './ErrorBoundary.tsx';
import {
  AgentsPage,
  ImportsPage,
  InboxPage,
  NotFoundPage,
  OverviewPage,
  PlannerPage,
  ProjectPage,
  ProjectsPage,
  SettingsPage,
  StudioPage,
} from './pages.tsx';
import { type Route, resolveRoute, usePath } from './router.tsx';
import { Shell } from './Shell.tsx';

type RouteName =
  | 'overview'
  | 'inbox'
  | 'projects'
  | 'project'
  | 'agents'
  | 'agent'
  | 'studio'
  | 'planner'
  | 'imports'
  | 'settings';

export const ROUTES: readonly Route<RouteName>[] = [
  { name: 'overview', pattern: '/' },
  { name: 'inbox', pattern: '/inbox' },
  { name: 'projects', pattern: '/projects' },
  { name: 'project', pattern: '/projects/:id' },
  { name: 'agents', pattern: '/agents' },
  { name: 'agent', pattern: '/agents/:agent' },
  { name: 'studio', pattern: '/studio' },
  { name: 'planner', pattern: '/planner' },
  { name: 'imports', pattern: '/imports' },
  { name: 'settings', pattern: '/settings' },
];

const TITLE: Record<RouteName, MessageKey> = {
  overview: 'nav.overview',
  inbox: 'nav.inbox',
  projects: 'nav.projects',
  project: 'nav.projects',
  agents: 'nav.agents',
  agent: 'nav.agents',
  studio: 'nav.studio',
  planner: 'nav.planner',
  imports: 'imports.title',
  settings: 'nav.settings',
};

export function App() {
  const { t } = useI18n();
  const path = usePath();
  const match = resolveRoute(ROUTES, path);

  useEffect(() => {
    const page = match ? t(TITLE[match.route.name]) : t('notFound.title');
    document.title = `${page} · ${t('app.name')}`;
  }, [match, t]);

  let page: ReactNode;
  switch (match?.route.name) {
    case 'overview':
      page = <OverviewPage />;
      break;
    case 'inbox':
      page = <InboxPage />;
      break;
    case 'projects':
      page = <ProjectsPage />;
      break;
    case 'project':
      page = <ProjectPage id={match.params.id ?? ''} />;
      break;
    case 'agents':
      page = <AgentsPage />;
      break;
    case 'agent':
      page = <AgentsPage agent={match.params.agent ?? ''} />;
      break;
    case 'studio':
      page = <StudioPage />;
      break;
    case 'planner':
      page = <PlannerPage />;
      break;
    case 'imports':
      page = <ImportsPage />;
      break;
    case 'settings':
      page = <SettingsPage />;
      break;
    default:
      page = <NotFoundPage path={path} />;
  }

  return (
    <Shell>
      <ErrorBoundary key={path}>{page}</ErrorBoundary>
    </Shell>
  );
}
