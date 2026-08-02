import { redirect } from 'next/navigation';

import { BackLink, PageHeader } from '@/components/app-ui';
import { listInvitations } from '@/domain/invitation/service';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';

import { InviteForm } from './InviteForm';

export const metadata = { title: 'メンバーを招待 | AtlasQuarry' };

export default async function InvitePage() {
  const actor = await requireActor();
  if (!can(actor, 'member.invite')) redirect('/settings');

  const items = await listInvitations();

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/settings/members" label="メンバー" />
      <PageHeader
        title="メンバーを招待"
        description="リンクを渡した人だけがアカウントを作れます。役割・期限・使用回数を決められ、いつでも止められます。"
      />
      <InviteForm initial={items} />
    </div>
  );
}
