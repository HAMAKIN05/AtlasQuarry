'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Alert } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';

/**
 * Discord の `/決定` で溜まった決定事項を、この議事録へ取り込む（F-24 の後半）。
 *
 * **既定では何も選ばれていない。** 全部入れるのが普通なら自動追記でよく、
 * 選ばせる意味がなくなる。「どれが今日の決定か」を選ぶ手間が、この機能の中身。
 */
export function DecisionInbox({
  documentId,
  items,
}: {
  documentId: string;
  items: Array<{ id: string; body: string; authorName: string; createdAt: Date }>;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (items.length === 0) return null;

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  async function run(action: 'merge' | 'dismiss') {
    if (picked.length === 0) return;
    if (action === 'dismiss' && !window.confirm('選んだものを取り込まずに閉じます。よろしいですか？')) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/decisions', {
        action,
        noteIds: picked,
        ...(action === 'merge' ? { documentId } : {}),
      });
      setPicked([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'うまくいきませんでした');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="band-heading">
        Discord で決まったこと<span className="count">{items.length}</span>
      </h2>
      <p className="px-1 text-[13px] text-muted-foreground">
        この議事録に入れるものを選んでください。入れなかったものは残ります。
      </p>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="card-list">
        {items.map((item) => (
          <label key={item.id} className="card flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-5"
              checked={picked.includes(item.id)}
              onChange={() => toggle(item.id)}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] break-words">{item.body}</span>
              <span className="stack-meta mt-1">
                <span>{item.authorName}さん</span>
                <span>{formatDateTime(item.createdAt)}</span>
              </span>
            </span>
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 px-1">
        <Button type="button" disabled={busy || picked.length === 0} onClick={() => void run('merge')}>
          {picked.length > 0 ? `${picked.length}件を議事録に入れる` : '議事録に入れる'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy || picked.length === 0}
          onClick={() => void run('dismiss')}
        >
          入れずに閉じる
        </Button>
      </div>
    </section>
  );
}
