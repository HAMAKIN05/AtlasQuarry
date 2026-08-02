import Link from 'next/link';
import { Suspense } from 'react';

import { GanttChart } from '@/components/GanttChart';
import { MobileSchedule } from '@/components/MobileSchedule';
import { EmptyState, Loading } from '@/components/app-ui';
import { getScheduleData } from '@/domain/gantt/query';
import { requireActor } from '@/lib/auth/cookies';
import { cn } from '@/lib/cn';

type Props = { searchParams: Promise<{ projectId?: string }> };

export const metadata = { title: '予定 | AtlasQuarry' };

/**
 * 予定（ガント）。
 *
 * **下部タブに昇格させた。** それまでは「プロジェクト → 詳細 → 予定の札」と
 * 3つ辿らないと見られず、「ガントチャートを見るためにいろんなところを開いて
 * 探さないといけない」と言われた。経営者と上司が日常的に見るものなので、
 * 設定画面の奥ではなく入口に置く。
 *
 * **初期表示は全プロジェクト。** プロジェクトを選ばせてから見せない。
 */
export default async function SchedulePage({ searchParams }: Props) {
  await requireActor();
  const { projectId } = await searchParams;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="large-title">予定</h1>

      <Suspense fallback={<Loading label="予定を読み込んでいます" />}>
        <ScheduleBody selected={projectId ?? null} />
      </Suspense>
    </div>
  );
}

async function ScheduleBody({ selected }: { selected: string | null }) {
  const schedules = await getScheduleData();

  if (schedules.length === 0) {
    return (
      <EmptyState
        title="予定に出せるタスクがありません"
        description="タスクに開始日か期限を入れると、ここに時系列で並びます。"
        actionLabel="タスクを見る"
        actionHref="/tasks"
      />
    );
  }

  const shown = selected ? schedules.filter((s) => s.projectId === selected) : schedules;
  const rows = shown.flatMap((s) => s.rows);

  return (
    <>
      {/* プロジェクトの切り替え。**既定は「すべて」** */}
      {schedules.length > 1 && (
        <nav className="-mx-1 flex max-w-full gap-2 overflow-x-auto px-1 py-1" aria-label="プロジェクトの切り替え">
          <Link href="/schedule" className={cn('chip shrink-0')} aria-current={selected ? undefined : 'page'}>
            すべて
          </Link>
          {schedules.map((s) => (
            <Link
              key={s.projectId}
              href={`/schedule?projectId=${s.projectId}`}
              className="chip shrink-0"
              aria-current={selected === s.projectId ? 'page' : undefined}
            >
              {s.projectName}
            </Link>
          ))}
        </nav>
      )}

      <MobileSchedule rows={rows} projectId={selected ?? undefined} />

      <div className="hidden lg:block">
        <GanttChart rows={rows} />
      </div>
    </>
  );
}
