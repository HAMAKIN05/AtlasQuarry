'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ApiError, api } from '@/lib/api/client';

export function DeleteCommentButton({ commentId }: { commentId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        className="btn-quiet"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm('このコメントを削除します。よろしいですか？')) return;
          setBusy(true);
          setError(null);
          try {
            await api.delete(`/comments/${commentId}`);
            router.refresh();
          } catch (err) {
            setError(err instanceof ApiError ? err.message : '削除に失敗しました');
            setBusy(false);
          }
        }}
      >
        削除
      </button>
      {error && (
        <span className="alert alert-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
