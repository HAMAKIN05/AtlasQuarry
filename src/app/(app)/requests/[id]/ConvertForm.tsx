'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiError, api } from '@/lib/api/client';

type Option = { id: string; name: string };

/**
 * 要望 → タスク変換（F-08）。
 *
 * 要望の題名と補足がそのままタスクになるので、ここで決めるのは
 * **どのプロジェクトの誰がいつまでにやるか**だけにしている。
 */
export function ConvertForm({
  requestId,
  projects,
  defaultProjectId,
  features,
  members,
}: {
  requestId: string;
  projects: Option[];
  defaultProjectId: string | null;
  features: Option[];
  members: Option[];
}) {
  const router = useRouter();
  const [productId, setProductId] = useState(defaultProjectId ?? projects[0]?.id ?? '');
  const [featureId, setFeatureId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const created = await api.post<{ key: string }>(`/requests/${requestId}/convert`, {
        productId,
        featureId: featureId || null,
        assigneeId: assigneeId || null,
        dueDate: dueDate || null,
      });
      router.push(`/tasks/${created.key}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'タスクにできませんでした');
      setBusy(false);
    }
  }

  if (projects.length === 0) {
    return (
      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-base font-bold">タスクにする</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          先にプロジェクトを作ってください。タスクはどれかのプロジェクトに属します。
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="mb-3 text-base font-bold">タスクにする</h2>
      <p className="mb-3 text-sm text-muted-foreground">要望の内容がそのままタスクになります。担当と期限はあとから変えられます。</p>

      <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
        {error && (
          <p className="rounded-md bg-danger-soft px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <label className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-semibold text-muted-foreground">どのプロジェクトのタスクにするか</span>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} required>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        {features.length > 0 && (
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-semibold text-muted-foreground">開発項目（任意）</span>
            <select value={featureId} onChange={(e) => setFeatureId(e.target.value)}>
              <option value="">指定しない</option>
              {features.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}

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
          <button type="submit" className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold min-h-11 px-4 disabled:opacity-50 disabled:pointer-events-none bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy}>
            {busy ? '作成中…' : 'タスクを作る'}
          </button>
        </div>
      </form>
    </section>
  );
}
