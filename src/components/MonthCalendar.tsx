import Link from 'next/link';

import { Dot, Row, Stack } from '@/components/Ledger';
import { EmptyState } from '@/components/app-ui';
import { buildGrid, shiftMonth, type CalendarEvent } from '@/domain/calendar/query';
import { cn } from '@/lib/cn';

/**
 * 月表示（F-15）。
 *
 * **格子の中にタスク名を詰めない。** スマホの1マスは幅40px前後で、
 * 題名を入れても読めず「何かある」以上の情報にならない。マスは**件数だけ**にして、
 * 日を選んだら下に読める形で並べる。
 *
 * **今日を必ず示す。** 月を送ると、いま自分がどこを見ているか分からなくなる。
 */
const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'] as const;

export function MonthCalendar({
  month,
  events,
  today,
  selected,
  hrefFor,
}: {
  month: string;
  events: CalendarEvent[];
  today: string;
  selected: string | null;
  /** 月やその日を選び直すリンクの組み立て。画面ごとに URL が違うので外から渡す */
  hrefFor: (params: { month: string; day: string | null }) => string;
}) {
  const cells = buildGrid(month, events);
  const shown = selected ? events.filter((e) => e.dueDate === selected) : events;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Link href={hrefFor({ month: shiftMonth(month, -1), day: null })} className="chip">
          前の月
        </Link>
        <span className="text-[17px] font-bold">
          {Number(month.slice(0, 4))}年{Number(month.slice(5, 7))}月
        </span>
        <Link href={hrefFor({ month: shiftMonth(month, 1), day: null })} className="chip">
          次の月
        </Link>
      </div>

      <div className="surface p-3">
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((w) => (
            <span
              key={w}
              className="pb-1 text-center text-[11px] font-semibold text-muted-foreground"
            >
              {w}
            </span>
          ))}

          {cells.map((cell) => {
            const late = cell.events.some(
              (e) => e.status !== 'done' && e.dueDate < today,
            );

            return (
              <Link
                key={cell.date}
                href={hrefFor({ month, day: selected === cell.date ? null : cell.date })}
                className={cn(
                  'cal-cell',
                  !cell.inMonth && 'cal-cell-out',
                  cell.date === today && 'cal-cell-today',
                  selected === cell.date && 'cal-cell-on',
                )}
              >
                <span className="tabular text-[13px]">{Number(cell.date.slice(8, 10))}</span>
                {cell.events.length > 0 && (
                  <span className={cn('cal-count', late && 'cal-count-late')}>
                    {cell.events.length}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="band-heading">
          {selected
            ? `${Number(selected.slice(5, 7))}月${Number(selected.slice(8, 10))}日が期限`
            : 'この月が期限'}
          <span className="count">{shown.length}</span>
        </h2>

        {shown.length === 0 ? (
          <EmptyState
            title="期限のあるタスクがありません"
            description="タスクに期限を入れると、この月の予定として並びます。"
          />
        ) : (
          <Stack>
            {shown.map((event) => (
              <Row
                key={event.id}
                href={`/tasks/${event.key}`}
                title={event.title}
                lead={<Dot seed={event.projectId} />}
                meta={
                  <>
                    <span>{event.projectName}</span>
                    <span className="tabular">
                      {Number(event.dueDate.slice(5, 7))}/{Number(event.dueDate.slice(8, 10))}
                    </span>
                    <span>{event.assigneeName ? `${event.assigneeName}さん` : '担当なし'}</span>
                  </>
                }
              />
            ))}
          </Stack>
        )}
      </section>
    </div>
  );
}
