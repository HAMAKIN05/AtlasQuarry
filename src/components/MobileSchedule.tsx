'use client';

import { useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';

import type { GanttRow } from '@/domain/gantt/query';
import { cn } from '@/lib/cn';

/**
 * スマホ向けの予定表示。
 *
 * **横長のガントをそのまま縮めない。** 幅が足りない画面で横に読ませると、
 * 横スクロールと「今日へ」の操作説明が要るわりに何も分からない。
 * オーナーから渡された整理のとおり、3段に分けて出す。
 *
 *   1. 現在地   … 遅延・今日・次の作業の件数と、いま進んでいるもの
 *   2. 縦タイムライン … 全体把握は縦に読む
 *   3. ミニガント（2週間）… 期間の調整は、必要な範囲だけ横で見る
 *
 * PC ではこれを出さず、従来のガント（`GanttChart`）を使う。
 */

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 14;
const CELL_W = 26;
const LABEL_W = 108;

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parse(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function diffDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

const OPEN_STATUSES = new Set(['backlog', 'todo', 'in_progress', 'review']);

export function MobileSchedule({ rows, projectId }: { rows: GanttRow[]; projectId: string }) {
  const today = useMemo(() => ymd(new Date()), []);

  const tasks = useMemo(() => rows.filter((r) => r.kind === 'task'), [rows]);
  const features = useMemo(() => rows.filter((r) => r.kind === 'feature'), [rows]);

  /*
   * **数字は行動につながるものだけにする。**
   *
   * 「次の作業」を出していたが、将来期限のタスクを全部数えるだけで、50件あれば
   * 50 と出る。何をすればいいかが分からない数字は、報告用の指標と同じで置く意味がない。
   * 代わりに「未割当」を出す。担当が決まっていないタスクは**誰も動かさない**ので、
   * 3人のチームで放置に直結する。
   */
  const stats = useMemo(() => {
    const open = tasks.filter((t) => t.status && OPEN_STATUSES.has(t.status));
    return {
      late: open.filter((t) => t.dueDate !== null && t.dueDate < today).length,
      today: open.filter((t) => t.dueDate === today || t.startDate === today).length,
      unassigned: open.filter((t) => !t.assigneeName).length,
    };
  }, [tasks, today]);

  /**
   * いま進んでいるもの。
   *
   * **`in_progress` のタスクを持つ開発項目**を優先する。以前は「進捗を持つ最初の
   * 開発項目」を拾っていたので、0% の項目や誰も触っていない項目が「進行中」として
   * 出ることがあった。実際に手が動いているものを出さないと嘘になる。
   */
  const current = useMemo(() => {
    const active = new Set(
      tasks.filter((t) => t.status === 'in_progress').map((t) => t.featureId ?? ''),
    );
    const withProgress = features.filter((f) => f.progress && f.progress.total > 0);
    if (withProgress.length === 0) return null;
    const pick =
      withProgress.find((f) => active.has(f.id)) ??
      withProgress.find((f) => f.progress!.done > 0 && f.progress!.done < f.progress!.total);
    if (!pick) return null;
    const { done, total } = pick.progress!;
    return { label: pick.label, percent: Math.round((done / total) * 100), done, total };
  }, [features, tasks]);

  return (
    <div className="flex flex-col gap-5 lg:hidden">
      <CurrentPosition stats={stats} current={current} projectId={projectId} />
      <VerticalTimeline rows={rows} today={today} />
      <MiniGantt rows={rows} today={today} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 1. 現在地
 * ------------------------------------------------------------------ */

function CurrentPosition({
  stats,
  current,
  projectId,
}: {
  stats: { late: number; today: number; unassigned: number };
  current: { label: string; percent: number; done: number; total: number } | null;
  projectId: string;
}) {
  /** **数字は押せるようにする。** 見て終わりの数字は行動につながらない。 */
  const to = `/tasks?projectId=${projectId}`;

  return (
    <section aria-label="現在地" className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-subtle">現在地</h3>

      {/* 件数は3つだけ。**急ぐものにだけ色を持たせる。** */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="遅延" value={stats.late} tone={stats.late > 0 ? 'danger' : 'plain'} href={to} />
        <Stat label="今日" value={stats.today} tone="plain" href={to} />
        <Stat label="未割当" value={stats.unassigned} tone="plain" href={to} />
      </div>

      {current && (
        <div className="surface flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">進行中</p>
            <p className="truncate text-sm font-bold">{current.label}</p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised">
              <div
                className="h-full bg-muted-foreground"
                style={{ width: `${current.percent}%` }}
              />
            </div>
          </div>
          <span className="tabular shrink-0 text-lg font-bold">{current.percent}%</span>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: number;
  tone: 'danger' | 'plain';
  href: string;
}) {
  return (
    <Link href={href} className="surface flex flex-col gap-0.5 p-3 hover:bg-raised">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          'tabular text-2xl font-bold leading-none',
          tone === 'danger' ? 'text-destructive' : 'text-foreground',
        )}
      >
        {value}
        <span className="ml-0.5 text-xs font-semibold text-muted-foreground">件</span>
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------------ *
 * 2. 縦タイムライン
 * ------------------------------------------------------------------ */

function VerticalTimeline({ rows, today }: { rows: GanttRow[]; today: string }) {
  /*
   * **完了・中止は出さない。** 済んだ作業が予定に混ざると、これから動かすものが
   * 埋もれる。とくに中止は期限を過ぎたまま残るので、赤い「期限超過」として
   * 並び続けてしまっていた。
   *
   * 同じ日付が並ぶことは普通に起きる（期限をまとめて入れる）。日付だけで並べると
   * 同じ行が反復して見えるので、**同日内は担当者名で並べ、担当者を必ず出す。**
   */
  const items = useMemo(() => {
    return rows
      .filter((r) => r.startDate !== null || r.dueDate !== null)
      .filter((r) => r.kind === 'feature' || (r.status !== 'done' && r.status !== 'cancelled'))
      .map((r) => ({ row: r, at: (r.startDate ?? r.dueDate)! }))
      .sort(
        (a, b) =>
          a.at.localeCompare(b.at) ||
          (a.row.assigneeName ?? '').localeCompare(b.row.assigneeName ?? '') ||
          a.row.label.localeCompare(b.row.label),
      );
  }, [rows]);

  if (items.length === 0) {
    return (
      <section aria-label="予定" className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold text-subtle">予定</h3>
        <p className="empty-inline">
          開始日か期限を入れたタスクが、ここに日付順で並びます。
        </p>
      </section>
    );
  }

  return (
    <section aria-label="予定" className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-subtle">予定（日付順）</h3>

      <ul className="flex flex-col">
        {items.map(({ row, at }, i) => {
          const started = at <= today;
          const late = row.dueDate !== null && row.dueDate < today && row.status !== 'done';
          return (
            <li key={row.id} className="flex gap-3">
              {/* 縦の線と点。線は最後の行では引かない */}
              <div className="flex w-3 shrink-0 flex-col items-center pt-2">
                <span
                  className={cn(
                    'size-2.5 shrink-0 rounded-full',
                    late ? 'bg-destructive' : started ? 'bg-primary' : 'bg-border-strong',
                  )}
                />
                {i < items.length - 1 && <span className="w-px flex-1 bg-border" />}
              </div>

              <div className="min-w-0 flex-1 pb-4">
                <p className="tabular text-xs text-muted-foreground">
                  {formatMd(at)}
                  {row.dueDate && row.startDate && row.dueDate !== row.startDate && (
                    <span> → {formatMd(row.dueDate)}</span>
                  )}
                </p>
                {row.href ? (
                  <Link href={row.href} className="block truncate text-sm font-bold hover:underline">
                    {row.label}
                  </Link>
                ) : (
                  <p className="truncate text-sm font-bold">{row.label}</p>
                )}
                {/* **担当者を必ず出す。** 同じ日付が並ぶと、誰の予定か分からないと選べない */}
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                  <span data-late={late} className={cn(late && 'font-bold text-destructive')}>
                    {row.kind === 'feature'
                      ? '開発項目'
                      : late
                        ? '期限を過ぎています'
                        : started
                          ? '開始済み'
                          : '開始予定'}
                  </span>
                  <span className="min-w-0 truncate">
                    {row.kind === 'feature' ? '' : (row.assigneeName ?? '担当が未定')}
                  </span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function formatMd(value: string): string {
  const [, m, d] = value.split('-');
  return `${Number(m)}/${Number(d)}`;
}

/* ------------------------------------------------------------------ *
 * 3. ミニガント（2週間）
 * ------------------------------------------------------------------ */

function MiniGantt({ rows, today }: { rows: GanttRow[]; today: string }) {
  const scroller = useRef<HTMLDivElement>(null);

  /* 縦タイムラインと同じ基準にする。済んだものが帯で残ると窓が埋まる */
  const dated = useMemo(
    () =>
      rows
        .filter((r) => r.startDate !== null || r.dueDate !== null)
        .filter((r) => r.kind === 'feature' || (r.status !== 'done' && r.status !== 'cancelled')),
    [rows],
  );

  /**
   * 今日を左から3列目に置いた2週間の窓。**必要な範囲だけ横で見る。**
   * 過去は2日だけ見えれば足り、残りは先を見るために使う。
   * （遅れているものは上の「遅延」で別に数えているので、ここで振り返る必要はない）
   */
  const start = useMemo(() => addDays(parse(today), -2), [today]);
  const days = useMemo(
    () => Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(start, i)),
    [start],
  );

  const toToday = () => {
    // 今日の列が左端から少し内側に来る位置へ戻す
    scroller.current?.scrollTo({ left: 2 * CELL_W - 8, behavior: 'smooth' });
  };

  useEffect(toToday, []);

  if (dated.length === 0) return null;

  return (
    <section aria-label="ミニガント" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-subtle">2週間の予定</h3>
        <button
          type="button"
          onClick={toToday}
          className="min-h-11 px-1 text-xs text-muted-foreground hover:text-foreground"
        >
          今日へ戻る
        </button>
      </div>

      <div ref={scroller} className="overflow-x-auto">
        <div style={{ width: LABEL_W + WINDOW_DAYS * CELL_W }}>
          {/* 日付の行 */}
          <div className="flex">
            <div className="sticky left-0 z-10 shrink-0 bg-background" style={{ width: LABEL_W }} />
            {days.map((d) => {
              const key = ymd(d);
              return (
                <div
                  key={key}
                  className={cn(
                    'tabular shrink-0 text-center text-[0.6rem] leading-5',
                    key === today ? 'font-bold text-primary' : 'text-muted-foreground',
                  )}
                  style={{ width: CELL_W }}
                >
                  {d.getDate()}
                </div>
              );
            })}
          </div>

          {dated.map((row) => {
            const s = row.startDate ?? row.dueDate!;
            const e = row.dueDate ?? row.startDate!;
            const from = Math.max(0, diffDays(start, parse(s)));
            const to = Math.min(WINDOW_DAYS - 1, diffDays(start, parse(e)));
            const visible = to >= 0 && from <= WINDOW_DAYS - 1;
            const late = row.dueDate !== null && row.dueDate < today && row.status !== 'done';

            return (
              <div key={row.id} className="flex items-center border-t border-border/60">
                <div
                  className="sticky left-0 z-10 shrink-0 truncate bg-background py-2 pr-2 text-xs"
                  style={{ width: LABEL_W }}
                  title={row.label}
                >
                  {row.label}
                </div>
                <div className="relative h-8 shrink-0" style={{ width: WINDOW_DAYS * CELL_W }}>
                  {/* 今日の縦線 */}
                  <span
                    className="absolute top-0 bottom-0 w-px bg-primary/50"
                    style={{ left: 2 * CELL_W + CELL_W / 2 }}
                    aria-hidden="true"
                  />
                  {visible && (
                    <span
                      className={cn(
                        'absolute top-1/2 h-3 -translate-y-1/2 rounded-sm',
                        late ? 'bg-destructive' : row.kind === 'feature' ? 'bg-muted-foreground' : 'bg-primary',
                      )}
                      style={{
                        left: from * CELL_W + 2,
                        width: Math.max(CELL_W - 4, (to - from + 1) * CELL_W - 4),
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        今日を含む2週間だけを出しています。全期間はパソコンで見てください。
      </p>
    </section>
  );
}
