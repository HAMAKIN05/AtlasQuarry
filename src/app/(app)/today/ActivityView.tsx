import Link from 'next/link';

import { EmptyState } from '@/components/app-ui';
import { activityRhythm } from '@/domain/activity/rhythm';
import {
  FEED_RANGES,
  FEED_TARGETS,
  describeFeedItem,
  listFeed,
  type FeedRange,
  type FeedTarget,
} from '@/domain/activity/feed';
import { cn } from '@/lib/cn';

/**
 * 活動（F-16 のリズム + F-20 の一覧）。
 *
 * **年間の草は作らない。** 3人・スマホで1年分の濃淡を見ても、次の行動が変わらない。
 * 見て意味があるのは「ここ2週間、手が動いていたか」なので直近14日に絞る。
 * 横スクロールも要らなくなる。
 *
 * **リズムと一覧を同じ画面に置く。** 濃い日を見つけたら、その日に何があったかを
 * すぐ読めないと確認にならない。日を叩くと下の一覧がその日だけになる。
 *
 * **役割で隠さない。** 3人しかいない組織で、誰が何をしたかを伏せる理由がない。
 */
export async function ActivityView({
  range,
  target,
  day,
}: {
  range: FeedRange;
  target: FeedTarget;
  day: string | null;
}) {
  const [rhythm, feed] = await Promise.all([
    activityRhythm(),
    listFeed({ range, target, day }),
  ]);

  const total = rhythm.reduce((sum, d) => sum + d.score, 0);

  return (
    <div className="flex flex-col gap-7">
      <section className="flex flex-col gap-2">
        <h2 className="band-heading">
          直近2週間<span className="count">{total}</span>
        </h2>

        <div className="surface p-4">
          <div className="grid grid-cols-7 gap-1.5">
            {rhythm.map((d) => (
              <Link
                key={d.date}
                href={link({ range, target, day: day === d.date ? null : d.date })}
                aria-current={day === d.date ? 'true' : undefined}
                className={cn(
                  'rhythm-cell',
                  day === d.date && 'rhythm-cell-on',
                )}
                data-level={d.level}
                title={`${d.date} ${d.score}`}
              >
                <span className="tabular text-[11px]">{Number(d.date.slice(8, 10))}</span>
              </Link>
            ))}
          </div>

          <p className="mt-3 text-[13px] text-muted-foreground">
            {day
              ? `${formatDay(day)}の分だけを下に出しています。もう一度押すと戻ります。`
              : '色が濃い日ほど動きがあった日です。日を押すとその日の記録が出ます。'}
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="band-heading">記録</h2>

        {!day && (
          <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1" aria-label="期間">
            {FEED_RANGES.map((r) => (
              <Link
                key={r.key}
                href={link({ range: r.key, target, day: null })}
                className="chip shrink-0"
                aria-current={range === r.key ? 'page' : undefined}
              >
                {r.label}
              </Link>
            ))}
          </nav>
        )}

        <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 py-1" aria-label="対象">
          {FEED_TARGETS.map((t) => (
            <Link
              key={t.key}
              href={link({ range, target: t.key, day })}
              className="chip shrink-0"
              aria-current={target === t.key ? 'page' : undefined}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {feed.length === 0 ? (
          <EmptyState
            title="この期間の記録はありません"
            description="タスクや資料を動かすと、ここに残ります。"
          />
        ) : (
          <div className="card-list">
            {feed.map((item) => {
              const body = (
                <>
                  <span className="stack-meta">
                    <span className="tabular">{formatTime(item.createdAt)}</span>
                    <span>{item.actorName}さん</span>
                  </span>
                  <span className="mt-0.5 block text-[15px] break-words">
                    {describeFeedItem(item)}
                  </span>
                </>
              );

              return item.href ? (
                <Link key={item.id} href={item.href} className="card block">
                  {body}
                </Link>
              ) : (
                <div key={item.id} className="card">
                  {body}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function link(params: { range: FeedRange; target: FeedTarget; day: string | null }): string {
  const query = new URLSearchParams({ view: 'activity' });
  if (params.range !== 'week') query.set('range', params.range);
  if (params.target !== 'all') query.set('target', params.target);
  if (params.day) query.set('day', params.day);
  return `/today?${query.toString()}`;
}

/** 時刻は日本時間で出す。**サーバーの時計が UTC でも画面はずらさない。** */
function formatTime(at: Date): string {
  return at.toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDay(day: string): string {
  return `${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日`;
}
