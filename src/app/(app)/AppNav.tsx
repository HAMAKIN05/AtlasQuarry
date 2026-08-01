'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import type { ActorRole } from '@/db/schema/enums';
import { api } from '@/lib/api/client';
import { ROLE_LABELS } from '@/lib/labels';

/**
 * ナビゲーション。
 *
 * PC は左のサイドバー、スマホは画面下のタブ。**同じ5項目**を出す。
 * スマホで下に置くのは、経営者と上司が片手で持って見るのが主な使われ方だから。
 *
 * 機能名を並べるのではなく、利用者が次に取る行動の順に並べている。
 */
const ITEMS = [
  { href: '/', label: 'ホーム', icon: '⌂', exact: true },
  { href: '/requests', label: '要望', icon: '✎', exact: false },
  { href: '/tasks', label: 'タスク', icon: '☑', exact: false },
  { href: '/projects', label: 'プロジェクト', icon: '▤', exact: false },
  { href: '/settings', label: '設定', icon: '⚙', exact: false },
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
      <header className="topbar">
        <Link href="/" className="topbar-brand">
          AtlasQuarry
        </Link>
        <AccountMenu actor={actor} />
      </header>

      <nav className="sidenav" aria-label="メインメニュー">
        <Link href="/" className="sidenav-brand">
          AtlasQuarry
        </Link>

        <ul className="sidenav-list">
          {ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="navlink"
                aria-current={isCurrent(item.href, item.exact) ? 'page' : undefined}
              >
                <span className="navlink-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="navlink-label">{item.label}</span>
                {item.href === '/requests' && pendingRequests > 0 && (
                  <span className="navlink-badge" aria-label={`判断待ち ${pendingRequests} 件`}>
                    {pendingRequests}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>

        <div className="sidenav-foot">
          <AccountMenu actor={actor} />
        </div>
      </nav>

      <nav className="tabbar" aria-label="メインメニュー">
        {ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="tab"
            aria-current={isCurrent(item.href, item.exact) ? 'page' : undefined}
          >
            <span className="tab-icon" aria-hidden="true">
              {item.icon}
            </span>
            <span className="tab-label">{item.label}</span>
            {item.href === '/requests' && pendingRequests > 0 && (
              <span className="tab-badge" aria-label={`判断待ち ${pendingRequests} 件`}>
                {pendingRequests}
              </span>
            )}
          </Link>
        ))}
      </nav>
    </>
  );
}

function AccountMenu({ actor }: { actor: { name: string; role: ActorRole } }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <div className="account">
      <span className="account-name">{actor.name}</span>
      <span className="account-role">{ROLE_LABELS[actor.role]}</span>
      <button
        type="button"
        className="btn-quiet"
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
      </button>
    </div>
  );
}
