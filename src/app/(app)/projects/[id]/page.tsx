import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { Badge, EmptyState, Loading, PageHeader, taskStatusTone, BackLink } from '@/components/app-ui';
import { getProductById } from '@/domain/product/service';
import { loadLabels } from '@/domain/setting/labels';
import { listTasks } from '@/domain/task/service';
import { requireActor } from '@/lib/auth/cookies';
import { NotFoundError } from '@/lib/errors';
import { dueLabel, isOverdue } from '@/lib/format';


type Props = { params: Promise<{ id: string }> };

export const metadata = { title: 'プロジェクト | AtlasQuarry' };

async function loadProject(id: string) {
  try {
    return await getProductById(id);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

/** S-04 プロジェクト詳細。開発項目＝そのプロジェクトの中の作業のまとまり。 */
export default async function ProjectDetailPage({ params }: Props) {
  await requireActor();
  const { id } = await params;

  const project = await loadProject(id);
  if (!project) notFound();

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/projects" label="プロジェクト一覧" />

      <PageHeader title={project.name} description={project.description ?? undefined} />

      {/*
        **かんばんは主操作としてプロジェクト名の直下に置く。**
        「プロジェクトのところからもかんばんへ行きたい」という指摘。
        下の切り替えの列に混ぜると弱いので、押せるボタンとして1つ出す。
        開くのは**このプロジェクトに絞ったかんばん**（タスク画面と同じもの）。
      */}
      <Link
        href={`/tasks?projectId=${project.id}&view=board`}
        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-bold text-primary-foreground transition-colors hover:bg-primary-hover sm:w-auto sm:self-start"
      >
        かんばんを開く
      </Link>

      {/*
        **このプロジェクトの見方を1列に並べる。**
        以前は「開発項目一覧／ガント」の2つだけで、タスクとかんばんへは
        別の場所（見出しの右のボタン）から行く作りだった。
        「プロジェクトのところからもかんばんへ行きたい」という指摘のとおり、
        **同じプロジェクトを別の切り口で見る手段は、同じ列に並べる。**
        タスク一覧とかんばんは、このプロジェクトに絞った状態で開く。
      */}
      {/* かんばんは上の主ボタンにあるので、ここには重ねて置かない */}
      <nav className="-mx-1 flex max-w-full gap-2 overflow-x-auto px-1 py-1" aria-label="このプロジェクトの見方">
        <Link href={`/schedule?projectId=${project.id}`} className="chip shrink-0">
          予定
        </Link>
        <Link href={`/tasks?projectId=${project.id}`} className="chip shrink-0">
          タスク一覧
        </Link>
        {/*
          **このプロジェクトに入るタスクを、ここから直接足せるようにする。**
          「まずどこに入れるか決めろ」を消すのが目的なので、押した先では
          プロジェクトが埋まった状態で追加フォームが開く。
        */}
        <Link href={`/tasks?projectId=${project.id}&new=1`} className="chip shrink-0">
          ＋ タスクを追加
        </Link>
      </nav>

      {/*
        **開発項目を画面から外した。**
        「開発項目とタスクの関係がわかりにくすぎる」との指摘。プロジェクトの下に
        開発項目があり、しかも開発項目に入らないタスクも許していたので、
        構造そのものが例外を含んでいた。3人・プロジェクト3つの規模では、
        **プロジェクト > タスク の2階層**で足りる。
        テーブルと既存データは消していない（v0.2 で「まとまり」＝親タスクに寄せる）。
      */}
      <Suspense fallback={<Loading />}>
        <ProjectTasks projectId={project.id} />
      </Suspense>
    </div>
  );
}


async function ProjectTasks({ projectId }: { projectId: string }) {
  const [tasks, labels] = await Promise.all([listTasks({ productId: projectId }), loadLabels()]);

  if (tasks.length === 0) {
    return (
      <EmptyState
        title="このプロジェクトのタスクはまだありません"
        description="右下の「＋」から追加できます。押した時点でこのプロジェクトが入ります。"
      />
    );
  }

  const open = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  const closed = tasks.length - open.length;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="band-heading">
        タスク<span className="count">{open.length}</span>
      </h2>

      <div className="card-list">
        {open.map((t) => {
          const due = dueLabel(t.dueDate, t.status);
          return (
            <Link key={t.id} href={`/tasks/${t.key}`} className="card flex items-center gap-3">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="card-title">{t.title}</span>
                <span className="stack-meta">
                  <Badge tone={taskStatusTone(t.status)}>{labels[`task.status.${t.status}`]}</Badge>
                  {t.assigneeName && <span>{t.assigneeName}</span>}
                  {due && (
                    <span data-late={isOverdue(t.dueDate, t.status) || undefined}>{due}</span>
                  )}
                </span>
              </span>
              <span className="chevron" aria-hidden="true" />
            </Link>
          );
        })}
      </div>

      {closed > 0 && (
        <Link
          href={`/tasks?projectId=${projectId}`}
          className="px-1 py-2 text-sm font-semibold text-primary"
        >
          終わったもの {closed} 件を含めて見る
        </Link>
      )}
    </section>
  );
}
