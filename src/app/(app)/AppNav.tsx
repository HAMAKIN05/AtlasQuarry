'use client';

import {
  BellIcon,
  CalendarCheckIcon,
  CalendarRangeIcon,
  ChevronDownIcon,
  FolderKanbanIcon,
  MessageSquarePlusIcon,
  SearchIcon,
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
/**
 * ナビゲーションの並び。
 *
 * **左端＝アプリの基点**として読まれる。ここにプロジェクトを置く。
 * 「プロジェクトが大枠で全ての起点なのに、ドックも右端で重要感がない」という
 * 指摘への対応。右端は「到着物・補助」として受け取られやすいので要望を置く。
 *
 * **タスクのタブは廃止した。** タスクは必ずプロジェクトに属するので、
 * 全体のタブにすると案件の文脈が切れる。一覧とかんばんはプロジェクトの中の見方にした。
 */
const ITEMS = [
  { href: '/', label: 'プロジェクト', Icon: FolderKanbanIcon, exact: true },
  { href: '/today', label: '今日', Icon: CalendarCheckIcon, exact: false },
  { href: '/schedule', label: '予定', Icon: CalendarRangeIcon, exact: false },
  { href: '/requests', label: '要望', Icon: MessageSquarePlusIcon, exact: false },
  { href: '/settings', label: '設定', Icon: SettingsIcon, exact: false },
] as const;

/**
 * スマホの下部タブからは**設定を外す。**
 * 毎日の仕事の流れに入っていない。設定へは上部の氏名から入る。
 */
const MOBILE_ITEMS = ITEMS.filter((item) => item.href !== '/settings');

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
      {/* スマホ：上部のバー */}
      {/*
        **境目を引く。** 本文だけが内側でスクロールするので、線が無いと
        文字がバーの下でいきなり切られたように見える（実機で「上が切れてる」と
        指摘されたのがこれ。切れているのではなく、境目が見えていなかった）。
      */}
      {/*
        iOS のナビゲーションバー。**半透明＋blur＋1px のヘアライン。**
        下の内容が透けて動くことで「上に乗っている」ことが伝わる。
        影は使わない（iOS のバーは影ではなく境界線で分ける）。
      */}
      <header className="order-1 z-10 flex shrink-0 items-center justify-between gap-2 border-b border-border bg-[oklch(0.98_0.002_286/0.78)] px-5 py-2 backdrop-blur-[20px] backdrop-saturate-150 lg:hidden">
        {/* 右側（氏名＝設定への入口）を先に立てるので、題字は縮んでよい */}
        <Link href="/" className="flex min-h-11 min-w-0 shrink items-center truncate font-bold tracking-tight">
          AtlasQuarry
        </Link>
        <span className="flex shrink-0 items-center gap-1">
          {/* **お知らせは上部に置く。** 下部タブは日々の場所で、通知は届いたときだけ見る */}
          {/* 探すは上部に置く。下部タブは日々の居場所で、検索は必要になったときだけ */}
          <Link
            href="/search"
            aria-label="探す"
            className="grid size-11 place-items-center rounded-full"
          >
            <SearchIcon className="size-[22px] text-muted-foreground" aria-hidden="true" />
          </Link>
          <Link
            href="/notifications"
            aria-label={unreadNotifications > 0 ? `お知らせ ${unreadNotifications}件` : 'お知らせ'}
            className="relative grid size-11 place-items-center rounded-full"
          >
            <BellIcon className="size-[22px] text-muted-foreground" aria-hidden="true" />
            {unreadNotifications > 0 && (
              <span className="absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                {unreadNotifications}
              </span>
            )}
          </Link>
          <Account actor={actor} />
        </span>
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
        **`position: fixed` をやめた。** 外枠が画面の高さに固定され、本文だけが
        内側でスクロールするので、このタブは普通に一番下に置くだけで動かない。
        慣性スクロール中に一瞬切れる、という指摘への対応（`(app)/layout.tsx` を参照）。

        下余白は `max()` で受ける。実機の `env(safe-area-inset-bottom)` は、
        Safari のツールバーが出ている間は **0px**、隠れるとホームインジケータぶんの
        値になる。素で使うと片方の状態でしか合わない。
      */}
      <nav
        aria-label="メインメニュー"
        className="order-3 grid shrink-0 grid-cols-4 border-t border-border bg-[oklch(0.98_0.002_286/0.78)] pb-[max(env(safe-area-inset-bottom),0.375rem)] backdrop-blur-[20px] backdrop-saturate-150 lg:hidden"
      >
        {MOBILE_ITEMS.map(({ href, label, Icon, exact }) => {
          const current = isCurrent(href, exact);
          return (
            <Link
              key={href}
              href={href}
              aria-current={current ? 'page' : undefined}
              className={cn(
                'relative flex min-h-[49px] flex-col items-center justify-center gap-1 px-1 text-[10px] leading-[12px]',
                current ? 'font-bold text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className="size-[22px]" aria-hidden="true" />
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
