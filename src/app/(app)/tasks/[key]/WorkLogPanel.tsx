'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api/client';

/**
 * 作業時間（F-17）。
 *
 * **最初に見せるのは選択肢だけ。** 分を打たせると入れるのが面倒になり、
 * 入力されないまま集計が空になる。よく使う長さを札にして、1回押せば済むようにする。
 *
 * **完了したのに未入力なら、それを言う。** 黙って 0 分にすると
 * 「早く終わった」という誤った集計になる。
 *
 * **入れずに進めることを妨げない。** 必須にすると、完了にする操作そのものが避けられる。
 */

const QUICK = [
  { minutes: 15, label: '15分' },
  { minutes: 30, label: '30分' },
  { minutes: 60, label: '1時間' },
  { minutes: 120, label: '2時間' },
  { minutes: 240, label: '半日' },
  { minutes: 480, label: '1日' },
] as const;

function label(minutes: number): string {
  if (minutes < 60) return `${minutes}分`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

export function WorkLogPanel({
  taskKey,
  isDone,
  logs,
  myActorName,
}: {
  taskKey: string;
  isDone: boolean;
  logs: Array<{
    id: string;
    actorName: string;
    minutes: number;
    workDate: string;
    note: string | null;
    source: string;
  }>;
  myActorName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const human = logs.filter((l) => l.source === 'manual');
  const agent = logs.filter((l) => l.source === 'agent');
  const humanTotal = human.reduce((s, l) => s + l.minutes, 0);
  const agentTotal = agent.reduce((s, l) => s + l.minutes, 0);

  async function add(minutes: number) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/tasks/${taskKey}/worklogs`, { minutes });
      setCustom('');
      setShowCustom(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '記録できませんでした');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await api.delete(`/worklogs/${id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '消せませんでした');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface flex flex-col gap-3 p-4">
      <h2 className="text-base font-bold">
        作業時間
        {humanTotal > 0 && (
          <span className="ml-2 text-[15px] font-normal text-muted-foreground">
            {label(humanTotal)}
          </span>
        )}
      </h2>

      {error && <Alert tone="error">{error}</Alert>}

      {isDone && humanTotal === 0 && (
        <p className="text-sm text-muted-foreground">
          完了していますが、作業時間が入っていません。入れておくと次の見積りに使えます。
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button
            key={q.minutes}
            type="button"
            className="chip"
            disabled={busy}
            onClick={() => void add(q.minutes)}
          >
            {q.label}
          </button>
        ))}
        <button type="button" className="chip" onClick={() => setShowCustom((v) => !v)}>
          別の時間
        </button>
      </div>

      {showCustom && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const minutes = Number(custom);
            if (Number.isInteger(minutes) && minutes > 0) void add(minutes);
          }}
        >
          <Input
            className="max-w-32"
            inputMode="numeric"
            value={custom}
            onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))}
            placeholder="分"
            aria-label="作業した分数"
          />
          <Button type="submit" disabled={busy || custom.length === 0}>
            足す
          </Button>
        </form>
      )}

      {logs.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {logs.map((log) => (
            <li key={log.id} className="flex items-center gap-2 text-[15px]">
              <span className="tabular text-muted-foreground">{log.workDate.slice(5)}</span>
              <span className="font-medium">{label(log.minutes)}</span>
              <span className="text-muted-foreground">
                {log.source === 'agent' ? 'AI' : `${log.actorName}さん`}
              </span>
              {log.actorName === myActorName && log.source === 'manual' && (
                <button
                  type="button"
                  className="ml-auto text-[13px] text-muted-foreground underline"
                  disabled={busy}
                  onClick={() => void remove(log.id)}
                >
                  消す
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {agentTotal > 0 && (
        <p className="text-[13px] text-muted-foreground">
          AI の実行時間 {label(agentTotal)} は、見積りとの比較には入れていません。
        </p>
      )}
    </section>
  );
}
