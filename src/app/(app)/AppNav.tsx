'use client';

import {
  ChevronDownIcon,
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

/**
 * スマホの下部タブからは**設定を外す。**
 *
 * 毎日の仕事は「把握する・要望を出す／判断する・進める・案件を眺める」の4つで、
 * 設定はその流れに入っていない。日常の導線に混ぜると、5つのうちどれが仕事用なのかを
 * 毎回選ばせることになる。設定へは上部の氏名から入る。
 */
const MOBILE_ITEMS = ITEMS.filter((item) => item.href !== '/settings');

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
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 bg-background/80 px-4 py-2 backdrop-blur-md lg:hidden">
        {/* 右側（氏名＝設定への入口）を先に立てるので、題字は縮んでよい */}
        <Link href="/" className="flex min-h-11 min-w-0 shrink items-center truncate font-bold tracking-tight">
          AtlasQuarry
        </Link>
        <Account actor={actor} />
      </header>

      {/* PC：左のサイドバー */}
      <nav
        aria-label="メインメニュー"
        className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:gap-6 lg:p-4 lg:shadow-[1px_0_0_var(--border)]"
      >
        <Link href="/" className="flex items-center gap-2 text-[1.05rem] font-bold tracking-tight">
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
                      ? 'bg-primary-soft font-bold text-primary'
                      : 'text-muted-foreground hover:bg-hover hover:text-foreground',
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

        <div className="mt-auto pt-3 shadow-[0_-1px_0_var(--border)]">
          <Account actor={actor} stacked />
        </div>
      </nav>

      {/* スマホ：下部のタブ。片手で持って親指が届く位置 */}
      {/*
        **半透明をやめて不透明にする。** 下に文字が透けると「固定されていない／
        切れている」ように見える。

        下余白は `max()` で受ける。実機の `env(safe-area-inset-bottom)` は、
        Safari のツールバーが出ている間は **0px**、隠れるとホームインジケータぶんの
        値になる。素で使うと片方の状態でしか合わないので、下限を持たせる。
      */}
      <nav
        aria-label="メインメニュー"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 bg-background pb-[max(env(safe-area-inset-bottom),0.375rem)] shadow-[0_-1px_0_var(--border)] lg:hidden"
      >
        {MOBILE_ITEMS.map(({ href, label, Icon, exact }) => {
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

  /*
   * スマホの上部は**氏名そのものを設定への入口**にする。
   * アイコンだけだと何が起きるか分からず、文字だけだと押せることが伝わらないので、
   * 氏名＋下向き矢印を 44px 以上の1つの押し先にまとめる。
   * ログアウトはここから外し、設定画面の最下部へ移した（誤タップ防止）。
   */
  if (!stacked) {
    return (
      <Link
        href="/settings"
        aria-label={`${actor.name}の設定`}
        className="flex min-h-11 min-w-0 shrink items-center gap-1 rounded-md px-2 text-sm hover:bg-hover"
      >
        <span className="min-w-0 truncate font-semibold">{actor.name}</span>
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    );
  }

  return (
    <div className={cn('flex min-w-0 items-center gap-2 text-sm', stacked && 'flex-wrap')}>
      <span className="min-w-0 truncate font-semibold">{actor.name}</span>
      {/*
        役割バッジはスマホでは出さない。**3人しかいない組織で、自分の役割を
        毎画面で知らせる必要がない。** 幅を食って右端を押し出す原因にもなっていた。
      */}
      <span className={cn('hidden shrink-0', stacked ? 'inline-flex' : 'lg:inline-flex')}>
        <Badge tone="neutral">{ROLE_LABELS[actor.role]}</Badge>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        /*
         * **`shrink-0` を外す。** 200px まで押し込んだとき、ページ全体で
         * 唯一これだけが縮まなかった。縮まない要素が1つでもあると、
         * iOS Safari は shrink-to-fit でレイアウト自体を広げてしまう。
         */
        className="min-w-0 shrink"
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
