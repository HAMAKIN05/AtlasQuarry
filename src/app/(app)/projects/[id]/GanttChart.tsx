'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { GanttRow } from '@/domain/gantt/query';

/**
 * ガント（F-14、帯まで）。
 *
 * **ライブラリは使わず SVG を自前で描く**（CLAUDE.md の禁止事項。既製品は日本語と
 * 縦横スクロールで詰まりやすい）。左のラベル列は sticky にして、時間軸だけ横に流す。
 * ガントは UI規約の例外として横スクロールしてよい。
 *
 * 依存線は描かない（v0.4）。
 */

const ROW_H = 34;
const HEADER_H = 40;
const DAY_W = { day: 26, week: 7 } as const;

type Scale = keyof typeof DAY_W;

/** ローカル時刻で YYYY-MM-DD を作る。toISOString だとUTC基準になって日付がずれる。 */
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
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export function GanttChart({ rows }: { rows: GanttRow[] }) {
  const [scale, setScale] = useState<Scale>('day');
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = ymd(new Date());

  const range = useMemo(() => {
    const dates: string[] = [];
    for (const row of rows) {
      if (row.startDate) dates.push(row.startDate);
      if (row.dueDate) dates.push(row.dueDate);
    }
    // 期間が1つも無くても今日を含む範囲は出す。空の枠だけ描いて「まだ何も無い」を示す
    dates.push(today);

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

  /** 月の区切り。日表示では月と日、週表示では月だけを出す。 */
  const months = useMemo(() => {
    const out: Array<{ x: number; label: string }> = [];
    let cursor = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    while (cursor <= range.end) {
      const x = diffDays(range.start, cursor) * dayW;
      out.push({ x, label: `${cursor.getFullYear()}年${cursor.getMonth() + 1}月` });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    return out;
  }, [range, dayW]);

  /** 目盛り。日表示は7日ごと、週表示は月初のみ。 */
  const ticks = useMemo(() => {
    const out: Array<{ x: number; label: string; strong: boolean }> = [];
    for (let i = 0; i <= range.days; i += 1) {
      const date = addDays(range.start, i);
      const isMonthStart = date.getDate() === 1;
      if (scale === 'day' ? i % 7 === 0 || isMonthStart : isMonthStart) {
        out.push({ x: i * dayW, label: `${date.getMonth() + 1}/${date.getDate()}`, strong: isMonthStart });
      }
    }
    return out;
  }, [range, dayW, scale]);

  const todayX = xOf(today);

  /**
   * 開いた直後に今日が見えるところまで横スクロールする。
   *
   * 範囲の左端は「最も古い開始日 - 3日」なので、そのままだと**今日も帯も画面外**になり、
   * 開いた人には空の枠しか見えない。実際にそうなって気づいた。
   * 表示単位を変えたときも位置を取り直す。
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    // 描画が終わってから位置を決める。同じフレームで scrollLeft を入れても、
    // SVG の幅がまだ反映されておらず 0 に丸められることがある
    // 直後は SVG の幅がまだ反映されておらず scrollLeft が 0 に丸められることがあるため、
    // 同期で1回、描画後にもう1回入れる
    scrollToToday();
    const id = requestAnimationFrame(scrollToToday);
    return () => cancelAnimationFrame(id);
    // scrollToToday は todayX / scale だけに依存する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayX, scale]);

  /** ラベル列の分を差し引き、今日が左から 1/3 くらいに来るように寄せる。 */
  function scrollToToday() {
    const el = scrollRef.current;
    if (!el) return;
    const labelW = el.querySelector('.gantt-labels')?.clientWidth ?? 0;
    const visible = Math.max(el.clientWidth - labelW, 1);
    el.scrollLeft = Math.max(todayX - visible / 3, 0);
  }

  return (
    <div className="gantt">
      <div className="gantt-toolbar">
        <div className="viewswitch" role="group" aria-label="ガントの表示単位">
          <button
            type="button"
            className="viewswitch-btn"
            aria-pressed={scale === 'day'}
            onClick={() => setScale('day')}
          >
            日
          </button>
          <button
            type="button"
            className="viewswitch-btn"
            aria-pressed={scale === 'week'}
            onClick={() => setScale('week')}
          >
            週
          </button>
        </div>
        {/*
          自動で今日の位置へ寄せてはいるが、環境によっては効かないことがある。
          自力で戻れる手段を必ず残す（ガントは横に長く、迷子になると探せない）。
        */}
        <button type="button" className="btn-secondary btn-sm" onClick={scrollToToday}>
          今日へ
        </button>
        <p className="gantt-legend">
          <span className="swatch swatch-feature" aria-hidden="true" />
          開発項目
          <span className="swatch swatch-task" aria-hidden="true" />
          タスク
          <span className="swatch swatch-late" aria-hidden="true" />
          期限超過
          <span className="swatch swatch-done" aria-hidden="true" />
          完了
        </p>
      </div>

      <div className="gantt-scroll" ref={scrollRef}>
        <div className="gantt-labels" style={{ paddingBlockStart: HEADER_H }}>
          {rows.map((row) => (
            <div
              key={`${row.kind}-${row.id}`}
              className={`gantt-label gantt-label-${row.kind}`}
              style={{ blockSize: ROW_H }}
            >
              {row.href ? (
                <Link href={row.href} className="gantt-label-link">
                  <span className="gantt-label-key">{row.key}</span>
                  <span className="gantt-label-text">{row.label}</span>
                </Link>
              ) : (
                <span className="gantt-label-text">
                  {row.label}
                  {row.progress && row.progress.total > 0 && (
                    <span className="gantt-label-count">
                      {row.progress.done}/{row.progress.total}
                    </span>
                  )}
                </span>
              )}
            </div>
          ))}
        </div>

        <svg
          className="gantt-svg"
          width={chartW}
          height={chartH + HEADER_H}
          role="img"
          aria-label="開発項目とタスクの期間"
        >
          {/* 月の帯 */}
          {months.map((m) => (
            <text key={m.label} x={m.x + 4} y={16} className="gantt-month">
              {m.label}
            </text>
          ))}

          {/* 目盛りと縦線 */}
          {ticks.map((t) => (
            <g key={t.x}>
              <line
                x1={t.x}
                y1={HEADER_H - 12}
                x2={t.x}
                y2={chartH + HEADER_H}
                className={t.strong ? 'gantt-grid gantt-grid-strong' : 'gantt-grid'}
              />
              {scale === 'day' && (
                <text x={t.x + 3} y={HEADER_H - 16} className="gantt-tick">
                  {t.label}
                </text>
              )}
            </g>
          ))}

          {/* 行の区切りと帯 */}
          {rows.map((row, index) => {
            const y = HEADER_H + index * ROW_H;
            const bar = barFor(row, range.start, dayW, xOf, today);

            return (
              <g key={`${row.kind}-${row.id}`}>
                <line
                  x1={0}
                  y1={y + ROW_H}
                  x2={chartW}
                  y2={y + ROW_H}
                  className="gantt-grid gantt-grid-row"
                />
                {row.kind === 'feature' && (
                  <rect x={0} y={y} width={chartW} height={ROW_H} className="gantt-band" />
                )}
                {bar && (
                  <rect
                    x={bar.x}
                    y={y + (row.kind === 'feature' ? 9 : 11)}
                    width={bar.width}
                    height={row.kind === 'feature' ? 16 : 12}
                    rx={row.kind === 'feature' ? 4 : 3}
                    className={`gantt-bar gantt-bar-${bar.tone}`}
                  >
                    <title>
                      {row.label}（{row.startDate ?? '開始未定'} 〜 {row.dueDate ?? '期限未定'}）
                    </title>
                  </rect>
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
            className="gantt-today"
          />
          <text x={todayX + 3} y={HEADER_H - 2} className="gantt-today-label">
            今日
          </text>
        </svg>
      </div>
    </div>
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
  _start: Date,
  dayW: number,
  xOf: (date: string) => number,
  today: string,
): { x: number; width: number; tone: string } | null {
  const from = row.startDate ?? row.dueDate;
  const to = row.dueDate ?? row.startDate;
  if (!from || !to) return null;

  const x = xOf(from);
  // 期限日そのものを含めたいので +1 日ぶん伸ばす
  const width = Math.max(diffDays(parse(from), parse(to)) + 1, 1) * dayW;

  const closed = row.status === 'done' || row.status === 'cancelled';
  const late = !closed && row.dueDate !== null && row.dueDate < today;

  const tone = row.kind === 'feature' ? 'feature' : closed ? 'done' : late ? 'late' : 'task';
  return { x, width, tone };
}
