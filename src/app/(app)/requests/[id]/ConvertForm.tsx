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
      <section className="card">
        <h2 className="card-title">タスクにする</h2>
        <p className="hint">
          先にプロジェクトを作ってください。タスクはどれかのプロジェクトに属します。
        </p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2 className="card-title">タスクにする</h2>
      <p className="hint">要望の内容がそのままタスクになります。担当と期限はあとから変えられます。</p>

      <form className="stack" onSubmit={handleSubmit} noValidate>
        {error && (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        )}

        <label className="field">
          <span className="field-label">どのプロジェクトのタスクにするか</span>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} required>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        {features.length > 0 && (
          <label className="field">
            <span className="field-label">開発項目（任意）</span>
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

        <label className="field">
          <span className="field-label">担当（任意）</span>
          <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">まだ決めない</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">期限（任意）</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>

        <div className="actions">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? '作成中…' : 'タスクを作る'}
          </button>
        </div>
      </form>
    </section>
  );
}
