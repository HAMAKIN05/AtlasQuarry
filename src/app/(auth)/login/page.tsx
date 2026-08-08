import { redirect } from 'next/navigation';

import { currentActor } from '@/lib/auth/cookies';

import { AuthPanel } from './AuthPanel';

export const metadata = { title: 'ログイン | AtlasQuarry' };

/** S-01 ログイン。TOTP 設定済みなら追加入力を求める。 */
export default async function LoginPage() {
  // ログイン済みで開いた場合はホームへ戻す
  const actor = await currentActor();
  if (actor) redirect('/');

  return (
    <main className="auth-page">
      <div className="auth-content">
        <span className="brand-symbol brand-symbol-large">AQ</span>
        <h1 className="auth-title">AtlasQuarry</h1>
        <p className="mt-1 text-sm text-muted-foreground">社内システム内製化のタスク管理</p>
      </div>
      <div className="auth-panel-shell">
        <AuthPanel />
      </div>
    </main>
  );
}
