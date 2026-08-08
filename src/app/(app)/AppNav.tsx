'use client';

import {
  BellIcon,
  CalendarDaysIcon,
  FolderKanbanIcon,
  InboxIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  SearchIcon,
  Settings2Icon,
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

const ITEMS = [
  { href: '/', label: 'プロジェクト', caption: '全体を俯瞰', Icon: FolderKanbanIcon, exact: true },
  { href: '/today', label: '今日', caption: '次にやること', Icon: LayoutDashboardIcon, exact: false },
  { href: '/schedule', label: '予定', caption: '工程と期限', Icon: CalendarDaysIcon, exact: false },
  { href: '/requests', label: '要望', caption: '改善の入口', Icon: InboxIcon, exact: false },
] as const;

type Props = {
  actor: { id: string; name: string; role: ActorRole };
  pendingRequests: number;
  unreadNotifications: number;
};

export function AppNav({ actor, pendingRequests, unreadNotifications }: Props) {
  const pathname = usePathname();
  const isCurrent = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <header className="mobile-topbar lg:hidden">
        <Link href="/" className="brand-mark" aria-label="AtlasQuarry ホーム">
          <span className="brand-symbol">AQ</span>
          <span className="brand-name">AtlasQuarry</span>
        </Link>

        <div className="flex items-center gap-1">
          <Link href="/search" className="icon-button" aria-label="検索">
            <SearchIcon className="size-5" aria-hidden="true" />
          </Link>
          <Link href="/notifications" className="icon-button relative" aria-label="お知らせ">
            <BellIcon className="size-5" aria-hidden="true" />
            {unreadNotifications > 0 && <span className="notification-dot" />}
          </Link>
          <Link href="/settings" className="avatar avatar-small" aria-label={`${actor.name}の設定`}>
            {actor.name.slice(0, 1)}
          </Link>
        </div>
      </header>

      <nav aria-label="メインメニュー" className="desktop-sidebar hidden lg:flex">
        <div className="flex items-center gap-3 px-3">
          <span className="brand-symbol brand-symbol-large">AQ</span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] font-bold tracking-tight text-white">AtlasQuarry</span>
            <span className="text-[11px] text-slate-400">開発ワークスペース</span>
          </span>
        </div>

        <div className="sidebar-label">ワークスペース</div>
        <ul className="flex flex-col gap-1">
          {ITEMS.map(({ href, label, caption, Icon, exact }) => {
            const current = isCurrent(href, exact);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={current ? 'page' : undefined}
                  className={cn('sidebar-link', current && 'sidebar-link-current')}
                >
                  <Icon className="size-[18px] shrink-0" aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[14px] font-semibold">{label}</span>
                    <span className="truncate text-[11px] text-slate-500">{caption}</span>
                  </span>
                  {href === '/requests' && pendingRequests > 0 && (
                    <Badge tone="danger" className="shrink-0">
                      {pendingRequests}
                    </Badge>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-auto flex flex-col gap-3 border-t border-slate-800 pt-4">
          <Link href="/settings" className={cn('sidebar-link', pathname.startsWith('/settings') && 'sidebar-link-current')}>
            <Settings2Icon className="size-[18px] shrink-0" aria-hidden="true" />
            <span className="flex flex-1 flex-col">
              <span className="text-[14px] font-semibold">設定</span>
              <span className="text-[11px] text-slate-500">メンバー・連携・表示</span>
            </span>
          </Link>
          <Account actor={actor} />
        </div>
      </nav>

      <nav aria-label="メインメニュー" className="mobile-bottom-nav lg:hidden">
        {ITEMS.map(({ href, label, Icon, exact }) => {
          const current = isCurrent(href, exact);
          return (
            <Link
              key={href}
              href={href}
              aria-current={current ? 'page' : undefined}
              className={cn('mobile-nav-item', current && 'mobile-nav-item-current')}
            >
              <Icon className="size-[20px]" aria-hidden="true" />
              <span>{label}</span>
              {href === '/requests' && pendingRequests > 0 && <span className="mobile-nav-badge">{pendingRequests}</span>}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function Account({ actor }: { actor: { name: string; role: ActorRole } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-900 px-3 py-2.5">
      <span className="avatar avatar-medium">{actor.name.slice(0, 1)}</span>
      <Link href="/settings" className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-semibold text-white">{actor.name}</span>
        <span className="truncate text-[11px] text-slate-400">{ROLE_LABELS[actor.role]}</span>
      </Link>
      <button
        type="button"
        className="grid size-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white"
        aria-label="ログアウト"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api.post('/auth/logout');
          } finally {
            router.replace('/login');
            router.refresh();
          }
        }}
      >
        <LogOutIcon className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
