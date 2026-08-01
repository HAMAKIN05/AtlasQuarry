import Link from 'next/link';

import { BackLink, PageHeader } from '@/components/app-ui';
import { requireActor } from '@/lib/auth/cookies';
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/labels';

import { ProfileForm } from './ProfileForm';
import { TotpSection } from './TotpSection';

export const metadata = { title: '自分の設定 | AtlasQuarry' };

/** 設定 → 自分の設定。名前・パスワード・2要素認証。 */
export default async function ProfileSettingsPage() {
  const actor = await requireActor();

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/settings" label="設定" />

      <PageHeader title="自分の設定" />

      <div className="grid overflow-hidden rounded-lg border bg-surface sm:grid-cols-2">
        <div>
          <dt>ログインID</dt>
          <dd>{actor.email ?? '—'}</dd>
        </div>
        <div>
          <dt>権限</dt>
          <dd>
            {ROLE_LABELS[actor.role]}
            <span className="text-sm text-muted-foreground">（{ROLE_DESCRIPTIONS[actor.role]}）</span>
          </dd>
        </div>
      </div>

      <ProfileForm initialName={actor.name} />
      <TotpSection enabled={actor.hasTotp} />
    </div>
  );
}
