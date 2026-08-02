'use client';

import { useState, type FormEvent } from 'react';

import type { TaskListItem } from '@/domain/task/service';
import { ApiError, api } from '@/lib/api/client';

type Option = { id: string; name: string };

/**
 * タスクの追加。
 *
 * 作成したタスクは親の state に足して即座に出す。router.refresh() だけに任せると、
 * 追加したのに一拍おいてから現れることになる。
 */
export function NewTaskForm({
  productId,
  projectName,
  features,
  members,
  onCreated,
  open,
  onClose,
}: {
  productId: string;
  /** 追加直後の行に出す名前。サーバーから返る前の仮表示に使う */
  projectName: string;
  features: Option[];
  members: Option[];
  onCreated: (task: TaskListItem) => void;
  /**
   * 開いているか。**開閉は親が持つ。**
   * このフォームが自分で開閉を持ち、見出しの右のボタンと同じ場所に描かれていたため、
   * 開くと**見出しの脇の細い枠の中にフォームが出て**、右へはみ出していた。
   * 要望を出す画面で同じ形の不具合を直したのに、こちらに残っていた。
   */
  open: boolean;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [featureId, setFeatureId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const created = await api.post<{
        id: string;
        key: string;
        title: string;
        status: TaskListItem['status'];
        priority: TaskListItem['priority'];
        position: number;
        featureId: string | null;
        assigneeId: string | null;
        parentTaskId: string | null;
        startDate: string | null;
        dueDate: string | null;
      }>('/tasks', {
        productId,
        title,
        featureId: featureId || null,
        assigneeId: assigneeId || null,
        dueDate: dueDate || null,
      });

      onCreated({
        ...created,
        productId,
        productKey: '',
        productName: projectName ?? '',
        featureName: features.find((f) => f.id === created.featureId)?.name ?? null,
        assigneeName: members.find((m) => m.id === created.assigneeId)?.name ?? null,
        completedAt: null,
      });

      setTitle('');
      setDueDate('');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '追加できませんでした');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <form className="surface flex flex-col gap-4 p-4" onSubmit={handleSubmit} noValidate>
      <h2 className="text-base font-bold">タスクを追加</h2>

      {error && (
        <p className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-semibold text-muted-foreground">やること</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
          autoFocus
          placeholder="例：ログイン画面を作る"
        />
      </label>

      {/*
        **開発項目の選択欄を外した。** 画面から開発項目という概念を無くしたため。
        追加のときに決めるのは「やること」だけでよい。担当と期限も任意のまま。
      */}

      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-semibold text-muted-foreground">担当（任意）</span>
        <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
          <option value="">まだ決めない</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-semibold text-muted-foreground">期限（任意）</span>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold min-h-11 px-4 disabled:opacity-50 disabled:pointer-events-none bg-primary text-primary-foreground hover:bg-primary/90" disabled={submitting}>
          {submitting ? '追加中…' : '追加'}
        </button>
        <button type="button" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold min-h-11 text-primary hover:bg-primary-soft disabled:opacity-50" onClick={onClose}>
          やめる
        </button>
      </div>
    </form>
  );
}
