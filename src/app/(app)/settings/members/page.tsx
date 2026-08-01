import Link from 'next/link';

import { BackLink, PageHeader } from '@/components/app-ui';
import { listMembers } from '@/domain/member/service';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';
import { ForbiddenError } from '@/lib/errors';

import { MemberRow } from './MemberRow';

export const metadata = { title: 'メンバー | AtlasQuarry' };

/** 設定 → メンバー。名前と権限の変更、利用停止。 */
export default async function MembersPage() {
  const actor = await requireActor();
  // 画面側でも弾く。API 側の can() が本体だが、権限の無い人にフォームを見せない
  if (!can(actor, 'member.invite')) throw new ForbiddenError();

  const members = await listMembers();

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/settings" label="設定" />

      <PageHeader
        title="メンバー"
        description="名前と権限を変えられます。新しい人の追加は、今のところ開発者に依頼してください。"
      />

      <ul className="flex flex-col gap-2">
        {members.map((member) => (
          <MemberRow key={member.id} member={member} isSelf={member.id === actor.id} />
        ))}
      </ul>
    </div>
  );
}
