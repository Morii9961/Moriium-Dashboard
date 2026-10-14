import { useI18n } from '../i18n/i18n.tsx';
import { TasksPanel } from './Tasks.tsx';
import { TodayPanel, useToday } from './Today.tsx';
import { PageHeader } from './ui.tsx';
export function PlannerPage() {
  const { t } = useI18n();
  const { data, error } = useToday();
  return (
    <>
      <PageHeader title={t('nav.planner')} />
      {data ? (
        <TodayPanel key={data.date} day={data} />
      ) : (
        <p>{t(error ? 'projects.loadFailed' : 'common.loading')}</p>
      )}
      <TasksPanel />
    </>
  );
}
