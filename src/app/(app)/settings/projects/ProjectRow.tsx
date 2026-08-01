'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Chip } from '@/components/ui';
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
    <li className="member">
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}

      {editing ? (
        <div className="stack">
          <label className="field">
            <span className="field-label">名前</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </label>

          <label className="field">
            <span className="field-label">説明（任意）</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </label>

          <label className="field">
            <span className="field-label">状態</span>
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

          <div className="actions">
            <button type="button" className="btn-primary" onClick={save} disabled={busy}>
              保存
            </button>
            <button type="button" className="btn-quiet" onClick={() => setEditing(false)}>
              やめる
            </button>
          </div>
        </div>
      ) : (
        <div className="member-view">
          <span className="member-name">{project.name}</span>
          <Chip tone={project.status === 'active' ? 'progress' : 'neutral'}>
            {PROJECT_STATUS_LABELS[project.status]}
          </Chip>
          <span className="member-mail">
            {project.key}・タスク {project.taskCount} 件
          </span>

          <span className="member-actions">
            <button type="button" className="btn-quiet" onClick={() => setEditing(true)}>
              変更
            </button>
            {canDelete && (
              <button
                type="button"
                className="btn-quiet btn-quiet-danger"
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
