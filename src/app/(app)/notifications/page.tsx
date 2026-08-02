import Link from 'next/link';

import { EmptyState } from '@/components/app-ui';
import { listNotifications, markAllRead } from '@/domain/notification/service';
import { requireActor } from '@/lib/auth/cookies';
import { formatRelative } from '@/lib/format';

export const metadata = { title: 'お知らせ | AtlasQuarry' };

/**
 * お知らせ（F-09 のアプリ内通知）。
 *
 * **開いたら既読にする。** 「既読にする」ボタンを押させない。
 * 3人の道具で、未読の管理そのものを仕事にしない。
 */
export default async function NotificationsPage() {
  const actor = await requireActor();
  const items = await listNotifications(actor.id);
  await markAllRead(actor.id);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="large-title">お知らせ</h1>

      {items.length === 0 ? (
        <EmptyState
          title="お知らせはありません"
          description="タスクが割り当てられたときや、要望に判断がついたときにここへ届きます。"
        />
      ) : (
        <div className="card-list">
          {items.map((n) => {
            const content = (
              <>
                <span className="flex items-start gap-2">
                  {!n.isRead && (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="未読" />
                  )}
                  <span className="card-title min-w-0 flex-1">{n.title}</span>
                  {n.url && <span className="chevron" aria-hidden="true" />}
                </span>
                <span className="mt-1 block text-[15px] whitespace-pre-wrap text-muted-foreground">
                  {n.body}
                </span>
                <span className="stack-meta mt-1.5">{formatRelative(n.createdAt)}</span>
              </>
            );

            return n.url ? (
              <Link key={n.id} href={n.url} className="card">
                {content}
              </Link>
            ) : (
              <div key={n.id} className="card">
                {content}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
