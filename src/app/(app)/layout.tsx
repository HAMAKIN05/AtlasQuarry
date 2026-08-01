import Link from 'next/link';
import { redirect } from 'next/navigation';

import { currentActor } from '@/lib/auth/cookies';
import { ROLE_LABELS } from '@/lib/format';

import { LogoutButton } from './LogoutButton';

/**
 * 認証必須の画面すべての外枠。
 *
 * 未認証なら /login へリダイレクトする（受入基準 5.1）。
 * ここで一括して弾くことで、各ページが認証チェックを書き忘れる余地をなくす。
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (!actor) redirect('/login');

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link href="/" className="app-brand">
          AtlasQuarry
        </Link>
        <nav className="app-nav" aria-label="メインナビゲーション">
          <Link href="/">ダッシュボード</Link>
          <Link href="/products">プロダクト</Link>
          <Link href="/board">かんばん</Link>
        </nav>
        <div className="app-account">
          <Link href="/settings/profile">
            {actor.name}
            <span className="app-role">{ROLE_LABELS[actor.role] ?? actor.role}</span>
          </Link>
          <LogoutButton />
        </div>
      </header>

      <main className="app-main">{children}</main>
    </div>
  );
}
