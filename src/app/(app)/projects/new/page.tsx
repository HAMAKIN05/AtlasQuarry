import { redirect } from 'next/navigation';

import { BackLink, PageHeader } from '@/components/app-ui';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';

import { NewProjectForm } from './NewProjectForm';

export const metadata = { title: 'プロジェクトを作る | AtlasQuarry' };

export default async function NewProjectPage() {
  const actor = await requireActor();
  // 権限が無い人が URL 直打ちで来ても作れないようにする
  if (!can(actor, 'product.create')) redirect('/projects');

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/projects" label="プロジェクト一覧" />
      <PageHeader title="プロジェクトを作る" />
      <NewProjectForm />
    </div>
  );
}
