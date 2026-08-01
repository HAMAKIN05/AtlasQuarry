import { redirect } from 'next/navigation';

import { currentActor } from '@/lib/auth/cookies';

import { LoginForm } from './LoginForm';

export const metadata = { title: 'ログイン | AtlasQuarry' };

/** S-01 ログイン。TOTP 設定済みなら追加入力を求める。 */
export default async function LoginPage() {
  // ログイン済みで開いた場合はダッシュボードへ戻す
  const actor = await currentActor();
  if (actor) redirect('/');

  return (
    <main className="auth-shell">
      <h1 className="auth-title">AtlasQuarry</h1>
      <LoginForm />
    </main>
  );
}
