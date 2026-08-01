'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Badge } from '@/components/app-ui';
import { PRODUCT_STATUSES, type ProductStatus } from '@/db/schema/enums';
import { ApiError, api } from '@/lib/api/client';
import { PROJECT_STATUS_LABELS } from '@/lib/labels';

type Project = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  status: ProductStatus;
  taskCount: number;
};

export function ProjectRow({ project, canDelete }: { project: Project; canDelete: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [status, setStatus] = useState<ProductStatus>(project.status);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      await api.patch(`/products/${project.id}`, { name, description, status });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存できませんでした');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    // 配下のタスクが道連れになる。件数を出したうえで、名前の入力で確認する
    const typed = window.prompt(
      `「${project.name}」を削除すると、中のタスク ${project.taskCount} 件も一緒に消えます。\n` +
        `元に戻せません。削除する場合はプロジェクト名を入力してください。`,
    );
    if (typed !== project.name) return;

    setError(null);
    setBusy(true);
    try {
      await api.delete(`/products/${project.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '削除できませんでした');
      setBusy(false);
    }
  }

  return (
    <li className="rounded-md bg-raised p-3">
      {error && (
        <p className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {editing ? (
        <div className="flex flex-col gap-3">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-semibold text-muted-foreground">名前</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </label>

          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-semibold text-muted-foreground">説明（任意）</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </label>

          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-semibold text-muted-foreground">状態</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ProductStatus)}
            >
              {PRODUCT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PROJECT_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold min-h-11 px-4 disabled:opacity-50 disabled:pointer-events-none bg-primary text-primary-foreground hover:bg-primary/90" onClick={save} disabled={busy}>
              保存
            </button>
            <button type="button" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold min-h-11 text-primary hover:bg-primary-soft disabled:opacity-50" onClick={() => setEditing(false)}>
              やめる
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold">{project.name}</span>
          <Badge tone={project.status === 'active' ? 'progress' : 'neutral'}>
            {PROJECT_STATUS_LABELS[project.status]}
          </Badge>
          <span className="basis-full text-xs text-muted-foreground">
            {project.key}・タスク {project.taskCount} 件
          </span>

          <span className="ml-auto flex gap-1">
            <button type="button" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold min-h-11 text-primary hover:bg-primary-soft disabled:opacity-50" onClick={() => setEditing(true)}>
              変更
            </button>
            {canDelete && (
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold min-h-11 text-destructive hover:bg-destructive-soft disabled:opacity-50"
                onClick={remove}
                disabled={busy}
              >
                削除
              </button>
            )}
          </span>
        </div>
      )}
    </li>
  );
}
