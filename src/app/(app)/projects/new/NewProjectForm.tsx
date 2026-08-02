'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { Alert, Field } from '@/components/app-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError, api } from '@/lib/api/client';

/**
 * プロジェクトの作成。
 *
 * **専用の画面にした。** 以前は一覧の見出しの右にあるボタンを押すと、その場所に
 * フォームが開く作りだった。見出しの脇という狭い枠に入力欄が入り、右へはみ出す。
 * 要望とタスクで同じ不具合を直したので、ここも同じ形に揃える。
 *
 * 入力は名前だけ。**タスク番号の記号は訊かない**（サーバーが `P1` `P2` … と採番する）。
 */
export function NewProjectForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length === 0) {
      setError('プロジェクトの名前を入れてください');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const created = await api.post<{ id: string }>('/products', {
        name: name.trim(),
        description: description.trim() || null,
      });
      router.push(`/projects/${created.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '作成できませんでした');
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit} noValidate>
      {error && <Alert tone="error">{error}</Alert>}

      <Field
        label="名前"
        htmlFor="project-name"
        hint="内製化する対象ごとに作ります。「日報自動化」「SNS分析」のような単位です。"
      >
        <Input
          id="project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
          autoFocus
          placeholder="例：日報自動化"
        />
      </Field>

      <Field label="説明（任意）" htmlFor="project-desc" hint="何のためのプロジェクトかを1〜2行で。">
        <textarea
          id="project-desc"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
        />
      </Field>

      <Button type="submit" size="lg" disabled={submitting} className="w-full sm:w-auto sm:self-start">
        {submitting ? '作成しています…' : 'このプロジェクトを作る'}
      </Button>
    </form>
  );
}
