/**
 * 和快照有关的页面：概览、项目列表、项目详情、导入记录（P3）。
 * 概览和项目页的完整内容（需要你决定、新鲜度、历史、验收）在 P4；这里先让导入的快照显示出来。
 */
import { useMemo } from 'react';
import { CopyLine } from '../components/CopyLine.tsx';
import { useI18n } from '../i18n/i18n.tsx';
import type { MessageKey } from '../i18n/messages/zh-Hans.ts';
import { useResource } from './data.tsx';
import { useImport } from './ImportDialog.tsx';
import { DetailHead, ProjectDetailView } from './ProjectDetail.tsx';
import { ProjectList } from './ProjectList.tsx';
import { Link } from './router.tsx';
import type { BatchView, FileOutcome, ProjectWithCurrent } from './types.ts';
import { EmptyState, PageHeader, SNAPSHOT_PHRASE, SnapshotSteps } from './ui.tsx';
import { BandHead } from './ZoneSections.tsx';

const projectPath = (id: string) => `/projects/${encodeURIComponent(id)}`;

function useProjects() {
  return useResource<{ projects: ProjectWithCurrent[] }>('/api/projects');
}

/** 还没读到登记表时的占位：读取中，或连不上服务时说明会自动重试。 */
function RegistryPending({ failed }: { failed: boolean }) {
  const { t } = useI18n();
  return <p className="page-lede">{failed ? t('projects.loadFailed') : t('common.loading')}</p>;
}

function ImportButton({ projectId }: { projectId?: string }) {
  const { t } = useI18n();
  const { open } = useImport();
  return (
    <button type="button" className="btn btn-primary" onClick={() => open(projectId)}>
      {t('action.import')}
    </button>
  );
}

export function ProjectsPage() {
  const { t } = useI18n();
  const now = useMemo(() => new Date(), []);
  const { data, error } = useProjects();
  if (!data)
    return (
      <>
        <PageHeader title={t('nav.projects')} />
        <RegistryPending failed={!!error} />
      </>
    );
  const active = data.projects.filter((p) => p.attention !== 'paused' && p.attention !== 'archived');
  return (
    <div className="page">
      <section className="block" aria-labelledby="h-projects">
        <BandHead
          title={t('nav.projects')}
          level={1}
          id="h-projects"
          numbers={[
            [t('zone.registered'), data.projects.length],
            [t('zone.inProgress'), active.length],
          ]}
        >
          <div className="head-actions">
            <Link to="/settings#set-projects" className="btn btn-quiet">
              {t('manual.register')}
            </Link>
          </div>
        </BandHead>
        <ProjectList projects={data.projects} now={now} />
      </section>
    </div>
  );
}

export function ProjectPage({ id }: { id: string }) {
  const { t } = useI18n();
  const now = useMemo(() => new Date(), []);
  const { data, error } = useProjects();
  if (!data) {
    return (
      <>
        <PageHeader meta={<span className="mono">{id}</span>} title={t('nav.projects')} />
        <RegistryPending failed={!!error} />
      </>
    );
  }
  const project = data.projects.find((p) => p.id === id);
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
    <div className="page detail">
      <DetailHead
        project={project}
        now={now}
        actions={project.tracking === 'protocol' ? <ImportButton projectId={project.id} /> : null}
      />
      {project.current || project.tracking === 'manual' ? null : (
        <div className="g">
          <div className="main">
            <EmptyState title={t('project.empty')}>
              <p className="empty-body">{t('project.emptyHint')}</p>
              <CopyLine text={SNAPSHOT_PHRASE} lang="zh-Hans" />
            </EmptyState>
          </div>
        </div>
      )}
      <ProjectDetailView key={project.id} projectId={project.id} />
    </div>
  );
}

function outcomeKey(r: FileOutcome): MessageKey {
  if (r.outcome === 'imported') return `import.outcome.${r.placement}`;
  if (r.outcome === 'skipped') return `import.outcome.${r.reason}`;
  return `import.outcome.${r.outcome}`;
}

export function ImportsPage() {
  const { t, locale } = useI18n();
  const { data } = useResource<{ batches: BatchView[] }>('/api/imports');
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  return (
    <div className="page imports-page">
      <BandHead
        title={t('imports.title')}
        level={1}
        id="h-imports"
        numbers={[[t('zone.batches'), data?.batches.length ?? 0]]}
      >
        <div className="head-actions">
          <ImportButton />
        </div>
      </BandHead>
      <div className="g">
        <div className="main wide">
          {data && data.batches.length > 0 ? (
            <ol className="batch-list">
              {data.batches.map((b) => (
                <li key={b.id} className={`batch${b.undoneAt ? ' is-undone' : ''}`}>
                  <details>
                    <summary>
                      <time dateTime={b.at}>{fmt.format(new Date(b.at))}</time>
                      <span>
                        {t('imports.batchLine', { imported: b.importedCount, skipped: b.skippedCount })}
                      </span>
                      {b.undoneAt ? <span className="batch-tag">{t('imports.undoneTag')}</span> : null}
                    </summary>
                    <ul className="iresult-list">
                      {b.results.map((r, i) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: 导入记录里的结果不会重排，同名文件只能靠位置区分。
                        <li key={`${r.fileName}-${i}`} className={`iresult-row is-${r.outcome}`}>
                          <span className="mono">{r.fileName}</span>
                          <span>{t(outcomeKey(r))}</span>
                          {'projectId' in r ? (
                            <Link to={projectPath(r.projectId)} className="iresult-link">
                              {r.projectId}
                            </Link>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ))}
            </ol>
          ) : (
            <>
              <EmptyState title={t('imports.empty')} />
              <SnapshotSteps importAction={false} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
