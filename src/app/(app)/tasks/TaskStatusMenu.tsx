'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useLabels } from '@/components/LabelsProvider';
import type { TaskStatus } from '@/db/schema/enums';
import { api } from '@/lib/api/client';
import { BOARD_COLUMNS } from '@/lib/labels';

/**
 * 一覧から状態を変える。
 *
 * **かんばんへ切り替えて長押しドラッグ、を状態変更の唯一の手段にしない。**
 * ドラッグは覚えないと使えず、スマホでは特に当たりが悪い。3人のチームで
 * 一番よく起きるのは「作業中にする」「確認待ちにする」なので、一覧の行から直接できるようにする。
 *
 * かんばんは残してある。速い人はそちらを使えばよく、ここはその代わりではなく併存。
 */
export function TaskStatusMenu({
  taskId,
  status,
  onChanged,
}: {
  taskId: string;
  status: TaskStatus;
  onChanged?: (next: TaskStatus) => void;
}) {
  const router = useRouter();
  const labels = useLabels();
  const [current, setCurrent] = useState<TaskStatus>(status);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function change(next: TaskStatus) {
    if (next === current || busy) return;

    const before = current;
    setCurrent(next);
    setBusy(true);
    setFailed(false);
    try {
      await api.patch(`/tasks/${taskId}`, { status: next });
      onChanged?.(next);
      router.refresh();
    } catch {
      /*
       * 失敗したら見た目を戻し、**戻したことを言う。**
       * 黙って戻すと「押したのに変わらない」だけが残り、通信の失敗なのか
       * 操作を間違えたのかが利用者に分からない。
       */
      setCurrent(before);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex shrink-0 flex-col items-end gap-0.5">
      <select
        aria-label="状態を変える"
        disabled={busy}
        value={current}
        onChange={(event) => change(event.target.value as TaskStatus)}
        className="!min-h-9 !w-auto shrink-0 !border-0 !bg-raised !px-2 !py-1 !text-xs !text-muted-foreground"
      >
        {BOARD_COLUMNS.map((value) => (
          <option key={value} value={value}>
            {labels[`task.status.${value}`]}
          </option>
        ))}
      </select>
      {failed && (
        <span role="status" className="text-xs text-destructive">
          変更できませんでした
        </span>
      )}
    </span>
  );
}
