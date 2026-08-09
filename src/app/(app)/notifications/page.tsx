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
    <div className="notification-workspace">
      <header className="notification-hero">
        <div>
          <p className="eyebrow">Activity inbox</p>
          <h1>お知らせ</h1>
          <p>自分に関係する変化だけをまとめています。開いた時点で確認済みになります。</p>
        </div>
        <span className="notification-count">{items.length}件</span>
      </header>

      {items.length === 0 ? (
        <section className="section-card notification-empty-card">
          <EmptyState
            title="お知らせはありません"
            description="タスクが割り当てられたときや、要望に判断がついたときにここへ届きます。"
          />
        </section>
      ) : (
        <section className="section-card notification-list">
          <div className="section-card-header">
            <div>
              <p className="section-eyebrow">最近の変化</p>
              <h2>通知一覧</h2>
            </div>
          </div>
          {items.map((n) => {
            const content = (
              <>
                <span className="notification-title-row">
                  {!n.isRead && (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="未読" />
                  )}
                  <span className="notification-title">{n.title}</span>
                  {n.url && <span className="chevron" aria-hidden="true" />}
                </span>
                <span className="notification-body">
                  {n.body}
                </span>
                <span className="notification-meta">{formatRelative(n.createdAt)}</span>
              </>
            );

            return n.url ? (
              <Link key={n.id} href={n.url} className="notification-card">
                {content}
              </Link>
            ) : (
              <div key={n.id} className="notification-card">
                {content}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
