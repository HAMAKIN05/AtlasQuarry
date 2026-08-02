'use client';

import { PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';

/**
 * 常設の「＋」。
 *
 * **どの画面からでも、まず1件を捕まえられるようにする。**
 * それまでは「タスク画面へ行ってから追加」「プロジェクト詳細へ行ってから追加」で、
 * 追加するのにまず正しい画面へ移動する必要があった。
 * 既存のツール（Asana の右下＋、Todoist の常設＋、Linear の C）はどれも、
 * **入口を1つにして、文脈がある画面ではその文脈を自動で埋める**形にしている。
 *
 * ここも同じにする。プロジェクトを見ているときに押せば、そのプロジェクトが入る。
 */
export function AddButton({ canCreateTask }: { canCreateTask: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const params = useSearchParams();

  // いま見ている文脈。プロジェクトが分かるならタスクの行き先に引き継ぐ
  const projectId =
    params.get('projectId') ??
    (pathname.startsWith('/projects/') ? pathname.split('/')[2] : undefined);

  const taskHref = projectId ? `/tasks?projectId=${projectId}&new=1` : '/tasks?new=1';

  return (
    <>
      {open && (
        <>
          {/* 背景を押しても閉じる */}
          <button
            type="button"
            aria-label="閉じる"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 bg-black/20 lg:hidden"
          />
          <div className="fixed right-4 bottom-[calc(9.5rem+env(safe-area-inset-bottom))] z-40 flex w-56 flex-col overflow-hidden rounded-[10px] bg-surface shadow-[0_8px_32px_oklch(0_0_0/0.18)] lg:hidden">
            {canCreateTask && (
              <Link
                href={taskHref}
                onClick={() => setOpen(false)}
                className="min-h-12 border-b border-border px-4 py-3 text-[17px] font-semibold"
              >
                タスクを追加
              </Link>
            )}
            <Link
              href="/requests/new"
              onClick={() => setOpen(false)}
              className="min-h-12 px-4 py-3 text-[17px] font-semibold"
            >
              要望を出す
            </Link>
          </div>
        </>
      )}

      <button
        type="button"
        aria-label="追加する"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="fab"
      >
        <PlusIcon className="size-6" aria-hidden="true" />
      </button>
    </>
  );
}
