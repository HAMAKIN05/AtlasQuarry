'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import type { TaskPriority, TaskStatus } from '@/db/schema/enums';
import { ApiError, api } from '@/lib/api/client';
import { useLabels } from '@/components/LabelsProvider';

type Option = { id: string; name: string };

type EditableTask = {
  id: string;
  title: string;
  bodyMd: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  startDate: string | null;
  dueDate: string | null;
};

const PRIORITIES: TaskPriority[] = ['urgent', 'high', 'normal', 'low'];

/** タスクの編集。本文はプレーン Markdown（機能定義書 §7）。 */
export function TaskEditor({
  task,
  members,
  canDelete,
  projectId,
}: {
  task: EditableTask;
  members: Option[];
  canDelete: boolean;
  projectId: string;
}) {
  const router = useRouter();
  const labels = useLabels();
  const [form, setForm] = useState(task);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);

    try {
      /*
       * **status は送らない。** タイトル直下の「状態」で即時に変えられるようにしたので、
       * このフォームが開いた時点の古い状態を一緒に送ると、保存のたびに巻き戻る。
       */
      await api.patch(`/tasks/${task.id}`, {
        title: form.title,
        bodyMd: form.bodyMd ?? '',
        priority: form.priority,
        assigneeId: form.assigneeId,
        startDate: form.startDate,
        dueDate: form.dueDate,
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    // 取り消せない操作なので確認を挟む
    if (!window.confirm('このタスクを削除します。元に戻せません。よろしいですか？')) return;

    setError(null);
    setSaving(true);
    try {
      await api.delete(`/tasks/${task.id}`);
      router.replace(`/tasks?projectId=${projectId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '削除に失敗しました');
      setSaving(false);
    }
  }

  return (
    <section className="surface task-editor p-4" aria-labelledby="edit-heading">
      <h2 id="edit-heading" className="mb-3 text-base font-bold">
        編集
      </h2>

      <form id="task-editor-form" className="task-editor-form flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
        {error && (
          <p className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning" role="status">
            保存しました
          </p>
        )}

        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted-foreground">タイトル</span>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            maxLength={200}
            required
          />
        </label>

        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted-foreground">本文（Markdown）</span>
          <textarea
            value={form.bodyMd ?? ''}
            onChange={(e) => setForm({ ...form, bodyMd: e.target.value })}
            rows={10}
          />
        </label>

        {/*
          **状態はここに置かない。** タイトル直下の「状態」に一本化した。
          両方に置くと、上で状態を変えたあとに古い値を抱えたこのフォームを保存して、
          **意図せず状態を巻き戻す**。単に迷わせるだけでなく壊れる。
          このフォームはタイトル・本文・優先度・担当・日付を直すためのもの。
        */}

        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted-foreground">優先度</span>
          <select
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
          >
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {labels[`task.priority.${priority}`]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted-foreground">担当者</span>
          <select
            value={form.assigneeId ?? ''}
            onChange={(e) => setForm({ ...form, assigneeId: e.target.value || null })}
          >
            <option value="">未割当</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        {/*
          **開発項目の選択欄を外した。** 画面から開発項目という概念を無くしたため。
          まとまりへの所属は親子（`parent_task_id`）で表し、タスク詳細の上部で見せる。
        */}

        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted-foreground">開始日</span>
          <input
            type="date"
            value={form.startDate ?? ''}
            onChange={(e) => setForm({ ...form, startDate: e.target.value || null })}
          />
        </label>

        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted-foreground">期限日</span>
          <input
            type="date"
            value={form.dueDate ?? ''}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value || null })}
          />
        </label>

        <div className="task-editor-actions-original flex flex-wrap items-center gap-2">
          <button type="submit" className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold min-h-11 px-4 disabled:opacity-50 disabled:pointer-events-none bg-primary text-primary-foreground hover:bg-primary/90" disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
          {canDelete && (
            <button type="button" className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold min-h-11 px-4 disabled:opacity-50 disabled:pointer-events-none border border-destructive bg-surface text-destructive hover:bg-destructive-soft" onClick={handleDelete} disabled={saving}>
              削除
            </button>
          )}
        </div>
      </form>
      <div className="task-editor-actions" role="group" aria-label="タスクの編集操作">
        <div className="task-editor-actions-inner">
          <button type="submit" form="task-editor-form" className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold min-h-11 px-4 disabled:opacity-50 disabled:pointer-events-none bg-primary text-primary-foreground hover:bg-primary/90" disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
          {canDelete && (
            <button type="button" className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold min-h-11 px-4 disabled:opacity-50 disabled:pointer-events-none border border-destructive bg-surface text-destructive hover:bg-destructive-soft" onClick={handleDelete} disabled={saving}>
              削除
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
