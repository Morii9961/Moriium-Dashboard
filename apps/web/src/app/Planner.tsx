import { useI18n } from '../i18n/i18n.tsx';
import { TasksPanel } from './Tasks.tsx';
import { TodayPanel, useToday } from './Today.tsx';
import { PageHeader } from './ui.tsx';
export function PlannerPage() {
  const { t } = useI18n();
  const { data, error } = useToday();
  return (
    <div className="page">
      <PageHeader title={t('nav.planner')} />
      {data ? (
        <TodayPanel key={data.date} day={data} />
      ) : (
        <p className="loading-line">{t(error ? 'projects.loadFailed' : 'common.loading')}</p>
      )}
      <div className="g planner-tasks">
        <div className="main wide">
          <TasksPanel />
        </div>
      </div>
    </div>
  );
}
