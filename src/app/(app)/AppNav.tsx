'use client';

import {
  FolderKanbanIcon,
  HomeIcon,
  ListChecksIcon,
  MessageSquarePlusIcon,
  SettingsIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ActorRole } from '@/db/schema/enums';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { ROLE_LABELS } from '@/lib/labels';

/**
 * ナビゲーション。
 *
 * PC は左のサイドバー、スマホは画面下のタブ。**同じ5項目**を出す。
 * スマホで下に置くのは、経営者と管理者が片手で持って見るのが主な使われ方だから。
 *
 * 機能名を並べるのではなく、利用者が次に取る行動の順に並べている。
 */
const ITEMS = [
  { href: '/', label: 'ホーム', Icon: HomeIcon, exact: true },
  { href: '/requests', label: '要望', Icon: MessageSquarePlusIcon, exact: false },
  { href: '/tasks', label: 'タスク', Icon: ListChecksIcon, exact: false },
  { href: '/projects', label: 'プロジェクト', Icon: FolderKanbanIcon, exact: false },
  { href: '/settings', label: '設定', Icon: SettingsIcon, exact: false },
] as const;

type Props = {
  actor: { id: string; name: string; role: ActorRole };
  pendingRequests: number;
};

export function AppNav({ actor, pendingRequests }: Props) {
  const pathname = usePathname();
  const isCurrent = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* スマホ：上部のバー */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-card px-4 py-2 lg:hidden">
        <Link href="/" className="flex min-h-11 items-center font-bold tracking-tight">
          AtlasQuarry
        </Link>
        <Account actor={actor} />
      </header>

      {/* PC：左のサイドバー */}
      <nav
        aria-label="メインメニュー"
        className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-5 lg:border-r lg:bg-card lg:p-4"
      >
        <Link href="/" className="text-lg font-bold tracking-tight">
          AtlasQuarry
        </Link>

        <ul className="flex flex-col gap-0.5">
          {ITEMS.map(({ href, label, Icon, exact }) => {
            const current = isCurrent(href, exact);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={current ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center gap-2 rounded-md px-3 text-sm',
                    current
                      ? 'bg-accent font-bold text-accent-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1">{label}</span>
                  {href === '/requests' && pendingRequests > 0 && (
                    <Badge tone="danger" aria-label={`判断待ち ${pendingRequests} 件`}>
                      {pendingRequests}
                    </Badge>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-auto border-t pt-3">
          <Account actor={actor} stacked />
        </div>
      </nav>

      {/* スマホ：下部のタブ。片手で持って親指が届く位置 */}
      <nav
        aria-label="メインメニュー"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {ITEMS.map(({ href, label, Icon, exact }) => {
          const current = isCurrent(href, exact);
          return (
            <Link
              key={href}
              href={href}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'relative flex min-h-15 flex-col items-center justify-center gap-0.5 px-1 text-[0.7rem]',
                current ? 'font-bold text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
              {href === '/requests' && pendingRequests > 0 && (
                <Badge
                  tone="danger"
                  aria-label={`判断待ち ${pendingRequests} 件`}
                  className="absolute top-1.5 left-1/2 ml-2 px-1.5"
                >
                  {pendingRequests}
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function Account({
  actor,
  stacked = false,
}: {
  actor: { name: string; role: ActorRole };
  stacked?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <div className={cn('flex min-w-0 items-center gap-2 text-sm', stacked && 'flex-wrap')}>
      <span className="truncate font-semibold">{actor.name}</span>
      <Badge tone="neutral">{ROLE_LABELS[actor.role]}</Badge>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api.post('/auth/logout');
          } finally {
            // 通信に失敗しても画面はログインへ送る。セッションが生きていれば再度弾かれるだけ
            router.replace('/login');
            router.refresh();
          }
        }}
      >
        ログアウト
      </Button>
    </div>
  );
}
