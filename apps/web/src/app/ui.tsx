/** 页面的通用骨架：标题区和空状态。 */
import type { ReactNode } from 'react';
import { CopyLine } from '../components/CopyLine.tsx';
import { useI18n } from '../i18n/i18n.tsx';
import { Link } from './router.tsx';

/** 换页后焦点移到页面标题（tabIndex=-1），读屏会读出新页面的名字。 */
export function PageHeader({ title, lede, meta }: { title: ReactNode; lede?: ReactNode; meta?: ReactNode }) {
  return (
    <header className="page-head">
      {meta ? <p className="page-meta">{meta}</p> : null}
      <h1 className="page-title" tabIndex={-1}>
        {title}
      </h1>
      {lede ? <p className="page-lede">{lede}</p> : null}
    </header>
  );
}

export function EmptyState({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <section className="empty">
      <p className="empty-title">{title}</p>
      {children}
    </section>
  );
}

/** Agent 识别的触发语。快照协议的指令是中文，三种界面语言都原样显示。 */
export const SNAPSHOT_PHRASE = '生成项目状态快照';

/** 「从这三步开始」：概览和导入页的空状态共用。 */
export function SnapshotSteps({ importAction = true }: { importAction?: boolean }) {
  const { t } = useI18n();
  return (
    <section className="steps" aria-labelledby="steps-title">
      <h2 id="steps-title" className="steps-title">
        {t('overview.steps')}
      </h2>
      <ol className="steps-list">
        <li>
          <p>{t('overview.step1')}</p>
        </li>
        <li>
          <p>{t('overview.step2')}</p>
          <CopyLine text={SNAPSHOT_PHRASE} lang="zh-Hans" />
        </li>
        <li>
          <p>{t('overview.step3')}</p>
          {importAction ? (
            <Link to="/imports" className="btn btn-primary">
              {t('action.import')}
            </Link>
          ) : null}
        </li>
      </ol>
    </section>
  );
}
