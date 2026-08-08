import { BackLink } from '@/components/app-ui';
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
    <div className="request-form-workspace">
      <BackLink href="/requests" label="要望一覧" />

      <header className="request-form-hero">
        <p className="eyebrow">New request</p>
        <h1>要望を登録する</h1>
        <p>思いついたまま書けば大丈夫です。受け取ったあと、内容を確認して次の仕事につなげます。</p>
      </header>

      <div className="request-form-layout">
        <aside className="request-form-guide">
          <p className="section-eyebrow">入力のコツ</p>
          <h2>まずは1行で十分です</h2>
          <p>「何ができるようになりたいか」を書いてください。背景や関係する案件は、分かる範囲で後から足せます。</p>
        </aside>
        <section className="section-card request-form-card">
          <NewRequestForm projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
        </section>
      </div>
    </div>
  );
}
