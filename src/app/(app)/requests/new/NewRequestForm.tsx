'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { ApiError, api } from '@/lib/api/client';

/**
 * 要望を出す。
 *
 * **専用の画面にした。** 以前は一覧の見出しの右にあるボタンを押すと、その場所に
 * フォームが開く作りだった。見出しの脇という狭い枠に入力欄が入り、下には一覧が
 * 残ったままなので、いま何を書いているのかが分からなくなる。
 *
 * 入力の敷居はできるだけ下げる。**必須は1行だけ。** プロジェクトも任意にしてある
 * （どれに関わるか分からないまま出せる方が、思いついたときに書いてもらえる）。
 */
export function NewRequestForm({ projects }: { projects: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [bodyMd, setBodyMd] = useState('');
  const [productId, setProductId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (title.trim().length === 0) {
      setError('やりたいことを1行だけ書いてください');
      titleRef.current?.focus();
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const created = await api.post<{ id: string }>('/requests', {
        title: title.trim(),
        bodyMd: bodyMd || null,
        productId: productId || null,
      });
      router.push(`/requests/${created.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '送信できませんでした');
      setSubmitting(false);
    }
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit} noValidate>
      {error && (
        <p id="request-form-error" className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <label className="flex min-w-0 flex-col gap-2">
        {/* **1行目を主役にする。** ここだけ大きく、ほかは補助として一段落とす */}
        <span className="text-base font-bold">何ができるようになりたいですか</span>
        <input
          ref={titleRef}
          id="request-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
          autoFocus
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'request-form-error request-title-hint' : 'request-title-hint'}
          className="!min-h-14 !text-base"
          placeholder="例：受付の入力を減らしたい"
        />
        <span id="request-title-hint" className="text-sm leading-relaxed text-muted-foreground">
          思いついた言い方のままで構いません。整える必要はありません。
        </span>
      </label>

      <label className="flex min-w-0 flex-col gap-2">
        <span className="text-sm font-semibold text-muted-foreground">
          いま何が大変ですか<span className="ml-1 font-normal">（書かなくても出せます）</span>
        </span>
        <textarea
          value={bodyMd}
          onChange={(e) => setBodyMd(e.target.value)}
          rows={6}
          placeholder="今どうしていて、どこで手が止まるか。分かる範囲で。"
        />
      </label>

      {projects.length > 0 && (
        <label className="flex min-w-0 flex-col gap-2">
          <span className="text-sm font-semibold text-muted-foreground">
            関係するプロジェクト<span className="ml-1 font-normal">（分からなければそのままで）</span>
          </span>
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">分からない・特にない</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* 送信は画面の一番下に1つだけ。「やめる」は戻る導線が上にあるので置かない */}
      <Button type="submit" size="lg" disabled={submitting} className="w-full sm:w-auto sm:self-start">
        {submitting ? '送っています…' : 'この要望を出す'}
      </Button>
    </form>
  );
}
