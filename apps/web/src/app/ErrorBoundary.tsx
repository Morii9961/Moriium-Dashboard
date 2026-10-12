/**
 * 页面级错误边界：一页出错只影响这一页，导航和其他页面照常可用。
 * 外壳给它传 key={路径}，换页时自动复位。
 */
import { Component, type ReactNode } from 'react';
import { useI18n } from '../i18n/i18n.tsx';

function ErrorView({ error }: { error: Error }) {
  const { t } = useI18n();
  return (
    <section className="page-error" role="alert">
      <h1 className="page-title">{t('error.title')}</h1>
      <p className="page-lede">{t('error.body')}</p>
      <button type="button" className="btn" onClick={() => window.location.reload()}>
        {t('error.reload')}
      </button>
      <details className="page-error-details">
        <summary>{t('error.details')}</summary>
        {/* 只显示错误信息本身，不显示堆栈里的本机路径。 */}
        <pre className="mono">{error.message}</pre>
      </details>
    </section>
  );
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  override componentDidCatch(error: unknown) {
    console.error('页面渲染出错：', error);
  }

  override render() {
    return this.state.error ? <ErrorView error={this.state.error} /> : this.props.children;
  }
}
