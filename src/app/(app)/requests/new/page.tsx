import { BackLink, PageHeader } from '@/components/app-ui';
import { listProducts } from '@/domain/product/service';
import { requireActor } from '@/lib/auth/cookies';

import { NewRequestForm } from './NewRequestForm';

export const metadata = { title: '要望を出す | AtlasQuarry' };

/**
 * 要望を出す専用の画面。
 *
 * **一覧の中に開くフォームをやめて画面を分けた。** 書いている間、ほかのものが
 * 目に入らない方がよい。要望は「思いついたときに書く」ものなので、
 * 書き始めるまでの手数と、書いている最中の迷いをできるだけ減らす。
 */
export default async function NewRequestPage() {
  await requireActor();
  const projects = await listProducts();

  return (
    <div className="flex flex-col gap-6">
      <BackLink href="/requests" label="要望一覧" />

      <PageHeader
        title="要望を出す"
        description="「こうなったら仕事が楽になる」を書いてください。実現できるかは、こちらで調べて返します。"
      />

      <NewRequestForm projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
    </div>
  );
}
