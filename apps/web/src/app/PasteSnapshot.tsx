import { type FormEvent, useId } from 'react';
import { useI18n } from '../i18n/i18n.tsx';

export function PasteSnapshot({
  text,
  onChange,
  onPreview,
  disabled,
  tooLarge,
}: {
  text: string;
  onChange: (text: string) => void;
  onPreview: () => void;
  disabled: boolean;
  tooLarge: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!disabled && text.trim()) onPreview();
  };
  return (
    <details className="paste-snapshot">
      <summary>{t('import.paste')}</summary>
      <form onSubmit={submit}>
        <label htmlFor={id}>{t('import.pasteLabel')}</label>
        <p id={`${id}-hint`}>{t('import.pasteHint')}</p>
        <textarea
          id={id}
          name="snapshot-json"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={`${id}-hint${tooLarge ? ` ${id}-error` : ''}`}
          aria-invalid={tooLarge || undefined}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          rows={8}
          disabled={disabled}
        />
        {tooLarge ? (
          <p id={`${id}-error`} role="alert">
            {t('import.pasteTooLarge')}
          </p>
        ) : null}
        <button type="submit" className="btn" disabled={disabled || !text.trim()}>
          {t('import.previewPaste')}
        </button>
      </form>
    </details>
  );
}
