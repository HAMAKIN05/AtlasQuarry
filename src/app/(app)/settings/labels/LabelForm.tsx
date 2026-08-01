'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiError, api } from '@/lib/api/client';
import type { LabelKey } from '@/lib/labels';

const GROUPS: Array<{ title: string; hint: string; prefix: string }> = [
  {
    title: 'タスクの状態',
    hint: 'かんばんの列の名前になります。',
    prefix: 'task.status.',
  },
  {
    title: 'タスクの優先度',
    hint: '',
    prefix: 'task.priority.',
  },
  {
    title: '要望の状態',
    hint: '要望一覧のタブの名前になります。',
    prefix: 'request.status.',
  },
];

export function LabelForm({
  defaults,
  overrides,
}: {
  defaults: Record<LabelKey, string>;
  overrides: Record<string, string>;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const key of Object.keys(defaults)) initial[key] = overrides[key] ?? '';
    return initial;
  });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await api.patch('/settings/labels', values);
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存できませんでした');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit} noValidate>
      {error && (
        <p className="alert alert-error" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="alert" role="status">
          保存しました。画面の表示が切り替わります。
        </p>
      )}

      {GROUPS.map((group) => (
        <section key={group.prefix} className="card">
          <h2 className="card-title">{group.title}</h2>
          {group.hint && <p className="hint">{group.hint}</p>}

          <div className="labelgrid">
            {Object.keys(defaults)
              .filter((key) => key.startsWith(group.prefix))
              .map((key) => (
                <label key={key} className="field">
                  <span className="field-label">既定：{defaults[key as LabelKey]}</span>
                  <input
                    value={values[key] ?? ''}
                    onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                    maxLength={40}
                    placeholder={defaults[key as LabelKey]}
                  />
                </label>
              ))}
          </div>
        </section>
      ))}

      <div className="actions">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? '保存中…' : '保存'}
        </button>
      </div>
    </form>
  );
}
