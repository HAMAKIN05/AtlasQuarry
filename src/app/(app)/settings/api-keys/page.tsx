import { redirect } from 'next/navigation';

import { BackLink, PageHeader } from '@/components/app-ui';
import { listApiKeys } from '@/domain/mcp/auth';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';

import { ApiKeyForm } from './ApiKeyForm';

export const metadata = { title: 'AIエージェントの鍵 | AtlasQuarry' };

export default async function ApiKeysPage() {
  const actor = await requireActor();
  if (!can(actor, 'integration.manage')) redirect('/settings');

  const items = await listApiKeys();

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/settings" label="設定" />
      <PageHeader
        title="AIエージェントの鍵"
        description="Claude Code などから、このツールのタスクや資料を読み書きするための鍵です。人が使うものではありません。"
      />
      <ApiKeyForm initial={items} />
    </div>
  );
}
