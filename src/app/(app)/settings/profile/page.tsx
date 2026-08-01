import { requireActor } from '@/lib/auth/cookies';
import { ROLE_LABELS } from '@/lib/format';

import { ProfileForm } from './ProfileForm';
import { TotpSection } from './TotpSection';

export const metadata = { title: 'プロフィール設定 | AtlasQuarry' };

/** 設定 / プロフィール。名前変更、パスワード変更、TOTP 設定。 */
export default async function ProfileSettingsPage() {
  const actor = await requireActor();

  return (
    <div className="page">
      <h1 className="page-title">プロフィール設定</h1>

      <dl className="task-meta">
        <div>
          <dt>メールアドレス</dt>
          <dd>{actor.email ?? '—'}</dd>
        </div>
        <div>
          <dt>権限</dt>
          <dd>{ROLE_LABELS[actor.role] ?? actor.role}</dd>
        </div>
      </dl>

      <ProfileForm initialName={actor.name} />
      <TotpSection enabled={actor.hasTotp} />
    </div>
  );
}
