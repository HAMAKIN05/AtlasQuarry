import { redirect } from 'next/navigation';

import { BackLink } from '@/components/app-ui';
import { requireActor } from '@/lib/auth/cookies';
import { can } from '@/lib/auth/rbac';

import { NewProjectForm } from './NewProjectForm';

export const metadata = { title: 'プロジェクトを作る | AtlasQuarry' };

export default async function NewProjectPage() {
  const actor = await requireActor();
  // 権限が無い人が URL 直打ちで来ても作れないようにする
  if (!can(actor, 'product.create')) redirect('/projects');

  return (
    <div className="project-form-workspace">
      <BackLink href="/projects" label="プロジェクト一覧" />
      <header className="request-form-hero project-form-hero">
        <p className="eyebrow">New project</p>
        <h1>案件を作成する</h1>
        <p>チームで進めるまとまりを登録します。番号は自動で付くので、名前と目的だけ入力してください。</p>
      </header>
      <div className="request-form-layout">
        <aside className="request-form-guide">
          <p className="section-eyebrow">作成後にできること</p>
          <h2>仕事の入口を一つにする</h2>
          <p>案件を作ると、タスク・予定・資料・工数を一つの場所で追えるようになります。</p>
        </aside>
        <section className="section-card request-form-card">
          <NewProjectForm />
        </section>
      </div>
    </div>
  );
}
