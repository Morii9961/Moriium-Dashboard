import {
  createContext,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useI18n } from '../i18n/i18n.tsx';
import type { MessageKey } from '../i18n/messages/zh-Hans.ts';
import { requestCreation } from './creation.ts';
import { useResource } from './data.tsx';
import { useImport } from './ImportDialog.tsx';
import { navigate } from './router.tsx';
import { localizedName, type Project } from './types.ts';

type Action =
  | { kind: 'navigate'; to: string }
  | { kind: 'import' }
  | { kind: 'create'; target: 'task' | 'work' };
interface Command {
  id: string;
  label: string;
  keywords: string;
  detail?: string;
  action: Action;
}
const CommandContext = createContext<(() => void) | null>(null);
const normalized = (text: string) => text.normalize('NFKC').toLowerCase();

export function CommandButton({ beforeOpen }: { beforeOpen?: (() => void) | undefined }) {
  const { t } = useI18n();
  const open = useContext(CommandContext);
  return (
    <button
      type="button"
      className="nav-link"
      aria-keyshortcuts="Control+k Meta+k"
      title={`${t('commands.open')} (Ctrl / ⌘ K)`}
      onClick={() => {
        beforeOpen?.();
        open?.();
      }}
    >
      {t('commands.open')}
    </button>
  );
}

export function CommandProvider({ children }: { children: ReactNode }) {
  const { t, locale } = useI18n();
  const { open: importSnapshot } = useImport();
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState('');
  const { data, error, loading } = useResource<{ projects: Project[] }>(opened ? '/api/projects' : null);
  const open = useCallback(() => {
    if (document.querySelector('dialog[open]')) return;
    setQuery('');
    setOpened(true);
    dialog.current?.showModal();
    search.current?.focus();
  }, []);
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 'k' || e.isComposing) return;
      if (dialog.current?.open) {
        e.preventDefault();
        if (!e.repeat) dialog.current.close();
      } else if (!document.querySelector('dialog[open]')) {
        e.preventDefault();
        if (!e.repeat) open();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);

  const commands: Command[] = [
    ...(
      [
        ['/', 'nav.overview'],
        ['/inbox', 'nav.inbox'],
        ['/projects', 'nav.projects'],
        ['/agents', 'nav.agents'],
        ['/studio', 'nav.studio'],
        ['/planner', 'nav.planner'],
        ['/settings', 'nav.settings'],
      ] as const
    ).map(([to, label]) => ({
      id: to,
      label: t(label),
      keywords: to,
      action: { kind: 'navigate' as const, to },
    })),
    { id: 'import', label: t('nav.import'), keywords: 'import snapshot json', action: { kind: 'import' } },
    {
      id: 'new-task',
      label: t('tasks.new'),
      keywords: 'new task',
      action: { kind: 'create', target: 'task' },
    },
    {
      id: 'new-work',
      label: t('works.new'),
      keywords: 'new work',
      action: { kind: 'create', target: 'work' },
    },
    ...(data?.projects ?? []).map((p) => ({
      id: `project:${p.id}`,
      label: localizedName(p, locale),
      detail: p.id,
      keywords: [p.id, p.name, p.nameJa, p.nameEn].join(' '),
      action: { kind: 'navigate' as const, to: `/projects/${encodeURIComponent(p.id)}` },
    })),
  ];
  const terms = normalized(query).trim().split(/\s+/).filter(Boolean);
  const matches = commands.filter((command) =>
    terms.every((term) => normalized(`${command.label} ${command.keywords}`).includes(term)),
  );
  const visible = matches.slice(0, 50);
  const run = (action: Action) => {
    dialog.current?.close();
    if (action.kind === 'navigate') navigate(action.to);
    else if (action.kind === 'import') importSnapshot();
    else requestCreation(action.target);
  };
  const move = (e: KeyboardEvent<HTMLElement>) => {
    if (e.nativeEvent.isComposing || !['ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const buttons = Array.from(
      dialog.current?.querySelectorAll<HTMLButtonElement>('.command-results button') ?? [],
    );
    if (!buttons.length) return;
    e.preventDefault();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index === 0 && e.key === 'ArrowUp') search.current?.focus();
    else
      buttons[
        index < 0
          ? e.key === 'ArrowDown'
            ? 0
            : buttons.length - 1
          : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
      ]?.focus();
  };
  const countKey: MessageKey = matches.length > 50 ? 'commands.more' : 'commands.count';
  return (
    <CommandContext.Provider value={open}>
      {children}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: The backdrop is a pointer shortcut; native Escape also closes the dialog. */}
      <dialog
        ref={dialog}
        className="command-dialog"
        aria-labelledby="command-title"
        onClose={() => setOpened(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <div className="command-inner">
          <header className="command-heading">
            <h2 id="command-title">{t('commands.open')}</h2>
            <button type="button" className="btn btn-quiet" onClick={() => dialog.current?.close()}>
              {t('common.close')}
            </button>
          </header>
          <label htmlFor="command-search">{t('commands.search')}</label>
          <input
            ref={search}
            id="command-search"
            name="command-search"
            type="search"
            value={query}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="command-hint"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              // Search inputs otherwise consume Escape to clear their value before dialog cancellation.
              if (e.key === 'Escape') {
                e.preventDefault();
                dialog.current?.close();
                return;
              }
              move(e);
              if (e.key === 'Enter' && visible[0]) {
                e.preventDefault();
                run(visible[0].action);
              }
            }}
          />
          <p id="command-hint">{t('commands.hint')}</p>
          <p className="sr-only" role="status">
            {t(countKey, { count: matches.length })}
          </p>
          {opened && loading && !data ? <p role="status">{t('common.loading')}</p> : null}
          {opened && error ? <p role="status">{t('projects.loadFailed')}</p> : null}
          <ul className="command-results" onKeyDown={move}>
            {visible.map((command) => (
              <li key={command.id}>
                <button type="button" onClick={() => run(command.action)}>
                  <span>{command.label}</span>
                  {command.detail ? <span className="mono">{command.detail}</span> : null}
                </button>
              </li>
            ))}
          </ul>
          {!matches.length ? <p role="status">{t('commands.empty')}</p> : null}
          {matches.length > 50 ? <p>{t('commands.more', { count: matches.length })}</p> : null}
        </div>
      </dialog>
    </CommandContext.Provider>
  );
}
