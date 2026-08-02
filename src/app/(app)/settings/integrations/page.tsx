import { redirect } from 'next/navigation';

import { db } from '@/db/client';
import { integration } from '@/db/schema';
import { BackLink, PageHeader } from '@/components/app-ui';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';

import { IntegrationForm } from './IntegrationForm';

export const metadata = { title: '外部連携 | AtlasQuarry' };

/** 外部連携の設定（F-22a / F-09）。**経営者だけが触れる。** */
export default async function IntegrationsPage() {
  const actor = await requireActor();
  if (!can(actor, 'integration.manage')) redirect('/settings');

  const rows = await db
    .select({ provider: integration.provider, isActive: integration.isActive })
    .from(integration);

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/settings" label="設定" />
      <PageHeader title="外部連携" />
      <IntegrationForm
        initial={{
          discord: rows.some((r) => r.provider === 'discord' && r.isActive),
          smtp: rows.some((r) => r.provider === 'smtp' && r.isActive),
        }}
      />
    </div>
  );
}
