/** 一行可复制的文字（例如给 Agent 的指令）。复制结果用 live region 播报。 */
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/i18n.tsx';

export function CopyLine({ text, lang }: { text: string; lang?: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // 剪贴板不可用（例如页面没有焦点）：文字本身可以手动选中复制。
    }
  };

  return (
    <div className="copyline">
      <code className="copyline-text" lang={lang}>
        {text}
      </code>
      <button type="button" className="copyline-btn" onClick={copy}>
        <span>{copied ? t('action.copied') : t('action.copy')}</span>
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? t('action.copied') : ''}
      </span>
    </div>
  );
}
