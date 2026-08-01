import Link from 'next/link';

import { BackLink, PageHeader } from '@/components/app-ui';
import { loadLabelOverrides } from '@/domain/setting/labels';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';
import { ForbiddenError } from '@/lib/errors';
import { DEFAULT_LABELS } from '@/lib/labels';

import { LabelForm } from './LabelForm';

export const metadata = { title: '呼び名 | AtlasQuarry' };

/** 設定 → 呼び名。ステータスや優先度の言い方を会社に合わせる。 */
export default async function LabelsPage() {
  const actor = await requireActor();
  if (!can(actor, 'member.invite')) throw new ForbiddenError();

  const overrides = await loadLabelOverrides();

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/settings" label="設定" />

      <PageHeader
        title="呼び名"
        description="画面に出る言い方を変えられます。空にすると元の言い方に戻ります。"
      />

      <LabelForm defaults={DEFAULT_LABELS} overrides={overrides} />
    </div>
  );
}
