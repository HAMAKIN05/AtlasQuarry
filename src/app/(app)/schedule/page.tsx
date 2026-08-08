import Link from 'next/link';
import { Suspense } from 'react';

import { GanttChart } from '@/components/GanttChart';
import { MobileSchedule } from '@/components/MobileSchedule';
import { MonthCalendar } from '@/components/MonthCalendar';
import { EmptyState, Loading } from '@/components/app-ui';
import { currentMonth, monthEvents } from '@/domain/calendar/query';
import { getScheduleData } from '@/domain/gantt/query';
import { requireActor } from '@/lib/auth/cookies';
import { cn } from '@/lib/cn';

type Props = {
  searchParams: Promise<{ projectId?: string; view?: string; month?: string; day?: string }>;
};

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
  const { projectId, view, month, day } = await searchParams;

  /*
   * **カレンダーはタブを増やさず、予定の中の見方にする。**
   * ガントは「いつからいつまで」を、カレンダーは「その日までに何を終わらせるか」を見る。
   * 同じ「予定」の別の見方なので、同じ場所に置く。
   */
  const mode = view === 'calendar' ? 'calendar' : 'gantt';

  return (
    <div className="schedule-workspace">
      <header className="schedule-hero">
        <div>
          <p className="eyebrow">Planning view</p>
          <h1>予定を見渡す</h1>
          <p>プロジェクトをまたいで、いつ何が動くかを確認します。詳細な作業はプロジェクトや自分の仕事から開けます。</p>
        </div>
        <div className="schedule-legend-copy">
          <span><i className="schedule-dot schedule-dot-task" />タスク</span>
          <span><i className="schedule-dot schedule-dot-done" />完了</span>
        </div>
      </header>

      <nav className="schedule-mode-switcher" aria-label="予定の見方">
        <Link
          href={projectId ? `/schedule?projectId=${projectId}` : '/schedule'}
          className={cn('schedule-mode-link', mode === 'gantt' && 'is-active')}
          aria-current={mode === 'gantt' ? 'page' : undefined}
        >
          工程
        </Link>
        <Link
          href={calendarHref({ projectId: projectId ?? null, month: month ?? null, day: null })}
          className={cn('schedule-mode-link', mode === 'calendar' && 'is-active')}
          aria-current={mode === 'calendar' ? 'page' : undefined}
        >
          カレンダー
        </Link>
      </nav>

      {mode === 'calendar' ? (
        <Suspense fallback={<Loading label="カレンダーを組み立てています" />}>
          <CalendarBody
            projectId={projectId ?? null}
            month={month ?? currentMonth()}
            day={day ?? null}
          />
        </Suspense>
      ) : (
        <Suspense fallback={<Loading label="予定を読み込んでいます" />}>
          <ScheduleBody selected={projectId ?? null} />
        </Suspense>
      )}
    </div>
  );
}

function calendarHref(params: {
  projectId: string | null;
  month: string | null;
  day: string | null;
}): string {
  const query = new URLSearchParams({ view: 'calendar' });
  if (params.projectId) query.set('projectId', params.projectId);
  if (params.month) query.set('month', params.month);
  if (params.day) query.set('day', params.day);
  return `/schedule?${query.toString()}`;
}

async function CalendarBody({
  projectId,
  month,
  day,
}: {
  projectId: string | null;
  month: string;
  day: string | null;
}) {
  const events = await monthEvents(month, projectId);

  return (
    <MonthCalendar
      month={month}
      events={events}
      today={new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10)}
      selected={day}
      hrefFor={(p) => calendarHref({ projectId, month: p.month, day: p.day })}
    />
  );
}

async function ScheduleBody({ selected }: { selected: string | null }) {
  const schedules = await getScheduleData();
  const today = new Date().toISOString().slice(0, 10);

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

      {/* 選んでいるプロジェクトがあれば、その全体像へ行ける導線を置く */}
      {selected && (
        <Link href={`/projects/${selected}`} className="chip self-start">
          このプロジェクトを開く
        </Link>
      )}

      <MobileSchedule rows={rows} projectId={selected ?? undefined} today={today} />

      <div className="hidden lg:block">
        <GanttChart rows={rows} today={today} />
      </div>
    </>
  );
}
