'use client';

import { CheckIcon, LoaderCircleIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { TaskStatus } from '@/db/schema/enums';
import { api } from '@/lib/api/client';
import { cn } from '@/lib/cn';

/**
 * 一覧からその場でタスクを完了にする。
 *
 * **「終わった」を記録するのに詳細画面を開かせない。** 開いて編集して保存、では
 * 誰も押さなくなり、状態が実態とずれる。タスク管理ツールで一番押される操作なので
 * 一覧の行に直接置く。
 *
 * 押した瞬間に見た目を変え、失敗したら戻す。往復を待たせない。
 */
export function TaskCheck({
  taskId,
  status,
  title,
  onDone,
}: {
  taskId: string;
  status: TaskStatus;
  title: string;
  /** 一覧が手元に state を持っている場合、そちらも更新する */
  onDone?: (next: TaskStatus) => void;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState<TaskStatus>(status);
  const [busy, setBusy] = useState(false);

  const done = current === 'done';

  async function toggle(event: React.MouseEvent) {
    // 行そのものがリンクなので、チェックだけを拾って遷移させない
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;

    const next: TaskStatus = done ? 'todo' : 'done';
    const before = current;
    setCurrent(next);
    setBusy(true);

    try {
      await api.patch(`/tasks/${taskId}`, { status: next });
      onDone?.(next);
      router.refresh();
    } catch {
      setCurrent(before);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={done}
      aria-label={done ? `${title} を未完了に戻す` : `${title} を完了にする`}
      className={cn(
        'grid size-6 shrink-0 place-items-center rounded-full transition-colors',
        done
          ? 'bg-success text-background'
          : 'text-transparent shadow-[inset_0_0_0_1.5px_var(--border-strong)] hover:text-muted-foreground hover:shadow-[inset_0_0_0_1.5px_var(--success)]',
      )}
    >
      {busy ? (
        <LoaderCircleIcon className="size-3.5 animate-spin text-muted-foreground" />
      ) : (
        <CheckIcon className="size-3.5" strokeWidth={3} />
      )}
    </button>
  );
}
