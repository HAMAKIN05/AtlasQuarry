'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { GanttRow } from '@/domain/gantt/query';
import { cn } from '@/lib/cn';

/**
 * ガント（F-14、帯まで）。
 *
 * **ライブラリは使わず SVG を自前で描く**（CLAUDE.md の禁止事項。既製品は日本語と
 * 縦横スクロールで詰まりやすい）。左のラベル列は sticky にして、時間軸だけ横に流す。
 * ガントは UI規約の例外として横スクロールしてよい。
 *
 * 依存線は描かない（v0.4）。
 *
 * ホームでも使うため `compact` を持たせている。ホームでは行数を絞って高さを抑える。
 */

const ROW_H = 32;
const HEADER_H = 38;
const DAY_W = { day: 26, week: 7 } as const;

type Scale = keyof typeof DAY_W;

/** ローカル時刻で YYYY-MM-DD を作る。toISOString だと UTC 基準になって日付がずれる。 */
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
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export function GanttChart({
  rows,
  today,
  compact = false,
  defaultScale = 'day',
}: {
  rows: GanttRow[];
  today: string;
  compact?: boolean;
  defaultScale?: Scale;
}) {
  const [scale, setScale] = useState<Scale>(defaultScale);
  const scrollRef = useRef<HTMLDivElement>(null);

  const range = useMemo(() => {
    const dates: string[] = [today];
    for (const row of rows) {
      if (row.startDate) dates.push(row.startDate);
      if (row.dueDate) dates.push(row.dueDate);
    }
    const min = dates.reduce((a, b) => (a < b ? a : b));
    const max = dates.reduce((a, b) => (a > b ? a : b));
    // 前後に余白を取って、端の帯が枠に貼り付かないようにする
    const start = addDays(parse(min), -3);
    const end = addDays(parse(max), 4);
    return { start, end, days: Math.max(diffDays(start, end), 7) };
  }, [rows, today]);

  const dayW = DAY_W[scale];
  const chartW = range.days * dayW;
  const chartH = rows.length * ROW_H;
  const xOf = (date: string) => diffDays(range.start, parse(date)) * dayW;
  const todayX = xOf(today);

  /** ラベル列の分を差し引き、今日が左から 1/3 くらいに来るように寄せる。 */
  function scrollToToday() {
    const el = scrollRef.current;
    if (!el) return;
    const labelW = el.querySelector('[data-gantt-labels]')?.clientWidth ?? 0;
    const visible = Math.max(el.clientWidth - labelW, 1);
    el.scrollLeft = Math.max(todayX - visible / 3, 0);
  }

  /**
   * 開いた直後に今日が見えるところまで寄せる。
   *
   * 時間軸の左端は「最も古い開始日 - 3日」なので、そのままだと**今日も帯も画面外**になり、
   * 開いた人には空の枠しか見えない。実際にそうなって気づいた。
   * 直後は SVG の幅がまだ反映されず scrollLeft が 0 に丸められることがあるため2回入れる。
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    scrollToToday();

    // 実寸が確定してから寄せ直す。ハイドレーション直後は SVG の幅がまだ反映されておらず、
    // その時点で scrollLeft を入れても 0 に丸められる。実際にそれで効かなかった。
    // 一度スクロールできる状態になったら監視をやめる（利用者の操作を奪わないため）。
    const observer = new ResizeObserver(() => {
      if (el.scrollWidth > el.clientWidth) {
        scrollToToday();
        observer.disconnect();
      }
    });
    observer.observe(el);

    const id = requestAnimationFrame(scrollToToday);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayX, scale]);

  const months = useMemo(() => {
    const out: Array<{ x: number; label: string }> = [];
    let cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    while (cursor <= range.end) {
      out.push({
        x: diffDays(range.start, cursor) * dayW,
        label: `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`,
      });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    return out;
  }, [range, dayW]);

  const ticks = useMemo(() => {
    const out: Array<{ x: number; label: string; strong: boolean }> = [];
    for (let i = 0; i <= range.days; i += 1) {
      const date = addDays(range.start, i);
      const isMonthStart = date.getDate() === 1;
      if (scale === 'day' ? i % 7 === 0 || isMonthStart : isMonthStart) {
        out.push({
          x: i * dayW,
          label: `${date.getMonth() + 1}/${date.getDate()}`,
          strong: isMonthStart,
        });
      }
    }
    return out;
  }, [range, dayW, scale]);

  return (
    <div className="flex flex-col gap-3">
      {/*
       * ホーム（compact）ではプロジェクトごとにガントが並ぶので、表示単位と凡例を
       * **各図に付けると同じ操作列が何度も出て画面が濁る。** 図ごとに要るのは
       * 「今日へ」だけ。単位の切替と凡例はプロジェクト詳細と、ホームでは章に1つ置く。
       */}
      <div className="flex flex-wrap items-center gap-3">
        {!compact && (
          <div className="inline-flex overflow-hidden rounded-md border" role="group" aria-label="表示単位">
            {(['day', 'week'] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={scale === s}
                onClick={() => setScale(s)}
                className={cn(
                  'min-h-11 px-3 text-sm',
                  scale === s
                    ? 'bg-primary font-bold text-primary-foreground'
                    : 'bg-surface text-muted-foreground',
                )}
              >
                {s === 'day' ? '日' : '週'}
              </button>
            ))}
          </div>
        )}

        {/*
          自動で今日の位置へ寄せてはいるが、環境によっては効かないことがある。
          自力で戻れる手段を必ず残す（ガントは横に長く、迷子になると探せない）。
        */}
        <Button type="button" variant="outline" size="sm" onClick={scrollToToday}>
          今日へ
        </Button>

        {!compact && <GanttLegend />}
      </div>

      <div ref={scrollRef} className="surface flex overflow-x-auto">
        <div
          data-gantt-labels
          className="sticky left-0 z-10 w-32 shrink-0 bg-surface shadow-[1px_0_0_var(--border)] sm:w-56"
          style={{ paddingTop: HEADER_H }}
        >
          {rows.map((row) => (
            <div
              key={`${row.kind}-${row.id}`}
              className={cn(
                'flex items-center overflow-hidden border-b border-border/50 px-2 text-xs',
                row.kind === 'feature' ? 'bg-raised font-semibold' : 'pl-4 text-muted-foreground',
              )}
              style={{ height: ROW_H }}
            >
              {row.href ? (
                <Link href={row.href} className="flex min-w-0 items-baseline gap-1 hover:underline">
                  <span className="tabular shrink-0 text-[0.65rem] text-muted-foreground">
                    {row.key}
                  </span>
                  <span className="truncate">{row.label}</span>
                </Link>
              ) : (
                <span className="flex min-w-0 items-baseline gap-1">
                  <span className="truncate">{row.label}</span>
                  {row.progress && row.progress.total > 0 && (
                    <span className="tabular shrink-0 text-[0.65rem] font-normal text-muted-foreground">
                      {row.progress.done}/{row.progress.total}
                    </span>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>

        <svg
          width={chartW}
          height={chartH + HEADER_H}
          className="shrink-0"
          role="img"
          aria-label="開発項目とタスクの期間"
        >
          {months.map((m) => (
            <text key={m.label} x={m.x + 4} y={14} fill="var(--subtle-foreground)" className="text-[11px] font-semibold">
              {m.label}
            </text>
          ))}

          {ticks.map((t) => (
            <g key={t.x}>
              <line
                x1={t.x}
                y1={HEADER_H - 12}
                x2={t.x}
                y2={chartH + HEADER_H}
                className={t.strong ? 'stroke-[var(--border-strong)]' : 'stroke-[var(--border)]'}
              />
              {scale === 'day' && !compact && (
                <text x={t.x + 3} y={HEADER_H - 16} fill="var(--subtle-foreground)" className="text-[10px]">
                  {t.label}
                </text>
              )}
            </g>
          ))}

          {rows.map((row, index) => {
            const y = HEADER_H + index * ROW_H;
            const bar = barFor(row, xOf, today, dayW);

            return (
              <g key={`${row.kind}-${row.id}`}>
                {row.kind === 'feature' && (
                  <rect x={0} y={y} width={chartW} height={ROW_H} fill="var(--surface-raised)" />
                )}
                <line x1={0} y1={y + ROW_H} x2={chartW} y2={y + ROW_H} className="stroke-[var(--border)]" opacity={0.5} />
                {bar && (
                  <rect
                    x={bar.x}
                    y={y + (row.kind === 'feature' ? 9 : 10)}
                    width={bar.width}
                    height={row.kind === 'feature' ? 14 : 12}
                    rx={3}
                    className={bar.className}
                    aria-label={`${row.label}（${row.startDate ?? '開始未定'} 〜 ${row.dueDate ?? '期限未定'}）`}
                  />
                )}
              </g>
            );
          })}

          {/* 今日の線。最後に描いて帯の上に出す */}
          <line
            x1={todayX}
            y1={HEADER_H - 12}
            x2={todayX}
            y2={chartH + HEADER_H}
            stroke="var(--destructive)"
            strokeWidth={2}
            strokeDasharray="3 3"
          />
          <text x={todayX + 3} y={HEADER_H - 2} fill="var(--destructive)" className="text-[10px] font-bold">
            今日
          </text>
        </svg>
      </div>
    </div>
  );
}

function Swatch({ className }: { className: string }) {
  return <span aria-hidden="true" className={cn('inline-block h-2 w-3.5 rounded-[2px]', className)} />;
}

/**
 * 帯の色の意味。図が複数並ぶ画面では**章に1つだけ**置く。
 * 図ごとに繰り返すと、同じ説明が何度も目に入って情報が薄まる。
 */
export function GanttLegend({ className }: { className?: string } = {}) {
  return (
    <p className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground', className)}>
      <Swatch className="bg-subtle" />
      開発項目
      <Swatch className="bg-primary" />
      タスク
      <Swatch className="bg-destructive" />
      期限超過
      <Swatch className="bg-success" />
      完了
    </p>
  );
}

/**
 * 帯の位置と幅。
 *
 * **日付が片方しか無い場合も帯を出す**（その日1日分）。両方無いときだけ描かない。
 * 0幅の矩形を描くと、見えないのに存在する要素ができて紛らわしい。
 */
function barFor(
  row: GanttRow,
  xOf: (date: string) => number,
  today: string,
  dayW: number,
): { x: number; width: number; className: string } | null {
  const from = row.startDate ?? row.dueDate;
  const to = row.dueDate ?? row.startDate;
  if (!from || !to) return null;

  const x = xOf(from);
  // 期限日そのものを含めたいので +1 日ぶん伸ばす
  const width = Math.max(diffDays(parse(from), parse(to)) + 1, 1) * dayW;

  const closed = row.status === 'done' || row.status === 'cancelled';
  const late = !closed && row.dueDate !== null && row.dueDate < today;

  const className =
    row.kind === 'feature'
      ? 'fill-[var(--subtle-foreground)]'
      : closed
        ? 'fill-[var(--success)]'
        : late
          ? 'fill-[var(--destructive)]'
          : 'fill-[var(--primary)]';

  return { x, width, className };
}
