import { redirect } from 'next/navigation';

import { currentActor } from '@/lib/auth/cookies';

import { LoginForm } from './LoginForm';

export const metadata = { title: 'ログイン | AtlasQuarry' };

/** S-01 ログイン。TOTP 設定済みなら追加入力を求める。 */
export default async function LoginPage() {
  // ログイン済みで開いた場合はホームへ戻す
  const actor = await currentActor();
  if (actor) redirect('/');

  return (
    <main className="auth">
      <div className="auth-head">
        <h1 className="auth-title">AtlasQuarry</h1>
        <p className="auth-sub">社内システム内製化のタスク管理</p>
      </div>
      <LoginForm />
    </main>
  );
}
