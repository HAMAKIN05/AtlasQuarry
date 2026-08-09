'use client';

import {
  CalendarDaysIcon,
  FolderKanbanIcon,
  InboxIcon,
  ListChecksIcon,
  SearchIcon,
  Settings2Icon,
  SparklesIcon,
  XIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

type CommandAction = {
  href: string;
  label: string;
  description: string;
  shortcut?: string;
  Icon: typeof SearchIcon;
};

const ACTIONS: CommandAction[] = [
  { href: '/tasks?new=1', label: 'タスクを追加', description: 'やることをすぐに記録する', shortcut: 'N', Icon: ListChecksIcon },
  { href: '/requests/new', label: '要望を出す', description: '相談・依頼を受信箱に送る', Icon: InboxIcon },
  { href: '/today', label: '自分の仕事', description: '担当中のタスクだけを見る', shortcut: 'T', Icon: ListChecksIcon },
  { href: '/requests', label: '受信箱', description: '判断待ちの要望を整理する', shortcut: 'I', Icon: InboxIcon },
  { href: '/projects', label: 'プロジェクト', description: '進捗と滞留をまとめて見る', Icon: FolderKanbanIcon },
  { href: '/schedule', label: '予定', description: '期限のある仕事を確認する', Icon: CalendarDaysIcon },
  { href: '/search', label: '検索', description: 'タスク・要望・資料を横断して探す', shortcut: '/', Icon: SearchIcon },
  { href: '/settings', label: '設定', description: 'メンバー・表示名・連携を管理する', Icon: Settings2Icon },
];

export function CommandPalette() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
        return;
      }

      if (event.key === 'Escape') setOpen(false);
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return ACTIONS;
    return ACTIONS.filter((action) => `${action.label} ${action.description}`.toLowerCase().includes(normalized));
  }, [query]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <button
        type="button"
        className="command-palette-trigger"
        aria-label="操作を検索（Command K）"
        onClick={() => setOpen(true)}
      >
        <SearchIcon className="size-4" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-left">操作を検索</span>
        <kbd>⌘K</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/25 px-4 pt-[12vh] backdrop-blur-[2px]"
          role="presentation"
          onMouseDown={() => setOpen(false)}
        >
          <section
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="操作を検索"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-border px-4">
              <SparklesIcon className="size-5 shrink-0 text-primary" aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setOpen(false);
                  if (event.key === 'Enter' && filtered[0]) go(filtered[0].href);
                }}
                className="min-h-14 min-w-0 flex-1 border-0 bg-transparent px-0 text-base outline-none focus:ring-0"
                placeholder="タスクを追加、受信箱を開く…"
                aria-label="操作を検索"
              />
              <button type="button" className="icon-button" aria-label="閉じる" onClick={() => setOpen(false)}>
                <XIcon className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="max-h-[52vh] overflow-y-auto p-2">
              {filtered.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-muted-foreground">該当する操作がありません。</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {filtered.map(({ href, label, description, shortcut, Icon }) => (
                    <button
                      key={href}
                      type="button"
                      className="group flex min-h-14 items-center gap-3 rounded-xl px-3 text-left hover:bg-raised focus-visible:bg-raised focus-visible:outline-none"
                      onClick={() => go(href)}
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block text-sm">{label}</strong>
                        <span className="block truncate text-xs text-muted-foreground">{description}</span>
                      </span>
                      {shortcut && <kbd className="hidden rounded bg-raised px-2 py-1 text-xs text-muted-foreground sm:inline">{shortcut}</kbd>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <footer className="flex items-center justify-between border-t border-border bg-raised px-4 py-2 text-xs text-muted-foreground">
              <span>Enter で実行</span>
              <span>Esc で閉じる</span>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
